import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyStats, UserProfile } from '../types';
import Dashboard from './Dashboard';

const mocks = vi.hoisted(() => ({
    profile: {
        id: 'profile-1',
        firstName: 'Davis',
        token: 'token',
        lastKnownUtcOffsetMinutes: 0,
    } as UserProfile,
    metricDetailProps: null as Record<string, unknown> | null,
    dayDetail: vi.fn(),
    competitionProps: null as { profileData: Array<{ data?: DailyStats; isLoading: boolean; isError: boolean }> } | null,
    loadHistory: vi.fn(),
}));

vi.mock('../services/firestoreStatsService', async (importOriginal) => ({
    ...await importOriginal<typeof import('../services/firestoreStatsService')>(),
    getStoredDailyStats: mocks.loadHistory,
}));
vi.mock('../components/compete/CompeteView', () => ({
    default: (props: NonNullable<typeof mocks.competitionProps>) => {
        mocks.competitionProps = props;
        return <div>Competition test view</div>;
    },
}));

beforeEach(() => {
    window.history.replaceState({}, '', '/');
    mocks.loadHistory.mockReset().mockResolvedValue(null);
    mocks.competitionProps = null;
    mocks.dayDetail.mockReset().mockImplementation(async () => makeStats(new Date().toISOString().slice(0, 10)));
    window.scrollTo = vi.fn();
});

vi.mock('../contexts/UserContext', () => ({
    useUser: () => ({
        activeProfile: mocks.profile,
        profiles: [mocks.profile],
        login: vi.fn(),
        getAccessTokenForProfile: vi.fn().mockResolvedValue('token'),
        markProfileSyncSuccess: vi.fn().mockResolvedValue(undefined),
        markProfileSyncError: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('../hooks/useProfileStatsHydration', () => ({
    useProfileStatsHydration: () => ({
        hydratedProfileIds: new Set([mocks.profile.id]),
        allProfilesHydrated: true,
    }),
}));

vi.mock('../hooks/useInsights', () => ({ useInsights: () => ({ data: null, rebuilding: false }) }));
vi.mock('../services/insightsService', () => ({
    readDayDetail: (...args: unknown[]) => mocks.dayDetail(...args),
    readInsightSummary: vi.fn().mockResolvedValue(null),
    readMetricHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock('../components/charts/SleepStagesChart', () => ({ default: () => <div>Sleep stage detail</div> }));

afterEach(() => {
    cleanup();
    mocks.metricDetailProps = null;
});

const makeStats = (day: string): DailyStats => ({
    personalInfo: null,
    sleep: [{
        id: 'sleep-score',
        day,
        score: 88,
        contributors: {},
    }],
    readiness: [{
        id: 'readiness-score',
        day,
        score: 86,
        contributors: {},
    }],
    activity: [{
        id: 'activity-score',
        day,
        score: 82,
        active_calories: 400,
        contributors: {},
        steps: 8_000,
        target_calories: 500,
        total_calories: 2_100,
    }],
    session: [
        {
            id: 'nap',
            day,
            type: 'late_nap',
            bedtime_start: `${day}T14:00:00+00:00`,
            bedtime_end: `${day}T14:45:00+00:00`,
            total_sleep_duration: 2_700,
        },
        {
            id: 'main-sleep',
            day,
            type: 'long_sleep',
            bedtime_start: '2026-08-10T22:47:00-06:00',
            bedtime_end: '2026-08-11T06:32:00-06:00',
            total_sleep_duration: 27_900,
        },
    ],
    spo2: [],
    stress: [],
    resilience: [],
    heartrate: [],
    workout: [],
});

describe('Dashboard sleep details', () => {
    it('launches from saved data without exposing sync controls or freshness alarms', async () => {
        const day = new Date().toISOString().slice(0, 10);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        queryClient.setQueryData(['dailyStats', mocks.profile.id], makeStats(day));

        render(
            <QueryClientProvider client={queryClient}>
                <Dashboard />
            </QueryClientProvider>
        );

        expect(await screen.findByRole('heading', { name: /today/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /refresh oura data/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/sync attention needed|try sync again|sync is stale/i)).not.toBeInTheDocument();
        expect(screen.queryByText('Just now')).not.toBeInTheDocument();
        expect(mocks.loadHistory).not.toHaveBeenCalled();
    });

    it('opens Total Sleep with the selected main session timing', async () => {
        const day = new Date().toISOString().slice(0, 10);
        const stats = makeStats(day);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        queryClient.setQueryData(['dailyStats', mocks.profile.id], stats);

        render(
            <QueryClientProvider client={queryClient}>
                <Dashboard />
            </QueryClientProvider>
        );

        fireEvent.click(await screen.findByRole('button', {
            name: /Time asleep7h 45mBedtime & wake time/i,
        }));

        expect(await screen.findByRole('heading', { name: 'Time asleep', level: 1 })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/metrics/sleep_duration');
        expect(await screen.findByText('22:47', { selector: '.sleep-clock strong' })).toBeInTheDocument();
        expect(screen.getByText('06:32', { selector: '.sleep-clock strong' })).toBeInTheDocument();
        expect(screen.queryByText('14:00', { selector: '.sleep-clock strong' })).not.toBeInTheDocument();
        expect(mocks.loadHistory).not.toHaveBeenCalled();
    });
});

describe('competition history hydration', () => {
    it('loads full history on the competition route and merges current saved scores', async () => {
        window.history.replaceState({}, '', '/leaderboard/compete');
        const today = new Date().toISOString().slice(0, 10);
        mocks.loadHistory.mockResolvedValue(makeStats('2000-01-01'));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        client.setQueryData(['dailyStats', mocks.profile.id], makeStats(today));
        render(<QueryClientProvider client={client}><Dashboard /></QueryClientProvider>);
        await waitFor(() => expect(mocks.competitionProps?.profileData[0].data?.activity.map((item) => item.day)).toEqual(expect.arrayContaining(['2000-01-01', today])));
        expect(mocks.loadHistory).toHaveBeenCalledWith(mocks.profile.id);
        expect(mocks.competitionProps?.profileData[0]).toMatchObject({ isLoading: false, isError: false });
    });
});

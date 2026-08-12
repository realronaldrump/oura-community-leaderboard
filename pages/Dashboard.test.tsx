import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
}));

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

vi.mock('../components/MetricDetailModal', () => ({
    default: (props: Record<string, unknown>) => {
        mocks.metricDetailProps = props;
        return <div role="dialog" aria-label="Total Sleep Duration">Sleep details</div>;
    },
}));

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
            name: /Total Sleep: 7h 45m\. Bedtime & wake time\. View details/i,
        }));

        await waitFor(() => {
            expect(screen.getByRole('dialog', { name: 'Total Sleep Duration' })).toBeInTheDocument();
        });
        expect(mocks.metricDetailProps?.sleepSession).toEqual({
            bedtime_start: '2026-08-10T22:47:00-06:00',
            bedtime_end: '2026-08-11T06:32:00-06:00',
        });
    });
});

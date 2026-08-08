import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createEmptyDailyStats } from '../test/helpers';
import { getStoredDashboardStats } from '../services/firestoreStatsService';
import { useProfileStatsHydration } from './useProfileStatsHydration';

vi.mock('../services/firestoreStatsService', () => ({
    getStoredDashboardStats: vi.fn(),
}));

const Harness: React.FC<{ profileIds: string[]; priorityProfileId?: string }> = ({ profileIds, priorityProfileId }) => {
    const queryClient = useQueryClient();
    const { allProfilesHydrated, hydratedProfileIds } = useProfileStatsHydration(profileIds, priorityProfileId);
    const cached = queryClient.getQueryData(['dailyStats', profileIds[0]]);
    return (
        <div>
            {allProfilesHydrated ? 'hydrated' : 'loading'}:{cached ? 'cached' : 'empty'}:
            {profileIds.filter((profileId) => hydratedProfileIds.has(profileId)).join(',')}
        </div>
    );
};

const renderHarness = (profileIds: string[], priorityProfileId?: string) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <Harness profileIds={profileIds} priorityProfileId={priorityProfileId} />
        </QueryClientProvider>
    );
    return queryClient;
};

describe('useProfileStatsHydration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads the compact dashboard snapshot without pretending full history is hydrated', async () => {
        const stored = createEmptyDailyStats({
            sleep: [{ id: 'sleep-1', day: '2026-07-30', score: 88, contributors: {} }],
        });
        vi.mocked(getStoredDashboardStats).mockResolvedValue(stored);

        const queryClient = renderHarness(['profile-1']);

        await waitFor(() => expect(screen.getByText('hydrated:cached:profile-1')).toBeInTheDocument());
        expect(queryClient.getQueryData(['dailyStats', 'profile-1'])).toBe(stored);
        expect(queryClient.getQueryData(['allTimeStats', 'profile-1'])).toBeUndefined();
    });

    it('still completes hydration when React Strict Mode remounts the effect', async () => {
        const stored = createEmptyDailyStats({
            sleep: [{ id: 'sleep-1', day: '2026-07-30', score: 88, contributors: {} }],
        });
        vi.mocked(getStoredDashboardStats).mockResolvedValue(stored);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });

        render(
            <React.StrictMode>
                <QueryClientProvider client={queryClient}>
                    <Harness profileIds={['profile-1']} />
                </QueryClientProvider>
            </React.StrictMode>
        );

        await waitFor(() => expect(screen.getByText('hydrated:cached:profile-1')).toBeInTheDocument());
        expect(queryClient.getQueryData(['dailyStats', 'profile-1'])).toBe(stored);
    });

    it('never overwrites data that a newer request already placed in memory', async () => {
        const existing = createEmptyDailyStats({
            sleep: [{ id: 'new', day: '2026-07-30', score: 92, contributors: {} }],
        });
        const queryClient = new QueryClient();
        queryClient.setQueryData(['dailyStats', 'profile-1'], existing);

        render(
            <QueryClientProvider client={queryClient}>
                <Harness profileIds={['profile-1']} />
            </QueryClientProvider>
        );

        await waitFor(() => expect(screen.getByText('hydrated:cached:profile-1')).toBeInTheDocument());
        expect(getStoredDashboardStats).not.toHaveBeenCalled();
        expect(queryClient.getQueryData(['dailyStats', 'profile-1'])).toBe(existing);
    });

    it('reports the priority profile ready without waiting for slower profiles', async () => {
        const first = createEmptyDailyStats({
            sleep: [{ id: 'sleep-1', day: '2026-07-30', score: 88, contributors: {} }],
        });
        const second = createEmptyDailyStats({
            sleep: [{ id: 'sleep-2', day: '2026-07-30', score: 77, contributors: {} }],
        });
        let resolveSecond: ((stats: typeof second) => void) | undefined;
        vi.mocked(getStoredDashboardStats).mockImplementation((profileId) => {
            if (profileId === 'profile-1') return Promise.resolve(first);
            return new Promise((resolve) => {
                resolveSecond = resolve;
            });
        });

        renderHarness(['profile-2', 'profile-1'], 'profile-1');

        await waitFor(() => {
            expect(screen.getByText('loading:empty:profile-1')).toBeInTheDocument();
        });

        resolveSecond?.(second);
        await waitFor(() => expect(screen.getByText('hydrated:cached:profile-2,profile-1')).toBeInTheDocument());
    });
});

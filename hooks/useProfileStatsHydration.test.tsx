import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createEmptyDailyStats } from '../test/helpers';
import { getStoredDailyStats } from '../services/firestoreStatsService';
import { useProfileStatsHydration } from './useProfileStatsHydration';

vi.mock('../services/firestoreStatsService', () => ({
    getStoredDailyStats: vi.fn(),
}));

const Harness: React.FC<{ profileIds: string[] }> = ({ profileIds }) => {
    const queryClient = useQueryClient();
    const { allProfilesHydrated } = useProfileStatsHydration(profileIds);
    const cached = queryClient.getQueryData(['dailyStats', profileIds[0]]);
    return <div>{allProfilesHydrated ? 'hydrated' : 'loading'}:{cached ? 'cached' : 'empty'}</div>;
};

const renderHarness = (profileIds: string[]) => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={queryClient}>
            <Harness profileIds={profileIds} />
        </QueryClientProvider>
    );
    return queryClient;
};

describe('useProfileStatsHydration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads the durable snapshot into both caches before reporting ready', async () => {
        const stored = createEmptyDailyStats({
            sleep: [{ id: 'sleep-1', day: '2026-07-30', score: 88, contributors: {} }],
        });
        vi.mocked(getStoredDailyStats).mockResolvedValue(stored);

        const queryClient = renderHarness(['profile-1']);

        await waitFor(() => expect(screen.getByText('hydrated:cached')).toBeInTheDocument());
        expect(queryClient.getQueryData(['dailyStats', 'profile-1'])).toBe(stored);
        expect(queryClient.getQueryData(['allTimeStats', 'profile-1'])).toBe(stored);
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

        await waitFor(() => expect(screen.getByText('hydrated:cached')).toBeInTheDocument());
        expect(getStoredDailyStats).not.toHaveBeenCalled();
        expect(queryClient.getQueryData(['dailyStats', 'profile-1'])).toBe(existing);
    });
});

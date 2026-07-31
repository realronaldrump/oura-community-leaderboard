import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AUTO_SYNC_RETRY_COOLDOWN_MS, useAutoSync } from './useAutoSync';

type SyncProfile = {
    id: string;
    lastSuccessfulSyncAt?: string | null;
};

const flushPromises = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const Harness: React.FC<{
    profiles: SyncProfile[];
    enabled?: boolean;
}> = ({ profiles, enabled = true }) => {
    useAutoSync(profiles, enabled);
    return null;
};

const renderHookHarness = (
    profiles: SyncProfile[],
    rejectRefetch: boolean = false
) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    if (rejectRefetch) refetch.mockRejectedValue(new Error('Oura unavailable'));
    const view = render(
        <QueryClientProvider client={queryClient}>
            <Harness profiles={profiles} />
        </QueryClientProvider>
    );

    return { ...view, queryClient, refetch };
};

describe('useAutoSync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-25T18:00:00.000Z'));
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('refreshes only profiles whose durable successful-sync timestamp is stale', async () => {
        const { refetch } = renderHookHarness([
            { id: 'stale-profile', lastSuccessfulSyncAt: '2026-07-25T15:00:00.000Z' },
            { id: 'fresh-profile', lastSuccessfulSyncAt: '2026-07-25T17:30:00.000Z' },
        ]);

        await flushPromises();

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(refetch).toHaveBeenCalledWith(
            { queryKey: ['dailyStats', 'stale-profile'], exact: true, type: 'active' },
            { cancelRefetch: false, throwOnError: true }
        );
    });

    it('does not let the removed global browser timestamp suppress a profile refresh', async () => {
        localStorage.setItem('oura_last_sync', Date.now().toString());
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const { refetch } = renderHookHarness([
            { id: 'profile-1', lastSuccessfulSyncAt: null },
        ]);

        await flushPromises();

        expect(refetch).toHaveBeenCalledTimes(1);
        expect(setItem).not.toHaveBeenCalled();
        setItem.mockRestore();
    });

    it('contains failed automatic refreshes with an in-memory cooldown', async () => {
        const { refetch } = renderHookHarness(
            [{ id: 'profile-1', lastSuccessfulSyncAt: null }],
            true
        );

        await flushPromises();
        expect(refetch).toHaveBeenCalledTimes(1);

        act(() => window.dispatchEvent(new Event('online')));
        await flushPromises();
        expect(refetch).toHaveBeenCalledTimes(1);

        act(() => vi.advanceTimersByTime(AUTO_SYNC_RETRY_COOLDOWN_MS + 1));
        act(() => window.dispatchEvent(new Event('online')));
        await flushPromises();
        expect(refetch).toHaveBeenCalledTimes(2);
    });

    it('tracks attempts by profile so switching profiles cannot inherit another profile cooldown', async () => {
        const { refetch, rerender, queryClient } = renderHookHarness([
            { id: 'profile-1', lastSuccessfulSyncAt: null },
        ]);
        await flushPromises();

        rerender(
            <QueryClientProvider client={queryClient}>
                <Harness profiles={[{ id: 'profile-2', lastSuccessfulSyncAt: null }]} />
            </QueryClientProvider>
        );
        await flushPromises();

        expect(refetch).toHaveBeenCalledTimes(2);
        expect(refetch).toHaveBeenLastCalledWith(
            { queryKey: ['dailyStats', 'profile-2'], exact: true, type: 'active' },
            { cancelRefetch: false, throwOnError: true }
        );
    });

    it('serializes stale profile refreshes so endpoint fan-out cannot burst across members', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        let resolveFirst!: () => void;
        const firstRefresh = new Promise<void>((resolve) => {
            resolveFirst = resolve;
        });
        const refetch = vi.spyOn(queryClient, 'refetchQueries')
            .mockImplementationOnce(() => firstRefresh)
            .mockResolvedValue(undefined);

        render(
            <QueryClientProvider client={queryClient}>
                <Harness profiles={[
                    { id: 'profile-1', lastSuccessfulSyncAt: null },
                    { id: 'profile-2', lastSuccessfulSyncAt: null },
                ]} />
            </QueryClientProvider>
        );

        await flushPromises();
        expect(refetch).toHaveBeenCalledTimes(1);

        resolveFirst();
        await flushPromises();
        expect(refetch).toHaveBeenCalledTimes(2);
    });
});

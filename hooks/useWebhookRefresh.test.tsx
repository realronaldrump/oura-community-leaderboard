import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserProfile, WebhookSignal } from '../types';
import { firebaseService } from '../services/firebaseService';
import { useWebhookRefresh } from './useWebhookRefresh';

vi.mock('../services/firebaseService', () => ({
    firebaseService: {
        subscribeToWebhookSignal: vi.fn(),
    },
}));

vi.mock('../services/webhookService', () => ({
    webhookService: {
        getSignal: vi.fn(),
        ensureSetup: vi.fn(),
    },
}));

const profile = (lastSuccessfulSyncAt: string): UserProfile => ({
    id: 'profile-1',
    ouraUserId: 'oura-user-1',
    token: 'token',
    lastSuccessfulSyncAt,
});

const Harness: React.FC<{ member: UserProfile }> = ({ member }) => {
    useWebhookRefresh(member, true);
    return null;
};

const renderSignal = (member: UserProfile, signal: WebhookSignal) => {
    vi.mocked(firebaseService.subscribeToWebhookSignal).mockImplementation((_id, callback) => {
        callback(signal);
        return () => {};
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    render(
        <QueryClientProvider client={queryClient}>
            <Harness member={member} />
        </QueryClientProvider>
    );
    return invalidate;
};

describe('useWebhookRefresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses the first snapshot as a baseline when it predates the saved sync', () => {
        const invalidate = renderSignal(
            profile('2026-07-30T20:00:00.000Z'),
            {
                ouraUserId: 'oura-user-1',
                lastReceivedAt: '2026-07-30T19:00:00.000Z',
                updateCount: 4,
            }
        );

        act(() => vi.advanceTimersByTime(2_000));
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('invalidates once when a webhook signal is newer than the saved sync', () => {
        const invalidate = renderSignal(
            profile('2026-07-30T19:00:00.000Z'),
            {
                ouraUserId: 'oura-user-1',
                lastReceivedAt: '2026-07-30T20:00:00.000Z',
                updateCount: 5,
            }
        );

        act(() => vi.advanceTimersByTime(2_000));
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: ['dailyStats', 'profile-1'],
            exact: true,
        });
    });
});

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LAST_SYNC_KEY = 'oura_last_sync';

export const useAutoSync = (tokens: string[], enabled: boolean = true) => {
    const queryClient = useQueryClient();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const getLastSyncTime = useCallback((): number => {
        const stored = localStorage.getItem(LAST_SYNC_KEY);
        return stored ? parseInt(stored, 10) : 0;
    }, []);

    const setLastSyncTime = useCallback(() => {
        localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
    }, []);

    const refresh = useCallback(async () => {
        if (tokens.length === 0) return;

        // Invalidate all data queries so react-query refetches them
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['dailyStats'] }),
            queryClient.invalidateQueries({ queryKey: ['allTimeStats'] }),
        ]);
        setLastSyncTime();
    }, [tokens, queryClient, setLastSyncTime]);

    useEffect(() => {
        if (!enabled || tokens.length === 0) return;

        // Check if we need an immediate sync (e.g., been away for more than the interval)
        const lastSync = getLastSyncTime();
        const elapsed = Date.now() - lastSync;

        if (elapsed >= SYNC_INTERVAL_MS) {
            refresh();
        }

        // Set up the recurring interval
        intervalRef.current = setInterval(() => {
            refresh();
        }, SYNC_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [enabled, tokens, refresh, getLastSyncTime]);

    return {
        lastSyncTime: getLastSyncTime(),
        refreshNow: refresh,
    };
};

export const formatLastSync = (timestamp: number): string => {
    if (!timestamp) return 'Never';

    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
};

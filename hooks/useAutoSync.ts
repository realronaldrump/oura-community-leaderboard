import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LAST_SYNC_KEY = 'oura_last_sync';

export const useAutoSync = (profileIds: string[], enabled: boolean = true) => {
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
        if (profileIds.length === 0) return;

        // Refresh the incremental daily stats path; all-time cache is merged from that data.
        await queryClient.invalidateQueries({ queryKey: ['dailyStats'] });
        setLastSyncTime();
    }, [profileIds, queryClient, setLastSyncTime]);

    const refreshIfStale = useCallback(() => {
        if (!enabled || profileIds.length === 0) return;
        const lastSync = getLastSyncTime();
        const elapsed = Date.now() - lastSync;
        if (elapsed >= SYNC_INTERVAL_MS) {
            refresh();
        }
    }, [enabled, profileIds.length, getLastSyncTime, refresh]);

    useEffect(() => {
        if (!enabled || profileIds.length === 0) return;
        refreshIfStale();

        // Set up the recurring interval
        intervalRef.current = setInterval(() => {
            refresh();
        }, SYNC_INTERVAL_MS);

        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshIfStale();
            }
        };

        const onOnline = () => {
            refreshIfStale();
        };

        window.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('online', onOnline);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            window.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('online', onOnline);
        };
    }, [enabled, profileIds, refresh, refreshIfStale]);

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

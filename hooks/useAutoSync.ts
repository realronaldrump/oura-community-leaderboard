import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const SYNC_INTERVAL_MS = 60 * 60 * 1000;
export const AUTO_SYNC_RETRY_COOLDOWN_MS = 5 * 60 * 1000;

export type AutoSyncProfile = {
    id: string;
    lastSuccessfulSyncAt?: string | null;
};

const parseSyncTime = (value: string | number | null | undefined): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const isProfileStale = (profile: AutoSyncProfile, now: number): boolean => {
    const lastSuccessfulSyncTime = parseSyncTime(profile.lastSuccessfulSyncAt);
    return lastSuccessfulSyncTime === 0 || now - lastSuccessfulSyncTime >= SYNC_INTERVAL_MS;
};

export const useAutoSync = (profiles: readonly AutoSyncProfile[], enabled: boolean = true) => {
    const queryClient = useQueryClient();
    const inFlightByProfileRef = useRef(new Map<string, Promise<boolean>>());
    const lastAutomaticAttemptByProfileRef = useRef(new Map<string, number>());

    const refreshProfile = useCallback((profileId: string, respectCooldown: boolean): Promise<boolean> => {
        const inFlight = inFlightByProfileRef.current.get(profileId);
        if (inFlight) return inFlight;

        const now = Date.now();
        const lastAttempt = lastAutomaticAttemptByProfileRef.current.get(profileId) ?? 0;
        if (respectCooldown && now - lastAttempt < AUTO_SYNC_RETRY_COOLDOWN_MS) {
            return Promise.resolve(false);
        }

        if (respectCooldown) {
            lastAutomaticAttemptByProfileRef.current.set(profileId, now);
        }

        // Refetch one profile at a time so one member's successful query can
        // never make a different member look current. The query function owns
        // the durable success/error write via markProfileSyncSuccess/Error.
        const request = queryClient.refetchQueries(
            { queryKey: ['dailyStats', profileId], exact: true, type: 'active' },
            { cancelRefetch: false, throwOnError: true }
        ).then(
            () => true,
            () => false
        ).finally(() => {
            if (inFlightByProfileRef.current.get(profileId) === request) {
                inFlightByProfileRef.current.delete(profileId);
            }
        });

        inFlightByProfileRef.current.set(profileId, request);
        return request;
    }, [queryClient]);

    const refreshProfiles = useCallback(async (
        profileIds: readonly string[],
        respectCooldown: boolean
    ): Promise<boolean> => {
        const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
        if (uniqueProfileIds.length === 0) return false;
        const results = await Promise.all(
            uniqueProfileIds.map((profileId) => refreshProfile(profileId, respectCooldown))
        );
        return results.every(Boolean);
    }, [refreshProfile]);

    const refreshIfStale = useCallback(() => {
        if (!enabled || profiles.length === 0) return;
        const now = Date.now();
        const staleProfileIds = profiles
            .filter((profile) => isProfileStale(profile, now))
            .map((profile) => profile.id);
        void refreshProfiles(staleProfileIds, true);
    }, [enabled, profiles, refreshProfiles]);

    useEffect(() => {
        if (!enabled || profiles.length === 0) return;
        refreshIfStale();

        const interval = window.setInterval(refreshIfStale, SYNC_INTERVAL_MS);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshIfStale();
        };
        const onOnline = () => refreshIfStale();

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('online', onOnline);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('online', onOnline);
        };
    }, [enabled, profiles.length, refreshIfStale]);

    return {
        refreshNow: () => refreshProfiles(profiles.map((profile) => profile.id), false),
    };
};

export const formatLastSync = (timestamp: string | number | null | undefined): string => {
    const syncTime = parseSyncTime(timestamp);
    if (!syncTime) return 'Never';

    const diffMs = Date.now() - syncTime;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
};

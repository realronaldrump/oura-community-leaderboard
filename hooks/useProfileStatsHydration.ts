import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getStoredDashboardStats } from '../services/firestoreStatsService';
import type { DailyStats } from '../types';

const PROFILE_STATS_BOOTSTRAP_TIMEOUT_MS = 8_000;

const withHydrationTimeout = <T,>(task: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
        reject(new Error('dashboard_snapshot_timeout'));
    }, PROFILE_STATS_BOOTSTRAP_TIMEOUT_MS);
    task.then(
        (value) => {
            window.clearTimeout(timeout);
            resolve(value);
        },
        (error) => {
            window.clearTimeout(timeout);
            reject(error);
        }
    );
});

const createEmptyDailyStats = (): DailyStats => ({
    sleep: [],
    readiness: [],
    activity: [],
    session: [],
    spo2: [],
    stress: [],
    resilience: [],
});

/**
 * Hydrate React Query from the durable Firestore snapshot before enabling Oura
 * network queries. A refresh can then fail without making already-saved scores
 * disappear or briefly presenting a reconnect screen.
 */
export const useProfileStatsHydration = (
    profileIds: readonly string[],
    priorityProfileId?: string | null
) => {
    const queryClient = useQueryClient();
    const profileKey = profileIds.join('\u0000');
    const normalizedProfileIds = useMemo(
        () => {
            const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
            if (!priorityProfileId || !uniqueProfileIds.includes(priorityProfileId)) {
                return uniqueProfileIds;
            }
            return [priorityProfileId, ...uniqueProfileIds.filter((profileId) => profileId !== priorityProfileId)];
        },
        [priorityProfileId, profileKey]
    );
    const [hydratedProfileIds, setHydratedProfileIds] = useState<Set<string>>(() => new Set());
    const inFlightProfileIdsRef = useRef(new Set<string>());
    const currentProfileIdsRef = useRef(new Set(normalizedProfileIds));
    const mountedRef = useRef(true);

    currentProfileIdsRef.current = new Set(normalizedProfileIds);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const pendingIds = normalizedProfileIds.filter(
            (profileId) => (
                !hydratedProfileIds.has(profileId) &&
                !inFlightProfileIdsRef.current.has(profileId)
            )
        );
        if (pendingIds.length === 0) return;

        pendingIds.forEach((profileId) => {
            inFlightProfileIdsRef.current.add(profileId);
            void (async () => {
                if (queryClient.getQueryData(['dailyStats', profileId]) !== undefined) return;

                try {
                    const stored = await withHydrationTimeout(getStoredDashboardStats(profileId));
                    if (!mountedRef.current || !currentProfileIdsRef.current.has(profileId)) return;

                    queryClient.setQueryData<DailyStats>(
                        ['dailyStats', profileId],
                        (current) => current ?? stored ?? createEmptyDailyStats()
                    );
                } catch (error) {
                    if (mountedRef.current && currentProfileIdsRef.current.has(profileId)) {
                        // Do not seed an empty cache after a failed durable read:
                        // the live query must retain an honest loading/error state.
                        // A confirmed empty profile is handled by the null branch above.
                        console.warn('Failed to hydrate stored profile stats:', error);
                    }
                }
            })().finally(() => {
                inFlightProfileIdsRef.current.delete(profileId);
                if (!mountedRef.current || !currentProfileIdsRef.current.has(profileId)) return;
                setHydratedProfileIds((current) => {
                    if (current.has(profileId)) return current;
                    const next = new Set(current);
                    next.add(profileId);
                    return next;
                });
            });
        });
    }, [hydratedProfileIds, normalizedProfileIds, queryClient]);

    return {
        hydratedProfileIds,
        allProfilesHydrated: normalizedProfileIds.every((profileId) => hydratedProfileIds.has(profileId)),
    };
};

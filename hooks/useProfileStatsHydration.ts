import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getStoredDailyStats } from '../services/firestoreStatsService';
import type { DailyStats } from '../types';

/**
 * Hydrate React Query from the durable Firestore snapshot before enabling Oura
 * network queries. A refresh can then fail without making already-saved scores
 * disappear or briefly presenting a reconnect screen.
 */
export const useProfileStatsHydration = (profileIds: readonly string[]) => {
    const queryClient = useQueryClient();
    const profileKey = profileIds.join('\u0000');
    const normalizedProfileIds = useMemo(
        () => [...new Set(profileIds.filter(Boolean))],
        [profileKey]
    );
    const [hydratedProfileIds, setHydratedProfileIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        const pendingIds = normalizedProfileIds.filter(
            (profileId) => !hydratedProfileIds.has(profileId)
        );
        if (pendingIds.length === 0) return;

        let cancelled = false;
        void Promise.all(pendingIds.map(async (profileId) => {
            if (queryClient.getQueryData(['dailyStats', profileId]) !== undefined) return;

            try {
                const stored = await getStoredDailyStats(profileId);
                if (cancelled || !stored) return;

                queryClient.setQueryData<DailyStats>(
                    ['dailyStats', profileId],
                    (current) => current ?? stored
                );
                queryClient.setQueryData<DailyStats>(
                    ['allTimeStats', profileId],
                    (current) => current ?? stored
                );
            } catch (error) {
                if (!cancelled) {
                    console.warn('Failed to hydrate stored profile stats:', error);
                }
            }
        })).finally(() => {
            if (cancelled) return;
            setHydratedProfileIds((current) => {
                const next = new Set(current);
                pendingIds.forEach((profileId) => next.add(profileId));
                return next;
            });
        });

        return () => {
            cancelled = true;
        };
    }, [hydratedProfileIds, normalizedProfileIds, queryClient]);

    return {
        hydratedProfileIds,
        allProfilesHydrated: normalizedProfileIds.every((profileId) => hydratedProfileIds.has(profileId)),
    };
};

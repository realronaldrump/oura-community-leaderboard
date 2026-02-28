import { useQuery } from '@tanstack/react-query';
import { ouraService } from '../services/ouraService';
import { DailyStats } from '../types';

const hasScope = (grantedScopes: string[] | undefined, requiredScope: string): boolean => {
    if (!grantedScopes || grantedScopes.length === 0) return true;
    return grantedScopes.includes(requiredScope);
};

export const fetchDailyStats = async (
    token: string,
    dateRange?: { start: string, end?: string },
    grantedScopes?: string[]
): Promise<DailyStats> => {
    const { start, end } = dateRange || {};
    const canReadDaily = hasScope(grantedScopes, 'daily');
    const canReadSpO2 = hasScope(grantedScopes, 'spo2');

    const [sleep, readiness, activity, sessions, spo2, stress, resilience] = await Promise.all([
        canReadDaily ? ouraService.getDailySleep(token, start, end) : Promise.resolve([]),
        canReadDaily ? ouraService.getDailyReadiness(token, start, end) : Promise.resolve([]),
        canReadDaily ? ouraService.getDailyActivity(token, start, end) : Promise.resolve([]),
        canReadDaily ? ouraService.getSleepSessions(token, start, end) : Promise.resolve([]),
        canReadSpO2 ? ouraService.getDailySpO2(token, start, end) : Promise.resolve([]),
        canReadDaily ? ouraService.getDailyStress(token, start, end) : Promise.resolve([]),
        canReadDaily ? ouraService.getDailyResilience(token, start, end) : Promise.resolve([])
    ]);

    // Sort descending by date
    const sortFn = (a: any, b: any) => new Date(b.day || b.summary_date || 0).getTime() - new Date(a.day || a.summary_date || 0).getTime();

    return {
        sleep: sleep.map(s => ({ ...s, score: s.score != null ? Number(s.score) : null })).sort(sortFn),
        readiness: readiness.map(r => ({ ...r, score: r.score != null ? Number(r.score) : null })).sort(sortFn),
        activity: activity.map(a => ({
            ...a,
            score: a.score != null ? Number(a.score) : null,
            steps: a.steps != null ? Number(a.steps) : 0,
            active_calories: a.active_calories != null ? Number(a.active_calories) : 0
        })).sort(sortFn),
        session: sessions.map(s => ({
            ...s,
            average_hrv: s.average_hrv != null ? Number(s.average_hrv) : null
        })).sort(sortFn),
        spo2: spo2.sort(sortFn),
        stress: stress.sort(sortFn),
        resilience: resilience.sort(sortFn)
    };
};

export const useDailyStats = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['dailyStats', token],
        queryFn: () => fetchDailyStats(token),
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 30, // 30 minutes
    });
};

export const useAllTimeStats = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['allTimeStats', token],
        // Fetch from 2016 (Oura Gen 1 era) to now
        queryFn: () => fetchDailyStats(token, { start: '2016-01-01' }),
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 60 * 24, // 24 hours
        gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
    });
};

export const useHeartRate = (
    token: string,
    enabled: boolean = true,
    grantedScopes?: string[]
) => {
    return useQuery({
        queryKey: ['heartRate', token],
        queryFn: async () => {
            return await ouraService.getHeartRate(token);
        },
        enabled: !!token && enabled && hasScope(grantedScopes, 'heartrate'),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};

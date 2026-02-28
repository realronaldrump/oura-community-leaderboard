import { useQuery } from '@tanstack/react-query';
import { ouraService } from '../services/ouraService';
import { DailyStats } from '../types';

export const FULL_HISTORY_START_DATE = '2016-01-01';

export const fetchDailyStats = async (
    token: string,
    dateRange?: { start: string, end?: string },
    _grantedScopes?: string[]
): Promise<DailyStats> => {
    // Single canonical history path for the app:
    // default to complete history unless a specific range is requested.
    const start = dateRange?.start || FULL_HISTORY_START_DATE;
    const end = dateRange?.end;

    const requests = [
        ouraService.getDailySleep(token, start, end),
        ouraService.getDailyReadiness(token, start, end),
        ouraService.getDailyActivity(token, start, end),
        ouraService.getSleepSessions(token, start, end),
        ouraService.getDailySpO2(token, start, end),
        ouraService.getDailyStress(token, start, end),
        ouraService.getDailyResilience(token, start, end),
        ouraService.getHeartRate(token, start, end),
        ouraService.getWorkouts(token, start, end),
        ouraService.getSessions(token, start, end),
        ouraService.getSleepTime(token, start, end),
        ouraService.getTags(token, start, end),
        ouraService.getEnhancedTags(token, start, end),
        ouraService.getRestModePeriods(token, start, end),
        ouraService.getRingConfiguration(token),
        ouraService.getDailyCardiovascularAge(token, start, end),
        ouraService.getVO2Max(token, start, end)
    ] as const;

    const settled = await Promise.allSettled(requests);
    const endpointNames = [
        'sleep',
        'readiness',
        'activity',
        'sessions',
        'spo2',
        'stress',
        'resilience',
        'heartrate',
        'workout',
        'guidedSession',
        'sleepTime',
        'tag',
        'enhancedTag',
        'restModePeriod',
        'ringConfiguration',
        'cardiovascularAge',
        'vo2Max'
    ] as const;

    const [
        sleep,
        readiness,
        activity,
        sessions,
        spo2,
        stress,
        resilience,
        heartrate,
        workout,
        guidedSession,
        sleepTime,
        tag,
        enhancedTag,
        restModePeriod,
        ringConfiguration,
        cardiovascularAge,
        vo2Max
    ] = settled.map((result, idx) => {
        if (result.status === 'fulfilled') return result.value as any[];
        console.warn(`Failed to fetch ${endpointNames[idx]}:`, result.reason);
        return [];
    });

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
        resilience: resilience.sort(sortFn),
        heartrate: heartrate.sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()),
        workout: workout.sort(sortFn),
        guidedSession: guidedSession.sort(sortFn),
        sleepTime: sleepTime.sort(sortFn),
        tag: tag.sort(sortFn),
        enhancedTag: enhancedTag.sort(sortFn),
        restModePeriod: restModePeriod.sort(sortFn),
        ringConfiguration,
        cardiovascularAge: cardiovascularAge.sort(sortFn),
        vo2Max: vo2Max.sort(sortFn),
    };
};

export const useDailyStats = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['dailyStats', token],
        queryFn: () => fetchDailyStats(token),
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 30, // 30 minutes
        gcTime: 1000 * 60 * 60 * 24, // keep full history cached for the current app session
    });
};

export const useAllTimeStats = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['allTimeStats', token],
        queryFn: () => fetchDailyStats(token, { start: FULL_HISTORY_START_DATE }),
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 60 * 24, // 24 hours
        gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
    });
};

export const useHeartRate = (
    token: string,
    enabled: boolean = true,
    _grantedScopes?: string[]
) => {
    return useQuery({
        queryKey: ['heartRate', token],
        queryFn: async () => {
            return await ouraService.getHeartRate(token);
        },
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};

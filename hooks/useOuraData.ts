import { useQuery } from '@tanstack/react-query';
import { ouraService } from '../services/ouraService';
import { DailyStats } from '../types';

export const fetchDailyStats = async (token: string, dateRange?: { start: string, end?: string }): Promise<DailyStats> => {
    const { start, end } = dateRange || {};
    const [sleep, readiness, activity, sessions, spo2, stress, resilience] = await Promise.all([
        ouraService.getDailySleep(token, start, end),
        ouraService.getDailyReadiness(token, start, end),
        ouraService.getDailyActivity(token, start, end),
        ouraService.getSleepSessions(token, start, end),
        ouraService.getDailySpO2(token, start, end),
        ouraService.getDailyStress(token, start, end),
        ouraService.getDailyResilience(token, start, end)
    ]);

    // Sort descending by date
    const sortFn = (a: any, b: any) => new Date(b.day || b.summary_date || 0).getTime() - new Date(a.day || a.summary_date || 0).getTime();

    return {
        sleep: sleep.sort(sortFn),
        readiness: readiness.sort(sortFn),
        activity: activity.sort(sortFn),
        session: sessions.sort(sortFn),
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

export const useHeartRate = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['heartRate', token],
        queryFn: async () => {
            return await ouraService.getHeartRate(token);
        },
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};

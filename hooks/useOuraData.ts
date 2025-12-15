import { useQuery } from '@tanstack/react-query';
import { ouraService } from '../services/ouraService';
import { DailyStats } from '../types';

export const fetchDailyStats = async (token: string): Promise<DailyStats> => {
    const [sleep, readiness, activity, sessions, spo2, stress, resilience] = await Promise.all([
        ouraService.getDailySleep(token),
        ouraService.getDailyReadiness(token),
        ouraService.getDailyActivity(token),
        ouraService.getSleepSessions(token),
        ouraService.getDailySpO2(token),
        ouraService.getDailyStress(token),
        ouraService.getDailyResilience(token)
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

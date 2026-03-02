import { useQuery } from '@tanstack/react-query';
import { ouraService } from '../services/ouraService';
import { DailyStats } from '../types';

export const FULL_HISTORY_START_DATE = '2016-01-01';
const INITIAL_RECENT_DAYS = 28;
const INCREMENTAL_OVERLAP_DAYS = 3;

type FetchConfig = {
    includeStaticCollections?: boolean;
};

type SyncMode = 'incremental' | 'full';

type SyncDailyStatsOptions = {
    mode?: SyncMode;
    endDate?: string;
};

const getToday = (): string => new Date().toISOString().split('T')[0];

const shiftDate = (day: string, daysDelta: number): string => {
    const d = new Date(`${day}T00:00:00`);
    if (Number.isNaN(d.getTime())) return day;
    d.setDate(d.getDate() + daysDelta);
    return d.toISOString().split('T')[0];
};

const sortByDayDesc = (a: any, b: any): number => {
    const bDate = new Date(b?.day || b?.summary_date || 0).getTime();
    const aDate = new Date(a?.day || a?.summary_date || 0).getTime();
    return bDate - aDate;
};

const sortByTimestampDesc = (a: any, b: any): number =>
    new Date(b?.timestamp || b?.end_datetime || b?.start_datetime || 0).getTime() -
    new Date(a?.timestamp || a?.end_datetime || a?.start_datetime || 0).getTime();

const itemKey = (item: any, index: number): string => {
    if (item?.id) return `id:${item.id}`;
    const composite = [
        item?.day,
        item?.timestamp,
        item?.start_datetime,
        item?.end_datetime,
        item?.bedtime_end,
        item?.bedtime_start,
        item?.type,
        item?.activity,
    ].filter(Boolean).join('|');
    return composite ? `c:${composite}` : `i:${index}`;
};

const mergeCollection = (existing: any[] = [], incoming: any[] = [], sorter: (a: any, b: any) => number = sortByDayDesc): any[] => {
    const merged = new Map<string, any>();
    existing.forEach((item, idx) => merged.set(itemKey(item, idx), item));
    incoming.forEach((item, idx) => {
        const key = itemKey(item, idx);
        const prev = merged.get(key);
        merged.set(key, prev ? { ...prev, ...item } : item);
    });
    return Array.from(merged.values()).sort(sorter);
};

const toNumberOrNull = (value: any): number | null => (value != null ? Number(value) : null);

const getMostRecentDay = (existingData: DailyStats | undefined): string | null => {
    if (!existingData) return null;
    const candidates = [
        existingData.sleep?.[0]?.day,
        existingData.readiness?.[0]?.day,
        existingData.activity?.[0]?.day,
        existingData.session?.[0]?.day,
        existingData.spo2?.[0]?.day,
        existingData.stress?.[0]?.day,
        existingData.resilience?.[0]?.day,
    ].filter(Boolean) as string[];

    if (candidates.length === 0) return null;
    return candidates.sort().reverse()[0];
};

const resolveSettled = (settled: PromiseSettledResult<any[]>[], names: string[]): any[][] =>
    settled.map((result, idx) => {
        if (result.status === 'fulfilled') return result.value as any[];
        console.warn(`Failed to fetch ${names[idx]}:`, result.reason);
        return [];
    });

const getErrorMessage = (reason: unknown): string => {
    if (reason instanceof Error) return reason.message;
    if (typeof reason === 'string') return reason;
    try {
        return JSON.stringify(reason);
    } catch {
        return String(reason);
    }
};

const resolveCriticalSettled = (settled: PromiseSettledResult<any[]>[], names: string[]): any[][] => {
    const failures: Array<{ name: string; reason: unknown }> = [];

    const values = settled.map((result, idx) => {
        if (result.status === 'fulfilled') return result.value as any[];
        failures.push({ name: names[idx], reason: result.reason });
        console.warn(`Failed to fetch ${names[idx]}:`, result.reason);
        return [];
    });

    if (failures.length === 0) {
        return values;
    }

    const failureNames = failures.map((f) => f.name).join(', ');
    const hasUnauthorizedError = failures.some((f) => {
        const message = getErrorMessage(f.reason).toLowerCase();
        return message.includes('unauthorized') || message.includes('401');
    });

    if (hasUnauthorizedError) {
        throw new Error(`Unauthorized while fetching critical endpoints (${failureNames})`);
    }

    const firstFailureMessage = getErrorMessage(failures[0].reason);
    throw new Error(`Critical data fetch failed (${failureNames}): ${firstFailureMessage}`);
};

const buildDailyStats = (
    sleep: any[], readiness: any[], activity: any[], sessions: any[],
    spo2: any[], stress: any[], resilience: any[], heartrate: any[],
    workout: any[], guidedSession: any[], sleepTime: any[], tag: any[],
    enhancedTag: any[], restModePeriod: any[], ringConfiguration: any[],
    cardiovascularAge: any[], vo2Max: any[]
): DailyStats => ({
    sleep: sleep.map(s => ({ ...s, score: toNumberOrNull(s.score) })).sort(sortByDayDesc),
    readiness: readiness.map(r => ({ ...r, score: toNumberOrNull(r.score) })).sort(sortByDayDesc),
    activity: activity.map(a => ({
        ...a,
        score: toNumberOrNull(a.score),
        steps: a.steps != null ? Number(a.steps) : 0,
        active_calories: a.active_calories != null ? Number(a.active_calories) : 0,
    })).sort(sortByDayDesc),
    session: sessions.map(s => ({ ...s, average_hrv: toNumberOrNull(s.average_hrv) })).sort(sortByDayDesc),
    spo2: spo2.sort(sortByDayDesc),
    stress: stress.sort(sortByDayDesc),
    resilience: resilience.sort(sortByDayDesc),
    heartrate: heartrate.sort(sortByTimestampDesc),
    workout: workout.sort(sortByDayDesc),
    guidedSession: guidedSession.sort(sortByDayDesc),
    sleepTime: sleepTime.sort(sortByDayDesc),
    tag: tag.sort(sortByDayDesc),
    enhancedTag: enhancedTag.sort(sortByDayDesc),
    restModePeriod: restModePeriod.sort(sortByDayDesc),
    ringConfiguration,
    cardiovascularAge: cardiovascularAge.sort(sortByDayDesc),
    vo2Max: vo2Max.sort(sortByDayDesc),
});

export const fetchDailyStats = async (
    token: string,
    dateRange?: { start: string; end?: string },
    _grantedScopes?: string[],
    config: FetchConfig = {}
): Promise<DailyStats> => {
    const includeStaticCollections = config.includeStaticCollections ?? true;
    const start = dateRange?.start || shiftDate(getToday(), -INITIAL_RECENT_DAYS);
    const end = dateRange?.end;

    // Phase 1: Critical endpoints the dashboard needs to render scores + details
    const criticalRequests = [
        ouraService.getDailySleep(token, start, end),
        ouraService.getDailyReadiness(token, start, end),
        ouraService.getDailyActivity(token, start, end),
        ouraService.getSleepSessions(token, start, end),
    ];

    const criticalSettled = await Promise.allSettled(criticalRequests);
    const [sleep, readiness, activity, sessions] = resolveCriticalSettled(
        criticalSettled, ['sleep', 'readiness', 'activity', 'sessions']
    );

    // Phase 2: Supplementary endpoints — fetched after critical data is secured
    // Limit heartrate to 2 days for the dashboard (the slowest, most paginated endpoint)
    const hrStart = shiftDate(end || getToday(), -2);
    const supplementaryRequests = [
        ouraService.getDailySpO2(token, start, end),
        ouraService.getDailyStress(token, start, end),
        ouraService.getDailyResilience(token, start, end),
        ouraService.getHeartRate(token, hrStart, end),
        ouraService.getWorkouts(token, start, end),
        ouraService.getSessions(token, start, end),
        ouraService.getSleepTime(token, start, end),
        ouraService.getTags(token, start, end),
        ouraService.getEnhancedTags(token, start, end),
        ouraService.getRestModePeriods(token, start, end),
        includeStaticCollections ? ouraService.getRingConfiguration(token) : Promise.resolve([]),
        ouraService.getDailyCardiovascularAge(token, start, end),
        ouraService.getVO2Max(token, start, end),
    ];

    const suppSettled = await Promise.allSettled(supplementaryRequests);
    const [
        spo2, stress, resilience, heartrate, workout, guidedSession,
        sleepTime, tag, enhancedTag, restModePeriod, ringConfiguration,
        cardiovascularAge, vo2Max
    ] = resolveSettled(suppSettled, [
        'spo2', 'stress', 'resilience', 'heartrate', 'workout', 'guidedSession',
        'sleepTime', 'tag', 'enhancedTag', 'restModePeriod', 'ringConfiguration',
        'cardiovascularAge', 'vo2Max'
    ]);

    return buildDailyStats(
        sleep, readiness, activity, sessions,
        spo2, stress, resilience, heartrate,
        workout, guidedSession, sleepTime, tag,
        enhancedTag, restModePeriod, ringConfiguration,
        cardiovascularAge, vo2Max
    );
};

const mergeDailyStats = (existingData: DailyStats, incomingData: DailyStats): DailyStats => {
    return {
        sleep: mergeCollection(existingData.sleep, incomingData.sleep),
        readiness: mergeCollection(existingData.readiness, incomingData.readiness),
        activity: mergeCollection(existingData.activity, incomingData.activity),
        session: mergeCollection(existingData.session, incomingData.session),
        spo2: mergeCollection(existingData.spo2, incomingData.spo2),
        stress: mergeCollection(existingData.stress, incomingData.stress),
        resilience: mergeCollection(existingData.resilience, incomingData.resilience),
        heartrate: mergeCollection(existingData.heartrate || [], incomingData.heartrate || [], sortByTimestampDesc),
        workout: mergeCollection(existingData.workout || [], incomingData.workout || []),
        guidedSession: mergeCollection(existingData.guidedSession || [], incomingData.guidedSession || []),
        sleepTime: mergeCollection(existingData.sleepTime || [], incomingData.sleepTime || []),
        tag: mergeCollection(existingData.tag || [], incomingData.tag || []),
        enhancedTag: mergeCollection(existingData.enhancedTag || [], incomingData.enhancedTag || []),
        restModePeriod: mergeCollection(existingData.restModePeriod || [], incomingData.restModePeriod || []),
        ringConfiguration: mergeCollection(existingData.ringConfiguration || [], incomingData.ringConfiguration || [], sortByTimestampDesc),
        cardiovascularAge: mergeCollection(existingData.cardiovascularAge || [], incomingData.cardiovascularAge || []),
        vo2Max: mergeCollection(existingData.vo2Max || [], incomingData.vo2Max || []),
    };
};

export const syncDailyStats = async (
    token: string,
    existingData?: DailyStats,
    options: SyncDailyStatsOptions = {}
): Promise<DailyStats> => {
    const mode = options.mode || 'incremental';
    const endDate = options.endDate || getToday();

    if (mode === 'full') {
        return fetchDailyStats(token, {
            start: FULL_HISTORY_START_DATE,
            end: endDate,
        }, undefined, { includeStaticCollections: true });
    }

    const lastDay = getMostRecentDay(existingData);
    const startDate = lastDay
        ? shiftDate(lastDay, -INCREMENTAL_OVERLAP_DAYS)
        : shiftDate(endDate, -INITIAL_RECENT_DAYS);

    const delta = await fetchDailyStats(token, {
        start: startDate,
        end: endDate,
    }, undefined, {
        includeStaticCollections: !existingData,
    });

    return existingData ? mergeDailyStats(existingData, delta) : delta;
};

export const useDailyStats = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['dailyStats', token],
        queryFn: () => syncDailyStats(token, undefined, { mode: 'incremental' }),
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 30, // 30 minutes
        gcTime: 1000 * 60 * 60 * 24, // Keep cache for 24 hours
    });
};

export const useAllTimeStats = (token: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['allTimeStats', token],
        queryFn: () => syncDailyStats(token, undefined, { mode: 'full' }),
        enabled: !!token && enabled,
        staleTime: 1000 * 60 * 60 * 24, // 24 hours
        gcTime: 1000 * 60 * 60 * 24,
    });
};

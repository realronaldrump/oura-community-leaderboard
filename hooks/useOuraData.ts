import {
    getStoredDailyStats,
    saveIncrementalProfileStats,
    saveProfileStats,
} from '../services/firestoreStatsService';
import { ouraService } from '../services/ouraService';
import { persistDerivedProfileTemporalMetadata } from '../services/profileTemporalService';
import { DailyStats, OuraEndpointDiagnostic } from '../types';
import { getOuraFetchEndISODate, shiftLocalISODate } from '../utils/date';
import { getOuraEndpointCapabilities } from '../utils/ouraScopes';

export const FULL_HISTORY_START_DATE = '2016-01-01';
const INITIAL_RECENT_DAYS = 28;
const INCREMENTAL_OVERLAP_DAYS = 3;

type FetchConfig = {
    includeStaticCollections?: boolean;
    fullHeartrate?: boolean;
    requireCompleteData?: boolean;
    grantedScopes?: string[];
    availabilityKey?: string;
    profileOffsetMinutes?: number | null;
};

type SyncMode = 'incremental' | 'full';

type SyncDailyStatsOptions = {
    mode?: SyncMode;
    endDate?: string;
    grantedScopes?: string[];
    availabilityKey?: string;
    profileId?: string;
    profileOffsetMinutes?: number | null;
};

const getFetchEndDate = (offsetMinutes?: number | null): string => getOuraFetchEndISODate(new Date(), offsetMinutes);
const shiftDate = (day: string, daysDelta: number): string => shiftLocalISODate(day, daysDelta);

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

const toTimestampMs = (value?: string | null): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
};

const countDefinedValues = (value: any): number => {
    if (!value || typeof value !== 'object') return 0;
    return Object.values(value as Record<string, unknown>).reduce<number>((count, entry) => {
        if (entry == null) return count;
        if (Array.isArray(entry)) return count + (entry.length > 0 ? 1 : 0);
        if (typeof entry === 'object') return count + countDefinedValues(entry);
        return count + 1;
    }, 0);
};

const preferDailyItem = (current: any, candidate: any): any => {
    const currentTs = toTimestampMs(current?.timestamp || current?.updated_at || current?.created_at);
    const candidateTs = toTimestampMs(candidate?.timestamp || candidate?.updated_at || candidate?.created_at);

    if (candidateTs > currentTs) {
        return { ...current, ...candidate };
    }
    if (candidateTs < currentTs) {
        return current;
    }

    const currentDensity = countDefinedValues(current);
    const candidateDensity = countDefinedValues(candidate);
    if (candidateDensity >= currentDensity) {
        return { ...current, ...candidate };
    }

    return current;
};

const mergeCollectionByDay = (existing: any[] = [], incoming: any[] = []): any[] => {
    const byDay = new Map<string, any>();
    const upsert = (item: any) => {
        const day = item?.day || item?.summary_date;
        if (!day) return;
        const previous = byDay.get(day);
        byDay.set(day, previous ? preferDailyItem(previous, item) : item);
    };

    existing.forEach(upsert);
    incoming.forEach(upsert);

    return Array.from(byDay.values()).sort(sortByDayDesc);
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

const buildDiagnostic = (
    code: OuraEndpointDiagnostic['code'],
    endpoint: string,
    message: string,
    status?: number | null,
    detail?: string | null
): OuraEndpointDiagnostic => ({
    code,
    endpoint,
    message,
    status: status ?? null,
    detail: detail ?? null,
    recordedAt: new Date().toISOString(),
});

const buildRejectedEndpointDiagnostic = (endpoint: string, reason: unknown): OuraEndpointDiagnostic => {
    const message = getErrorMessage(reason);
    const normalized = message.toLowerCase();

    if (normalized.includes('unauthorized') || normalized.includes('401')) {
        return buildDiagnostic('unauthorized', endpoint, `Oura returned 401 while loading ${endpoint}: ${message}`, 401, message);
    }

    return buildDiagnostic('request_failed', endpoint, `The ${endpoint} request failed: ${message}`, null, message);
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
    enhancedTag: any[], restModePeriod: any[], ringConfiguration: any[], personalInfo: any | null, ringBatteryLevel: any[],
    cardiovascularAge: any[], vo2Max: any[],
    resilienceDiagnostic?: OuraEndpointDiagnostic | null,
    endpointDiagnostics?: Record<string, OuraEndpointDiagnostic | null>
): DailyStats => ({
    personalInfo,
    sleep: mergeCollectionByDay([], sleep.map(s => ({ ...s, score: toNumberOrNull(s.score) }))),
    readiness: mergeCollectionByDay([], readiness.map(r => ({ ...r, score: toNumberOrNull(r.score) }))),
    activity: mergeCollectionByDay([], activity.map(a => ({
        ...a,
        score: toNumberOrNull(a.score),
        steps: a.steps != null ? Number(a.steps) : 0,
        active_calories: a.active_calories != null ? Number(a.active_calories) : 0,
    }))),
    session: sessions.map(s => ({ ...s, average_hrv: toNumberOrNull(s.average_hrv) })).sort(sortByDayDesc),
    spo2: mergeCollectionByDay([], spo2),
    stress: mergeCollectionByDay([], stress),
    resilience: mergeCollectionByDay([], resilience),
    heartrate: heartrate.sort(sortByTimestampDesc),
    workout: workout.sort(sortByDayDesc),
    guidedSession: guidedSession.sort(sortByDayDesc),
    sleepTime: sleepTime.sort(sortByDayDesc),
    tag: tag.sort(sortByDayDesc),
    enhancedTag: enhancedTag.sort(sortByDayDesc),
    restModePeriod: restModePeriod.sort(sortByDayDesc),
    ringConfiguration,
    ringBatteryLevel: ringBatteryLevel.sort(sortByTimestampDesc),
    cardiovascularAge: mergeCollectionByDay([], cardiovascularAge),
    vo2Max: mergeCollection([], vo2Max),
    resilienceDiagnostic: resilienceDiagnostic ?? null,
    endpointDiagnostics: endpointDiagnostics ?? {},
});

export const fetchDailyStats = async (
    token: string,
    dateRange?: { start: string; end?: string },
    config: FetchConfig = {}
): Promise<DailyStats> => {
    const includeStaticCollections = config.includeStaticCollections ?? true;
    const availabilityKey = config.availabilityKey;
    const capabilities = getOuraEndpointCapabilities(config.grantedScopes);
    const end = dateRange?.end || getOuraFetchEndISODate(new Date(), config.profileOffsetMinutes);
    const start = dateRange?.start || shiftDate(end, -INITIAL_RECENT_DAYS);

    // Phase 1: Critical endpoints the dashboard needs to render scores + details
    const criticalRequests = [
        ouraService.getDailySleep(token, start, end, { availabilityKey }),
        ouraService.getDailyReadiness(token, start, end, { availabilityKey }),
        ouraService.getDailyActivity(token, start, end, { availabilityKey }),
        ouraService.getSleepSessions(token, start, end, { availabilityKey }),
    ];

    const criticalSettled = await Promise.allSettled(criticalRequests);
    const [sleep, readiness, activity, sessions] = resolveCriticalSettled(
        criticalSettled, ['sleep', 'readiness', 'activity', 'sessions']
    );

    // Phase 2: Supplementary endpoints — fetched after critical data is secured
    // Limit heartrate to 2 days for dashboard fetches; full syncs fetch the complete range.
    const hrStart = config.fullHeartrate ? start : shiftDate(end, -2);
    const supplementaryRequests = [
        capabilities.spo2 ? ouraService.getDailySpO2(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.stress ? ouraService.getDailyStress(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.resilience ? ouraService.getDailyResilience(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.heartrate ? ouraService.getHeartRate(token, hrStart, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.workout ? ouraService.getWorkouts(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.session ? ouraService.getSessions(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.sleepTime ? ouraService.getSleepTime(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.tag ? ouraService.getTags(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.tag ? ouraService.getEnhancedTags(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.restModePeriod ? ouraService.getRestModePeriods(token, start, end, { availabilityKey }) : Promise.resolve([]),
        includeStaticCollections && capabilities.ringConfiguration ? ouraService.getRingConfiguration(token, { availabilityKey }) : Promise.resolve([]),
        includeStaticCollections && capabilities.personal ? ouraService.getPersonalInfo(token).then((info) => [info]) : Promise.resolve([]),
        capabilities.ringBatteryLevel ? ouraService.getRingBatteryLevel(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.cardiovascularAge ? ouraService.getDailyCardiovascularAge(token, start, end, { availabilityKey }) : Promise.resolve([]),
        capabilities.vo2Max ? ouraService.getVO2Max(token, start, end, { availabilityKey }) : Promise.resolve([]),
    ];
    const supplementaryNames = [
        'spo2', 'stress', 'resilience', 'heartrate', 'workout', 'guidedSession',
        'sleepTime', 'tag', 'enhancedTag', 'restModePeriod', 'ringConfiguration',
        'personalInfo', 'ringBatteryLevel', 'cardiovascularAge', 'vo2Max'
    ];

    const suppSettled = await Promise.allSettled(supplementaryRequests);
    if (config.requireCompleteData) {
        const failedNames = suppSettled.flatMap((result, index) =>
            result.status === 'rejected' ? [supplementaryNames[index]] : []
        );
        if (failedNames.length > 0) {
            throw new Error(`Supplementary data fetch failed (${failedNames.join(', ')})`);
        }
    }
    const [
        spo2, stress, resilience, heartrate, workout, guidedSession,
        sleepTime, tag, enhancedTag, restModePeriod, ringConfiguration,
        personalInfoRows, ringBatteryLevel, cardiovascularAge, vo2Max
    ] = resolveSettled(suppSettled, supplementaryNames);
    const resilienceSettled = suppSettled[2];

    const resilienceDiagnostic = !capabilities.resilience
        ? buildDiagnostic(
            'skipped_missing_scope',
            'daily_resilience',
            'This profile does not have the Oura permissions needed for Resilience. Reconnect the account and grant daily access.'
        )
        : resilienceSettled?.status === 'rejected'
            ? buildRejectedEndpointDiagnostic('daily_resilience', resilienceSettled.reason)
            : ouraService.getEndpointDiagnostic(token, 'daily_resilience', availabilityKey)
                ?? (resilience.length === 0
                    ? buildDiagnostic(
                        'no_data',
                        'daily_resilience',
                        'Oura returned no Resilience records for this account or date range.'
                    )
                    : null);

    const endpointNames = [
        'daily_spo2', 'daily_stress', 'daily_resilience', 'heartrate', 'workout', 'session',
        'sleep_time', 'tag', 'enhanced_tag', 'rest_mode_period', 'ring_configuration',
        'personal_info', 'ring_battery_level', 'daily_cardiovascular_age', 'vO2_max',
    ];
    const endpointEnabled = [
        capabilities.spo2, capabilities.stress, capabilities.resilience, capabilities.heartrate,
        capabilities.workout, capabilities.session, capabilities.sleepTime, capabilities.tag,
        capabilities.tag, capabilities.restModePeriod,
        includeStaticCollections && capabilities.ringConfiguration,
        includeStaticCollections && capabilities.personal,
        capabilities.ringBatteryLevel, capabilities.cardiovascularAge, capabilities.vo2Max,
    ];
    const endpointDiagnostics = Object.fromEntries(endpointNames.flatMap((endpoint, index) => {
        if (!endpointEnabled[index]) {
            if (!includeStaticCollections && (endpoint === 'ring_configuration' || endpoint === 'personal_info')) {
                return [];
            }
            return [[endpoint, buildDiagnostic(
                'skipped_missing_scope',
                endpoint,
                `The saved Oura authorization does not include the scope required for ${endpoint}.`,
            )]];
        }
        const result = suppSettled[index];
        const diagnostic = result?.status === 'rejected'
            ? buildRejectedEndpointDiagnostic(endpoint, result.reason)
            : ouraService.getEndpointDiagnostic(token, endpoint, availabilityKey) ?? null;
        return [[endpoint, diagnostic]];
    }));

    const stats = buildDailyStats(
        sleep, readiness, activity, sessions,
        spo2, stress, resilience, heartrate,
        workout, guidedSession, sleepTime, tag,
        enhancedTag, restModePeriod, ringConfiguration, personalInfoRows[0] ?? null, ringBatteryLevel,
        cardiovascularAge, vo2Max,
        resilienceDiagnostic,
        endpointDiagnostics,
    );

    return stats;
};

export const mergeDailyStats = (existingData: DailyStats, incomingData: DailyStats): DailyStats => {
    return {
        personalInfo: incomingData.personalInfo ?? existingData.personalInfo ?? null,
        sleep: mergeCollectionByDay(existingData.sleep, incomingData.sleep),
        readiness: mergeCollectionByDay(existingData.readiness, incomingData.readiness),
        activity: mergeCollectionByDay(existingData.activity, incomingData.activity),
        session: mergeCollection(existingData.session, incomingData.session),
        spo2: mergeCollectionByDay(existingData.spo2, incomingData.spo2),
        stress: mergeCollectionByDay(existingData.stress, incomingData.stress),
        resilience: mergeCollectionByDay(existingData.resilience, incomingData.resilience),
        heartrate: mergeCollection(existingData.heartrate || [], incomingData.heartrate || [], sortByTimestampDesc),
        workout: mergeCollection(existingData.workout || [], incomingData.workout || []),
        guidedSession: mergeCollection(existingData.guidedSession || [], incomingData.guidedSession || []),
        sleepTime: mergeCollection(existingData.sleepTime || [], incomingData.sleepTime || []),
        tag: mergeCollection(existingData.tag || [], incomingData.tag || []),
        enhancedTag: mergeCollection(existingData.enhancedTag || [], incomingData.enhancedTag || []),
        restModePeriod: mergeCollection(existingData.restModePeriod || [], incomingData.restModePeriod || []),
        ringConfiguration: mergeCollection(existingData.ringConfiguration || [], incomingData.ringConfiguration || [], sortByTimestampDesc),
        ringBatteryLevel: mergeCollection(existingData.ringBatteryLevel || [], incomingData.ringBatteryLevel || [], sortByTimestampDesc),
        cardiovascularAge: mergeCollectionByDay(existingData.cardiovascularAge || [], incomingData.cardiovascularAge || []),
        vo2Max: mergeCollection(existingData.vo2Max || [], incomingData.vo2Max || []),
        resilienceDiagnostic: incomingData.resilienceDiagnostic ?? null,
        endpointDiagnostics: {
            ...(existingData.endpointDiagnostics || {}),
            ...(incomingData.endpointDiagnostics || {}),
        },
    };
};

export const syncDailyStats = async (
    token: string,
    existingData?: DailyStats,
    options: SyncDailyStatsOptions = {}
): Promise<DailyStats> => {
    const mode = options.mode || 'incremental';
    const endDate = options.endDate || getFetchEndDate(options.profileOffsetMinutes);
    const { profileId } = options;

    // For full syncs, fetch everything and persist
    if (mode === 'full') {
        const fullData = await fetchDailyStats(token, {
            start: FULL_HISTORY_START_DATE,
            end: endDate,
        }, {
            includeStaticCollections: true,
            fullHeartrate: true,
            grantedScopes: options.grantedScopes,
            availabilityKey: options.availabilityKey,
            profileOffsetMinutes: options.profileOffsetMinutes,
        });
        if (profileId) {
            await saveProfileStats(profileId, fullData, 'full');
            await persistDerivedProfileTemporalMetadata(profileId, fullData);
        }
        return fullData;
    }

    // Hydrate from shared Firestore stats if no in-memory data was provided.
    let baseData = existingData;

    if (!baseData && profileId) {
        const stored = await getStoredDailyStats(profileId);
        if (stored) {
            baseData = stored;
        }
    }

    const lastDay = getMostRecentDay(baseData);
    const startDate = lastDay
        ? shiftDate(lastDay, -INCREMENTAL_OVERLAP_DAYS)
        : shiftDate(endDate, -INITIAL_RECENT_DAYS);

    const delta = await fetchDailyStats(token, {
        start: startDate,
        end: endDate,
    }, {
        includeStaticCollections: !baseData,
        grantedScopes: options.grantedScopes,
        availabilityKey: options.availabilityKey,
        profileOffsetMinutes: options.profileOffsetMinutes,
    });

    const result = baseData ? mergeDailyStats(baseData, delta) : delta;

    // Persist only the changed slice so dashboard queries do not block on full-history rewrites.
    if (profileId) {
        await saveIncrementalProfileStats(profileId, result, delta);
        await persistDerivedProfileTemporalMetadata(profileId, result);
    }

    return result;
};

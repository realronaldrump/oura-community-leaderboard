import {
    collection,
    deleteDoc,
    doc,
    FirestoreError,
    getDocs,
    query,
    setDoc,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
    DailyStats,
    HeartRate,
    SleepSession,
} from '../types';

export const PROFILE_STATS_COLLECTION = 'profileStats';
export const PROFILE_STATS_SCHEMA_VERSION = 1;

const DAYS_COLLECTION = 'days';
const HEART_RATE_DAYS_COLLECTION = 'heartRateDays';

const RAW_COLLECTIONS = {
    sleepSessions: 'sleepSessions',
    workouts: 'workouts',
    tags: 'tags',
    enhancedTags: 'enhancedTags',
    guidedSessions: 'guidedSessions',
    sleepTime: 'sleepTime',
    restModePeriods: 'restModePeriods',
    ringConfigurations: 'ringConfigurations',
} as const;

type SyncMode = 'incremental' | 'full';

export interface ProfileStatsMetadata {
    profileId: string;
    schemaVersion: number;
    oldestDay: string | null;
    newestDay: string | null;
    lastFullSyncAt?: string | null;
    lastIncrementalSyncAt?: string | null;
    lastSyncError?: string | null;
    updatedAt: string;
}

export interface ProfileStatsDayDocument {
    day: string;
    sleep?: unknown | null;
    readiness?: unknown | null;
    activity?: unknown | null;
    spo2?: unknown | null;
    stress?: unknown | null;
    resilience?: unknown | null;
    cardiovascularAge?: unknown | null;
    vo2Max?: unknown | null;
    bestSleepSession?: unknown | null;
    updatedAt: string;
}

type BuiltProfileStatsDocuments = {
    metadata: ProfileStatsMetadata;
    days: ProfileStatsDayDocument[];
    heartRateDays: Array<{ day: string; items: HeartRate[]; updatedAt: string }>;
    rawCollections: Record<string, unknown[]>;
};

type FirestoreDocumentPath = [string, string, ...string[]];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isPermissionDeniedError = (error: unknown): boolean => {
    const code = String((error as FirestoreError)?.code || '').toLowerCase();
    const message = String((error as Error)?.message || '').toLowerCase();
    return code === 'permission-denied' ||
        code === 'permission_denied' ||
        message.includes('permission') ||
        message.includes('insufficient permissions');
};

const logSharedStatsWarning = (operation: string, profileId: string, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Shared Firestore stats ${operation} failed for ${profileId}. Continuing with live Oura data.`, {
        profileId,
        operation,
        permissionDenied: isPermissionDeniedError(error),
        message,
    });
};

const stripUndefinedDeep = <T>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefinedDeep(item)) as T;
    }

    if (!isRecord(value)) {
        return value;
    }

    const cleaned: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, entry]) => {
        if (entry !== undefined) {
            cleaned[key] = stripUndefinedDeep(entry);
        }
    });
    return cleaned as T;
};

const toDocumentId = (item: unknown, index: number): string => {
    const rawId = isRecord(item) && item.id != null
        ? String(item.id)
        : JSON.stringify(item);
    const normalized = encodeURIComponent(rawId || `item-${index}`)
        .replace(/\./g, '%2E')
        .replace(/\//g, '%2F')
        .slice(0, 900);
    return normalized || `item-${index}`;
};

const toTimestampMs = (value?: string | null): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
};

const sortByDayDesc = <T extends { day?: string }>(items: T[] = []): T[] =>
    [...items].sort((left, right) => (right.day || '').localeCompare(left.day || ''));

const sortByTimestampDesc = <T extends { timestamp?: string; start_datetime?: string; end_datetime?: string }>(items: T[] = []): T[] =>
    [...items].sort((left, right) => {
        const rightTs = toTimestampMs(right.timestamp || right.end_datetime || right.start_datetime);
        const leftTs = toTimestampMs(left.timestamp || left.end_datetime || left.start_datetime);
        return rightTs - leftTs;
    });

const extractDayRange = (data: DailyStats): { oldestDay: string | null; newestDay: string | null } => {
    const days: string[] = [];
    const addDays = (items?: Array<{ day?: string }>) => {
        items?.forEach((item) => {
            if (item.day) days.push(item.day);
        });
    };

    addDays(data.sleep);
    addDays(data.readiness);
    addDays(data.activity);
    addDays(data.session);
    addDays(data.spo2);
    addDays(data.stress);
    addDays(data.resilience);
    addDays(data.workout as Array<{ day?: string }>);
    addDays(data.cardiovascularAge as Array<{ day?: string }>);
    addDays(data.vo2Max as Array<{ day?: string }>);

    if (!days.length) return { oldestDay: null, newestDay: null };
    const sorted = Array.from(new Set(days)).sort();
    return {
        oldestDay: sorted[0],
        newestDay: sorted[sorted.length - 1],
    };
};

const getSessionCandidateDays = (session: SleepSession): Set<string> => {
    const days = new Set<string>();
    if (session.day) days.add(session.day);
    const startDay = session.bedtime_start?.slice(0, 10);
    const endDay = session.bedtime_end?.slice(0, 10);
    if (startDay) days.add(startDay);
    if (endDay) days.add(endDay);
    return days;
};

const pickBestSession = (sessions: SleepSession[]): SleepSession | null => {
    if (!sessions.length) return null;
    return [...sessions]
        .filter((session) => session.type !== 'deleted')
        .sort((left, right) => {
            const rightDuration = right.total_sleep_duration ?? right.time_in_bed ?? 0;
            const leftDuration = left.total_sleep_duration ?? left.time_in_bed ?? 0;
            if (rightDuration !== leftDuration) return rightDuration - leftDuration;
            return toTimestampMs(right.bedtime_end) - toTimestampMs(left.bedtime_end);
        })[0] || null;
};

const findByDay = <T extends { day?: string }>(items: T[] | undefined, day: string): T | null =>
    items?.find((item) => item.day === day) || null;

const getAllDays = (data: DailyStats): string[] => {
    const days = new Set<string>();
    const addDays = (items?: Array<{ day?: string }>) => {
        items?.forEach((item) => {
            if (item.day) days.add(item.day);
        });
    };

    addDays(data.sleep);
    addDays(data.readiness);
    addDays(data.activity);
    addDays(data.session);
    addDays(data.spo2);
    addDays(data.stress);
    addDays(data.resilience);
    addDays(data.workout as Array<{ day?: string }>);
    addDays(data.cardiovascularAge as Array<{ day?: string }>);
    addDays(data.vo2Max as Array<{ day?: string }>);
    return Array.from(days).sort();
};

const groupHeartRateByDay = (items: HeartRate[] | undefined, updatedAt: string) => {
    const grouped = new Map<string, HeartRate[]>();
    (items || []).forEach((item) => {
        const day = item.timestamp?.slice(0, 10);
        if (!day) return;
        const existing = grouped.get(day) || [];
        existing.push(item);
        grouped.set(day, existing);
    });

    return Array.from(grouped.entries()).map(([day, heartRate]) => ({
        day,
        items: sortByTimestampDesc(heartRate),
        updatedAt,
    }));
};

export const buildProfileStatsDocuments = (
    profileId: string,
    data: DailyStats,
    mode: SyncMode,
    now: string = new Date().toISOString()
): BuiltProfileStatsDocuments => {
    const { oldestDay, newestDay } = extractDayRange(data);
    const sessions = data.session || [];
    const days = getAllDays(data).map((day) => {
        const daySessions = sessions.filter((session) => getSessionCandidateDays(session).has(day));
        return stripUndefinedDeep({
            day,
            sleep: findByDay(data.sleep, day),
            readiness: findByDay(data.readiness, day),
            activity: findByDay(data.activity, day),
            spo2: findByDay(data.spo2, day),
            stress: findByDay(data.stress, day),
            resilience: findByDay(data.resilience, day),
            cardiovascularAge: findByDay(data.cardiovascularAge as Array<{ day?: string }>, day),
            vo2Max: findByDay(data.vo2Max as Array<{ day?: string }>, day),
            bestSleepSession: pickBestSession(daySessions),
            updatedAt: now,
        });
    });

    return {
        metadata: stripUndefinedDeep({
            profileId,
            schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
            oldestDay,
            newestDay,
            lastFullSyncAt: mode === 'full' ? now : undefined,
            lastIncrementalSyncAt: mode === 'incremental' ? now : undefined,
            lastSyncError: null,
            updatedAt: now,
        }),
        days,
        heartRateDays: groupHeartRateByDay(data.heartrate, now),
        rawCollections: {
            [RAW_COLLECTIONS.sleepSessions]: data.session || [],
            [RAW_COLLECTIONS.workouts]: data.workout || [],
            [RAW_COLLECTIONS.tags]: data.tag || [],
            [RAW_COLLECTIONS.enhancedTags]: data.enhancedTag || [],
            [RAW_COLLECTIONS.guidedSessions]: data.guidedSession || [],
            [RAW_COLLECTIONS.sleepTime]: data.sleepTime || [],
            [RAW_COLLECTIONS.restModePeriods]: data.restModePeriod || [],
            [RAW_COLLECTIONS.ringConfigurations]: data.ringConfiguration || [],
        },
    };
};

const commitSetOperations = async (
    operations: Array<{ path: FirestoreDocumentPath; data: unknown }>
): Promise<void> => {
    for (let index = 0; index < operations.length; index += 450) {
        const batch = writeBatch(db);
        operations.slice(index, index + 450).forEach((operation) => {
            const [collectionPath, documentPath, ...pathSegments] = operation.path;
            batch.set(doc(db, collectionPath, documentPath, ...pathSegments), stripUndefinedDeep(operation.data), { merge: true });
        });
        await batch.commit();
    }
};

const deleteKnownStatsCollection = async (profileId: string, collectionName: string): Promise<void> => {
    const snapshot = await getDocs(collection(db, PROFILE_STATS_COLLECTION, profileId, collectionName));
    const docs = snapshot.docs;
    for (let index = 0; index < docs.length; index += 450) {
        const batch = writeBatch(db);
        docs.slice(index, index + 450).forEach((document) => batch.delete(document.ref));
        await batch.commit();
    }
};

export const clearProfileStats = async (profileId: string): Promise<void> => {
    try {
        await Promise.all([
            deleteKnownStatsCollection(profileId, DAYS_COLLECTION),
            deleteKnownStatsCollection(profileId, HEART_RATE_DAYS_COLLECTION),
            ...Object.values(RAW_COLLECTIONS).map((collectionName) =>
                deleteKnownStatsCollection(profileId, collectionName)
            ),
        ]);
    } catch (error) {
        logSharedStatsWarning('clear', profileId, error);
    }
};

export const saveProfileStats = async (
    profileId: string,
    data: DailyStats,
    mode: SyncMode = 'incremental'
): Promise<void> => {
    try {
        if (mode === 'full') {
            await clearProfileStats(profileId);
        }

        const built = buildProfileStatsDocuments(profileId, data, mode);
        const operations: Array<{ path: FirestoreDocumentPath; data: unknown }> = [
            {
                path: [PROFILE_STATS_COLLECTION, profileId] as FirestoreDocumentPath,
                data: built.metadata,
            },
            ...built.days.map((day) => ({
                path: [PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION, day.day] as FirestoreDocumentPath,
                data: day,
            })),
            ...built.heartRateDays.map((heartRateDay) => ({
                path: [PROFILE_STATS_COLLECTION, profileId, HEART_RATE_DAYS_COLLECTION, heartRateDay.day] as FirestoreDocumentPath,
                data: heartRateDay,
            })),
        ];

        Object.entries(built.rawCollections).forEach(([collectionName, items]) => {
            items.forEach((item, index) => {
                operations.push({
                    path: [PROFILE_STATS_COLLECTION, profileId, collectionName, toDocumentId(item, index)] as FirestoreDocumentPath,
                    data: isRecord(item)
                        ? { ...item, updatedAt: built.metadata.updatedAt }
                        : { value: item, updatedAt: built.metadata.updatedAt },
                });
            });
        });

        await commitSetOperations(operations);
    } catch (error) {
        logSharedStatsWarning('save', profileId, error);
    }
};

const readRawCollection = async <T = any>(profileId: string, collectionName: string): Promise<T[]> => {
    const snapshot = await getDocs(collection(db, PROFILE_STATS_COLLECTION, profileId, collectionName));
    return snapshot.docs.map((document) => document.data() as T);
};

export const getStoredDailyStats = async (profileId: string): Promise<DailyStats | null> => {
    try {
        const daysSnapshot = await getDocs(query(collection(db, PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION)));
        if (daysSnapshot.empty) return null;

        const dayDocs = daysSnapshot.docs.map((document) => document.data() as ProfileStatsDayDocument);
        const heartRateDays = await readRawCollection<{ items?: HeartRate[] }>(profileId, HEART_RATE_DAYS_COLLECTION);
        const [
            sleepSessions,
            workouts,
            tags,
            enhancedTags,
            guidedSessions,
            sleepTime,
            restModePeriods,
            ringConfigurations,
        ] = await Promise.all([
            readRawCollection<SleepSession>(profileId, RAW_COLLECTIONS.sleepSessions),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.workouts),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.tags),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.enhancedTags),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.guidedSessions),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.sleepTime),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.restModePeriods),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.ringConfigurations),
        ]);

        return {
            sleep: sortByDayDesc(dayDocs.map((day) => day.sleep).filter(Boolean) as any[]),
            readiness: sortByDayDesc(dayDocs.map((day) => day.readiness).filter(Boolean) as any[]),
            activity: sortByDayDesc(dayDocs.map((day) => day.activity).filter(Boolean) as any[]),
            session: sortByDayDesc(sleepSessions || []),
            spo2: sortByDayDesc(dayDocs.map((day) => day.spo2).filter(Boolean) as any[]),
            stress: sortByDayDesc(dayDocs.map((day) => day.stress).filter(Boolean) as any[]),
            resilience: sortByDayDesc(dayDocs.map((day) => day.resilience).filter(Boolean) as any[]),
            heartrate: sortByTimestampDesc(heartRateDays.flatMap((entry) => entry.items || [])),
            workout: sortByDayDesc(workouts || []),
            guidedSession: sortByDayDesc(guidedSessions || []),
            sleepTime: sortByDayDesc(sleepTime || []),
            tag: sortByDayDesc(tags || []),
            enhancedTag: sortByDayDesc(enhancedTags || []),
            restModePeriod: sortByDayDesc(restModePeriods || []),
            ringConfiguration: ringConfigurations || [],
            cardiovascularAge: sortByDayDesc(dayDocs.map((day) => day.cardiovascularAge).filter(Boolean) as any[]),
            vo2Max: sortByDayDesc(dayDocs.map((day) => day.vo2Max).filter(Boolean) as any[]),
        };
    } catch (error) {
        logSharedStatsWarning('read', profileId, error);
        return null;
    }
};

export const deleteProfileStats = async (profileId: string): Promise<void> => {
    try {
        await clearProfileStats(profileId);
        await deleteDoc(doc(db, PROFILE_STATS_COLLECTION, profileId));
    } catch (error) {
        logSharedStatsWarning('delete', profileId, error);
    }
};

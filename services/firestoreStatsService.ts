import {
    collection,
    deleteDoc,
    doc,
    FirestoreError,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    writeBatch,
} from 'firebase/firestore';
import {
    collection as bootstrapCollection,
    doc as bootstrapDoc,
    getDoc as getBootstrapDoc,
    getDocs as getBootstrapDocs,
    limit as bootstrapLimit,
    orderBy as bootstrapOrderBy,
    query as bootstrapQuery,
} from 'firebase/firestore/lite';
import { bootstrapDb, db } from './firebaseConfig';
import {
    DailyStats,
    HeartRate,
    OuraEndpointDiagnostic,
    OuraPersonalInfo,
    RingBatteryLevel,
    SleepSession,
} from '../types';
import { PROFILE_STATS_SCHEMA_VERSION } from './profileStatsConstants';

export const PROFILE_STATS_COLLECTION = 'profileStats';

const DAYS_COLLECTION = 'days';
const HEART_RATE_DAYS_COLLECTION = 'heartRateDays';
const SNAPSHOTS_COLLECTION = 'snapshots';
const DASHBOARD_SNAPSHOT_DOCUMENT = 'dashboard';
export const DASHBOARD_SNAPSHOT_SCHEMA_VERSION = 1;
export const DASHBOARD_SNAPSHOT_DAY_LIMIT = 30;

const RAW_COLLECTIONS = {
    sleepSessions: 'sleepSessions',
    workouts: 'workouts',
    tags: 'tags',
    enhancedTags: 'enhancedTags',
    guidedSessions: 'guidedSessions',
    sleepTime: 'sleepTime',
    restModePeriods: 'restModePeriods',
    ringConfigurations: 'ringConfigurations',
    ringBatteryLevels: 'ringBatteryLevels',
    personalInfo: 'personalInfo',
    vo2Max: 'vo2Max',
} as const;

const RAW_COLLECTION_BY_WEBHOOK_DATA_TYPE: Record<string, string> = {
    sleep: RAW_COLLECTIONS.sleepSessions,
    workout: RAW_COLLECTIONS.workouts,
    tag: RAW_COLLECTIONS.tags,
    enhanced_tag: RAW_COLLECTIONS.enhancedTags,
    session: RAW_COLLECTIONS.guidedSessions,
    sleep_time: RAW_COLLECTIONS.sleepTime,
    rest_mode_period: RAW_COLLECTIONS.restModePeriods,
    ring_configuration: RAW_COLLECTIONS.ringConfigurations,
    vO2_max: RAW_COLLECTIONS.vo2Max,
    vo2_max: RAW_COLLECTIONS.vo2Max,
};

const DAY_FIELD_BY_WEBHOOK_DATA_TYPE: Record<string, keyof ProfileStatsDayDocument> = {
    daily_sleep: 'sleep',
    daily_readiness: 'readiness',
    daily_activity: 'activity',
    daily_spo2: 'spo2',
    daily_stress: 'stress',
    daily_resilience: 'resilience',
    daily_cardiovascular_age: 'cardiovascularAge',
    vO2_max: 'vo2Max',
    vo2_max: 'vo2Max',
    sleep: 'bestSleepSession',
};

type SyncMode = 'incremental' | 'full';

export interface ProfileStatsMetadata {
    profileId: string;
    schemaVersion: number;
    oldestDay: string | null;
    newestDay: string | null;
    lastFullSyncAt?: string | null;
    lastFullSyncSchemaVersion?: number | null;
    lastIncrementalSyncAt?: string | null;
    lastSyncError?: string | null;
    endpointDiagnostics?: Record<string, OuraEndpointDiagnostic | null>;
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

export interface ProfileDashboardSnapshot {
    profileId: string;
    schemaVersion: number;
    updatedAt: string;
    data: DailyStats;
}

type BuiltProfileStatsDocuments = {
    metadata: ProfileStatsMetadata;
    days: ProfileStatsDayDocument[];
    heartRateDays: Array<{ day: string; items: HeartRate[]; updatedAt: string }>;
    rawCollections: Record<string, unknown[]>;
};

type BuiltProfileStatsSliceDocuments = Omit<BuiltProfileStatsDocuments, 'metadata'>;

type FirestoreDocumentPath = [string, string, ...string[]];
type FirestoreSetOperation = {
    path: FirestoreDocumentPath;
    data: unknown;
    merge?: boolean;
};
type PartitionOptions = {
    maxOperations?: number;
    maxBytes?: number;
};

const MAX_BATCH_OPERATIONS = 450;
const TARGET_BATCH_BYTES = 7 * 1024 * 1024;
const PAYLOAD_TOO_LARGE_ERROR_PATTERN = /payload size exceeds the limit|request payload size exceeds the limit/i;
const textEncoder = new TextEncoder();

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
    const sourceIdentity = isRecord(item)
        ? [
            item.timestamp,
            item.start_datetime,
            item.start_time,
            item.bedtime_start,
            item.day,
            item.type,
        ].filter((value) => value != null && value !== '').map(String).join('|')
        : '';
    const rawId = isRecord(item) && item.id != null
        ? String(item.id)
        : sourceIdentity || JSON.stringify(item);
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

const buildProfileStatsMetadata = (
    profileId: string,
    data: DailyStats,
    mode: SyncMode,
    now: string
): ProfileStatsMetadata => {
    const { oldestDay, newestDay } = extractDayRange(data);

    return stripUndefinedDeep({
        profileId,
        schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
        oldestDay,
        newestDay,
        lastFullSyncAt: mode === 'full' ? now : undefined,
        lastFullSyncSchemaVersion: mode === 'full' ? PROFILE_STATS_SCHEMA_VERSION : undefined,
        lastIncrementalSyncAt: mode === 'incremental' ? now : undefined,
        lastSyncError: null,
        endpointDiagnostics: data.endpointDiagnostics || {},
        updatedAt: now,
    });
};

const minIsoDay = (left?: string | null, right?: string | null): string | null => {
    const values = [left, right].filter((value): value is string => Boolean(value)).sort();
    return values[0] || null;
};

const maxIsoDay = (left?: string | null, right?: string | null): string | null => {
    const values = [left, right].filter((value): value is string => Boolean(value)).sort();
    return values.at(-1) || null;
};

export const mergeIncrementalProfileStatsMetadata = (
    current: ProfileStatsMetadata | null,
    incoming: ProfileStatsMetadata
): ProfileStatsMetadata => stripUndefinedDeep({
    ...(current || {}),
    ...incoming,
    oldestDay: minIsoDay(current?.oldestDay, incoming.oldestDay),
    newestDay: maxIsoDay(current?.newestDay, incoming.newestDay),
});

const buildRawCollections = (data: DailyStats): Record<string, unknown[]> => ({
    [RAW_COLLECTIONS.personalInfo]: data.personalInfo ? [data.personalInfo] : [],
    [RAW_COLLECTIONS.sleepSessions]: data.session || [],
    [RAW_COLLECTIONS.workouts]: data.workout || [],
    [RAW_COLLECTIONS.tags]: data.tag || [],
    [RAW_COLLECTIONS.enhancedTags]: data.enhancedTag || [],
    [RAW_COLLECTIONS.guidedSessions]: data.guidedSession || [],
    [RAW_COLLECTIONS.sleepTime]: data.sleepTime || [],
    [RAW_COLLECTIONS.restModePeriods]: data.restModePeriod || [],
    [RAW_COLLECTIONS.ringConfigurations]: data.ringConfiguration || [],
    [RAW_COLLECTIONS.ringBatteryLevels]: data.ringBatteryLevel || [],
    [RAW_COLLECTIONS.vo2Max]: data.vo2Max || [],
});

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

const buildProfileStatsSliceDocuments = (
    data: DailyStats,
    now: string = new Date().toISOString()
): BuiltProfileStatsSliceDocuments => {
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
        days,
        heartRateDays: groupHeartRateByDay(data.heartrate, now),
        rawCollections: buildRawCollections(data),
    };
};

export const buildProfileStatsDocuments = (
    profileId: string,
    data: DailyStats,
    mode: SyncMode,
    now: string = new Date().toISOString()
): BuiltProfileStatsDocuments => {
    return {
        metadata: buildProfileStatsMetadata(profileId, data, mode, now),
        ...buildProfileStatsSliceDocuments(data, now),
    };
};

export const buildIncrementalProfileStatsDocuments = (
    profileId: string,
    mergedData: DailyStats,
    deltaData: DailyStats,
    now: string = new Date().toISOString()
): BuiltProfileStatsDocuments => ({
    metadata: buildProfileStatsMetadata(profileId, mergedData, 'incremental', now),
    ...buildProfileStatsSliceDocuments(deltaData, now),
});

const selectDashboardDays = (data: DailyStats): string[] => {
    const days = new Set<string>();
    const collect = (items?: Array<{ day?: string }>) => {
        items?.forEach((item) => {
            if (item.day) days.add(item.day);
        });
    };

    collect(data.sleep);
    collect(data.readiness);
    collect(data.activity);
    collect(data.session);
    collect(data.spo2);
    collect(data.stress);
    collect(data.resilience);
    collect(data.cardiovascularAge as Array<{ day?: string }> | undefined);
    collect(data.vo2Max as Array<{ day?: string }> | undefined);
    return Array.from(days).sort((left, right) => right.localeCompare(left)).slice(0, DASHBOARD_SNAPSHOT_DAY_LIMIT);
};

const selectOnePerDashboardDay = <T extends { day?: string }>(
    items: T[] | undefined,
    days: readonly string[]
): T[] => days.flatMap((day) => {
    const item = items?.find((candidate) => candidate.day === day);
    return item ? [item] : [];
});

const toDashboardActivitySummary = (
    activity: DailyStats['activity'][number]
): DailyStats['activity'][number] => {
    const summary = { ...activity } as DailyStats['activity'][number] & Record<string, unknown>;
    delete summary.class_5_min;
    delete summary.met;
    return summary;
};

const toDashboardSessionSummary = (session: SleepSession): SleepSession => {
    const summary = { ...session } as SleepSession & Record<string, unknown>;
    [
        'movement_30_sec',
        'sleep_phase_30_sec',
        'sleep_phase_5_min',
        'app_sleep_phase_5_min',
        'heart_rate',
        'hrv',
        'readiness',
    ].forEach((field) => delete summary[field]);
    return summary;
};

/**
 * Build the bounded data needed by the Today and leaderboard views. Full raw
 * samples and all-time history remain in their normalized collections and are
 * fetched only by views that actually need them.
 */
export const buildProfileDashboardSnapshot = (
    profileId: string,
    data: DailyStats,
    now: string = new Date().toISOString()
): ProfileDashboardSnapshot => {
    const days = selectDashboardDays(data);
    const sessions = days.flatMap((day) => {
        const best = pickBestSession((data.session || []).filter((session) => session.day === day));
        return best ? [toDashboardSessionSummary(best)] : [];
    });

    return stripUndefinedDeep({
        profileId,
        schemaVersion: DASHBOARD_SNAPSHOT_SCHEMA_VERSION,
        updatedAt: now,
        data: {
            sleep: selectOnePerDashboardDay(data.sleep, days),
            readiness: selectOnePerDashboardDay(data.readiness, days),
            activity: selectOnePerDashboardDay(data.activity, days).map(toDashboardActivitySummary),
            session: sessions,
            spo2: selectOnePerDashboardDay(data.spo2, days),
            stress: selectOnePerDashboardDay(data.stress, days),
            resilience: selectOnePerDashboardDay(data.resilience, days),
            cardiovascularAge: selectOnePerDashboardDay(
                data.cardiovascularAge as Array<{ day?: string }> | undefined,
                days
            ),
            vo2Max: selectOnePerDashboardDay(
                data.vo2Max as Array<{ day?: string }> | undefined,
                days
            ),
            resilienceDiagnostic: data.resilienceDiagnostic ?? null,
            endpointDiagnostics: data.endpointDiagnostics || {},
        },
    }) as ProfileDashboardSnapshot;
};

const normalizeSetOperation = (operation: FirestoreSetOperation): FirestoreSetOperation => ({
    path: operation.path,
    data: stripUndefinedDeep(operation.data),
    merge: operation.merge,
});

export const estimateSetOperationBytes = (operation: FirestoreSetOperation): number => {
    try {
        return textEncoder.encode(JSON.stringify(operation)).length;
    } catch {
        return TARGET_BATCH_BYTES;
    }
};

export const partitionSetOperations = (
    operations: FirestoreSetOperation[],
    options: PartitionOptions = {}
): FirestoreSetOperation[][] => {
    const maxOperations = options.maxOperations ?? MAX_BATCH_OPERATIONS;
    const maxBytes = options.maxBytes ?? TARGET_BATCH_BYTES;
    const batches: FirestoreSetOperation[][] = [];
    let currentBatch: FirestoreSetOperation[] = [];
    let currentBatchBytes = 0;

    const flush = () => {
        if (!currentBatch.length) return;
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchBytes = 0;
    };

    operations.forEach((operation) => {
        const normalized = normalizeSetOperation(operation);
        const operationBytes = estimateSetOperationBytes(normalized);
        const wouldExceedOperationLimit = currentBatch.length >= maxOperations;
        const wouldExceedByteLimit = currentBatch.length > 0 && (currentBatchBytes + operationBytes) > maxBytes;

        if (wouldExceedOperationLimit || wouldExceedByteLimit) {
            flush();
        }

        currentBatch.push(normalized);
        currentBatchBytes += operationBytes;

        if (currentBatch.length >= maxOperations || currentBatchBytes >= maxBytes) {
            flush();
        }
    });

    flush();
    return batches;
};

const isPayloadTooLargeError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    return PAYLOAD_TOO_LARGE_ERROR_PATTERN.test(message);
};

const commitOperationBatch = async (operations: FirestoreSetOperation[]): Promise<void> => {
    const batch = writeBatch(db);
    operations.forEach((operation) => {
        const [collectionPath, documentPath, ...pathSegments] = operation.path;
        const documentRef = doc(db, collectionPath, documentPath, ...pathSegments);
        if (operation.merge === false) {
            batch.set(documentRef, operation.data);
        } else {
            batch.set(documentRef, operation.data, { merge: true });
        }
    });
    await batch.commit();
};

const commitOperationBatchWithRetry = async (operations: FirestoreSetOperation[]): Promise<void> => {
    try {
        await commitOperationBatch(operations);
    } catch (error) {
        if (isPayloadTooLargeError(error) && operations.length > 1) {
            const middle = Math.ceil(operations.length / 2);
            await commitOperationBatchWithRetry(operations.slice(0, middle));
            await commitOperationBatchWithRetry(operations.slice(middle));
            return;
        }

        throw error;
    }
};

const commitSetOperations = async (
    operations: FirestoreSetOperation[]
): Promise<void> => {
    const batches = partitionSetOperations(operations);
    for (const batch of batches) {
        await commitOperationBatchWithRetry(batch);
    }
};

const commitIncrementalMetadata = async (
    profileId: string,
    incoming: ProfileStatsMetadata
): Promise<void> => {
    await runTransaction(db, async (transaction) => {
        const metadataRef = doc(db, PROFILE_STATS_COLLECTION, profileId);
        const snapshot = await transaction.get(metadataRef);
        const current = snapshot.exists()
            ? snapshot.data() as ProfileStatsMetadata
            : null;
        transaction.set(
            metadataRef,
            mergeIncrementalProfileStatsMetadata(current, incoming),
            { merge: true }
        );
    });
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

const deleteUnexpectedStatsDocuments = async (
    profileId: string,
    collectionName: string,
    expectedDocumentIds: Set<string>
): Promise<void> => {
    const snapshot = await getDocs(collection(db, PROFILE_STATS_COLLECTION, profileId, collectionName));
    const obsoleteDocuments = snapshot.docs.filter((document) => !expectedDocumentIds.has(document.id));
    for (let index = 0; index < obsoleteDocuments.length; index += 450) {
        const batch = writeBatch(db);
        obsoleteDocuments.slice(index, index + 450).forEach((document) => batch.delete(document.ref));
        await batch.commit();
    }
};

const pruneFullProfileStats = async (
    profileId: string,
    built: BuiltProfileStatsDocuments
): Promise<void> => {
    const expectedByCollection = new Map<string, Set<string>>([
        [DAYS_COLLECTION, new Set(built.days.map((day) => day.day))],
        [HEART_RATE_DAYS_COLLECTION, new Set(built.heartRateDays.map((day) => day.day))],
    ]);
    Object.entries(built.rawCollections).forEach(([collectionName, items]) => {
        expectedByCollection.set(
            collectionName,
            new Set(items.map((item, index) => toDocumentId(item, index)))
        );
    });

    await Promise.all(Array.from(expectedByCollection.entries()).map(
        ([collectionName, expectedDocumentIds]) =>
            deleteUnexpectedStatsDocuments(profileId, collectionName, expectedDocumentIds)
    ));
};

type SaveProfileStatsDependencies = {
    commitOperations?: (operations: FirestoreSetOperation[]) => Promise<void>;
    pruneFullSnapshot?: (profileId: string, built: BuiltProfileStatsDocuments) => Promise<void>;
};

export const clearProfileStats = async (profileId: string): Promise<void> => {
    try {
        await Promise.all([
            deleteKnownStatsCollection(profileId, DAYS_COLLECTION),
            deleteKnownStatsCollection(profileId, HEART_RATE_DAYS_COLLECTION),
            deleteKnownStatsCollection(profileId, SNAPSHOTS_COLLECTION),
            ...Object.values(RAW_COLLECTIONS).map((collectionName) =>
                deleteKnownStatsCollection(profileId, collectionName)
            ),
        ]);
    } catch (error) {
        logSharedStatsWarning('clear', profileId, error);
        throw error;
    }
};

export const saveProfileStats = async (
    profileId: string,
    data: DailyStats,
    mode: SyncMode = 'incremental',
    dependencies: SaveProfileStatsDependencies = {}
): Promise<void> => {
    try {
        const built = buildProfileStatsDocuments(profileId, data, mode);
        const dashboardSnapshot = buildProfileDashboardSnapshot(
            profileId,
            data,
            built.metadata.updatedAt
        );
        const commitOperations = dependencies.commitOperations ?? commitSetOperations;
        const pruneFullSnapshot = dependencies.pruneFullSnapshot ?? pruneFullProfileStats;
        const dataOperations: FirestoreSetOperation[] = [
            ...built.days.map((day) => ({
                path: [PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION, day.day] as FirestoreDocumentPath,
                data: day,
                merge: mode !== 'full',
            })),
            ...built.heartRateDays.map((heartRateDay) => ({
                path: [PROFILE_STATS_COLLECTION, profileId, HEART_RATE_DAYS_COLLECTION, heartRateDay.day] as FirestoreDocumentPath,
                data: heartRateDay,
                merge: mode !== 'full',
            })),
            {
                path: [PROFILE_STATS_COLLECTION, profileId, SNAPSHOTS_COLLECTION, DASHBOARD_SNAPSHOT_DOCUMENT] as FirestoreDocumentPath,
                data: dashboardSnapshot,
                merge: false,
            },
        ];

        Object.entries(built.rawCollections).forEach(([collectionName, items]) => {
            items.forEach((item, index) => {
                dataOperations.push({
                    path: [PROFILE_STATS_COLLECTION, profileId, collectionName, toDocumentId(item, index)] as FirestoreDocumentPath,
                    data: isRecord(item)
                        ? { ...item, updatedAt: built.metadata.updatedAt }
                        : { value: item, updatedAt: built.metadata.updatedAt },
                    merge: mode !== 'full',
                });
            });
        });

        // Commit replacement data first, prune only after every replacement
        // write succeeds, then publish freshness metadata last. A failure at
        // any point leaves the previous metadata intact and is surfaced to the
        // caller instead of reporting a false successful sync.
        await commitOperations(dataOperations);
        if (mode === 'full') {
            await pruneFullSnapshot(profileId, built);
        }
        await commitOperations([{
            path: [PROFILE_STATS_COLLECTION, profileId] as FirestoreDocumentPath,
            data: built.metadata,
            merge: true,
        }]);
    } catch (error) {
        logSharedStatsWarning('save', profileId, error);
        throw error;
    }
};

export const saveIncrementalProfileStats = async (
    profileId: string,
    mergedData: DailyStats,
    deltaData: DailyStats
): Promise<void> => {
    try {
        const built = buildIncrementalProfileStatsDocuments(profileId, mergedData, deltaData);
        const dashboardSnapshot = buildProfileDashboardSnapshot(
            profileId,
            mergedData,
            built.metadata.updatedAt
        );
        const dataOperations: FirestoreSetOperation[] = [
            ...built.days.map((day) => ({
                path: [PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION, day.day] as FirestoreDocumentPath,
                data: day,
            })),
            ...built.heartRateDays.map((heartRateDay) => ({
                path: [PROFILE_STATS_COLLECTION, profileId, HEART_RATE_DAYS_COLLECTION, heartRateDay.day] as FirestoreDocumentPath,
                data: heartRateDay,
            })),
            {
                path: [PROFILE_STATS_COLLECTION, profileId, SNAPSHOTS_COLLECTION, DASHBOARD_SNAPSHOT_DOCUMENT] as FirestoreDocumentPath,
                data: dashboardSnapshot,
                merge: false,
            },
        ];

        Object.entries(built.rawCollections).forEach(([collectionName, items]) => {
            items.forEach((item, index) => {
                dataOperations.push({
                    path: [PROFILE_STATS_COLLECTION, profileId, collectionName, toDocumentId(item, index)] as FirestoreDocumentPath,
                    data: isRecord(item)
                        ? { ...item, updatedAt: built.metadata.updatedAt }
                        : { value: item, updatedAt: built.metadata.updatedAt },
                });
            });
        });

        await commitSetOperations(dataOperations);
        // A startup client intentionally holds only the compact dashboard
        // window. Merge coverage transactionally so that incremental syncs can
        // advance the newest day without erasing the durable oldest day or the
        // last-full-sync evidence used by complete exports.
        await commitIncrementalMetadata(profileId, built.metadata);
    } catch (error) {
        logSharedStatsWarning('incremental save', profileId, error);
        throw error;
    }
};

export const getProfileStatsMetadata = async (profileId: string): Promise<ProfileStatsMetadata | null> => {
    try {
        const snapshot = await getDoc(doc(db, PROFILE_STATS_COLLECTION, profileId));
        if (!snapshot.exists()) return null;
        return snapshot.data() as ProfileStatsMetadata;
    } catch (error) {
        logSharedStatsWarning('read metadata', profileId, error);
        return null;
    }
};

const isProfileDashboardSnapshot = (
    value: unknown,
    profileId: string
): value is ProfileDashboardSnapshot => {
    if (!isRecord(value) || value.profileId !== profileId) return false;
    if (value.schemaVersion !== DASHBOARD_SNAPSHOT_SCHEMA_VERSION || !isRecord(value.data)) return false;
    return ['sleep', 'readiness', 'activity', 'session', 'spo2', 'stress', 'resilience']
        .every((field) => Array.isArray(value.data[field]));
};

/**
 * Listen only to the compact server-published dashboard snapshot. The browser
 * never contacts Oura here; background functions publish a replacement when
 * Oura reports new data.
 */
export const subscribeToDashboardStats = (
    profileId: string,
    callback: (data: DailyStats | null) => void,
    onError?: (error: unknown) => void
): (() => void) => onSnapshot(
    doc(db, PROFILE_STATS_COLLECTION, profileId, SNAPSHOTS_COLLECTION, DASHBOARD_SNAPSHOT_DOCUMENT),
    (snapshot) => {
        if (!snapshot.exists()) {
            callback(null);
            return;
        }
        const stored = snapshot.data();
        callback(isProfileDashboardSnapshot(stored, profileId) ? stored.data : null);
    },
    (error) => onError?.(error)
);

const buildDashboardSourceFromDays = (
    dayDocs: ProfileStatsDayDocument[],
    metadata?: ProfileStatsMetadata
): DailyStats => ({
    sleep: sortByDayDesc(dayDocs.map((day) => day.sleep).filter(Boolean) as any[]),
    readiness: sortByDayDesc(dayDocs.map((day) => day.readiness).filter(Boolean) as any[]),
    activity: sortByDayDesc(dayDocs.map((day) => day.activity).filter(Boolean) as any[]),
    session: sortByDayDesc(dayDocs.map((day) => day.bestSleepSession).filter(Boolean) as SleepSession[]),
    spo2: sortByDayDesc(dayDocs.map((day) => day.spo2).filter(Boolean) as any[]),
    stress: sortByDayDesc(dayDocs.map((day) => day.stress).filter(Boolean) as any[]),
    resilience: sortByDayDesc(dayDocs.map((day) => day.resilience).filter(Boolean) as any[]),
    cardiovascularAge: sortByDayDesc(dayDocs.map((day) => day.cardiovascularAge).filter(Boolean) as any[]),
    vo2Max: sortByDayDesc(dayDocs.map((day) => day.vo2Max).filter(Boolean) as any[]),
    endpointDiagnostics: metadata?.endpointDiagnostics || {},
});

/**
 * Read only the compact Today-view snapshot during application bootstrap. Old
 * profiles self-heal from a bounded 30-day query; the full-history collections
 * are intentionally untouched until Trends, export, or another history view is
 * opened.
 */
export const getStoredDashboardStats = async (profileId: string): Promise<DailyStats | null> => {
    try {
        const snapshotRef = bootstrapDoc(
            bootstrapDb,
            PROFILE_STATS_COLLECTION,
            profileId,
            SNAPSHOTS_COLLECTION,
            DASHBOARD_SNAPSHOT_DOCUMENT
        );
        const snapshot = await getBootstrapDoc(snapshotRef);
        if (snapshot.exists()) {
            const stored = snapshot.data();
            if (isProfileDashboardSnapshot(stored, profileId)) {
                return stored.data;
            }
        }

        const [daysSnapshot, metadataSnapshot] = await Promise.all([
            getBootstrapDocs(bootstrapQuery(
                bootstrapCollection(bootstrapDb, PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION),
                bootstrapOrderBy('day', 'desc'),
                bootstrapLimit(DASHBOARD_SNAPSHOT_DAY_LIMIT)
            )),
            getBootstrapDoc(bootstrapDoc(bootstrapDb, PROFILE_STATS_COLLECTION, profileId)),
        ]);
        if (daysSnapshot.empty && !metadataSnapshot.exists()) return null;

        const dayDocs = daysSnapshot.docs.map((document) => document.data() as ProfileStatsDayDocument);
        const metadata = metadataSnapshot.exists()
            ? metadataSnapshot.data() as ProfileStatsMetadata
            : undefined;
        const dashboardSnapshot = buildProfileDashboardSnapshot(
            profileId,
            buildDashboardSourceFromDays(dayDocs, metadata),
            metadata?.updatedAt || new Date().toISOString()
        );

        return dashboardSnapshot.data;
    } catch (error) {
        logSharedStatsWarning('dashboard read', profileId, error);
        throw error;
    }
};

const readRawCollection = async <T = any>(profileId: string, collectionName: string): Promise<T[]> => {
    const snapshot = await getDocs(collection(db, PROFILE_STATS_COLLECTION, profileId, collectionName));
    return snapshot.docs.map((document) => document.data() as T);
};

export const getStoredDailyStats = async (profileId: string): Promise<DailyStats | null> => {
    try {
        const [daysSnapshot, metadataSnapshot] = await Promise.all([
            getDocs(query(collection(db, PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION))),
            getDoc(doc(db, PROFILE_STATS_COLLECTION, profileId)),
        ]);
        if (daysSnapshot.empty && !metadataSnapshot.exists()) return null;

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
            ringBatteryLevels,
            personalInfoRows,
            rawVo2Max,
        ] = await Promise.all([
            readRawCollection<SleepSession>(profileId, RAW_COLLECTIONS.sleepSessions),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.workouts),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.tags),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.enhancedTags),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.guidedSessions),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.sleepTime),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.restModePeriods),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.ringConfigurations),
            readRawCollection<RingBatteryLevel>(profileId, RAW_COLLECTIONS.ringBatteryLevels),
            readRawCollection<OuraPersonalInfo>(profileId, RAW_COLLECTIONS.personalInfo),
            readRawCollection<any>(profileId, RAW_COLLECTIONS.vo2Max),
        ]);

        return {
            personalInfo: personalInfoRows[0] || null,
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
            ringBatteryLevel: sortByTimestampDesc(ringBatteryLevels || []),
            cardiovascularAge: sortByDayDesc(dayDocs.map((day) => day.cardiovascularAge).filter(Boolean) as any[]),
            vo2Max: sortByDayDesc(Array.from(new Map([
                ...(dayDocs.map((day) => day.vo2Max).filter(Boolean) as any[]),
                ...(rawVo2Max || []),
            ].map((item, index) => [
                String(item?.id || `${item?.day || ''}|${item?.timestamp || ''}|${index}`),
                item,
            ])).values())),
            endpointDiagnostics: (metadataSnapshot.data() as ProfileStatsMetadata | undefined)?.endpointDiagnostics || {},
        };
    } catch (error) {
        logSharedStatsWarning('read', profileId, error);
        return null;
    }
};

/**
 * Reconciles an Oura `delete` webhook against the normalized snapshot. Raw
 * collection documents use the Oura object id; daily summaries are located by
 * inspecting their embedded source id because the Firestore document id is the day.
 */
export const deleteStoredOuraRecord = async (
    profileId: string,
    dataType: string,
    objectId: string,
): Promise<void> => {
    if (!profileId || !dataType || !objectId) return;

    try {
        const rawCollection = RAW_COLLECTION_BY_WEBHOOK_DATA_TYPE[dataType];
        if (rawCollection) {
            await deleteDoc(doc(
                db,
                PROFILE_STATS_COLLECTION,
                profileId,
                rawCollection,
                toDocumentId({ id: objectId }, 0),
            ));
        }

        const dayField = DAY_FIELD_BY_WEBHOOK_DATA_TYPE[dataType];
        if (!dayField) return;

        const snapshot = await getDocs(collection(db, PROFILE_STATS_COLLECTION, profileId, DAYS_COLLECTION));
        const matchingDocuments = snapshot.docs.filter((document) => {
            const value = (document.data() as Record<string, unknown>)[dayField];
            return isRecord(value) && String(value.id ?? '') === objectId;
        });
        if (matchingDocuments.length === 0) return;

        const now = new Date().toISOString();
        for (let index = 0; index < matchingDocuments.length; index += 450) {
            const batch = writeBatch(db);
            matchingDocuments.slice(index, index + 450).forEach((document) => {
                batch.set(document.ref, { [dayField]: null, updatedAt: now }, { merge: true });
            });
            await batch.commit();
        }
    } catch (error) {
        logSharedStatsWarning('webhook delete reconciliation', profileId, error);
        throw error;
    }
};

export const deleteProfileStats = async (profileId: string): Promise<void> => {
    try {
        await clearProfileStats(profileId);
        await deleteDoc(doc(db, PROFILE_STATS_COLLECTION, profileId));
    } catch (error) {
        logSharedStatsWarning('delete', profileId, error);
        throw error;
    }
};

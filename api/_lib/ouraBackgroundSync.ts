import crypto from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminFirestore } from './firebaseAdmin.js';
import { postOuraTokenRequest } from './ouraTokenRequest.js';

const OURA_API_BASE_URL = 'https://api.ouraring.com/v2/usercollection';
const PROFILES_COLLECTION = 'profiles';
const CREDENTIALS_COLLECTION = 'ouraCredentials';
const PROFILE_STATS_COLLECTION = 'profileStats';
const SYNC_STATE_COLLECTION = 'ouraSyncState';
const DASHBOARD_DAY_LIMIT = 30;
const PROFILE_STATS_SCHEMA_VERSION = 2;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;
const MAX_RETRY_DELAY_MS = 4_000;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_CONCURRENT_PROFILES = 2;
const LEASE_MS = 55_000;
const WEBHOOK_COOLDOWN_MS = 15_000;
const HISTORY_START_DAY = '2016-01-01';
const HISTORY_CHUNK_DAYS = 180;

export type BackgroundSyncReason = 'webhook' | 'cron' | 'bootstrap' | 'backfill';

type BackgroundProfile = {
    id: string;
    ouraUserId?: string | number | null;
    token?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: string | null;
    grantedScopes?: string[];
    lastKnownUtcOffsetMinutes?: number | null;
};

type OuraCredential = Pick<BackgroundProfile, 'token' | 'refreshToken' | 'tokenExpiresAt' | 'grantedScopes'> & {
    profileId: string;
    ouraUserId?: string | number | null;
    updatedAt?: string;
};

type DailyStatsLike = {
    personalInfo?: Record<string, unknown> | null;
    sleep: any[];
    readiness: any[];
    activity: any[];
    session: any[];
    spo2: any[];
    stress: any[];
    resilience: any[];
    heartrate?: any[];
    workout?: any[];
    guidedSession?: any[];
    sleepTime?: any[];
    tag?: any[];
    enhancedTag?: any[];
    restModePeriod?: any[];
    ringConfiguration?: any[];
    ringBatteryLevel?: any[];
    cardiovascularAge?: any[];
    vo2Max?: any[];
};

export type OuraWebhookRecord = {
    eventType?: string;
    dataType?: string;
    objectId?: string | null;
};

export type BackgroundSyncResult = {
    profileId: string;
    status: 'synced' | 'skipped' | 'reconnect_required' | 'failed';
    reason: BackgroundSyncReason;
    newestDay?: string | null;
    detail?: string;
};

type SyncOptions = {
    reason: BackgroundSyncReason;
    startDay?: string;
    endDay?: string;
    includeStatic?: boolean;
    webhookRecord?: OuraWebhookRecord;
    db?: Firestore;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    sleep?: (milliseconds: number) => Promise<void>;
};

type OuraRequestFailureKind = 'retryable' | 'unauthorized' | 'reconnect_required';

class OuraBackgroundSyncError extends Error {
    readonly kind: OuraRequestFailureKind;
    readonly status: number | null;

    constructor(kind: OuraRequestFailureKind, message: string, status: number | null = null) {
        super(message);
        this.name = 'OuraBackgroundSyncError';
        this.kind = kind;
        this.status = status;
    }
}

type EndpointDefinition = {
    key: keyof DailyStatsLike;
    endpoint: string;
    optional: boolean;
    dateTime?: boolean;
    static?: boolean;
    enabled: boolean;
};

type LeaseResult = { claimed: true; token: string } | { claimed: false; detail: string };

const emptyStats = (): DailyStatsLike => ({
    personalInfo: null,
    sleep: [],
    readiness: [],
    activity: [],
    session: [],
    spo2: [],
    stress: [],
    resilience: [],
    heartrate: [],
    workout: [],
    guidedSession: [],
    sleepTime: [],
    tag: [],
    enhancedTag: [],
    restModePeriod: [],
    ringConfiguration: [],
    ringBatteryLevel: [],
    cardiovascularAge: [],
    vo2Max: [],
});

const isRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stripUndefinedDeep = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(stripUndefinedDeep) as T;
    if (!isRecord(value)) return value;

    return Object.fromEntries(
        Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
};

const parseTime = (value?: string | null): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const shiftDay = (day: string, amount: number): string => {
    const date = new Date(`${day}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
};

const profileDay = (profile: BackgroundProfile, now: Date): string => {
    const offset = typeof profile.lastKnownUtcOffsetMinutes === 'number'
        ? profile.lastKnownUtcOffsetMinutes
        : -now.getTimezoneOffset();
    return new Date(now.getTime() + offset * 60_000).toISOString().slice(0, 10);
};

const splitDateRange = (startDay: string, endDay: string, windowDays: number = 90) => {
    const windows: Array<{ startDay: string; endDay: string }> = [];
    let cursor = startDay;
    while (cursor <= endDay) {
        const windowEnd = [shiftDay(cursor, windowDays - 1), endDay].sort()[0];
        windows.push({ startDay: cursor, endDay: windowEnd });
        cursor = shiftDay(windowEnd, 1);
    }
    return windows;
};

const itemIdentity = (item: any, index: number): string => {
    if (item?.id != null) return `id:${String(item.id)}`;
    const composite = [
        item?.day,
        item?.timestamp,
        item?.start_datetime,
        item?.end_datetime,
        item?.bedtime_start,
        item?.bedtime_end,
        item?.type,
        item?.activity,
    ].filter(Boolean).join('|');
    return composite ? `fields:${composite}` : `index:${index}`;
};

const sortByDayDescending = (left: any, right: any) =>
    String(right?.day || '').localeCompare(String(left?.day || ''));

const sortByTimestampDescending = (left: any, right: any) =>
    parseTime(right?.timestamp || right?.end_datetime || right?.bedtime_end) -
    parseTime(left?.timestamp || left?.end_datetime || left?.bedtime_end);

const mergeCollection = (current: any[] = [], incoming: any[] = [], sorter = sortByDayDescending) => {
    const merged = new Map<string, any>();
    current.forEach((item, index) => merged.set(itemIdentity(item, index), item));
    incoming.forEach((item, index) => {
        const key = itemIdentity(item, index);
        merged.set(key, { ...(merged.get(key) || {}), ...item });
    });
    return Array.from(merged.values()).sort(sorter);
};

const mergeDailyCollection = (current: any[] = [], incoming: any[] = []) => {
    const merged = new Map<string, any>();
    [...current, ...incoming].forEach((item) => {
        const day = String(item?.day || item?.summary_date || '');
        if (!day) return;
        merged.set(day, { ...(merged.get(day) || {}), ...item });
    });
    return Array.from(merged.values()).sort(sortByDayDescending);
};

export const mergeBackgroundStats = (
    current: Partial<DailyStatsLike> | null | undefined,
    incoming: Partial<DailyStatsLike>
): DailyStatsLike => {
    const base = { ...emptyStats(), ...(current || {}) } as DailyStatsLike;
    return {
        personalInfo: incoming.personalInfo ?? base.personalInfo ?? null,
        sleep: mergeDailyCollection(base.sleep, incoming.sleep),
        readiness: mergeDailyCollection(base.readiness, incoming.readiness),
        activity: mergeDailyCollection(base.activity, incoming.activity),
        session: mergeCollection(base.session, incoming.session),
        spo2: mergeDailyCollection(base.spo2, incoming.spo2),
        stress: mergeDailyCollection(base.stress, incoming.stress),
        resilience: mergeDailyCollection(base.resilience, incoming.resilience),
        heartrate: mergeCollection(base.heartrate, incoming.heartrate, sortByTimestampDescending),
        workout: mergeCollection(base.workout, incoming.workout),
        guidedSession: mergeCollection(base.guidedSession, incoming.guidedSession),
        sleepTime: mergeCollection(base.sleepTime, incoming.sleepTime),
        tag: mergeCollection(base.tag, incoming.tag),
        enhancedTag: mergeCollection(base.enhancedTag, incoming.enhancedTag),
        restModePeriod: mergeCollection(base.restModePeriod, incoming.restModePeriod),
        ringConfiguration: mergeCollection(base.ringConfiguration, incoming.ringConfiguration, sortByTimestampDescending),
        ringBatteryLevel: mergeCollection(base.ringBatteryLevel, incoming.ringBatteryLevel, sortByTimestampDescending),
        cardiovascularAge: mergeDailyCollection(base.cardiovascularAge, incoming.cardiovascularAge),
        vo2Max: mergeCollection(base.vo2Max, incoming.vo2Max),
    };
};

const removeWebhookDeletedRecord = (
    stats: DailyStatsLike,
    record?: OuraWebhookRecord
): DailyStatsLike => {
    if (record?.eventType !== 'delete' || !record.objectId || !record.dataType) return stats;
    const withoutId = (items: any[] | undefined) =>
        (items || []).filter((item) => String(item?.id || '') !== record.objectId);
    const next = { ...stats };
    const dataTypeToKey: Record<string, keyof DailyStatsLike> = {
        daily_sleep: 'sleep',
        daily_readiness: 'readiness',
        daily_activity: 'activity',
        sleep: 'session',
        daily_spo2: 'spo2',
        daily_stress: 'stress',
        daily_resilience: 'resilience',
        workout: 'workout',
        session: 'guidedSession',
        sleep_time: 'sleepTime',
        tag: 'tag',
        enhanced_tag: 'enhancedTag',
        rest_mode_period: 'restModePeriod',
        ring_configuration: 'ringConfiguration',
        daily_cardiovascular_age: 'cardiovascularAge',
        vO2_max: 'vo2Max',
        vo2_max: 'vo2Max',
    };
    const key = dataTypeToKey[record.dataType];
    if (key && Array.isArray(next[key])) {
        (next as any)[key] = withoutId(next[key] as any[]);
    }
    return next;
};

const bestSleepSession = (sessions: any[]): any | null => sessions
    .filter((session) => session?.type !== 'deleted')
    .sort((left, right) => {
        const durationDelta = Number(right?.total_sleep_duration || right?.time_in_bed || 0) -
            Number(left?.total_sleep_duration || left?.time_in_bed || 0);
        return durationDelta || sortByTimestampDescending(left, right);
    })[0] || null;

const stripHighVolumeFields = (value: any, fields: string[]) => {
    const result = { ...value };
    fields.forEach((field) => delete result[field]);
    return result;
};

export const buildBackgroundDashboardSnapshot = (
    profileId: string,
    stats: DailyStatsLike,
    updatedAt: string
) => {
    const daySet = new Set<string>();
    [
        stats.sleep,
        stats.readiness,
        stats.activity,
        stats.session,
        stats.spo2,
        stats.stress,
        stats.resilience,
        stats.cardiovascularAge,
        stats.vo2Max,
    ].forEach((items) => items?.forEach((item: any) => {
        if (item?.day) daySet.add(item.day);
    }));
    const days = Array.from(daySet).sort().reverse().slice(0, DASHBOARD_DAY_LIMIT);
    const onePerDay = (items: any[] | undefined) => days.flatMap((day) => {
        const item = items?.find((candidate) => candidate?.day === day);
        return item ? [item] : [];
    });

    return stripUndefinedDeep({
        profileId,
        schemaVersion: 1,
        updatedAt,
        data: {
            sleep: onePerDay(stats.sleep),
            readiness: onePerDay(stats.readiness),
            activity: onePerDay(stats.activity).map((item) => stripHighVolumeFields(item, ['class_5_min', 'met'])),
            session: days.flatMap((day) => {
                const session = bestSleepSession(stats.session.filter((item) => item?.day === day));
                return session
                    ? [stripHighVolumeFields(session, [
                        'movement_30_sec',
                        'sleep_phase_30_sec',
                        'sleep_phase_5_min',
                        'app_sleep_phase_5_min',
                        'heart_rate',
                        'hrv',
                        'readiness',
                    ])]
                    : [];
            }),
            spo2: onePerDay(stats.spo2),
            stress: onePerDay(stats.stress),
            resilience: onePerDay(stats.resilience),
            cardiovascularAge: onePerDay(stats.cardiovascularAge),
            vo2Max: onePerDay(stats.vo2Max),
        },
    });
};

const normalizedScopes = (scopes?: string[]) => new Set(
    (scopes || []).map((scope) => scope.toLowerCase().replace(/^extapi:/, '').replace(/[^a-z0-9]/g, ''))
);

const endpointDefinitions = (profile: BackgroundProfile, includeStatic: boolean): EndpointDefinition[] => {
    const scopes = normalizedScopes(profile.grantedScopes);
    const attemptAll = scopes.size === 0;
    const has = (...values: string[]) => attemptAll || values.some((value) => scopes.has(value.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const daily = has('daily', 'daily_sleep', 'daily_readiness', 'daily_activity');
    const personal = has('personal');

    return [
        { key: 'sleep', endpoint: 'daily_sleep', optional: false, enabled: daily },
        { key: 'readiness', endpoint: 'daily_readiness', optional: false, enabled: daily },
        { key: 'activity', endpoint: 'daily_activity', optional: false, enabled: daily },
        { key: 'session', endpoint: 'sleep', optional: false, enabled: daily },
        { key: 'spo2', endpoint: 'daily_spo2', optional: true, enabled: has('spo2daily', 'daily_spo2', 'spo2') },
        { key: 'stress', endpoint: 'daily_stress', optional: true, enabled: daily },
        { key: 'resilience', endpoint: 'daily_resilience', optional: true, enabled: daily },
        { key: 'heartrate', endpoint: 'heartrate', optional: true, dateTime: true, enabled: has('heartrate', 'heart_rate') },
        { key: 'workout', endpoint: 'workout', optional: true, enabled: has('workout') },
        { key: 'guidedSession', endpoint: 'session', optional: true, enabled: has('session') },
        { key: 'sleepTime', endpoint: 'sleep_time', optional: true, enabled: daily },
        { key: 'tag', endpoint: 'tag', optional: true, enabled: has('tag', 'taguser', 'enhanced_tag') },
        { key: 'enhancedTag', endpoint: 'enhanced_tag', optional: true, enabled: has('tag', 'taguser', 'enhanced_tag') },
        { key: 'restModePeriod', endpoint: 'rest_mode_period', optional: true, enabled: daily },
        { key: 'ringConfiguration', endpoint: 'ring_configuration', optional: true, static: true, enabled: includeStatic && personal },
        { key: 'ringBatteryLevel', endpoint: 'ring_battery_level', optional: true, dateTime: true, enabled: personal },
        { key: 'cardiovascularAge', endpoint: 'daily_cardiovascular_age', optional: true, enabled: daily },
        { key: 'vo2Max', endpoint: 'vO2_max', optional: true, enabled: daily },
    ];
};

const retryDelay = (attempt: number, retryAfter: string | null, nowMs: number): number => {
    if (retryAfter) {
        const seconds = Number(retryAfter);
        const dateMs = Date.parse(retryAfter);
        const delay = Number.isFinite(seconds)
            ? seconds * 1_000
            : Number.isFinite(dateMs)
                ? Math.max(0, dateMs - nowMs)
                : null;
        if (delay != null) return Math.min(delay, MAX_RETRY_DELAY_MS);
    }
    return Math.min(500 * (2 ** attempt), MAX_RETRY_DELAY_MS);
};

const fetchPage = async (
    url: string,
    token: string,
    optional: boolean,
    fetchImpl: typeof fetch,
    sleep: (milliseconds: number) => Promise<void>
): Promise<any> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetchImpl(url, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            });
            const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
            if (retryable && attempt < MAX_RETRIES) {
                await sleep(retryDelay(attempt, response.headers.get('Retry-After'), Date.now()));
                continue;
            }
            if (!response.ok) {
                if (response.status === 401 && !optional) {
                    throw new OuraBackgroundSyncError('unauthorized', 'oura_access_token_rejected', 401);
                }
                if (optional && [400, 401, 403, 404].includes(response.status)) return { data: [] };
                throw new OuraBackgroundSyncError('retryable', `oura_${response.status}`, response.status);
            }
            return await response.json();
        } catch (error) {
            if (error instanceof OuraBackgroundSyncError) throw error;
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await sleep(retryDelay(attempt, null, Date.now()));
                continue;
            }
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new OuraBackgroundSyncError(
        'retryable',
        lastError instanceof Error && lastError.name === 'AbortError'
            ? 'oura_request_timeout'
            : 'oura_request_unavailable'
    );
};

const fetchCollectionWindow = async (
    definition: EndpointDefinition,
    token: string,
    startDay: string,
    endDay: string,
    fetchImpl: typeof fetch,
    sleep: (milliseconds: number) => Promise<void>
): Promise<any[]> => {
    const results: any[] = [];
    let nextToken: string | null = null;
    do {
        const search = new URLSearchParams();
        if (!definition.static) {
            if (definition.dateTime) {
                search.set('start_datetime', `${startDay}T00:00:00`);
                search.set('end_datetime', `${endDay}T23:59:59`);
            } else {
                search.set('start_date', startDay);
                search.set('end_date', endDay);
            }
        }
        if (nextToken) search.set('next_token', nextToken);
        const query = search.toString();
        const payload = await fetchPage(
            `${OURA_API_BASE_URL}/${definition.endpoint}${query ? `?${query}` : ''}`,
            token,
            definition.optional,
            fetchImpl,
            sleep
        );
        if (Array.isArray(payload?.data)) results.push(...payload.data);
        nextToken = typeof payload?.next_token === 'string' && payload.next_token ? payload.next_token : null;
    } while (nextToken);
    return results;
};

const runWithConcurrency = async <T, R>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<R>
): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) return;
            results[index] = await task(items[index]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
};

const fetchEndpoint = async (
    definition: EndpointDefinition,
    token: string,
    startDay: string,
    endDay: string,
    fetchImpl: typeof fetch,
    sleep: (milliseconds: number) => Promise<void>
) => {
    if (!definition.enabled) return [];
    const windows = definition.static
        ? [{ startDay, endDay }]
        : splitDateRange(startDay, endDay);
    const chunks: any[][] = [];
    for (const window of windows) {
        chunks.push(await fetchCollectionWindow(
            definition,
            token,
            window.startDay,
            window.endDay,
            fetchImpl,
            sleep
        ));
    }
    return chunks.flat();
};

const fetchPersonalInfo = async (token: string, fetchImpl: typeof fetch, sleep: (milliseconds: number) => Promise<void>) => {
    const payload = await fetchPage(`${OURA_API_BASE_URL}/personal_info`, token, true, fetchImpl, sleep);
    return isRecord(payload) && !Array.isArray(payload.data) ? payload : null;
};

const fetchRecentStats = async (
    profile: BackgroundProfile,
    token: string,
    startDay: string,
    endDay: string,
    includeStatic: boolean,
    fetchImpl: typeof fetch,
    sleep: (milliseconds: number) => Promise<void>
): Promise<DailyStatsLike> => {
    const definitions = endpointDefinitions(profile, includeStatic);
    const critical = definitions.filter((definition) => !definition.optional && definition.enabled);
    const optional = definitions.filter((definition) => definition.optional && definition.enabled);
    if (critical.length < 4) {
        throw new OuraBackgroundSyncError('reconnect_required', 'missing_daily_scope');
    }

    const stats = emptyStats();
    const criticalResults = await runWithConcurrency(
        critical,
        MAX_CONCURRENT_REQUESTS,
        (definition) => fetchEndpoint(definition, token, startDay, endDay, fetchImpl, sleep)
    );
    critical.forEach((definition, index) => {
        (stats as any)[definition.key] = criticalResults[index];
    });

    const optionalResults = await runWithConcurrency(
        optional,
        MAX_CONCURRENT_REQUESTS,
        async (definition) => {
            try {
                return await fetchEndpoint(definition, token, startDay, endDay, fetchImpl, sleep);
            } catch {
                return [];
            }
        }
    );
    optional.forEach((definition, index) => {
        (stats as any)[definition.key] = optionalResults[index];
    });

    if (includeStatic && normalizedScopes(profile.grantedScopes).has('personal')) {
        stats.personalInfo = await fetchPersonalInfo(token, fetchImpl, sleep).catch(() => null);
    }
    return stats;
};

const shouldRefreshToken = (profile: BackgroundProfile, nowMs: number, force: boolean): boolean => {
    if (force) return true;
    if (!profile.token) return true;
    if (!profile.tokenExpiresAt) return Boolean(profile.refreshToken);
    const expiresAt = Date.parse(profile.tokenExpiresAt);
    return !Number.isFinite(expiresAt) || expiresAt - nowMs <= 2 * 60_000;
};

const refreshAccessToken = async (
    db: Firestore,
    profile: BackgroundProfile,
    fetchImpl: typeof fetch,
    now: Date
): Promise<{ token: string; profile: BackgroundProfile }> => {
    const refreshToken = profile.refreshToken?.trim();
    if (!refreshToken) {
        throw new OuraBackgroundSyncError('reconnect_required', 'missing_refresh_token');
    }
    const clientId = process.env.OURA_CLIENT_ID?.trim();
    const clientSecret = process.env.OURA_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
        throw new OuraBackgroundSyncError('retryable', 'missing_server_oauth_config');
    }

    const response = await postOuraTokenRequest(new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
    }), { fetchImpl });
    if (!response.ok) {
        const upstreamCode = String(response.payload?.error || '').toLowerCase();
        throw new OuraBackgroundSyncError(
            response.status === 400 && upstreamCode === 'invalid_grant' ? 'reconnect_required' : 'retryable',
            response.status === 400 && upstreamCode === 'invalid_grant' ? 'invalid_grant' : 'oura_refresh_failed',
            response.status
        );
    }

    const accessToken = typeof response.payload?.access_token === 'string'
        ? response.payload.access_token.trim()
        : '';
    const rotatedRefreshToken = typeof response.payload?.refresh_token === 'string'
        ? response.payload.refresh_token.trim()
        : '';
    if (!accessToken || !rotatedRefreshToken) {
        throw new OuraBackgroundSyncError('reconnect_required', 'missing_rotated_credentials');
    }
    const expiresInSeconds = Number(response.payload?.expires_in);
    const patch: Record<string, unknown> = {
        token: accessToken,
        refreshToken: rotatedRefreshToken,
        tokenExpiresAt: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
            ? new Date(now.getTime() + expiresInSeconds * 1_000).toISOString()
            : new Date(now.getTime() + 10 * 60_000).toISOString(),
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastUpdated: now.toISOString(),
    };
    if (typeof response.payload?.scope === 'string' && response.payload.scope.trim()) {
        patch.grantedScopes = response.payload.scope.split(/[ ,]+/).filter(Boolean);
    }

    const profileRef = db.collection(PROFILES_COLLECTION).doc(profile.id);
    const credentialRef = db.collection(CREDENTIALS_COLLECTION).doc(profile.id);
    const persisted = await db.runTransaction(async (transaction) => {
        const [profileSnapshot, credentialSnapshot] = await Promise.all([
            transaction.get(profileRef),
            transaction.get(credentialRef),
        ]);
        if (!profileSnapshot.exists) throw new OuraBackgroundSyncError('retryable', 'profile_not_found');
        const current = {
            id: profile.id,
            ...profileSnapshot.data(),
            ...(credentialSnapshot.data() || {}),
        } as BackgroundProfile;
        if (current.refreshToken !== refreshToken) return current;
        transaction.set(credentialRef, {
            profileId: profile.id,
            ouraUserId: current.ouraUserId || null,
            token: patch.token,
            refreshToken: patch.refreshToken,
            tokenExpiresAt: patch.tokenExpiresAt,
            grantedScopes: patch.grantedScopes || current.grantedScopes || [],
            updatedAt: patch.lastUpdated,
        }, { merge: true });
        transaction.set(profileRef, {
            lastSyncError: null,
            lastSyncErrorAt: null,
            lastUpdated: patch.lastUpdated,
        }, { merge: true });
        return { ...current, ...patch } as BackgroundProfile;
    });
    if (!persisted.token) throw new OuraBackgroundSyncError('retryable', 'token_rotation_conflict');
    return { token: persisted.token, profile: persisted };
};

const loadProfileWithCredentials = async (
    db: Firestore,
    profileId: string
): Promise<BackgroundProfile | null> => {
    const profileRef = db.collection(PROFILES_COLLECTION).doc(profileId);
    const credentialRef = db.collection(CREDENTIALS_COLLECTION).doc(profileId);
    const [profileSnapshot, credentialSnapshot] = await Promise.all([
        profileRef.get(),
        credentialRef.get(),
    ]);
    if (!profileSnapshot.exists) return null;
    const publicProfile = { id: profileId, ...profileSnapshot.data() } as BackgroundProfile;
    if (credentialSnapshot.exists) {
        return { ...publicProfile, ...credentialSnapshot.data(), id: profileId } as BackgroundProfile;
    }

    // One-time migration for deployments that previously stored OAuth
    // credentials in browser-readable profile documents.
    if (!publicProfile.token && !publicProfile.refreshToken) return publicProfile;
    const credential: OuraCredential = {
        profileId,
        ouraUserId: publicProfile.ouraUserId || null,
        token: publicProfile.token || null,
        refreshToken: publicProfile.refreshToken || null,
        tokenExpiresAt: publicProfile.tokenExpiresAt || null,
        grantedScopes: publicProfile.grantedScopes || [],
        updatedAt: new Date().toISOString(),
    };
    await db.runTransaction(async (transaction) => {
        const existingCredential = await transaction.get(credentialRef);
        if (!existingCredential.exists) transaction.set(credentialRef, credential, { merge: false });
        transaction.set(profileRef, {
            token: FieldValue.delete(),
            refreshToken: FieldValue.delete(),
            tokenExpiresAt: FieldValue.delete(),
        }, { merge: true });
    });
    return { ...publicProfile, ...credential, id: profileId };
};

const getAccessToken = async (
    db: Firestore,
    profile: BackgroundProfile,
    fetchImpl: typeof fetch,
    now: Date,
    force: boolean = false
) => {
    if (!shouldRefreshToken(profile, now.getTime(), force) && profile.token) {
        return { token: profile.token, profile };
    }
    return refreshAccessToken(db, profile, fetchImpl, now);
};

const claimLease = async (
    db: Firestore,
    profileId: string,
    reason: BackgroundSyncReason,
    now: Date
): Promise<LeaseResult> => {
    const stateRef = db.collection(SYNC_STATE_COLLECTION).doc(profileId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(stateRef);
        const state = snapshot.exists ? snapshot.data() || {} : {};
        const nowMs = now.getTime();
        if (parseTime(String(state.leaseUntil || '')) > nowMs) {
            return { claimed: false, detail: 'sync_already_running' };
        }
        if (
            reason === 'webhook' &&
            parseTime(String(state.lastSuccessfulAt || '')) > nowMs - WEBHOOK_COOLDOWN_MS
        ) {
            return { claimed: false, detail: 'webhook_coalesced' };
        }
        const token = crypto.randomUUID();
        transaction.set(stateRef, {
            profileId,
            leaseToken: token,
            leaseUntil: new Date(nowMs + LEASE_MS).toISOString(),
            lastAttemptAt: now.toISOString(),
            lastReason: reason,
        }, { merge: true });
        return { claimed: true, token };
    });
};

const releaseLease = async (
    db: Firestore,
    profileId: string,
    leaseToken: string,
    patch: Record<string, unknown>
) => {
    const stateRef = db.collection(SYNC_STATE_COLLECTION).doc(profileId);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(stateRef);
        if (!snapshot.exists || snapshot.data()?.leaseToken !== leaseToken) return;
        transaction.set(stateRef, {
            ...patch,
            leaseToken: null,
            leaseUntil: null,
        }, { merge: true });
    });
};

const toDocumentId = (item: any, index: number): string => {
    const raw = item?.id != null
        ? String(item.id)
        : [item?.timestamp, item?.start_datetime, item?.bedtime_start, item?.day, item?.type]
            .filter(Boolean).join('|') || `item-${index}`;
    return encodeURIComponent(raw).replace(/\./g, '%2E').replace(/\//g, '%2F').slice(0, 900);
};

const writeInBatches = async (
    db: Firestore,
    operations: Array<{ path: string[]; data?: Record<string, unknown>; delete?: boolean; merge?: boolean }>
) => {
    for (let offset = 0; offset < operations.length; offset += 400) {
        const batch = db.batch();
        operations.slice(offset, offset + 400).forEach((operation) => {
            const reference = db.doc(operation.path.join('/'));
            if (operation.delete) batch.delete(reference);
            else batch.set(reference, stripUndefinedDeep(operation.data || {}), { merge: operation.merge !== false });
        });
        await batch.commit();
    }
};

const rawCollections: Array<[keyof DailyStatsLike, string]> = [
    ['session', 'sleepSessions'],
    ['workout', 'workouts'],
    ['tag', 'tags'],
    ['enhancedTag', 'enhancedTags'],
    ['guidedSession', 'guidedSessions'],
    ['sleepTime', 'sleepTime'],
    ['restModePeriod', 'restModePeriods'],
    ['ringConfiguration', 'ringConfigurations'],
    ['ringBatteryLevel', 'ringBatteryLevels'],
    ['vo2Max', 'vo2Max'],
];

const rawCollectionByDataType: Record<string, string> = {
    sleep: 'sleepSessions',
    workout: 'workouts',
    tag: 'tags',
    enhanced_tag: 'enhancedTags',
    session: 'guidedSessions',
    sleep_time: 'sleepTime',
    rest_mode_period: 'restModePeriods',
    ring_configuration: 'ringConfigurations',
    vO2_max: 'vo2Max',
    vo2_max: 'vo2Max',
};

const dayFieldByDataType: Record<string, string> = {
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

const reconcileWebhookDelete = async (
    db: Firestore,
    profileId: string,
    record?: OuraWebhookRecord
) => {
    if (record?.eventType !== 'delete' || !record.dataType || !record.objectId) return;
    const operations: Array<{ path: string[]; data?: Record<string, unknown>; delete?: boolean }> = [];
    const rawCollection = rawCollectionByDataType[record.dataType];
    if (rawCollection) {
        operations.push({
            path: [PROFILE_STATS_COLLECTION, profileId, rawCollection, toDocumentId({ id: record.objectId }, 0)],
            delete: true,
        });
    }
    const dayField = dayFieldByDataType[record.dataType];
    if (dayField) {
        const days = await db.collection(PROFILE_STATS_COLLECTION).doc(profileId)
            .collection('days').orderBy('day', 'desc').limit(45).get();
        days.docs.forEach((document) => {
            const value = document.data()?.[dayField];
            if (isRecord(value) && String(value.id || '') === record.objectId) {
                operations.push({
                    path: [PROFILE_STATS_COLLECTION, profileId, 'days', document.id],
                    data: { [dayField]: null, updatedAt: new Date().toISOString() },
                });
            }
        });
    }
    await writeInBatches(db, operations);
};

const statsDayRange = (stats: DailyStatsLike) => {
    const days: string[] = [];
    [stats.sleep, stats.readiness, stats.activity, stats.session, stats.spo2, stats.stress, stats.resilience, stats.workout, stats.cardiovascularAge, stats.vo2Max]
        .forEach((items) => items?.forEach((item: any) => {
            if (item?.day) days.push(item.day);
        }));
    const sorted = Array.from(new Set(days)).sort();
    return { oldestDay: sorted[0] || null, newestDay: sorted.at(-1) || null };
};

const persistStats = async (
    db: Firestore,
    profile: BackgroundProfile,
    delta: DailyStatsLike,
    webhookRecord: OuraWebhookRecord | undefined,
    now: Date
) => {
    const profileStatsRef = db.collection(PROFILE_STATS_COLLECTION).doc(profile.id);
    const snapshotRef = profileStatsRef.collection('snapshots').doc('dashboard');
    const storedSnapshot = await snapshotRef.get();
    const currentData = storedSnapshot.exists && isRecord(storedSnapshot.data()?.data)
        ? storedSnapshot.data()!.data as DailyStatsLike
        : emptyStats();
    const reconciled = removeWebhookDeletedRecord(mergeBackgroundStats(currentData, delta), webhookRecord);
    const updatedAt = now.toISOString();
    const dashboardSnapshot = buildBackgroundDashboardSnapshot(profile.id, reconciled, updatedAt);
    const operations: Array<{ path: string[]; data?: Record<string, unknown>; delete?: boolean; merge?: boolean }> = [];

    const days = new Set<string>();
    [delta.sleep, delta.readiness, delta.activity, delta.session, delta.spo2, delta.stress, delta.resilience, delta.cardiovascularAge, delta.vo2Max]
        .forEach((items) => items?.forEach((item: any) => {
            if (item?.day) days.add(item.day);
        }));
    days.forEach((day) => {
        const one = (items: any[] | undefined) => items?.find((item) => item?.day === day);
        const sessions = delta.session.filter((item) => item?.day === day);
        operations.push({
            path: [PROFILE_STATS_COLLECTION, profile.id, 'days', day],
            data: {
                day,
                sleep: one(delta.sleep),
                readiness: one(delta.readiness),
                activity: one(delta.activity),
                spo2: one(delta.spo2),
                stress: one(delta.stress),
                resilience: one(delta.resilience),
                cardiovascularAge: one(delta.cardiovascularAge),
                vo2Max: one(delta.vo2Max),
                bestSleepSession: sessions.length ? bestSleepSession(sessions) : undefined,
                updatedAt,
            },
        });
    });

    const heartRateByDay = new Map<string, any[]>();
    (delta.heartrate || []).forEach((item) => {
        const day = String(item?.timestamp || '').slice(0, 10);
        if (!day) return;
        heartRateByDay.set(day, [...(heartRateByDay.get(day) || []), item]);
    });
    heartRateByDay.forEach((items, day) => operations.push({
        path: [PROFILE_STATS_COLLECTION, profile.id, 'heartRateDays', day],
        data: { day, items: items.sort(sortByTimestampDescending), updatedAt },
        merge: false,
    }));

    rawCollections.forEach(([key, collectionName]) => {
        ((delta[key] as any[]) || []).forEach((item, index) => operations.push({
            path: [PROFILE_STATS_COLLECTION, profile.id, collectionName, toDocumentId(item, index)],
            data: isRecord(item) ? { ...item, updatedAt } : { value: item, updatedAt },
        }));
    });
    if (delta.personalInfo) {
        operations.push({
            path: [PROFILE_STATS_COLLECTION, profile.id, 'personalInfo', toDocumentId(delta.personalInfo, 0)],
            data: { ...delta.personalInfo, updatedAt },
        });
    }
    operations.push({
        path: [PROFILE_STATS_COLLECTION, profile.id, 'snapshots', 'dashboard'],
        data: dashboardSnapshot,
        merge: false,
    });
    await writeInBatches(db, operations);
    await reconcileWebhookDelete(db, profile.id, webhookRecord);

    const incomingRange = statsDayRange(delta);
    await db.runTransaction(async (transaction) => {
        const metadataSnapshot = await transaction.get(profileStatsRef);
        const current = metadataSnapshot.exists ? metadataSnapshot.data() || {} : {};
        const oldestCandidates = [current.oldestDay, incomingRange.oldestDay].filter(Boolean).sort();
        const newestCandidates = [current.newestDay, incomingRange.newestDay].filter(Boolean).sort();
        transaction.set(profileStatsRef, {
            profileId: profile.id,
            schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
            oldestDay: oldestCandidates[0] || null,
            newestDay: newestCandidates.at(-1) || null,
            lastIncrementalSyncAt: updatedAt,
            lastSyncError: null,
            endpointDiagnostics: {},
            updatedAt,
        }, { merge: true });
    });
    await db.collection(PROFILES_COLLECTION).doc(profile.id).set({
        lastSuccessfulSyncAt: updatedAt,
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastUpdated: updatedAt,
    }, { merge: true });
    return incomingRange;
};

const markReconnectRequired = async (db: Firestore, profileId: string, now: Date) => {
    await db.collection(PROFILES_COLLECTION).doc(profileId).set({
        lastSyncError: 'oura_reconnect_required',
        lastSyncErrorAt: now.toISOString(),
        lastUpdated: now.toISOString(),
    }, { merge: true });
};

export const syncOuraProfile = async (
    profileId: string,
    options: SyncOptions
): Promise<BackgroundSyncResult> => {
    const db = options.db ?? getAdminFirestore();
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now?.() ?? new Date();
    const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const lease = await claimLease(db, profileId, options.reason, now);
    if ('detail' in lease) {
        return { profileId, status: 'skipped', reason: options.reason, detail: lease.detail };
    }

    try {
        const loadedProfile = await loadProfileWithCredentials(db, profileId);
        if (!loadedProfile) {
            throw new OuraBackgroundSyncError('retryable', 'profile_not_found');
        }
        let profile = loadedProfile;
        let access = await getAccessToken(db, profile, fetchImpl, now);
        profile = access.profile;
        const localToday = profileDay(profile, now);
        const startDay = options.startDay || shiftDay(localToday, -7);
        const endDay = options.endDay || shiftDay(localToday, 2);
        let delta: DailyStatsLike;
        try {
            delta = await fetchRecentStats(
                profile,
                access.token,
                startDay,
                endDay,
                options.includeStatic ?? options.reason === 'cron',
                fetchImpl,
                sleep
            );
        } catch (error) {
            if (!(error instanceof OuraBackgroundSyncError) || error.kind !== 'unauthorized') throw error;
            access = await getAccessToken(db, profile, fetchImpl, now, true);
            profile = access.profile;
            delta = await fetchRecentStats(
                profile,
                access.token,
                startDay,
                endDay,
                options.includeStatic ?? options.reason === 'cron',
                fetchImpl,
                sleep
            );
        }
        const range = await persistStats(db, profile, delta, options.webhookRecord, now);
        await releaseLease(db, profileId, lease.token, {
            lastSuccessfulAt: now.toISOString(),
            lastFailureCode: null,
        });
        return {
            profileId,
            status: 'synced',
            reason: options.reason,
            newestDay: range.newestDay,
        };
    } catch (error) {
        const reconnectRequired = error instanceof OuraBackgroundSyncError && error.kind === 'reconnect_required';
        if (reconnectRequired) {
            await markReconnectRequired(db, profileId, now);
        }
        const detail = error instanceof OuraBackgroundSyncError ? error.message : 'background_sync_failed';
        await releaseLease(db, profileId, lease.token, {
            lastFailedAt: now.toISOString(),
            lastFailureCode: detail,
        }).catch(() => undefined);
        return {
            profileId,
            status: reconnectRequired ? 'reconnect_required' : 'failed',
            reason: options.reason,
            detail,
        };
    }
};

export const syncOuraUser = async (
    ouraUserId: string,
    options: Omit<SyncOptions, 'reason'> & { reason?: BackgroundSyncReason } = {}
): Promise<BackgroundSyncResult[]> => {
    const db = options.db ?? getAdminFirestore();
    const snapshot = await db.collection(PROFILES_COLLECTION).where('ouraUserId', '==', ouraUserId).get();
    const matching = snapshot.docs.length > 0
        ? snapshot.docs
        : (await db.collection(PROFILES_COLLECTION).get()).docs.filter(
            (document) => String(document.data()?.ouraUserId ?? '') === ouraUserId
        );
    return Promise.all(matching.map((document) => syncOuraProfile(document.id, {
        ...options,
        db,
        reason: options.reason ?? 'webhook',
    })));
};

export const getHistoryReconciliationRange = (
    oldestDay: string | null | undefined,
    historyStartDay: string = HISTORY_START_DAY,
    chunkDays: number = HISTORY_CHUNK_DAYS
): { startDay: string; endDay: string } | null => {
    if (!oldestDay || oldestDay <= historyStartDay) return null;
    const endDay = shiftDay(oldestDay, -1);
    const startDay = [historyStartDay, shiftDay(endDay, -(chunkDays - 1))].sort().at(-1)!;
    return startDay <= endDay ? { startDay, endDay } : null;
};

export const reconcileProfileHistory = async (
    profileId: string,
    options: Omit<SyncOptions, 'reason' | 'startDay' | 'endDay'> = {}
): Promise<BackgroundSyncResult | null> => {
    const db = options.db ?? getAdminFirestore();
    const metadata = await db.collection(PROFILE_STATS_COLLECTION).doc(profileId).get();
    const range = getHistoryReconciliationRange(metadata.data()?.oldestDay);
    if (!range) return null;
    return syncOuraProfile(profileId, {
        ...options,
        db,
        reason: 'backfill',
        startDay: range.startDay,
        endDay: range.endDay,
        includeStatic: false,
    });
};

export const syncAllOuraProfiles = async (
    options: Omit<SyncOptions, 'reason'> = {}
): Promise<BackgroundSyncResult[]> => {
    const db = options.db ?? getAdminFirestore();
    const profiles = await db.collection(PROFILES_COLLECTION).get();
    const results = await runWithConcurrency(
        profiles.docs,
        MAX_CONCURRENT_PROFILES,
        (document) => syncOuraProfile(document.id, {
            ...options,
            db,
            reason: 'cron',
            includeStatic: true,
        })
    );
    // One bounded history chunk per day keeps Hobby function time and Oura
    // traffic predictable. Prefer the profile with the least history so new
    // members catch up automatically without asking anyone to run a full sync.
    const coverage = await Promise.all(profiles.docs.map(async (document) => {
        const metadata = await db.collection(PROFILE_STATS_COLLECTION).doc(document.id).get();
        return { profileId: document.id, oldestDay: metadata.data()?.oldestDay as string | null | undefined };
    }));
    const backfillCandidate = coverage
        .filter((entry) => getHistoryReconciliationRange(entry.oldestDay))
        .sort((left, right) => String(right.oldestDay || '').localeCompare(String(left.oldestDay || '')))[0];
    const backfill = backfillCandidate
        ? await reconcileProfileHistory(backfillCandidate.profileId, { ...options, db })
        : null;
    return [...results, ...(backfill ? [backfill] : [])];
};

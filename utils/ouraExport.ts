import Papa from 'papaparse';
import type { ProfileStatsMetadata } from '../services/firestoreStatsService';
import { PROFILE_STATS_SCHEMA_VERSION } from '../services/profileStatsConstants';
import type { DailyStats, OuraEndpointDiagnostic, UserProfile } from '../types';

export const OURA_COLLECTION_NAMES = [
    'daily_activity',
    'daily_cardiovascular_age',
    'daily_readiness',
    'daily_resilience',
    'daily_sleep',
    'daily_spo2',
    'daily_stress',
    'enhanced_tag',
    'heartrate',
    'personal_info',
    'rest_mode_period',
    'ring_battery_level',
    'ring_configuration',
    'session',
    'sleep',
    'sleep_time',
    'tag',
    'vO2_max',
    'workout',
] as const;

export type OuraCollectionName = (typeof OURA_COLLECTION_NAMES)[number];

type PersonalInfoExport = {
    id: string | null;
    age: number | null;
    weight: number | null;
    height: number | null;
    biological_sex: string | null;
    email: string | null;
};

export type CompleteOuraCollections = {
    daily_activity: unknown[];
    daily_cardiovascular_age: unknown[];
    daily_readiness: unknown[];
    daily_resilience: unknown[];
    daily_sleep: unknown[];
    daily_spo2: unknown[];
    daily_stress: unknown[];
    enhanced_tag: unknown[];
    heartrate: unknown[];
    personal_info: PersonalInfoExport;
    rest_mode_period: unknown[];
    ring_battery_level: unknown[];
    ring_configuration: unknown[];
    session: unknown[];
    sleep: Array<Record<string, unknown>>;
    sleep_time: unknown[];
    tag: unknown[];
    vO2_max: unknown[];
    workout: unknown[];
};

export type CompleteOuraExport = {
    manifest: {
        format: 'oura-community-leaderboard-complete-export';
        format_version: 1;
        oura_api_version: 'v2';
        oura_openapi_snapshot: '1.37';
        oura_openapi_url: string;
        exported_at: string;
        source: 'synced-firestore-snapshot';
        source_profile_id: string;
        profile_exclusions_applied: false;
        snapshot_status: 'full-sync' | 'incremental-or-unknown';
        storage_schema_version: number | null;
        required_storage_schema_version: number;
        last_full_sync_at: string | null;
        last_full_sync_schema_version: number | null;
        last_incremental_sync_at: string | null;
        oldest_day: string | null;
        newest_day: string | null;
        granted_scopes: string[];
        collection_counts: Record<OuraCollectionName, number>;
        endpoint_diagnostics: Record<string, OuraEndpointDiagnostic | null>;
    };
    collections: CompleteOuraCollections;
};

type BuildCompleteOuraExportOptions = {
    data: DailyStats;
    profile: UserProfile;
    metadata?: ProfileStatsMetadata | null;
    exportedAt?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const cloneSourceValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(cloneSourceValue);
    if (!isRecord(value)) return value;

    return Object.fromEntries(
        Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, cloneSourceValue(entry)]),
    );
};

/** Removes fields added by Firestore while preserving every Oura source field. */
export const stripPersistenceMetadata = (value: unknown): unknown => {
    if (!isRecord(value)) return cloneSourceValue(value);
    const sourceEntries = Object.entries(value).filter(([key]) => key !== 'updatedAt');
    if (sourceEntries.length === 1 && sourceEntries[0][0] === 'value') {
        return cloneSourceValue(sourceEntries[0][1]);
    }
    return Object.fromEntries(sourceEntries.map(([key, entry]) => [key, cloneSourceValue(entry)]));
};

const cleanCollection = (items: unknown[] | undefined): unknown[] => (
    (items ?? []).map(stripPersistenceMetadata)
);

const buildPersonalInfo = (profile: UserProfile, data: DailyStats): PersonalInfoExport => {
    if (data.personalInfo) {
        return {
            id: String(data.personalInfo.id),
            age: data.personalInfo.age ?? null,
            weight: data.personalInfo.weight ?? null,
            height: data.personalInfo.height ?? null,
            biological_sex: data.personalInfo.biological_sex ?? null,
            email: data.personalInfo.email ?? null,
        };
    }

    return {
        id: profile.ouraUserId != null ? String(profile.ouraUserId) : null,
        age: profile.age ?? null,
        weight: profile.weight ?? null,
        height: profile.height ?? null,
        biological_sex: profile.biological_sex ?? null,
        email: profile.email ?? null,
    };
};

export const buildCompleteOuraExport = ({
    data,
    profile,
    metadata = null,
    exportedAt = new Date().toISOString(),
}: BuildCompleteOuraExportOptions): CompleteOuraExport => {
    const collections: CompleteOuraCollections = {
        daily_activity: cleanCollection(data.activity),
        daily_cardiovascular_age: cleanCollection(data.cardiovascularAge),
        daily_readiness: cleanCollection(data.readiness),
        daily_resilience: cleanCollection(data.resilience),
        daily_sleep: cleanCollection(data.sleep),
        daily_spo2: cleanCollection(data.spo2),
        daily_stress: cleanCollection(data.stress),
        enhanced_tag: cleanCollection(data.enhancedTag),
        heartrate: cleanCollection(data.heartrate),
        personal_info: buildPersonalInfo(profile, data),
        rest_mode_period: cleanCollection(data.restModePeriod),
        ring_battery_level: cleanCollection(data.ringBatteryLevel),
        ring_configuration: cleanCollection(data.ringConfiguration),
        session: cleanCollection(data.guidedSession),
        sleep: cleanCollection(data.session) as Array<Record<string, unknown>>,
        sleep_time: cleanCollection(data.sleepTime),
        tag: cleanCollection(data.tag),
        vO2_max: cleanCollection(data.vo2Max),
        workout: cleanCollection(data.workout),
    };

    const collectionCounts = Object.fromEntries(OURA_COLLECTION_NAMES.map((name) => [
        name,
        name === 'personal_info' ? 1 : collections[name].length,
    ])) as Record<OuraCollectionName, number>;

    return {
        manifest: {
            format: 'oura-community-leaderboard-complete-export',
            format_version: 1,
            oura_api_version: 'v2',
            oura_openapi_snapshot: '1.37',
            oura_openapi_url: 'https://cloud.ouraring.com/v2/static/json/openapi-1.37.json',
            exported_at: exportedAt,
            source: 'synced-firestore-snapshot',
            source_profile_id: profile.id,
            profile_exclusions_applied: false,
            snapshot_status: metadata?.lastFullSyncAt
                && metadata.lastFullSyncSchemaVersion === PROFILE_STATS_SCHEMA_VERSION
                ? 'full-sync'
                : 'incremental-or-unknown',
            storage_schema_version: metadata?.schemaVersion ?? null,
            required_storage_schema_version: PROFILE_STATS_SCHEMA_VERSION,
            last_full_sync_at: metadata?.lastFullSyncAt ?? null,
            last_full_sync_schema_version: metadata?.lastFullSyncSchemaVersion ?? null,
            last_incremental_sync_at: metadata?.lastIncrementalSyncAt ?? null,
            oldest_day: metadata?.oldestDay ?? null,
            newest_day: metadata?.newestDay ?? null,
            granted_scopes: [...(profile.grantedScopes ?? [])],
            collection_counts: collectionCounts,
            endpoint_diagnostics: metadata?.endpointDiagnostics ?? data.endpointDiagnostics ?? {},
        },
        collections,
    };
};

type CsvScalar = string | number | boolean | null;
type FlatCsvRecord = Record<string, CsvScalar>;

const flattenRecord = (
    value: Record<string, unknown>,
    prefix = '',
    output: FlatCsvRecord = {},
): FlatCsvRecord => {
    Object.entries(value).forEach(([key, entry]) => {
        const column = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(entry)) {
            output[column] = JSON.stringify(entry);
        } else if (isRecord(entry)) {
            flattenRecord(entry, column, output);
        } else if (entry === null) {
            output[column] = 'null';
        } else if (entry === undefined) {
            output[column] = '';
        } else {
            output[column] = entry as CsvScalar;
        }
    });
    return output;
};

export const createComprehensiveCsv = (items: unknown[] | unknown): string => {
    const records = Array.isArray(items) ? items : [items];
    if (records.length === 0) return '';

    const rows = records.map((item) => (
        isRecord(item) ? flattenRecord(item) : { value: item as CsvScalar }
    ));
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

    return Papa.unparse(rows, {
        columns,
        escapeFormulae: true,
        newline: '\r\n',
    });
};

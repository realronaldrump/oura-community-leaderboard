import type { DailyStats } from '../types';

const COLLECTION_PROPERTY_BY_DATA_TYPE: Record<string, keyof DailyStats> = {
    daily_activity: 'activity',
    daily_cardiovascular_age: 'cardiovascularAge',
    daily_readiness: 'readiness',
    daily_resilience: 'resilience',
    daily_sleep: 'sleep',
    daily_spo2: 'spo2',
    daily_stress: 'stress',
    enhanced_tag: 'enhancedTag',
    rest_mode_period: 'restModePeriod',
    ring_configuration: 'ringConfiguration',
    session: 'guidedSession',
    sleep: 'session',
    sleep_time: 'sleepTime',
    tag: 'tag',
    vO2_max: 'vo2Max',
    vo2_max: 'vo2Max',
    workout: 'workout',
};

const hasMatchingId = (item: unknown, objectId: string): boolean => (
    Boolean(item)
    && typeof item === 'object'
    && String((item as { id?: unknown }).id ?? '') === objectId
);

export const removeDeletedOuraRecord = (
    data: DailyStats,
    dataType: string,
    objectId: string,
): DailyStats => {
    const property = COLLECTION_PROPERTY_BY_DATA_TYPE[dataType];
    if (!property || !objectId) return data;

    const current = data[property];
    if (!Array.isArray(current)) return data;
    const next = current.filter((item) => !hasMatchingId(item, objectId));
    if (next.length === current.length) return data;

    return {
        ...data,
        [property]: next,
    } as DailyStats;
};

import type { DailyStats } from '../types';

const sortByDayDesc = (left: any, right: any): number =>
    new Date(right?.day || right?.summary_date || 0).getTime() -
    new Date(left?.day || left?.summary_date || 0).getTime();

const sortByTimestampDesc = (left: any, right: any): number =>
    new Date(right?.timestamp || right?.end_datetime || right?.start_datetime || 0).getTime() -
    new Date(left?.timestamp || left?.end_datetime || left?.start_datetime || 0).getTime();

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
    return composite ? `fields:${composite}` : `index:${index}`;
};

const mergeCollection = (
    existing: any[] = [],
    incoming: any[] = [],
    sorter: (left: any, right: any) => number = sortByDayDesc
): any[] => {
    const merged = new Map<string, any>();
    existing.forEach((item, index) => merged.set(itemKey(item, index), item));
    incoming.forEach((item, index) => {
        const key = itemKey(item, index);
        merged.set(key, { ...(merged.get(key) || {}), ...item });
    });
    return Array.from(merged.values()).sort(sorter);
};

const toTimestampMs = (value?: string | null): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
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
    const currentTimestamp = toTimestampMs(current?.timestamp || current?.updated_at || current?.created_at);
    const candidateTimestamp = toTimestampMs(candidate?.timestamp || candidate?.updated_at || candidate?.created_at);
    if (candidateTimestamp > currentTimestamp) return { ...current, ...candidate };
    if (candidateTimestamp < currentTimestamp) return current;
    return countDefinedValues(candidate) >= countDefinedValues(current)
        ? { ...current, ...candidate }
        : current;
};

const mergeCollectionByDay = (existing: any[] = [], incoming: any[] = []): any[] => {
    const byDay = new Map<string, any>();
    [...existing, ...incoming].forEach((item) => {
        const day = item?.day || item?.summary_date;
        if (!day) return;
        const previous = byDay.get(day);
        byDay.set(day, previous ? preferDailyItem(previous, item) : item);
    });
    return Array.from(byDay.values()).sort(sortByDayDesc);
};

export const mergeDailyStats = (existing: DailyStats, incoming: DailyStats): DailyStats => ({
    personalInfo: incoming.personalInfo ?? existing.personalInfo ?? null,
    sleep: mergeCollectionByDay(existing.sleep, incoming.sleep),
    readiness: mergeCollectionByDay(existing.readiness, incoming.readiness),
    activity: mergeCollectionByDay(existing.activity, incoming.activity),
    session: mergeCollection(existing.session, incoming.session),
    spo2: mergeCollectionByDay(existing.spo2, incoming.spo2),
    stress: mergeCollectionByDay(existing.stress, incoming.stress),
    resilience: mergeCollectionByDay(existing.resilience, incoming.resilience),
    heartrate: mergeCollection(existing.heartrate || [], incoming.heartrate || [], sortByTimestampDesc),
    workout: mergeCollection(existing.workout || [], incoming.workout || []),
    guidedSession: mergeCollection(existing.guidedSession || [], incoming.guidedSession || []),
    sleepTime: mergeCollection(existing.sleepTime || [], incoming.sleepTime || []),
    tag: mergeCollection(existing.tag || [], incoming.tag || []),
    enhancedTag: mergeCollection(existing.enhancedTag || [], incoming.enhancedTag || []),
    restModePeriod: mergeCollection(existing.restModePeriod || [], incoming.restModePeriod || []),
    ringConfiguration: mergeCollection(existing.ringConfiguration || [], incoming.ringConfiguration || [], sortByTimestampDesc),
    ringBatteryLevel: mergeCollection(existing.ringBatteryLevel || [], incoming.ringBatteryLevel || [], sortByTimestampDesc),
    cardiovascularAge: mergeCollectionByDay(existing.cardiovascularAge || [], incoming.cardiovascularAge || []),
    vo2Max: mergeCollection(existing.vo2Max || [], incoming.vo2Max || []),
    resilienceDiagnostic: incoming.resilienceDiagnostic ?? null,
    endpointDiagnostics: {
        ...(existing.endpointDiagnostics || {}),
        ...(incoming.endpointDiagnostics || {}),
    },
});

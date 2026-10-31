import type { DailyStats, DataExclusionRange, DataExclusionSource, SleepSession, UserProfile } from '../types.js';
import { isISODateString, shiftLocalISODate } from './date.js';
import { applyScoreCorrections } from './scoreCorrections.js';

export const DATA_EXCLUSION_GROUPS: Array<{
    id: string; label: string; description: string; sources: DataExclusionSource[];
}> = [
    { id: 'sleep', label: 'Sleep', description: 'Score, stages, timing, naps, HRV and nightly heart rate', sources: ['sleep', 'session', 'sleepTime'] },
    { id: 'readiness', label: 'Readiness', description: 'Readiness score, contributors and temperature', sources: ['readiness'] },
    { id: 'activity', label: 'Activity', description: 'Steps, calories, movement and activity score', sources: ['activity'] },
    { id: 'heartrate', label: 'Heart rate samples', description: 'Heart rate recordings throughout the day', sources: ['heartrate'] },
    { id: 'spo2', label: 'Blood oxygen', description: 'Oxygen saturation and breathing disturbance', sources: ['spo2'] },
    { id: 'stress', label: 'Stress & resilience', description: 'Stress, restoration and resilience', sources: ['stress', 'resilience'] },
    { id: 'workout', label: 'Workouts', description: 'Recorded workouts, duration, distance and calories', sources: ['workout'] },
    { id: 'guidedSession', label: 'Guided sessions', description: 'Meditation and other guided sessions', sources: ['guidedSession'] },
    { id: 'cardiovascularAge', label: 'Heart age', description: 'Cardiovascular age estimates', sources: ['cardiovascularAge'] },
    { id: 'vo2Max', label: 'Fitness', description: 'VO₂ max estimates', sources: ['vo2Max'] },
    { id: 'tags', label: 'Tags & rest mode', description: 'Tags, notes and rest mode periods', sources: ['tag', 'enhancedTag', 'restModePeriod'] },
    { id: 'ring', label: 'Ring data', description: 'Battery levels and ring configuration', sources: ['ringConfiguration', 'ringBatteryLevel'] },
];
export const DATA_EXCLUSION_SOURCES = DATA_EXCLUSION_GROUPS.flatMap(group => group.sources).sort();
const knownSources = new Set<string>(DATA_EXCLUSION_SOURCES);
export const getExclusionSourcesForDay = (day: string, ranges: DataExclusionRange[] | null | undefined): DataExclusionSource[] =>
    [...new Set(normalizeDataExclusionRanges(ranges)
        .filter(range => day >= range.startDay && day <= range.endDay)
        .flatMap(range => range.sources || DATA_EXCLUSION_SOURCES))].sort();

export const describeDataExclusion = (range: DataExclusionRange): string => {
    if (!range.sources) return 'Whole day · all data types';
    return DATA_EXCLUSION_GROUPS.filter(group => group.sources.some(source => range.sources!.includes(source)))
        .map(group => group.label).join(', ');
};

type DayLikeItem = { day?: string | null };
type TimestampLikeItem = { timestamp?: string | null };

const trimLabel = (label?: string | null): string | null => {
    const trimmed = typeof label === 'string' ? label.trim() : '';
    return trimmed ? trimmed : null;
};

export const normalizeDataExclusionRanges = (
    ranges: DataExclusionRange[] | null | undefined
): DataExclusionRange[] => {
    if (!Array.isArray(ranges) || !ranges.length) return [];

    return ranges
        .map<DataExclusionRange | null>((range, index) => {
            if (!range || !isDataExclusionDay(range.startDay) || !isDataExclusionDay(range.endDay)) return null;
            // Never turn a malformed or empty scoped exclusion into a whole-day exclusion.
            if (range.sources != null && !Array.isArray(range.sources)) return null;
            const sources = range.sources == null ? undefined : [...new Set(range.sources.filter(source => knownSources.has(source)))].sort();
            if (sources?.length === 0) return null;
            const [startDay, endDay] = range.startDay <= range.endDay
                ? [range.startDay, range.endDay]
                : [range.endDay, range.startDay];

            const normalized = {
                ...range,
                id: range.id || `${startDay}-${endDay}-${index}`,
                startDay,
                endDay,
                label: trimLabel(range.label),
            };
            if (sources && sources.length < DATA_EXCLUSION_SOURCES.length) normalized.sources = sources;
            else delete normalized.sources;
            return normalized;
        })
        .filter((range): range is DataExclusionRange => range !== null)
        .sort((left, right) => {
            const byStart = left.startDay.localeCompare(right.startDay);
            if (byStart !== 0) return byStart;
            const byEnd = left.endDay.localeCompare(right.endDay);
            if (byEnd !== 0) return byEnd;
            return left.id.localeCompare(right.id);
        });
};

export const isDataExclusionDay = (day: unknown): day is string => isISODateString(day) &&
    Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;

const matchesExcludedDay = (day: string | null | undefined, ranges: DataExclusionRange[], source?: DataExclusionSource): boolean =>
    Boolean(day && ranges.some(range => day >= range.startDay && day <= range.endDay &&
        (!range.sources || (source != null && range.sources.includes(source)))));

export const isDayExcludedByRanges = (
    day: string | null | undefined,
    ranges: DataExclusionRange[] | null | undefined,
    source?: DataExclusionSource,
): boolean => {
    if (!isISODateString(day)) return false;
    return matchesExcludedDay(day, normalizeDataExclusionRanges(ranges), source);
};

/** Restore just this day, preserving the rest of any overlapping multi-day break. */
export const restoreDataExclusionDay = (ranges: DataExclusionRange[], day: string): DataExclusionRange[] => {
    if (!isISODateString(day)) return normalizeDataExclusionRanges(ranges);
    return normalizeDataExclusionRanges(ranges).flatMap(range => {
        if (day < range.startDay || day > range.endDay) return [range];
        const pieces: DataExclusionRange[] = [];
        if (range.startDay < day) pieces.push({ ...range, id: `${range.id}-before-${day}`, endDay: shiftLocalISODate(day, -1) });
        if (range.endDay > day) pieces.push({ ...range, id: `${range.id}-after-${day}`, startDay: shiftLocalISODate(day, 1) });
        return pieces;
    });
};

/** Stable analysis revision: preserve legacy whole-day keys and include scoped data types. */
export const dataExclusionKey = (ranges: DataExclusionRange[] | null | undefined): string =>
    JSON.stringify(normalizeDataExclusionRanges(ranges).map(range => range.sources
        ? [range.startDay, range.endDay, range.sources]
        : [range.startDay, range.endDay]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export const getDataExclusionRangeDayCount = (range: DataExclusionRange): number => {
    const normalized = normalizeDataExclusionRanges([range])[0];
    if (!normalized) return 0;

    let count = 0;
    for (let day = normalized.startDay; day <= normalized.endDay; day = shiftLocalISODate(day, 1)) {
        count += 1;
    }
    return count;
};

export const getTotalExcludedDayCount = (ranges: DataExclusionRange[] | null | undefined): number => {
    const days = new Set<string>();
    normalizeDataExclusionRanges(ranges).forEach((range) => {
        for (let day = range.startDay; day <= range.endDay; day = shiftLocalISODate(day, 1)) {
            days.add(day);
        }
    });
    return days.size;
};

const getTimestampDay = (value?: string | null): string | null => {
    const day = value?.slice(0, 10);
    return isISODateString(day) ? day : null;
};

const getSleepSessionExclusionDays = (session: SleepSession): string[] => {
    if (isISODateString(session.day)) return [session.day];
    return [
        getTimestampDay(session.bedtime_start),
        getTimestampDay(session.bedtime_end),
    ].filter((day): day is string => Boolean(day));
};

const getGenericDateFields = (item: unknown): string[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const directFields = ['day', 'start_day', 'end_day'];
    const timestampFields = ['timestamp', 'start_time', 'end_time', 'start_datetime', 'end_datetime', 'bedtime_start', 'bedtime_end'];

    return [
        ...directFields.map((field) => record[field]).filter(isISODateString),
        ...timestampFields
            .map((field) => getTimestampDay(typeof record[field] === 'string' ? record[field] : null))
            .filter((day): day is string => Boolean(day)),
    ];
};

const filterDayItems = <T extends DayLikeItem>(
    items: T[] | undefined,
    ranges: DataExclusionRange[],
    source: DataExclusionSource,
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => !matchesExcludedDay(item.day, ranges, source));
};

const filterTimestampItems = <T extends TimestampLikeItem>(
    items: T[] | undefined,
    ranges: DataExclusionRange[],
    source: DataExclusionSource,
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => !matchesExcludedDay(getTimestampDay(item.timestamp), ranges, source));
};

const filterGenericItems = <T>(
    items: T[] | undefined,
    ranges: DataExclusionRange[],
    source: DataExclusionSource,
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => {
        const days = getGenericDateFields(item);
        if (!days.length) return true;
        const sortedDays = days.sort();
        return !ranges.some(range => (!range.sources || range.sources.includes(source)) &&
            sortedDays[0] <= range.endDay && sortedDays[sortedDays.length - 1] >= range.startDay);
    });
};

export const filterDailyStatsByDataExclusions = (
    data: DailyStats | undefined,
    ranges: DataExclusionRange[] | null | undefined
): DailyStats | undefined => {
    if (!data) return undefined;
    const normalizedRanges = normalizeDataExclusionRanges(ranges);
    if (normalizedRanges.length === 0) return data;

    return {
        ...data,
        sleep: filterDayItems(data.sleep, normalizedRanges, 'sleep'),
        readiness: filterDayItems(data.readiness, normalizedRanges, 'readiness'),
        activity: filterDayItems(data.activity, normalizedRanges, 'activity'),
        session: (data.session || []).filter((session) => (
            !getSleepSessionExclusionDays(session).some((day) => matchesExcludedDay(day, normalizedRanges, 'session'))
        )),
        spo2: filterDayItems(data.spo2, normalizedRanges, 'spo2'),
        stress: filterDayItems(data.stress, normalizedRanges, 'stress'),
        resilience: filterDayItems(data.resilience, normalizedRanges, 'resilience'),
        heartrate: filterTimestampItems(data.heartrate, normalizedRanges, 'heartrate'),
        workout: filterDayItems(data.workout, normalizedRanges, 'workout'),
        guidedSession: filterGenericItems(data.guidedSession, normalizedRanges, 'guidedSession'),
        sleepTime: filterGenericItems(data.sleepTime, normalizedRanges, 'sleepTime'),
        tag: filterGenericItems(data.tag, normalizedRanges, 'tag'),
        enhancedTag: filterGenericItems(data.enhancedTag, normalizedRanges, 'enhancedTag'),
        restModePeriod: filterGenericItems(data.restModePeriod, normalizedRanges, 'restModePeriod'),
        ringConfiguration: filterGenericItems(data.ringConfiguration, normalizedRanges, 'ringConfiguration'),
        ringBatteryLevel: filterTimestampItems(data.ringBatteryLevel, normalizedRanges, 'ringBatteryLevel'),
        cardiovascularAge: filterDayItems(data.cardiovascularAge as DayLikeItem[] | undefined, normalizedRanges, 'cardiovascularAge'),
        vo2Max: filterDayItems(data.vo2Max as DayLikeItem[] | undefined, normalizedRanges, 'vo2Max'),
    };
};

export const filterDailyStatsForProfile = (
    data: DailyStats | undefined,
    profile: Pick<UserProfile, 'dataExclusionRanges' | 'scoreCorrections'> | null | undefined,
    range?: { startDay: string; endDay: string },
): DailyStats | undefined => filterDailyStatsByDataExclusions(
    applyScoreCorrections(data, profile?.scoreCorrections, range), profile?.dataExclusionRanges);

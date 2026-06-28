import { DailyStats, DataExclusionRange, SleepSession, UserProfile } from '../types';
import { isISODateString, shiftLocalISODate } from './date';

type DayLikeItem = { day?: string | null };
type TimestampLikeItem = { timestamp?: string | null };

const trimLabel = (label?: string | null): string | null => {
    const trimmed = label?.trim();
    return trimmed ? trimmed : null;
};

export const normalizeDataExclusionRanges = (
    ranges: DataExclusionRange[] | null | undefined
): DataExclusionRange[] => {
    if (!ranges?.length) return [];

    return ranges
        .map<DataExclusionRange | null>((range, index) => {
            if (!isISODateString(range.startDay) || !isISODateString(range.endDay)) return null;
            const [startDay, endDay] = range.startDay <= range.endDay
                ? [range.startDay, range.endDay]
                : [range.endDay, range.startDay];

            return {
                ...range,
                id: range.id || `${startDay}-${endDay}-${index}`,
                startDay,
                endDay,
                label: trimLabel(range.label),
            };
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

export const isDayExcludedByRanges = (
    day: string | null | undefined,
    ranges: DataExclusionRange[] | null | undefined
): boolean => {
    if (!isISODateString(day)) return false;
    return normalizeDataExclusionRanges(ranges).some((range) => day >= range.startDay && day <= range.endDay);
};

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
    ranges: DataExclusionRange[]
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => !isDayExcludedByRanges(item.day, ranges));
};

const filterTimestampItems = <T extends TimestampLikeItem>(
    items: T[] | undefined,
    ranges: DataExclusionRange[]
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => !isDayExcludedByRanges(getTimestampDay(item.timestamp), ranges));
};

const filterGenericItems = <T>(
    items: T[] | undefined,
    ranges: DataExclusionRange[]
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => {
        const days = getGenericDateFields(item);
        if (!days.length) return true;
        return !days.some((day) => isDayExcludedByRanges(day, ranges));
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
        sleep: filterDayItems(data.sleep, normalizedRanges),
        readiness: filterDayItems(data.readiness, normalizedRanges),
        activity: filterDayItems(data.activity, normalizedRanges),
        session: (data.session || []).filter((session) => (
            !getSleepSessionExclusionDays(session).some((day) => isDayExcludedByRanges(day, normalizedRanges))
        )),
        spo2: filterDayItems(data.spo2, normalizedRanges),
        stress: filterDayItems(data.stress, normalizedRanges),
        resilience: filterDayItems(data.resilience, normalizedRanges),
        heartrate: filterTimestampItems(data.heartrate, normalizedRanges),
        workout: filterDayItems(data.workout, normalizedRanges),
        guidedSession: filterGenericItems(data.guidedSession, normalizedRanges),
        sleepTime: filterGenericItems(data.sleepTime, normalizedRanges),
        tag: filterGenericItems(data.tag, normalizedRanges),
        enhancedTag: filterGenericItems(data.enhancedTag, normalizedRanges),
        restModePeriod: filterGenericItems(data.restModePeriod, normalizedRanges),
        ringConfiguration: filterGenericItems(data.ringConfiguration, normalizedRanges),
        cardiovascularAge: filterDayItems(data.cardiovascularAge as DayLikeItem[] | undefined, normalizedRanges),
        vo2Max: filterDayItems(data.vo2Max as DayLikeItem[] | undefined, normalizedRanges),
    };
};

export const filterDailyStatsForProfile = (
    data: DailyStats | undefined,
    profile: Pick<UserProfile, 'dataExclusionRanges'> | null | undefined
): DailyStats | undefined => filterDailyStatsByDataExclusions(data, profile?.dataExclusionRanges);

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WITH_OFFSET_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/;
const OFFSET_ONLY_PATTERN = /^(Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/;

const padTwo = (value: number): string => value.toString().padStart(2, '0');

type ShiftedDateParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};

export type ProfileOffsetSource =
    | 'session_bedtime_end'
    | 'session_bedtime_start'
    // Legacy persisted value only. Heart-rate timestamps are UTC and must not
    // be used as new profile offset evidence.
    | 'heartrate'
    | 'workout_end'
    | 'workout_start'
    | 'sleep_time_window';

const buildUtcFormatter = (
    locales: Intl.LocalesArgument | undefined,
    options: Intl.DateTimeFormatOptions
) => new Intl.DateTimeFormat(locales, {
    ...options,
    timeZone: 'UTC',
});

const toShiftedDate = (timestampMs: number, offsetMinutes: number): Date => (
    new Date(timestampMs + (offsetMinutes * 60_000))
);

const getShiftedDateParts = (timestampMs: number, offsetMinutes: number): ShiftedDateParts => {
    const shifted = toShiftedDate(timestampMs, offsetMinutes);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        second: shifted.getUTCSeconds(),
    };
};

export const formatClockTimeFromHourMinute = (
    hour: number,
    minute: number,
    locales: Intl.LocalesArgument = 'en-US',
    options: Intl.DateTimeFormatOptions = {}
): string => {
    const utcDate = new Date(Date.UTC(2000, 0, 1, hour, minute, 0, 0));
    return buildUtcFormatter(locales, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        ...options,
    }).format(utcDate);
};

const parseOffsetTokenToMinutes = (token: string): number | null => {
    if (!OFFSET_ONLY_PATTERN.test(token)) return null;
    if (token === 'Z') return 0;

    const compact = token.replace(':', '');
    const sign = compact.startsWith('-') ? -1 : 1;
    const hours = Number(compact.slice(1, 3));
    const minutes = Number(compact.slice(3, 5));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return sign * ((hours * 60) + minutes);
};

export const isISODateString = (value: unknown): value is string => (
    typeof value === 'string' && ISO_DAY_PATTERN.test(value)
);

export const compareISODateStringsAsc = (left: string, right: string): number => left.localeCompare(right);
export const compareISODateStringsDesc = (left: string, right: string): number => right.localeCompare(left);

export const parseUtcOffsetMinutesFromIso = (isoString?: string | null): number | null => {
    if (!isoString) return null;
    const match = isoString.match(ISO_WITH_OFFSET_PATTERN);
    if (!match) return null;
    return parseOffsetTokenToMinutes(match[8]);
};

export const extractIsoDayFromTimestamp = (isoString?: string | null): string | null => {
    if (!isoString) return null;
    const rawPrefix = isoString.slice(0, 10);
    return isISODateString(rawPrefix) ? rawPrefix : null;
};

export const extractLocalHourMinuteFromIso = (
    isoString?: string | null
): { hour: number; minute: number } | null => {
    if (!isoString) return null;
    const match = isoString.match(ISO_WITH_OFFSET_PATTERN);
    if (!match) return null;

    const hour = Number(match[4]);
    const minute = Number(match[5]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour, minute };
};

export const getLocalMinutesOfDayFromIso = (isoString?: string | null): number | null => {
    const parts = extractLocalHourMinuteFromIso(isoString);
    if (!parts) return null;
    return (parts.hour * 60) + parts.minute;
};

export const formatRecordLocalClockTime = (
    isoString?: string | null,
    locales: Intl.LocalesArgument = 'en-US',
    options: Intl.DateTimeFormatOptions = {}
): string => {
    const parts = extractLocalHourMinuteFromIso(isoString);
    if (!parts) return '--';
    return formatClockTimeFromHourMinute(parts.hour, parts.minute, locales, options);
};

export const getWallClockTimestampMs = (timestampMs: number, offsetMinutes: number): number => (
    timestampMs + (offsetMinutes * 60_000)
);

export const getWallClockTimestampMsFromIso = (isoString?: string | null): number | null => {
    if (!isoString) return null;
    const absoluteTimestampMs = new Date(isoString).getTime();
    const offsetMinutes = parseUtcOffsetMinutesFromIso(isoString);
    if (!Number.isFinite(absoluteTimestampMs) || offsetMinutes == null) return null;
    return getWallClockTimestampMs(absoluteTimestampMs, offsetMinutes);
};

export const formatClockTimeFromOffsetTimestamp = (
    timestampMs: number,
    offsetMinutes: number,
    locales: Intl.LocalesArgument = 'en-US',
    options: Intl.DateTimeFormatOptions = {}
): string => {
    const parts = getShiftedDateParts(timestampMs, offsetMinutes);
    return formatClockTimeFromHourMinute(parts.hour, parts.minute, locales, options);
};

export const getMinutesOfDayFromOffsetTimestamp = (timestampMs: number, offsetMinutes: number): number => {
    const parts = getShiftedDateParts(timestampMs, offsetMinutes);
    return (parts.hour * 60) + parts.minute;
};

export const getOffsetIsoDay = (offsetMinutes: number, baseDate: Date = new Date()): string => {
    const parts = getShiftedDateParts(baseDate.getTime(), offsetMinutes);
    return `${parts.year}-${padTwo(parts.month)}-${padTwo(parts.day)}`;
};

export const shiftISODateByDays = (isoDay: string, daysDelta: number): string => {
    if (!isISODateString(isoDay)) return isoDay;
    const [year, month, day] = isoDay.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + daysDelta, 12, 0, 0, 0));
    return `${shifted.getUTCFullYear()}-${padTwo(shifted.getUTCMonth() + 1)}-${padTwo(shifted.getUTCDate())}`;
};

export const getRelativeOffsetISODate = (
    daysDelta: number,
    offsetMinutes: number,
    baseDate: Date = new Date()
): string => shiftISODateByDays(getOffsetIsoDay(offsetMinutes, baseDate), daysDelta);

export const getCurrentHourForOffset = (offsetMinutes: number, baseDate: Date = new Date()): number => (
    getShiftedDateParts(baseDate.getTime(), offsetMinutes).hour
);

export const getMillisecondsUntilNextOffsetMidnight = (
    offsetMinutes: number,
    baseDate: Date = new Date(),
    bufferMs: number = 5_000
): number => {
    const parts = getShiftedDateParts(baseDate.getTime(), offsetMinutes);
    const nextMidnightUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0, 0) - (offsetMinutes * 60_000);
    return Math.max((nextMidnightUtcMs + bufferMs) - baseDate.getTime(), 1_000);
};

export const getBufferedFetchEndISODate = (
    offsetMinutes?: number | null,
    baseDate: Date = new Date(),
    futureDays: number = 2
): string => {
    if (typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)) {
        return getRelativeOffsetISODate(futureDays, offsetMinutes, baseDate);
    }

    const next = new Date(baseDate);
    next.setDate(next.getDate() + futureDays);
    return `${next.getFullYear()}-${padTwo(next.getMonth() + 1)}-${padTwo(next.getDate())}`;
};

export const getUTCDateFromISODate = (isoDay: string): Date | null => {
    if (!isISODateString(isoDay)) return null;
    const [year, month, day] = isoDay.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};

export const formatISODateForDisplayUTC = (
    isoDay: string,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
): string => {
    const parsed = getUTCDateFromISODate(isoDay);
    if (!parsed) return isoDay;
    return buildUtcFormatter(locales, options || {}).format(parsed);
};

export const getISODateWeekdayUTC = (isoDay: string): number | null => {
    const parsed = getUTCDateFromISODate(isoDay);
    return parsed ? parsed.getUTCDay() : null;
};

export const getISODateInTimeZone = (timeZone: string, baseDate: Date = new Date()): string => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(baseDate);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) {
        return getOffsetIsoDay(0, baseDate);
    }
    return `${year}-${month}-${day}`;
};

export const getRelativeISODateInTimeZone = (
    timeZone: string,
    daysDelta: number,
    baseDate: Date = new Date()
): string => shiftISODateByDays(getISODateInTimeZone(timeZone, baseDate), daysDelta);

export const formatRelativeDayLabel = (
    isoDay: string | undefined,
    todayIsoDay: string,
    locales: Intl.LocalesArgument = 'en-US'
): string => {
    if (!isoDay) return 'Today';
    if (isoDay === todayIsoDay) return 'Today';
    if (isoDay === shiftISODateByDays(todayIsoDay, -1)) return 'Yesterday';
    return formatISODateForDisplayUTC(isoDay, locales, { weekday: 'short', month: 'short', day: 'numeric' });
};

import {
    formatISODateForDisplayUTC,
    getBufferedFetchEndISODate,
    getISODateWeekdayUTC,
    getUTCDateFromISODate,
    isISODateString,
    shiftISODateByDays,
} from './temporal';

const padTwo = (value: number): string => value.toString().padStart(2, '0');

/**
 * Format a Date as YYYY-MM-DD using local calendar day (not UTC).
 */
export const formatLocalISODate = (date: Date = new Date()): string => {
    return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

export { isISODateString };

export const parseLocalISODate = (isoDay: string): Date | null => {
    return getUTCDateFromISODate(isoDay);
};

export const shiftLocalISODate = (isoDay: string, daysDelta: number): string => {
    return shiftISODateByDays(isoDay, daysDelta);
};

export const getRelativeLocalISODate = (daysDelta: number = 0, baseDate: Date = new Date()): string => {
    const next = new Date(baseDate);
    next.setDate(next.getDate() + daysDelta);
    return formatLocalISODate(next);
};

export const getOuraFetchEndISODate = (
    baseDate: Date = new Date(),
    offsetMinutes?: number | null,
    futureDays: number = 2
): string => getBufferedFetchEndISODate(offsetMinutes, baseDate, futureDays);

export const getISODateWeekday = (isoDay: string): number | null => getISODateWeekdayUTC(isoDay);

export const formatISODateForDisplay = (
    isoDay: string,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
): string => {
    return formatISODateForDisplayUTC(isoDay, locales, options);
};

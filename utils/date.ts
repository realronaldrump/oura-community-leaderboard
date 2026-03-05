const padTwo = (value: number): string => value.toString().padStart(2, '0');

const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Format a Date as YYYY-MM-DD using local calendar day (not UTC).
 */
export const formatLocalISODate = (date: Date = new Date()): string => {
    return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

export const isISODateString = (value: unknown): value is string => (
    typeof value === 'string' && ISO_DAY_PATTERN.test(value)
);

export const parseLocalISODate = (isoDay: string): Date | null => {
    if (!isISODateString(isoDay)) return null;
    const [year, month, day] = isoDay.split('-').map(Number);
    const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const shiftLocalISODate = (isoDay: string, daysDelta: number): string => {
    const parsed = parseLocalISODate(isoDay);
    if (!parsed) return isoDay;
    parsed.setDate(parsed.getDate() + daysDelta);
    return formatLocalISODate(parsed);
};

export const getRelativeLocalISODate = (daysDelta: number = 0, baseDate: Date = new Date()): string => {
    const next = new Date(baseDate);
    next.setDate(next.getDate() + daysDelta);
    return formatLocalISODate(next);
};

export const getOuraFetchEndISODate = (baseDate: Date = new Date()): string => (
    getRelativeLocalISODate(1, baseDate)
);

export const getISODateWeekday = (isoDay: string): number | null => {
    const parsed = parseLocalISODate(isoDay);
    return parsed ? parsed.getDay() : null;
};

export const formatISODateForDisplay = (
    isoDay: string,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
): string => {
    const parsed = parseLocalISODate(isoDay);
    return parsed ? parsed.toLocaleDateString(locales, options) : isoDay;
};

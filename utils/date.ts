const padTwo = (value: number): string => value.toString().padStart(2, '0');

/**
 * Format a Date as YYYY-MM-DD using local calendar day (not UTC).
 */
export const formatLocalISODate = (date: Date = new Date()): string => {
    return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};


import { DAY_MS, validDay } from '../domain/metrics';

export interface ChartPoint {
    day: string;
    value: number;
}

export type SmoothingMode = 'daily' | 'smooth' | 'smoother' | 'custom';
export interface ChartSmoothingSettings {
    mode: SmoothingMode;
    customDays: number;
    showDaily: boolean;
}

export const SMOOTHING_STORAGE_KEY = 'trend_smoothing';
export const MAX_SMOOTHING_DAYS = 365;
export const DEFAULT_SMOOTHING: ChartSmoothingSettings = { mode: 'daily', customDays: 14, showDaily: false };
export const SMOOTHING_OPTIONS = [
    { mode: 'daily', label: 'Daily', days: 1 },
    { mode: 'smooth', label: 'Smooth', days: 7 },
    { mode: 'smoother', label: 'Smoother', days: 30 },
    { mode: 'custom', label: 'Custom', days: null },
] as const;

export function normalizeSmoothing(value: unknown): ChartSmoothingSettings {
    const input = value && typeof value === 'object' ? value as Partial<ChartSmoothingSettings> : {};
    return {
        mode: SMOOTHING_OPTIONS.some(option => option.mode === input.mode) ? input.mode! : 'daily',
        customDays: typeof input.customDays === 'number' && Number.isInteger(input.customDays) &&
            input.customDays >= 2 && input.customDays <= MAX_SMOOTHING_DAYS ? input.customDays : DEFAULT_SMOOTHING.customDays,
        showDaily: input.showDaily === true,
    };
}

export const smoothingDays = (settings: ChartSmoothingSettings): number =>
    settings.mode === 'custom' ? settings.customDays : SMOOTHING_OPTIONS.find(option => option.mode === settings.mode)?.days || 1;

/** Trailing calendar-day average, emitted only on dates with an actual measurement. */
export function rollingAverage(points: ReadonlyArray<ChartPoint>, windowDays: number): ChartPoint[] {
    const window = Number.isFinite(windowDays) ? Math.max(1, Math.min(MAX_SMOOTHING_DAYS, Math.round(windowDays))) : 1;
    const byDay = new Map<string, number>();
    for (const point of points) {
        if (point && validDay(point.day) && typeof point.value === 'number' && Number.isFinite(point.value)) byDay.set(point.day, point.value);
    }
    const ordered = [...byDay].sort(([a], [b]) => a.localeCompare(b))
        .map(([day, value]) => ({ day, value, time: Date.parse(`${day}T12:00:00Z`) }));
    let left = 0, sum = 0;
    return ordered.map((point, right) => {
        sum += point.value;
        const earliest = point.time - (window - 1) * DAY_MS;
        while (ordered[left].time < earliest) sum -= ordered[left++].value;
        return { day: point.day, value: sum / (right - left + 1) };
    });
}

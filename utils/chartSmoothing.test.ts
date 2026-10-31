import { describe, expect, it } from 'vitest';
import { normalizeSmoothing, rollingAverage, smoothingDays } from './chartSmoothing';

describe('calendar-day line smoothing', () => {
    it('uses a trailing window without using future measurements or rounding the result', () => {
        const points = Object.freeze([
            Object.freeze({ day: '2026-04-01', value: 10 }),
            Object.freeze({ day: '2026-04-02', value: 20 }),
            Object.freeze({ day: '2026-04-03', value: 100 }),
        ]);
        expect(rollingAverage(points, 2)).toEqual([
            { day: '2026-04-01', value: 10 }, { day: '2026-04-02', value: 15 }, { day: '2026-04-03', value: 60 },
        ]);
        expect(rollingAverage(points, 3)[2].value).toBeCloseTo(130 / 3);
        expect(points[1].value).toBe(20);
    });

    it('keeps gaps empty and expires old dates rather than averaging the last N recordings', () => {
        expect(rollingAverage([
            { day: '2026-04-01', value: 10 }, { day: '2026-04-02', value: 20 }, { day: '2026-04-10', value: 90 },
        ], 3)).toEqual([
            { day: '2026-04-01', value: 10 }, { day: '2026-04-02', value: 15 }, { day: '2026-04-10', value: 90 },
        ]);
    });

    it('handles leap days, real zeros, duplicate dates and invalid measurements', () => {
        expect(rollingAverage([
            { day: '2024-03-01', value: 50 }, { day: '2024-02-28', value: 0 },
            { day: '2024-02-29', value: 10 }, { day: '2024-02-29', value: 30 },
            { day: '2024-02-30', value: 999 }, { day: '2024-03-02', value: NaN },
        ], 2)).toEqual([
            { day: '2024-02-28', value: 0 }, { day: '2024-02-29', value: 15 }, { day: '2024-03-01', value: 40 },
        ]);
        expect(rollingAverage([], 7)).toEqual([]);
    });

    it('defaults safely when a saved preference is malformed', () => {
        expect(normalizeSmoothing({ mode: 'unknown', customDays: Infinity, showDaily: 'false' }))
            .toEqual({ mode: 'daily', customDays: 14, showDaily: false });
        expect(smoothingDays(normalizeSmoothing({ mode: 'smooth' }))).toBe(7);
        expect(smoothingDays(normalizeSmoothing({ mode: 'smoother' }))).toBe(30);
        expect(smoothingDays(normalizeSmoothing({ mode: 'custom', customDays: 365 }))).toBe(365);
        expect(rollingAverage([{ day: '2026-04-01', value: 80 }], NaN)).toEqual([{ day: '2026-04-01', value: 80 }]);
    });
});

import { describe, expect, it } from 'vitest';
import { HISTORY_RANGES, historyRange, historyStart } from './metrics';

describe('history ranges', () => {
    it('accepts only the offered ranges and falls back to 30 days', () => {
        for (const [range] of HISTORY_RANGES) expect(historyRange(range)).toBe(range);
        for (const value of ['foo', '', null, undefined, '-5', '10000', 'NaN']) expect(historyRange(value)).toBe('30');
    });

    it('turns a range into an inclusive start day without invalid dates', () => {
        expect(historyStart('2026-10-25', '7')).toBe('2026-10-19');
        expect(historyStart('2026-10-25', '365')).toBe('2025-10-26');
        expect(historyStart('2026-10-25', 'all')).toBeUndefined();
        expect(historyStart('2026-10-25', historyRange('foo'))).toBe('2026-09-26');
    });
});

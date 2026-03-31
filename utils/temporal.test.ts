import { describe, expect, it } from 'vitest';
import {
    formatRecordLocalClockTime,
    getLocalMinutesOfDayFromIso,
} from './temporal';
import {
    getProfileCurrentHour,
    getProfileFetchEndISODate,
    getProfileLocalISODate,
} from './profileTemporal';

describe('temporal helpers', () => {
    it('formats record-local clock time from embedded offset', () => {
        expect(formatRecordLocalClockTime('2026-03-31T07:00:00-05:00')).toBe('7:00 AM');
    });

    it('keeps historical clock display stable across travel', () => {
        expect(formatRecordLocalClockTime('2026-03-31T07:00:00-05:00')).toBe('7:00 AM');
        expect(formatRecordLocalClockTime('2026-04-02T07:00:00-07:00')).toBe('7:00 AM');
    });

    it('preserves local minutes through DST-boundary timestamps', () => {
        expect(getLocalMinutesOfDayFromIso('2026-11-01T01:30:00-06:00')).toBe(90);
    });

    it('derives profile-local day and hour from stored offset instead of browser local time', () => {
        const profile = { lastKnownUtcOffsetMinutes: -300 };
        const baseDate = new Date('2026-04-01T03:30:00Z');

        expect(getProfileLocalISODate(profile, baseDate)).toBe('2026-03-31');
        expect(getProfileCurrentHour(profile, baseDate)).toBe(22);
    });

    it('uses a buffered fetch end date based on profile-local day', () => {
        const profile = { lastKnownUtcOffsetMinutes: -300 };
        const baseDate = new Date('2026-04-01T03:30:00Z');

        expect(getProfileFetchEndISODate(profile, baseDate)).toBe('2026-04-02');
    });
});

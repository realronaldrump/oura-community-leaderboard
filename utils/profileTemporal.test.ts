import { describe, expect, it } from 'vitest';
import {
    deriveProfileTemporalMetadata,
    getProfileOffsetMinutes,
    shouldReplaceProfileTemporalMetadata,
} from './profileTemporal';
import { createEmptyDailyStats } from '../test/helpers';

describe('profile temporal metadata derivation', () => {
    it('ignores UTC heart-rate timestamps when deriving a profile timezone', () => {
        const data = createEmptyDailyStats({
            session: [
                {
                    id: 'session-1',
                    day: '2026-03-30',
                    bedtime_end: '2026-03-30T07:00:00-05:00',
                },
            ],
            heartrate: [
                {
                    bpm: 58,
                    source: 'rest',
                    // Oura heart-rate samples are absolute UTC timestamps. They
                    // do not describe the member's local timezone.
                    timestamp: '2026-03-31T21:00:00Z',
                },
            ],
            workout: [
                {
                    id: 'workout-1',
                    activity: 'walk',
                    day: '2026-03-31',
                    start_datetime: '2026-03-31T08:00:00-06:00',
                    end_datetime: '2026-03-31T09:00:00-06:00',
                },
            ],
        });

        expect(deriveProfileTemporalMetadata(data)).toEqual({
            lastKnownUtcOffsetMinutes: -360,
            lastKnownOffsetObservedAt: '2026-03-31T09:00:00-06:00',
            lastKnownOffsetSource: 'workout_end',
        });
    });

    it('falls back to sleep_time day_tz when timestamped sources are unavailable', () => {
        const data = createEmptyDailyStats({
            sleepTime: [
                {
                    day: '2026-03-31',
                    day_tz: -18_000,
                },
            ],
        });

        expect(deriveProfileTemporalMetadata(data)).toEqual({
            lastKnownUtcOffsetMinutes: -300,
            lastKnownOffsetObservedAt: '2026-03-31T12:00:00-05:00',
            lastKnownOffsetSource: 'sleep_time_window',
        });
    });

    it('ignores and repairs a legacy heart-rate-derived UTC offset', () => {
        const legacyProfile = {
            lastKnownUtcOffsetMinutes: 0,
            lastKnownOffsetObservedAt: '2026-07-31T01:33:00Z',
            lastKnownOffsetSource: 'heartrate' as const,
        };
        const reliableCandidate = {
            lastKnownUtcOffsetMinutes: -360,
            lastKnownOffsetObservedAt: '2026-07-30T09:11:55-06:00',
            lastKnownOffsetSource: 'session_bedtime_end' as const,
        };

        expect(getProfileOffsetMinutes(legacyProfile)).toBeNull();
        expect(shouldReplaceProfileTemporalMetadata(legacyProfile, reliableCandidate)).toBe(true);
    });

    it('does not let an older partial sync overwrite newer reliable timezone evidence', () => {
        const current = {
            lastKnownUtcOffsetMinutes: -360,
            lastKnownOffsetObservedAt: '2026-07-30T09:11:55-06:00',
            lastKnownOffsetSource: 'session_bedtime_end' as const,
        };
        const olderCandidate = {
            lastKnownUtcOffsetMinutes: -420,
            lastKnownOffsetObservedAt: '2026-07-29T18:00:00-07:00',
            lastKnownOffsetSource: 'workout_end' as const,
        };

        expect(shouldReplaceProfileTemporalMetadata(current, olderCandidate)).toBe(false);
        expect(shouldReplaceProfileTemporalMetadata(current, {
            ...current,
            lastKnownOffsetSource: 'session_bedtime_end',
        })).toBe(false);
    });
});

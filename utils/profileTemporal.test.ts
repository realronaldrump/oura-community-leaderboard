import { describe, expect, it } from 'vitest';
import { deriveProfileTemporalMetadata } from './profileTemporal';
import { createEmptyDailyStats } from '../test/helpers';

describe('profile temporal metadata derivation', () => {
    it('picks the freshest available offset automatically for traveling users', () => {
        const data = createEmptyDailyStats({
            session: [
                {
                    id: 'session-1',
                    day: '2026-03-30',
                    bedtime_end: '2026-03-30T07:00:00-05:00',
                },
            ],
            // heartrate timestamps from Oura are always UTC (Z suffix) and are
            // not used as an offset source, so this should not influence the result.
            heartrate: [
                {
                    bpm: 58,
                    source: 'rest',
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
});

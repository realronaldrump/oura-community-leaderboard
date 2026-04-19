import { describe, expect, it } from 'vitest';
import { buildProfileStatsDocuments, PROFILE_STATS_SCHEMA_VERSION } from './firestoreStatsService';
import { DailyStats } from '../types';

describe('buildProfileStatsDocuments', () => {
    it('normalizes daily stats into shared Firestore day and collection documents', () => {
        const stats: DailyStats = {
            sleep: [
                {
                    id: 'sleep-1',
                    day: '2026-04-18',
                    score: 88,
                    contributors: {},
                },
            ],
            readiness: [
                {
                    id: 'ready-1',
                    day: '2026-04-18',
                    score: 82,
                    contributors: {},
                },
            ],
            activity: [
                {
                    id: 'activity-1',
                    day: '2026-04-18',
                    score: 91,
                    active_calories: 520,
                    contributors: {},
                    steps: 12345,
                    target_calories: 450,
                    total_calories: 2400,
                },
            ],
            session: [
                {
                    id: 'short-session',
                    day: '2026-04-18',
                    total_sleep_duration: 18000,
                    bedtime_end: '2026-04-18T07:00:00-06:00',
                    contributors: undefined,
                } as any,
                {
                    id: 'best-session',
                    day: '2026-04-18',
                    total_sleep_duration: 27000,
                    bedtime_end: '2026-04-18T07:30:00-06:00',
                },
            ],
            spo2: [],
            stress: [],
            resilience: [],
            heartrate: [
                { bpm: 58, source: 'sleep', timestamp: '2026-04-18T01:00:00-06:00' },
                { bpm: 62, source: 'sleep', timestamp: '2026-04-19T01:00:00-06:00' },
            ],
            workout: [
                {
                    id: 'workout-1',
                    activity: 'running',
                    day: '2026-04-18',
                    end_datetime: '2026-04-18T17:30:00-06:00',
                    start_datetime: '2026-04-18T17:00:00-06:00',
                },
            ],
            guidedSession: [],
            sleepTime: [],
            tag: [],
            enhancedTag: [],
            restModePeriod: [],
            ringConfiguration: [{ id: 'ring-1', color: 'silver' }],
        };

        const built = buildProfileStatsDocuments('profile-1', stats, 'full', '2026-04-19T12:00:00.000Z');

        expect(built.metadata).toMatchObject({
            profileId: 'profile-1',
            schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
            oldestDay: '2026-04-18',
            newestDay: '2026-04-18',
            lastFullSyncAt: '2026-04-19T12:00:00.000Z',
        });
        expect(built.days).toHaveLength(1);
        expect(built.days[0].bestSleepSession).toMatchObject({ id: 'best-session' });
        expect(JSON.stringify(built.days[0])).not.toContain('undefined');
        expect(built.heartRateDays).toHaveLength(2);
        expect(built.rawCollections.sleepSessions).toHaveLength(2);
        expect(built.rawCollections.workouts).toHaveLength(1);
        expect(built.rawCollections.ringConfigurations).toHaveLength(1);
    });
});

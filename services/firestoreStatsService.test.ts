import { describe, expect, it } from 'vitest';
import {
    buildIncrementalProfileStatsDocuments,
    buildProfileStatsDocuments,
    estimateSetOperationBytes,
    partitionSetOperations,
} from './firestoreStatsService';
import { PROFILE_STATS_SCHEMA_VERSION } from './profileStatsConstants';
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

    it('builds incremental persistence docs from the delta while keeping merged coverage metadata', () => {
        const merged: DailyStats = {
            sleep: [
                { id: 'sleep-old', day: '2026-04-10', score: 81, contributors: {} },
                { id: 'sleep-new', day: '2026-04-18', score: 88, contributors: {} },
            ],
            readiness: [
                { id: 'ready-old', day: '2026-04-10', score: 79, contributors: {} },
                { id: 'ready-new', day: '2026-04-18', score: 84, contributors: {} },
            ],
            activity: [
                {
                    id: 'activity-old',
                    day: '2026-04-10',
                    score: 76,
                    active_calories: 320,
                    contributors: {},
                    steps: 8000,
                    target_calories: 450,
                    total_calories: 2100,
                },
                {
                    id: 'activity-new',
                    day: '2026-04-18',
                    score: 92,
                    active_calories: 540,
                    contributors: {},
                    steps: 12800,
                    target_calories: 450,
                    total_calories: 2450,
                },
            ],
            session: [
                { id: 'session-old', day: '2026-04-10', total_sleep_duration: 25000 } as any,
                { id: 'session-new', day: '2026-04-18', total_sleep_duration: 27000 } as any,
            ],
            spo2: [],
            stress: [],
            resilience: [],
            heartrate: [
                { bpm: 57, source: 'sleep', timestamp: '2026-04-10T01:00:00-06:00' },
                { bpm: 61, source: 'sleep', timestamp: '2026-04-18T01:00:00-06:00' },
            ],
            workout: [
                {
                    id: 'workout-old',
                    activity: 'running',
                    day: '2026-04-10',
                    end_datetime: '2026-04-10T17:30:00-06:00',
                    start_datetime: '2026-04-10T17:00:00-06:00',
                },
                {
                    id: 'workout-new',
                    activity: 'walking',
                    day: '2026-04-18',
                    end_datetime: '2026-04-18T18:00:00-06:00',
                    start_datetime: '2026-04-18T17:40:00-06:00',
                },
            ],
            guidedSession: [],
            sleepTime: [],
            tag: [],
            enhancedTag: [],
            restModePeriod: [],
            ringConfiguration: [{ id: 'ring-1', color: 'silver' }],
            cardiovascularAge: [],
            vo2Max: [],
        };

        const delta: DailyStats = {
            ...merged,
            sleep: [merged.sleep[1]],
            readiness: [merged.readiness[1]],
            activity: [merged.activity[1]],
            session: [merged.session[1]],
            heartrate: [merged.heartrate[1]],
            workout: [merged.workout[1]],
            ringConfiguration: [],
        };

        const built = buildIncrementalProfileStatsDocuments('profile-1', merged, delta, '2026-04-19T12:00:00.000Z');

        expect(built.metadata).toMatchObject({
            profileId: 'profile-1',
            schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
            oldestDay: '2026-04-10',
            newestDay: '2026-04-18',
            lastIncrementalSyncAt: '2026-04-19T12:00:00.000Z',
        });
        expect(built.days).toHaveLength(1);
        expect(built.days[0]).toMatchObject({ day: '2026-04-18' });
        expect(built.heartRateDays).toHaveLength(1);
        expect(built.heartRateDays[0]).toMatchObject({ day: '2026-04-18' });
        expect(built.rawCollections.sleepSessions).toHaveLength(1);
        expect(built.rawCollections.workouts).toHaveLength(1);
        expect(built.rawCollections.ringConfigurations).toHaveLength(0);
    });

    it('partitions set operations by payload size before Firestore rejects the commit', () => {
        const operations = Array.from({ length: 5 }, (_, index) => ({
            path: ['profileStats', 'profile-1', 'sleepSessions', `session-${index}`] as [string, string, ...string[]],
            data: {
                id: `session-${index}`,
                blob: 'x'.repeat(420),
            },
        }));

        const batches = partitionSetOperations(operations, {
            maxOperations: 10,
            maxBytes: 1200,
        });

        expect(batches.length).toBeGreaterThan(1);
        batches.forEach((batch) => {
            const bytes = batch.reduce((total, operation) => total + estimateSetOperationBytes(operation), 0);
            expect(batch.length).toBeLessThanOrEqual(10);
            expect(bytes).toBeLessThanOrEqual(1200);
        });
    });

    it('still honors the operation-count limit even when payloads are small', () => {
        const operations = Array.from({ length: 5 }, (_, index) => ({
            path: ['profileStats', 'profile-1', 'days', `2026-04-${String(index + 1).padStart(2, '0')}`] as [string, string, ...string[]],
            data: {
                day: `2026-04-${String(index + 1).padStart(2, '0')}`,
            },
        }));

        const batches = partitionSetOperations(operations, {
            maxOperations: 2,
            maxBytes: 10_000,
        });

        expect(batches.map((batch) => batch.length)).toEqual([2, 2, 1]);
    });
});

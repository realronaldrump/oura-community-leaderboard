import { describe, expect, it } from 'vitest';
import {
    buildProfileDashboardSnapshot,
    buildIncrementalProfileStatsDocuments,
    buildProfileStatsDocuments,
    estimateSetOperationBytes,
    mergeIncrementalProfileStatsMetadata,
    partitionSetOperations,
    saveProfileStats,
} from './firestoreStatsService';
import { PROFILE_STATS_SCHEMA_VERSION } from './profileStatsConstants';
import { DailyStats } from '../types';

describe('buildProfileStatsDocuments', () => {
    it('builds a bounded dashboard snapshot without raw high-volume samples', () => {
        const days = Array.from({ length: 32 }, (_, index) => {
            const day = new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10);
            return {
                day,
                sleep: { id: `sleep-${index}`, day, score: 80 + (index % 10), contributors: {} },
                readiness: { id: `readiness-${index}`, day, score: 81 + (index % 10), contributors: {} },
                activity: {
                    id: `activity-${index}`,
                    day,
                    score: 82 + (index % 10),
                    active_calories: 500,
                    contributors: {},
                    steps: 10_000,
                    target_calories: 450,
                    total_calories: 2_400,
                    class_5_min: 'raw-class-samples',
                    met: { interval: 60, items: [1, 2, 3], timestamp: `${day}T00:00:00Z` },
                } as any,
                session: {
                    id: `session-${index}`,
                    day,
                    total_sleep_duration: 28_000,
                    movement_30_sec: 'raw-movement-samples',
                    sleep_phase_30_sec: 'raw-sleep-phase-samples',
                    heart_rate: { interval: 300, items: [50, 51], timestamp: `${day}T00:00:00Z` },
                    hrv: { interval: 300, items: [20, 22], timestamp: `${day}T00:00:00Z` },
                },
            };
        });
        const stats: DailyStats = {
            sleep: days.map((item) => item.sleep),
            readiness: days.map((item) => item.readiness),
            activity: days.map((item) => item.activity),
            session: days.map((item) => item.session),
            spo2: [],
            stress: [],
            resilience: [],
            endpointDiagnostics: { daily_stress: null },
        };

        const snapshot = buildProfileDashboardSnapshot('profile-1', stats, '2026-08-01T12:00:00.000Z');

        expect(snapshot.profileId).toBe('profile-1');
        expect(snapshot.data.sleep).toHaveLength(30);
        expect(snapshot.data.sleep[0].day).toBe('2026-07-02');
        expect(snapshot.data.sleep.at(-1)?.day).toBe('2026-06-03');
        expect(snapshot.data.endpointDiagnostics).toEqual({ daily_stress: null });
        expect(snapshot.data.session[0]).not.toHaveProperty('movement_30_sec');
        expect(snapshot.data.session[0]).not.toHaveProperty('sleep_phase_30_sec');
        expect(snapshot.data.session[0]).not.toHaveProperty('heart_rate');
        expect(snapshot.data.session[0]).not.toHaveProperty('hrv');
        expect(snapshot.data.activity[0]).not.toHaveProperty('class_5_min');
        expect(snapshot.data.activity[0]).not.toHaveProperty('met');
    });

    it('normalizes daily stats into shared Firestore day and collection documents', () => {
        const stats: DailyStats = {
            personalInfo: { id: 'oura-user-1', age: 40, email: 'member@example.com' },
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
            ringBatteryLevel: [{
                timestamp: '2026-04-18T12:00:00Z',
                timestamp_unix: 1_776_513_600_000,
                level: 71,
            }],
            endpointDiagnostics: {
                daily_stress: null,
            },
            vo2Max: [
                { id: 'vo2-1', day: '2026-04-18', timestamp: '2026-04-18T10:00:00Z', vo2_max: 44.1 },
                { id: 'vo2-2', day: '2026-04-18', timestamp: '2026-04-18T18:00:00Z', vo2_max: 44.8 },
            ],
        };

        const built = buildProfileStatsDocuments('profile-1', stats, 'full', '2026-04-19T12:00:00.000Z');

        expect(built.metadata).toMatchObject({
            profileId: 'profile-1',
            schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
            oldestDay: '2026-04-18',
            newestDay: '2026-04-18',
            lastFullSyncAt: '2026-04-19T12:00:00.000Z',
            lastFullSyncSchemaVersion: PROFILE_STATS_SCHEMA_VERSION,
        });
        expect(built.days).toHaveLength(1);
        expect(built.days[0].bestSleepSession).toMatchObject({ id: 'best-session' });
        expect(JSON.stringify(built.days[0])).not.toContain('undefined');
        expect(built.heartRateDays).toHaveLength(2);
        expect(built.rawCollections.sleepSessions).toHaveLength(2);
        expect(built.rawCollections.workouts).toHaveLength(1);
        expect(built.rawCollections.ringConfigurations).toHaveLength(1);
        expect(built.rawCollections.ringBatteryLevels).toHaveLength(1);
        expect(built.rawCollections.personalInfo).toEqual([
            expect.objectContaining({ id: 'oura-user-1', age: 40 }),
        ]);
        expect(built.rawCollections.vo2Max).toHaveLength(2);
        expect(built.metadata.endpointDiagnostics).toEqual({ daily_stress: null });
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

    it('never narrows durable history coverage when an incremental client holds only a compact snapshot', () => {
        const merged = mergeIncrementalProfileStatsMetadata(
            {
                profileId: 'profile-1',
                schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
                oldestDay: '2023-01-01',
                newestDay: '2026-07-30',
                lastFullSyncAt: '2026-07-01T12:00:00.000Z',
                lastFullSyncSchemaVersion: PROFILE_STATS_SCHEMA_VERSION,
                updatedAt: '2026-07-30T12:00:00.000Z',
            },
            {
                profileId: 'profile-1',
                schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
                oldestDay: '2026-07-01',
                newestDay: '2026-08-01',
                lastIncrementalSyncAt: '2026-08-01T12:00:00.000Z',
                updatedAt: '2026-08-01T12:00:00.000Z',
            }
        );

        expect(merged).toMatchObject({
            oldestDay: '2023-01-01',
            newestDay: '2026-08-01',
            lastFullSyncAt: '2026-07-01T12:00:00.000Z',
            lastFullSyncSchemaVersion: PROFILE_STATS_SCHEMA_VERSION,
            lastIncrementalSyncAt: '2026-08-01T12:00:00.000Z',
        });
    });

    it('stores an overnight sleep session only on its canonical Oura day', () => {
        const stats: DailyStats = {
            sleep: [
                { id: 'sleep-9', day: '2026-04-09', contributors: {} },
                { id: 'sleep-10', day: '2026-04-10', contributors: {} },
            ],
            readiness: [], activity: [], spo2: [], stress: [], resilience: [],
            session: [{
                id: 'overnight',
                day: '2026-04-10',
                bedtime_start: '2026-04-09T23:00:00Z',
                bedtime_end: '2026-04-10T07:00:00Z',
                total_sleep_duration: 28_000,
            }],
        };

        const built = buildProfileStatsDocuments('profile-1', stats, 'full');

        expect(built.days.find((day) => day.day === '2026-04-09')?.bestSleepSession).toBeNull();
        expect(built.days.find((day) => day.day === '2026-04-10')?.bestSleepSession).toMatchObject({ id: 'overnight' });
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

    it('does not publish freshness metadata when a later replacement-data batch fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const commitOperations = vi.fn(async () => {
            throw new Error('later data batch failed');
        });
        const pruneFullSnapshot = vi.fn(async () => {});
        const stats: DailyStats = {
            sleep: [{ id: 'sleep-1', day: '2026-04-18', score: 88, contributors: {} }],
            readiness: [], activity: [], session: [], spo2: [], stress: [], resilience: [],
            heartrate: [], workout: [], guidedSession: [], sleepTime: [], tag: [],
            enhancedTag: [], restModePeriod: [], ringConfiguration: [],
        };

        await expect(saveProfileStats('profile-1', stats, 'full', {
            commitOperations,
            pruneFullSnapshot,
        })).rejects.toThrow('later data batch failed');

        expect(commitOperations).toHaveBeenCalledTimes(1);
        expect(pruneFullSnapshot).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('reconciles a successful full snapshot before publishing metadata', async () => {
        const events: string[] = [];
        let dashboardSnapshotOperation: { path: string[]; data?: unknown } | undefined;
        const commitOperations = vi.fn(async (operations: Array<{ path: string[]; merge?: boolean }>) => {
            const isMetadata = operations.length === 1 && operations[0].path.length === 2;
            events.push(isMetadata ? 'metadata' : 'data');
            if (!isMetadata) {
                expect(operations.every((operation) => operation.merge === false)).toBe(true);
                dashboardSnapshotOperation = operations.find((operation) =>
                    operation.path.join('/') === 'profileStats/profile-1/snapshots/dashboard'
                );
            }
        });
        const pruneFullSnapshot = vi.fn(async () => {
            events.push('prune');
        });
        const stats: DailyStats = {
            sleep: [{ id: 'sleep-1', day: '2026-04-18', score: 88, contributors: {} }],
            readiness: [], activity: [], session: [], spo2: [], stress: [], resilience: [],
            heartrate: [], workout: [], guidedSession: [], sleepTime: [], tag: [],
            enhancedTag: [], restModePeriod: [], ringConfiguration: [],
        };

        await saveProfileStats('profile-1', stats, 'full', {
            commitOperations: commitOperations as any,
            pruneFullSnapshot,
        });

        expect(events).toEqual(['data', 'prune', 'metadata']);
        expect(pruneFullSnapshot).toHaveBeenCalledTimes(1);
        expect(dashboardSnapshotOperation).toMatchObject({
            path: ['profileStats', 'profile-1', 'snapshots', 'dashboard'],
            data: {
                schemaVersion: 1,
                profileId: 'profile-1',
            },
        });
    });
});

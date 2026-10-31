import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../test/helpers';
import {
    filterDailyStatsByDataExclusions,
    getDataExclusionRangeDayCount,
    getTotalExcludedDayCount,
    isDayExcludedByRanges,
    normalizeDataExclusionRanges,
    dataExclusionKey,
    DATA_EXCLUSION_GROUPS,
    DATA_EXCLUSION_SOURCES,
    getExclusionSourcesForDay,
    restoreDataExclusionDay,
} from './dataExclusions';

describe('data exclusions', () => {
    it('keeps valid data types and the original snapshot when sleep alone is excluded', () => {
        const day = '2026-01-02';
        const snapshot = createEmptyDailyStats({
            sleep: [{ id: 's', day, score: 12, contributors: {} }],
            session: [{ id: 'night', day, bedtime_start: '2026-01-01T22:00:00-07:00', average_hrv: 5 }],
            readiness: [{ id: 'r', day, score: 85, contributors: {} }],
            activity: [{ id: 'a', day, steps: 12000, active_calories: 400, target_calories: 500, total_calories: 2200, contributors: {} }],
            heartrate: [{ bpm: 60, source: 'awake', timestamp: `${day}T10:00:00Z` }],
            sleepTime: [{ id: 'timing', day }],
        });
        const before = structuredClone(snapshot);
        const sources = DATA_EXCLUSION_GROUPS.find(group => group.id === 'sleep')!.sources;
        const ranges = [{ id: 'sleep', startDay: day, endDay: day, sources }];
        const filtered = filterDailyStatsByDataExclusions(snapshot, ranges)!;
        expect(filtered.sleep).toEqual([]);
        expect(filtered.session).toEqual([]);
        expect(filtered.sleepTime).toEqual([]);
        expect(filtered.activity).toEqual(snapshot.activity);
        expect(filtered.readiness).toEqual(snapshot.readiness);
        expect(filtered.heartrate).toEqual(snapshot.heartrate);
        expect(snapshot).toEqual(before);
        expect(isDayExcludedByRanges(day, ranges)).toBe(false);
        expect(isDayExcludedByRanges(day, ranges, 'sleep')).toBe(true);
    });

    it('covers every dated collection and keeps scoped revisions stable and distinct', () => {
        expect(new Set(DATA_EXCLUSION_SOURCES).size).toBe(DATA_EXCLUSION_SOURCES.length);
        expect(DATA_EXCLUSION_SOURCES).toEqual(Object.keys(createEmptyDailyStats()).filter(key => key !== 'personalInfo').sort());
        const base = { id: 'x', startDay: '2026-01-02', endDay: '2026-01-02' };
        expect(dataExclusionKey([base])).toBe('[["2026-01-02","2026-01-02"]]');
        expect(dataExclusionKey([{ ...base, sources: ['sleep', 'session'] }])).toBe(dataExclusionKey([{ ...base, label: 'Changed reason', sources: ['session', 'sleep', 'sleep'] }]));
        expect(dataExclusionKey([{ ...base, sources: ['sleep'] }])).not.toBe(dataExclusionKey([{ ...base, sources: ['activity'] }]));
        expect(dataExclusionKey([{ ...base, sources: DATA_EXCLUSION_SOURCES }])).toBe(dataExclusionKey([base]));
        expect(normalizeDataExclusionRanges([
            { ...base, sources: [] }, { ...base, sources: ['unknown' as any] },
            { ...base, startDay: '2026-02-30' },
        ])).toEqual([]);
    });

    it('restores one day inside overlapping breaks while keeping other days and data types', () => {
        const ranges = [
            { id: 'long', startDay: '2026-01-01', endDay: '2026-01-05', label: 'Charging' },
            { id: 'overlap', startDay: '2026-01-02', endDay: '2026-01-04', sources: ['activity' as const] },
        ];
        const restored = restoreDataExclusionDay(ranges, '2026-01-03');
        expect(getExclusionSourcesForDay('2026-01-03', restored)).toEqual([]);
        expect(getExclusionSourcesForDay('2026-01-02', restored)).toEqual(DATA_EXCLUSION_SOURCES);
        expect(getExclusionSourcesForDay('2026-01-04', restored)).toEqual(DATA_EXCLUSION_SOURCES);
        expect(new Set(restored.map(range => range.id)).size).toBe(4);
        expect(restored.filter(range => range.sources)).toHaveLength(2);
        expect(restoreDataExclusionDay([{ id: 'one', startDay: '2026-01-03', endDay: '2026-01-03' }], '2026-01-03')).toEqual([]);
        expect(ranges[0].endDay).toBe('2026-01-05');
    });

    it('normalizes, sorts, and counts inclusive profile exclusion ranges', () => {
        const ranges = normalizeDataExclusionRanges([
            { id: 'invalid', startDay: '2026-01', endDay: '2026-01-04' },
            { id: 'flipped', startDay: '2026-01-05', endDay: '2026-01-03', label: '  Break  ' },
            { id: 'single', startDay: '2026-01-02', endDay: '2026-01-02' },
        ]);

        expect(ranges).toEqual([
            { id: 'single', startDay: '2026-01-02', endDay: '2026-01-02', label: null },
            { id: 'flipped', startDay: '2026-01-03', endDay: '2026-01-05', label: 'Break' },
        ]);
        expect(getDataExclusionRangeDayCount(ranges[1])).toBe(3);
        expect(getTotalExcludedDayCount(ranges)).toBe(4);
        expect(isDayExcludedByRanges('2026-01-04', ranges)).toBe(true);
        expect(isDayExcludedByRanges('2026-01-06', ranges)).toBe(false);
    });

    it('removes excluded days from daily metric arrays', () => {
        const filtered = filterDailyStatsByDataExclusions(
            createEmptyDailyStats({
                sleep: [
                    { id: 's1', day: '2026-01-01', score: 80, contributors: {} },
                    { id: 's2', day: '2026-01-02', score: 12, contributors: {} },
                ],
                readiness: [
                    { id: 'r1', day: '2026-01-01', score: 82, contributors: {} },
                    { id: 'r2', day: '2026-01-02', score: 10, contributors: {} },
                ],
                activity: [
                    { id: 'a1', day: '2026-01-01', score: 70, steps: 8000, active_calories: 300, target_calories: 500, total_calories: 2200, contributors: {} },
                    { id: 'a2', day: '2026-01-02', score: 4, steps: 50, active_calories: 2, target_calories: 500, total_calories: 1600, contributors: {} },
                ],
            }),
            [{ id: 'break', startDay: '2026-01-02', endDay: '2026-01-02' }]
        );

        expect(filtered?.sleep.map((item) => item.day)).toEqual(['2026-01-01']);
        expect(filtered?.readiness.map((item) => item.day)).toEqual(['2026-01-01']);
        expect(filtered?.activity.map((item) => item.day)).toEqual(['2026-01-01']);
    });

    it('removes sessions by Oura day and heart-rate points by timestamp day', () => {
        const filtered = filterDailyStatsByDataExclusions(
            createEmptyDailyStats({
                session: [
                    { id: 'kept', day: '2026-01-01', bedtime_start: '2025-12-31T22:00:00-07:00', bedtime_end: '2026-01-01T06:00:00-07:00' },
                    { id: 'excluded', day: '2026-01-02', bedtime_start: '2026-01-01T22:00:00-07:00', bedtime_end: '2026-01-02T06:00:00-07:00' },
                ],
                heartrate: [
                    { bpm: 54, source: 'sleep', timestamp: '2026-01-01T03:00:00-07:00' },
                    { bpm: 52, source: 'sleep', timestamp: '2026-01-02T03:00:00-07:00' },
                ],
            }),
            [{ id: 'break', startDay: '2026-01-02', endDay: '2026-01-02' }]
        );

        expect(filtered?.session.map((item) => item.id)).toEqual(['kept']);
        expect(filtered?.heartrate?.map((item) => item.timestamp.slice(0, 10))).toEqual(['2026-01-01']);
    });

    it('filters generic raw collections using day and timestamp-like fields', () => {
        const filtered = filterDailyStatsByDataExclusions(
            createEmptyDailyStats({
                tag: [
                    { id: 'kept-tag', day: '2026-01-01' },
                    { id: 'excluded-tag', start_time: '2026-01-03T08:00:00-07:00' },
                ],
                restModePeriod: [
                    { id: 'excluded-rest', start_day: '2026-01-02', end_day: '2026-01-04' },
                    { id: 'enclosing-rest', start_day: '2026-01-01', end_day: '2026-01-05' },
                    { id: 'kept-rest', start_day: '2026-01-05', end_day: '2026-01-06' },
                ],
            }),
            [{ id: 'break', startDay: '2026-01-02', endDay: '2026-01-03' }]
        );

        expect(filtered?.tag?.map((item: any) => item.id)).toEqual(['kept-tag']);
        expect(filtered?.restModePeriod?.map((item: any) => item.id)).toEqual(['kept-rest']);
    });
});

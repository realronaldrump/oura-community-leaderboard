import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../test/helpers';
import {
    filterDailyStatsByDataExclusions,
    getDataExclusionRangeDayCount,
    getTotalExcludedDayCount,
    isDayExcludedByRanges,
    normalizeDataExclusionRanges,
} from './dataExclusions';

describe('data exclusions', () => {
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
                    { id: 'kept-rest', start_day: '2026-01-05', end_day: '2026-01-06' },
                ],
            }),
            [{ id: 'break', startDay: '2026-01-02', endDay: '2026-01-03' }]
        );

        expect(filtered?.tag?.map((item: any) => item.id)).toEqual(['kept-tag']);
        expect(filtered?.restModePeriod?.map((item: any) => item.id)).toEqual(['kept-rest']);
    });
});

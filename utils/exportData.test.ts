import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../test/helpers';
import {
    filterSleepSessionsByRange,
    getAvailableExportRange,
    getNightlyRestingHeartRateRows,
} from './exportData';

describe('exportData helpers', () => {
    it('builds nightly resting heart rate rows for the selected range only', () => {
        const data = createEmptyDailyStats({
            session: [
                {
                    id: 'session-1',
                    day: '2026-04-10',
                    type: 'sleep',
                    bedtime_start: '2026-04-09T22:30:00Z',
                    bedtime_end: '2026-04-10T06:30:00Z',
                    lowest_heart_rate: 49,
                },
                {
                    id: 'session-2',
                    day: '2026-04-15',
                    type: 'sleep',
                    bedtime_start: '2026-04-14T23:00:00Z',
                    bedtime_end: '2026-04-15T07:00:00Z',
                    lowest_heart_rate: 45,
                },
                {
                    id: 'session-3',
                    day: '2026-04-16',
                    type: 'sleep',
                    bedtime_start: '2026-04-15T22:45:00Z',
                    bedtime_end: '2026-04-16T06:45:00Z',
                    lowest_heart_rate: null,
                },
                {
                    id: 'session-4',
                    day: '2026-04-17',
                    type: 'deleted',
                    bedtime_start: '2026-04-16T22:30:00Z',
                    bedtime_end: '2026-04-17T06:30:00Z',
                    lowest_heart_rate: 52,
                },
            ],
        });

        expect(getNightlyRestingHeartRateRows(data, { start: '2026-04-12', end: '2026-04-16' })).toEqual([
            {
                date: '2026-04-15',
                nightly_resting_heart_rate_bpm: 45,
            },
        ]);
    });

    it('includes sleep sessions that overlap the selected date range', () => {
        const sessions = [
            {
                id: 'overnight',
                day: '2026-04-10',
                type: 'sleep' as const,
                bedtime_start: '2026-04-09T23:30:00Z',
                bedtime_end: '2026-04-10T07:00:00Z',
            },
            {
                id: 'outside',
                day: '2026-04-12',
                type: 'sleep' as const,
                bedtime_start: '2026-04-11T23:30:00Z',
                bedtime_end: '2026-04-12T07:00:00Z',
            },
        ];

        expect(filterSleepSessionsByRange(sessions, { start: '2026-04-09', end: '2026-04-09' })).toEqual([
            sessions[0],
        ]);
    });

    it('derives the available export range from every exportable dataset', () => {
        const data = createEmptyDailyStats({
            session: [
                {
                    id: 'session-1',
                    day: '2026-04-02',
                    type: 'sleep',
                    bedtime_start: '2026-04-01T22:30:00Z',
                    bedtime_end: '2026-04-02T06:30:00Z',
                },
            ],
            heartrate: [
                {
                    bpm: 58,
                    source: 'sleep',
                    timestamp: '2026-04-03T01:00:00Z',
                },
            ],
            enhancedTag: [
                {
                    start_day: '2026-04-07',
                },
            ],
        });

        expect(getAvailableExportRange(data)).toEqual({
            start: '2026-04-01',
            end: '2026-04-07',
        });
    });
});

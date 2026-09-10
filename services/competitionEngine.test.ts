import { createEmptyDailyStats } from '../test/helpers';
import { makeCompetition, stepRule } from '../test/competitionFixtures';
import type { DailyStats } from '../types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCompetitionStatus, evaluateCompetition } from './competitionEngine';
import { Competition } from '../types/competitionTypes';

const competition: Competition = {
    id: 'competition-1',
    title: 'Timezone Test',
    description: '',
    mode: 'solo',
    format: 'goal',
    status: 'scheduled',
    createdByProfileId: 'user-1',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    timeZone: 'America/New_York',
    rules: [],
    participants: [],
    participantProfileIds: [],
};

describe('competition timezone anchoring', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('evaluates status against the stored competition timezone', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T02:30:00Z'));
        expect(deriveCompetitionStatus(competition)).toBe('scheduled');

        vi.setSystemTime(new Date('2026-04-01T05:30:00Z'));
        expect(deriveCompetitionStatus(competition)).toBe('active');
    });
});

describe('curated challenge scoring', () => {
    it('counts all steps in real units with no target cap and shares tied ranks', () => {
        const result = evaluateCompetition(makeCompetition(), {
            'profile-1': createEmptyDailyStats({ activity: [activity('2026-09-10', 14000), activity('2026-09-11', 9000)] }),
            'profile-2': createEmptyDailyStats({ activity: [activity('2026-09-10', 23000)] }),
        }, '2026-09-11');
        expect(result.leaderboard.map((entry) => entry.totalScore)).toEqual([23000, 23000]);
        expect(result.leaderboard.map((entry) => entry.rank)).toEqual([1, 1]);
        expect(result.days).toHaveLength(2);
        expect(result.leaderboard[0].totalDays).toBe(7);
    });

    it('averages synced scores without treating missing days as zero or summing daily averages', () => {
        const result = evaluateCompetition(makeCompetition({ scoring: 'average', rules: [{ ...stepRule, metricId: 'sleep_score', aggregation: 'average', target: 85 }] }), {
            'profile-1': createEmptyDailyStats({ sleep: [{ id: 'a', day: '2026-09-10', score: 80, contributors: {} }, { id: 'b', day: '2026-09-12', score: 90, contributors: {} }] }),
            'profile-2': createEmptyDailyStats({ sleep: [{ id: 'c', day: '2026-09-10', score: 88, contributors: {} }] }),
        }, '2026-09-12');
        expect(result.leaderboard.map((entry) => entry.totalScore)).toEqual([88, 85]);
        expect(result.leaderboard[1].progressDays).toBe(2);
    });

    it('preserves weighted legacy results', () => {
        const result = evaluateCompetition(makeCompetition({ scoring: undefined, format: 'combo', rules: [
            { ...stepRule, weight: 0.4, capAtTarget: true },
            { ...stepRule, id: 'sleep', metricId: 'sleep_score', target: 80, weight: 0.6, capAtTarget: true },
        ] }), { 'profile-1': createEmptyDailyStats({ activity: [activity('2026-09-10', 5000)], sleep: [{ id: 'sleep', day: '2026-09-10', score: 80, contributors: {} }] }) }, '2026-09-10');
        expect(result.leaderboard[0].totalScore).toBeCloseTo(0.8);
    });

    it('counts solo successful days against the full week, including zero values as real data', () => {
        const result = evaluateCompetition(makeCompetition({ mode: 'solo', format: 'goal', scoring: undefined }), {
            'profile-1': createEmptyDailyStats({ activity: [activity('2026-09-10', 10000), activity('2026-09-11', 0)] }),
        }, '2026-09-11');
        expect(result.leaderboard[0]).toMatchObject({ totalScore: 1, totalDays: 7, progressDays: 1 });
        expect(result.leaderboard[0].dailyScores[1].rules[0].value).toBe(0);
    });

    it('excludes future and outside-window data from results', () => {
        const result = evaluateCompetition(makeCompetition(), { 'profile-1': createEmptyDailyStats({ activity: [activity('2026-09-09', 50000), activity('2026-09-10', 1000), activity('2026-09-11', 50000)] }) }, '2026-09-10');
        expect(result.leaderboard[0].totalScore).toBe(1000);
        const scheduled = evaluateCompetition(makeCompetition(), {}, '2026-09-09');
        expect(scheduled.days).toHaveLength(0);
        expect(scheduled.leaderboard[0].totalDays).toBe(7);
    });
});

const activity = (day: string, steps: number): DailyStats['activity'][number] => ({ id: day, day, steps, score: 80, active_calories: 400, contributors: {}, target_calories: 500, total_calories: 2000 });

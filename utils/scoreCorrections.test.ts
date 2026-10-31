import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../test/helpers';
import type { DailyScoreCorrection } from '../types';
import { applyScoreCorrections, normalizeScoreCorrections } from './scoreCorrections';
import { filterDailyStatsForProfile } from './dataExclusions';
import { exclusionKey, filterMetricObservationsForProfile, normalizeMetricDays } from '../domain/metrics';

const day = '2026-10-30';
const correction: DailyScoreCorrection = { id: 'synthetic', day, source: 'oura_app', sleepScore: 78, readinessScore: 82 };
const activity = { id: 'a', day, score: 90, steps: 7000, active_calories: 400, target_calories: 500, total_calories: 2000, contributors: {} };

describe('verified Oura app scores', () => {
    it('fills source gaps without modifying raw data, and honors exclusions only on their own dates', () => {
        const raw = createEmptyDailyStats({ activity: [activity], session: [{ id: 'night', day, total_sleep_duration: 25000 }] });
        const before = structuredClone(raw);
        const profile = { scoreCorrections: [correction], dataExclusionRanges: [
            { id: 'before', startDay: '2026-10-29', endDay: '2026-10-29', sources: ['sleep' as const, 'session' as const] },
            { id: 'after', startDay: '2026-10-31', endDay: '2026-10-31', sources: ['sleep' as const, 'session' as const, 'readiness' as const] },
        ] };
        const filtered = filterDailyStatsForProfile(raw, profile)!;
        expect(filtered.sleep[0]).toMatchObject({ day, score: 78, scoreSource: 'oura_app' });
        expect(filtered.readiness[0]).toMatchObject({ day, score: 82, scoreSource: 'oura_app' });
        expect(normalizeMetricDays(raw, profile)[0].values).toMatchObject({ sleep_score: 78, readiness_score: 82, steps: 7000, sleep_duration: 25000 });
        expect(raw).toEqual(before);
        expect(filterDailyStatsForProfile(raw, { ...profile, dataExclusionRanges: [{ id: 'same', startDay: day, endDay: day, sources: ['sleep'] }] })!.sleep).toEqual([]);
    });

    it('prefers an actual API score, preserves contributor data, and never leaks into another month', () => {
        const raw = createEmptyDailyStats({ sleep: [{ id: 'real', day, score: 91, contributors: { efficiency: 90 } }], activity: [activity] });
        expect(applyScoreCorrections(raw, [correction])!.sleep[0]).toEqual(raw.sleep[0]);
        const nullScore = { ...raw, sleep: [{ ...raw.sleep[0], score: null }] };
        expect(applyScoreCorrections(nullScore, [correction])!.sleep[0]).toMatchObject({ score: 78, contributors: { efficiency: 90 } });
        const september = normalizeMetricDays(createEmptyDailyStats(), { scoreCorrections: [correction] }, { range: { startDay: '2026-09-01', endDay: '2026-09-30' } });
        expect(september).toEqual([]);
        const october = normalizeMetricDays(createEmptyDailyStats(), { scoreCorrections: [correction] }, { range: { startDay: '2026-10-01', endDay: '2026-10-31' } });
        expect(october[0].values).toMatchObject({ sleep_score: 78, readiness_score: 82 });
    });

    it('updates and removes cached corrections while retaining real API scores', () => {
        const cached = normalizeMetricDays(createEmptyDailyStats({ activity: [activity] }), { scoreCorrections: [correction] });
        const removed = filterMetricObservationsForProfile(cached, {});
        expect(removed[0].values.sleep_score).toBeUndefined();
        expect(removed[0].values.activity_score).toBe(90);
        const edited = filterMetricObservationsForProfile(cached, { scoreCorrections: [{ ...correction, sleepScore: 85 }] });
        expect(edited[0].values.sleep_score).toBe(85);
        const real = normalizeMetricDays(createEmptyDailyStats({ sleep: [{ id: 'real', day, score: 91, contributors: {} }] }));
        expect(filterMetricObservationsForProfile(real, { scoreCorrections: [correction] })[0].values.sleep_score).toBe(91);
    });

    it('validates scores and dates and includes values, but not timestamps, in analysis revisions', () => {
        expect(normalizeScoreCorrections([{ ...correction, day: '2026-02-30' }, { ...correction, sleepScore: 101, readinessScore: -1 }, { ...correction, sleepScore: 1.5, readinessScore: NaN }])).toEqual([]);
        expect(exclusionKey({ scoreCorrections: [correction] })).not.toBe(exclusionKey({}));
        expect(exclusionKey({ scoreCorrections: [correction] })).not.toBe(exclusionKey({ scoreCorrections: [{ ...correction, sleepScore: 85 }] }));
        expect(exclusionKey({ scoreCorrections: [correction] })).toBe(exclusionKey({ scoreCorrections: [{ ...correction, updatedAt: 'later' }] }));
    });
});

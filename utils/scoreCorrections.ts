import type { DailyScoreCorrection, DailyStats } from '../types.js';
import { isISODateString } from './date.js';

export const SCORE_CORRECTION_FIELDS = [
    { key: 'sleepScore', source: 'sleep', label: 'Sleep score' },
    { key: 'readinessScore', source: 'readiness', label: 'Readiness score' },
    { key: 'activityScore', source: 'activity', label: 'Activity score' },
] as const;
export const validCorrectionScore = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;

export function normalizeScoreCorrections(corrections: DailyScoreCorrection[] | null | undefined): DailyScoreCorrection[] {
    const days = new Map<string, DailyScoreCorrection>();
    for (const correction of Array.isArray(corrections) ? corrections : []) {
        if (!correction || correction.source !== 'oura_app' || !isISODateString(correction.day) ||
            !Number.isFinite(Date.parse(`${correction.day}T12:00:00Z`)) ||
            new Date(`${correction.day}T12:00:00Z`).toISOString().slice(0, 10) !== correction.day) continue;
        const scores = Object.fromEntries(SCORE_CORRECTION_FIELDS
            .filter(field => validCorrectionScore(correction[field.key]))
            .map(field => [field.key, correction[field.key]]));
        if (!Object.keys(scores).length) continue;
        const normalized: DailyScoreCorrection = {
            id: typeof correction.id === 'string' && correction.id ? correction.id : `oura-app-${correction.day}`,
            day: correction.day, source: 'oura_app', ...scores,
            ...(typeof correction.createdAt === 'string' ? { createdAt: correction.createdAt } : {}),
            ...(typeof correction.updatedAt === 'string' ? { updatedAt: correction.updatedAt } : {}),
        };
        const previous = days.get(correction.day);
        if (!previous || (normalized.updatedAt || '') >= (previous.updatedAt || '')) days.set(correction.day, normalized);
    }
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export const scoreCorrectionKey = (corrections: DailyScoreCorrection[] | null | undefined): unknown[] =>
    normalizeScoreCorrections(corrections).map(correction => [correction.day,
        ...SCORE_CORRECTION_FIELDS.map(field => correction[field.key] ?? null)]);

/** Fill missing scores in an analysis copy. Real API scores take priority. */
export function applyScoreCorrections(data: DailyStats | undefined, corrections: DailyScoreCorrection[] | null | undefined,
    range?: { startDay: string; endDay: string }): DailyStats | undefined {
    if (!data) return data;
    const normalized = normalizeScoreCorrections(corrections);
    if (!normalized.length) return data;
    const result = { ...data };
    for (const field of SCORE_CORRECTION_FIELDS) {
        let rows: Array<{ id: string; day: string; score?: number | null; contributors: object }> = data[field.source];
        for (const correction of normalized) {
            const score = correction[field.key];
            if (score == null || (range && (correction.day < range.startDay || correction.day > range.endDay))) continue;
            const existing = rows.find(row => row.day === correction.day);
            if (typeof existing?.score === 'number' && Number.isFinite(existing.score) && existing.score >= 0 && existing.score <= 100) continue;
            rows = [...rows.filter(row => row.day !== correction.day), {
                id: `oura-app:${correction.id}:${field.source}`, day: correction.day, contributors: {}, ...existing,
                score, scoreSource: 'oura_app' as const, scoreCorrectionId: correction.id,
            } as typeof rows[number]];
        }
        (result as unknown as Record<string, unknown>)[field.source] = rows;
    }
    return result;
}

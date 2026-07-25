import { describe, expect, it } from 'vitest';
import { buildAlignedDailyScoreAverages } from './scoreTrends';

describe('buildAlignedDailyScoreAverages', () => {
    it('aligns metric scores by calendar day when a series has gaps', () => {
        const result = buildAlignedDailyScoreAverages([
            [
                { day: '2026-07-05', score: 80 },
                { day: '2026-07-04', score: 70 },
            ],
            [
                { day: '2026-07-04', score: 90 },
                { day: '2026-07-03', score: 60 },
            ],
            [
                { day: '2026-07-05', score: 100 },
                { day: '2026-07-03', score: 50 },
            ],
        ]);

        expect(result).toEqual([
            { day: '2026-07-05', value: 90 },
            { day: '2026-07-04', value: 80 },
            { day: '2026-07-03', value: 55 },
        ]);
    });

    it('ignores invalid scores and keeps only the last score for a series and day', () => {
        const result = buildAlignedDailyScoreAverages([
            [
                { day: '2026-07-05', score: 0 },
                { day: '2026-07-04', score: 60 },
                { day: '2026-07-04', score: 80 },
            ],
            [
                { day: '2026-07-05', score: null },
                { day: '2026-07-04', score: 100 },
            ],
        ]);

        expect(result).toEqual([{ day: '2026-07-04', value: 90 }]);
    });
});

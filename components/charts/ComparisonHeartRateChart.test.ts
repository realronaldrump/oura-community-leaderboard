import { describe, expect, it } from 'vitest';
import { buildComparisonHeartRateChartData, ComparisonHeartRateSeries } from './ComparisonHeartRateChart';

describe('comparison heart-rate bucketing', () => {
    it('aligns points by each record local clock time', () => {
        const series: ComparisonHeartRateSeries[] = [
            {
                id: 'alice',
                name: 'Alice',
                color: '#6B9E8A',
                data: [
                    {
                        bpm: 55,
                        source: 'rest',
                        timestamp: '2026-03-31T23:07:00-05:00',
                    },
                ],
            },
        ];

        expect(buildComparisonHeartRateChartData(series)).toEqual([
            {
                time: '11:05 PM',
                timestamp: 83_100_000,
                series_alice: 55,
            },
        ]);
    });
});

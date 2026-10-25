import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HeartRateChart, { localDaySamples } from './HeartRateChart';

afterEach(cleanup);

describe('HeartRateChart', () => {
    it('places UTC samples on the profile’s local day', () => {
        const samples = localDaySamples([
            { bpm: 50, source: 'sleep', timestamp: '2026-10-24T04:30:00+00:00' },
            { bpm: 60, source: 'awake', timestamp: '2026-10-24T05:30:00+00:00' },
            { bpm: 70, source: 'awake', timestamp: '2026-10-25T04:59:00+00:00' },
            { bpm: 80, source: 'awake', timestamp: '2026-10-25T05:00:00+00:00' },
        ], '2026-10-24', -300);
        expect(samples.map((sample) => sample.bpm)).toEqual([60, 70]);
        expect(samples[0].minute).toBe(30);
    });

    it('keeps a sample’s own non-UTC offset', () => {
        const samples = localDaySamples([{ bpm: 55, source: 'sleep', timestamp: '2026-10-24T23:10:00-05:00' }], '2026-10-24', 120);
        expect(samples).toEqual([{ minute: 23 * 60 + 10, bpm: 55 }]);
    });

    it('summarizes a past day instead of showing an empty chart', () => {
        render(
            <HeartRateChart
                day="2026-10-20"
                offsetMinutes={0}
                data={[
                    { bpm: 52, source: 'sleep', timestamp: '2026-10-20T03:00:00+00:00' },
                    { bpm: 90, source: 'awake', timestamp: '2026-10-20T17:00:00+00:00' },
                ]}
            />,
        );
        expect(screen.getByRole('img', { name: /low 52, average 71, high 90/ })).toBeInTheDocument();
    });
});

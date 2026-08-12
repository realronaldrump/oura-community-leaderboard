import { describe, expect, it } from 'vitest';
import { getDataAwareChartDomain } from './chartScale';

describe('getDataAwareChartDomain', () => {
    it('frames heart-rate data without inventing a zero baseline', () => {
        const domain = getDataAwareChartDomain([48, 50, 49, 47, 46], { min: 0 });

        expect(domain[0]).toBeGreaterThan(0);
        expect(domain[0]).toBeLessThan(46);
        expect(domain[1]).toBeGreaterThan(50);
    });

    it('gives a constant series visible breathing room', () => {
        const domain = getDataAwareChartDomain([48, 48, 48], { min: 0 });

        expect(domain[0]).toBeLessThan(48);
        expect(domain[1]).toBeGreaterThan(48);
    });

    it('focuses bounded percentages on their data while respecting 100 percent', () => {
        const domain = getDataAwareChartDomain([97.2, 98.1, 99], { min: 0, max: 100 });

        expect(domain[0]).toBeGreaterThan(0);
        expect(domain[0]).toBeLessThan(97.2);
        expect(domain[1]).toBe(100);
    });

    it('does not clip a real score below the former 50-point history floor', () => {
        const domain = getDataAwareChartDomain([38, 42, 45], { min: 0, max: 100 });

        expect(domain[0]).toBeLessThanOrEqual(38);
        expect(domain[1]).toBeGreaterThan(45);
        expect(domain[1]).toBeLessThan(100);
    });

    it('includes zero for signed deviations where it is a meaningful baseline', () => {
        const domain = getDataAwareChartDomain([0.1, 0.2, 0.3], { includeZero: true });

        expect(domain[0]).toBeLessThanOrEqual(0);
        expect(domain[1]).toBeGreaterThan(0.3);
    });

    it('keeps a zero baseline for magnitude bars', () => {
        const domain = getDataAwareChartDomain([7.4, 8.1], { min: 0, includeZero: true });

        expect(domain[0]).toBe(0);
        expect(domain[1]).toBeGreaterThan(8.1);
    });

    it('ignores missing and non-finite values', () => {
        expect(getDataAwareChartDomain([null, undefined, Number.NaN, 48, Number.POSITIVE_INFINITY], { min: 0 }))
            .toEqual(getDataAwareChartDomain([48], { min: 0 }));
    });
});

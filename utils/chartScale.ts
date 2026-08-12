export type NumericChartDomain = [number, number];

export interface DataAwareDomainOptions {
    /** A semantic lower limit, such as 0 for non-negative measurements. */
    min?: number;
    /** A semantic upper limit, such as 100 for percentages and Oura scores. */
    max?: number;
    /** Keep zero visible when it is a meaningful baseline for the chart. */
    includeZero?: boolean;
    /** Fraction of the observed span to leave above and below the data. */
    paddingRatio?: number;
    /** Approximate number of labeled ticks the domain should support. */
    tickCount?: number;
}

const DEFAULT_DOMAIN: NumericChartDomain = [0, 1];

const niceStep = (roughStep: number): number => {
    if (!Number.isFinite(roughStep) || roughStep <= 0) return 1;

    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const multiplier = normalized <= 1
        ? 1
        : normalized <= 2
            ? 2
            : normalized <= 2.5
                ? 2.5
                : normalized <= 5
                    ? 5
                    : 10;

    return multiplier * magnitude;
};

const roundForStep = (value: number, step: number): number => {
    const decimalPlaces = Math.max(0, -Math.floor(Math.log10(step)) + 2);
    return Number(value.toFixed(Math.min(decimalPlaces, 12)));
};

/**
 * Builds a readable numeric domain from the values that are actually plotted.
 *
 * Unlike Recharts' default numeric domain, this does not force zero onto line
 * and area charts. Semantic bounds clamp only the surrounding whitespace; an
 * out-of-range observed value is still included rather than silently clipped.
 */
export const getDataAwareChartDomain = (
    values: Array<number | null | undefined>,
    options: DataAwareDomainOptions = {}
): NumericChartDomain => {
    const finiteValues = values.filter((value): value is number => (
        typeof value === 'number' && Number.isFinite(value)
    ));

    if (finiteValues.length === 0) {
        if (options.min != null && options.max != null && options.min < options.max) {
            return [options.min, options.max];
        }
        return [...DEFAULT_DOMAIN];
    }

    const dataMin = Math.min(...finiteValues);
    const dataMax = Math.max(...finiteValues);
    let anchorMin = dataMin;
    let anchorMax = dataMax;

    if (options.includeZero) {
        anchorMin = Math.min(anchorMin, 0);
        anchorMax = Math.max(anchorMax, 0);
    }

    const observedSpan = anchorMax - anchorMin;
    const magnitude = Math.max(Math.abs(anchorMin), Math.abs(anchorMax), 1);
    const effectiveSpan = observedSpan > 0 ? observedSpan : magnitude * 0.1;
    const padding = effectiveSpan * (options.paddingRatio ?? 0.12);

    let paddedMin = anchorMin - padding;
    let paddedMax = anchorMax + padding;

    if (options.min != null) paddedMin = Math.max(options.min, paddedMin);
    if (options.max != null) paddedMax = Math.min(options.max, paddedMax);

    if (paddedMin >= paddedMax) {
        const fallbackPadding = Math.max(effectiveSpan * 0.5, Number.EPSILON);
        paddedMin = anchorMin - fallbackPadding;
        paddedMax = anchorMax + fallbackPadding;
        if (options.min != null) paddedMin = Math.max(options.min, paddedMin);
        if (options.max != null) paddedMax = Math.min(options.max, paddedMax);
    }

    const intervals = Math.max(2, (options.tickCount ?? 5) - 1);
    const step = niceStep((paddedMax - paddedMin) / intervals);
    let domainMin = Math.floor(paddedMin / step) * step;
    let domainMax = Math.ceil(paddedMax / step) * step;

    if (options.min != null) domainMin = Math.max(options.min, domainMin);
    if (options.max != null) domainMax = Math.min(options.max, domainMax);

    // Bounds describe the metric, but never hide a value that was actually
    // supplied. Bad upstream data should remain visible and diagnosable.
    domainMin = Math.min(domainMin, dataMin);
    domainMax = Math.max(domainMax, dataMax);

    if (domainMin === domainMax) {
        domainMax = domainMin + step;
    }

    return [
        Object.is(domainMin, -0) ? 0 : roundForStep(domainMin, step),
        Object.is(domainMax, -0) ? 0 : roundForStep(domainMax, step),
    ];
};

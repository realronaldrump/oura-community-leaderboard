export interface DatedScore {
    day?: string;
    score?: number | null;
}

export interface DailyScoreAverage {
    day: string;
    value: number;
}

/**
 * Builds one average per calendar day before creating rolling windows.
 * Missing metrics stay missing instead of shifting another date into their slot.
 */
export const buildAlignedDailyScoreAverages = (
    series: ReadonlyArray<ReadonlyArray<DatedScore> | undefined>,
): DailyScoreAverage[] => {
    const scoreBySeriesAndDay = series.map((items) => {
        const scores = new Map<string, number>();
        for (const item of items || []) {
            const score = Number(item.score);
            if (!item.day || !Number.isFinite(score) || score <= 0) continue;
            scores.set(item.day, score);
        }
        return scores;
    });

    const days = new Set<string>();
    scoreBySeriesAndDay.forEach((scores) => {
        scores.forEach((_score, day) => days.add(day));
    });

    return [...days]
        .sort((a, b) => b.localeCompare(a))
        .map((day) => {
            const scores = scoreBySeriesAndDay
                .map((items) => items.get(day))
                .filter((score): score is number => score != null);
            return {
                day,
                value: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
            };
        });
};

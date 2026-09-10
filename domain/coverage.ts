import { shiftDay, type CollectionCoverage } from "./metrics.js";
export type CoverageInterval = { startDay: string; endDay: string };
export interface SourceCoverage extends CollectionCoverage {
  intervals: CoverageInterval[];
}
export function mergeCoverageIntervals(
  previous: CoverageInterval[],
  incoming: CoverageInterval,
): CoverageInterval[] {
  const ordered = [...previous, incoming].sort((a, b) =>
    a.startDay.localeCompare(b.startDay),
  );
  const merged: CoverageInterval[] = [];
  for (const interval of ordered) {
    const last = merged.at(-1);
    if (last && interval.startDay <= shiftDay(last.endDay, 1))
      last.endDay =
        last.endDay > interval.endDay ? last.endDay : interval.endDay;
    else merged.push({ ...interval });
  }
  return merged;
}
export function updateSourceCoverage(
  previous: SourceCoverage | undefined,
  incoming: CoverageInterval,
  status: CollectionCoverage["status"],
  historyStart = "2016-01-01",
): SourceCoverage {
  const intervals =
    status === "ready"
      ? mergeCoverageIntervals(previous?.intervals || [], incoming)
      : previous?.intervals || [];
  return {
    intervals,
    startDay: intervals[0]?.startDay || incoming.startDay,
    endDay: intervals.at(-1)?.endDay || incoming.endDay,
    complete: intervals.length === 1 && intervals[0].startDay <= historyStart,
    status:
      status === "ready" &&
      !(intervals.length === 1 && intervals[0].startDay <= historyStart)
        ? "partial"
        : status,
  };
}

/** Newest uncovered historical interval, independently of whether it contains observations. */
export function nextCoverageGap(
  sources: Record<string, SourceCoverage>,
  historyStart = "2016-01-01",
  chunkDays = 180,
): CoverageInterval | null {
  const gaps: CoverageInterval[] = [];
  for (const coverage of Object.values(sources)) {
    if (coverage.status === "unavailable" || !coverage.intervals?.length)
      continue;
    const intervals = [...coverage.intervals].sort((a, b) =>
      a.startDay.localeCompare(b.startDay),
    );
    for (let i = 0; i < intervals.length; i++) {
      const earliest = i ? shiftDay(intervals[i - 1].endDay, 1) : historyStart;
      const endDay = shiftDay(intervals[i].startDay, -1);
      if (endDay >= earliest)
        gaps.push({
          startDay: [earliest, shiftDay(endDay, -chunkDays + 1)].sort().at(-1)!,
          endDay,
        });
    }
  }
  return gaps.sort((a, b) => b.endDay.localeCompare(a.endDay))[0] || null;
}
export function historicalCoverageKey(
  sources: Record<string, SourceCoverage | CollectionCoverage>,
): string {
  return JSON.stringify(
    Object.entries(sources)
      .sort()
      .map(([key, value]) => [
        key,
        value.startDay,
        value.complete,
        value.status === "failed" ? "partial" : value.status,
        "intervals" in value
          ? value.intervals.map((interval, i) => [
              interval.startDay,
              i === value.intervals.length - 1 ? "latest" : interval.endDay,
            ])
          : null,
      ]),
  );
}

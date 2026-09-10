import {
  METRICS,
  METRIC_BY_ID,
  dayDistance,
  shiftDay,
  metricSeries,
  formatMetricValue,
  type MetricCategory,
  type MetricCoverage,
  type MetricDefinition,
  type MetricObservation,
} from "./metrics.js";

export const RULES_VERSION = "records-1";
export const COMPARISON_WINDOWS = [30, 90, 365, null] as const;
export const PERIOD_DAYS = [7, 14, 30, 90] as const;
export const NOTABILITY_WEIGHTS = {
  rarity: 40,
  depth: 20,
  magnitude: 15,
  persistence: 10,
  novelty: 10,
  recency: 5,
};
export type RuleFamily =
  | "daily"
  | "mean"
  | "sum"
  | "spread"
  | "week"
  | "month"
  | "streak"
  | "change"
  | "friend_lead"
  | "friend_close"
  | "shared";
export interface RuleDefinition {
  id: string;
  metricId: string;
  family: RuleFamily;
  periodDays: number;
  windowDays: number | null;
  direction: "high" | "low";
}
export interface NotabilityFactors {
  rarity: number;
  depth: number;
  magnitude: number;
  persistence: number;
  novelty: number;
  recency: number;
}
export interface RecordEvidence {
  windowDays: number | null;
  coverageStart: string;
  completeHistory: boolean;
  rank: number;
  tied: number;
  sampleCount: number;
  baseline: number;
  difference: number;
  threshold?: number;
  baselineStart?: string;
  baselineEnd?: string;
}
export interface HighlightEvent {
  id: string;
  profileId: string;
  metricId: string;
  category: MetricCategory;
  family: RuleFamily;
  direction: "high" | "low";
  tone: "positive" | "unfavorable" | "neutral";
  day: string;
  startDay: string;
  value: number;
  unit: string;
  title: string;
  description: string;
  score: number;
  factors: NotabilityFactors;
  evidence: RecordEvidence;
  relatedEvidence: RecordEvidence[];
  sourceIds: string[];
  revision: string;
  provisional: boolean;
  peerId?: string;
  detailPath: string;
}
export interface InsightSummary {
  profileId: string;
  day: string;
  generatedAt: string;
  rulesVersion: string;
  revision: string;
  exclusions: string;
  generation: string;
  status: "ready" | "building";
  featured: HighlightEvent[];
  recent: HighlightEvent[];
  coverage: MetricCoverage;
  archiveThrough?: string;
}
export interface EvaluateOptions {
  profileId: string;
  observations: MetricObservation[];
  asOfDay: string;
  today?: string;
  coverage?: MetricCoverage;
  peers?: Array<{ profileId: string; observations: MetricObservation[] }>;
  priorEvents?: Array<
    Pick<
      HighlightEvent,
      "metricId" | "family" | "direction" | "day" | "value" | "evidence"
    >
  >;
  revision?: string;
  metricIds?: string[];
}
type Point = {
  day: string;
  value: number;
  startDay?: string;
  duration?: number;
  threshold?: number;
  baselineStart?: string;
  baselineEnd?: string;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const deviation = (values: number[], avg = mean(values)) =>
  Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
export const notabilityScore = (factors: NotabilityFactors) =>
  Math.round(
    Object.entries(NOTABILITY_WEIGHTS).reduce(
      (sum, [factor, weight]) =>
        sum + clamp(factors[factor as keyof NotabilityFactors]) * weight,
      0,
    ),
  );
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
export const comparisonLabel = (evidence: RecordEvidence) =>
  evidence.windowDays
    ? `in ${evidence.windowDays} days`
    : evidence.completeHistory
      ? "of all time"
      : `since ${evidence.coverageStart}`;
export function buildRecordRules(): RuleDefinition[] {
  const result: RuleDefinition[] = [];
  for (const metric of METRICS.filter((m) => m.recordable)) {
    const families: Array<[RuleFamily, number]> = [
      ["daily", 1],
      ["streak", 1],
      ["change", 7],
      ["week", 7],
      ["month", 30],
    ];
    for (const aggregation of metric.aggregations)
      for (const days of PERIOD_DAYS) families.push([aggregation, days]);
    for (const [family, periodDays] of families)
      for (const windowDays of COMPARISON_WINDOWS) {
        if (windowDays && periodDays > windowDays) continue;
        for (const direction of ["high", "low"] as const)
          result.push({
            id: `${metric.id}:${family}:${periodDays}:${windowDays || "all"}:${direction}`,
            metricId: metric.id,
            family,
            periodDays,
            windowDays,
            direction,
          });
      }
  }
  return result;
}
export const RECORD_RULES = buildRecordRules();

/** Calendar periods are complete observations, never the last N available samples. */
export function rollingPeriods(
  points: Point[],
  size: number,
  aggregation: "mean" | "sum" | "spread",
): Point[] {
  const result: Point[] = [];
  const sums = [0];
  const squares = [0];
  points.forEach((p) => {
    sums.push(sums.at(-1)! + p.value);
    squares.push(squares.at(-1)! + p.value ** 2);
  });
  for (let i = size - 1; i < points.length; i++) {
    const first = i - size + 1;
    if (dayDistance(points[first].day, points[i].day) !== size - 1) continue;
    const sum = sums[i + 1] - sums[first];
    const value =
      aggregation === "sum"
        ? sum
        : aggregation === "mean"
          ? sum / size
          : Math.sqrt(
              Math.max(
                0,
                (squares[i + 1] - squares[first]) / size - (sum / size) ** 2,
              ),
            );
    result.push({
      day: points[i].day,
      startDay: points[first].day,
      value,
      duration: size,
    });
  }
  return result;
}
function calendarPeriods(points: Point[], family: "week" | "month"): Point[] {
  const groups = new Map<string, Point[]>();
  for (const p of points) {
    const weekday = new Date(`${p.day}T12:00:00Z`).getUTCDay();
    const start =
      family === "week"
        ? shiftDay(p.day, -(weekday + 6) % 7)
        : `${p.day.slice(0, 7)}-01`;
    groups.set(start, [...(groups.get(start) || []), p]);
  }
  return [...groups.entries()].flatMap(([start, group]) => {
    const end =
      family === "week"
        ? shiftDay(start, 6)
        : new Date(
            Date.UTC(
              Number(start.slice(0, 4)),
              Number(start.slice(5, 7)),
              0,
              12,
            ),
          )
            .toISOString()
            .slice(0, 10);
    const size = dayDistance(start, end) + 1;
    return group.length === size &&
      group[0].day === start &&
      group.at(-1)!.day === end
      ? [
          {
            day: end,
            startDay: start,
            value: mean(group.map((p) => p.value)),
            duration: size,
          },
        ]
      : [];
  });
}
/** Baselines use the preceding 90 calendar days, and freeze for the entire run. */
export function baselineStreaks(
  points: Point[],
  direction: "high" | "low",
  resolution: number,
  goal = false,
  progress = false,
): Point[] {
  const runs: Point[] = [];
  let run: Point | null = null;
  let threshold = 0;
  let previousDay = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const succeeds = (value: number) =>
      direction === "high" ? value >= threshold : value < threshold;
    if (run && (shiftDay(previousDay, 1) !== p.day || !succeeds(p.value))) {
      if (!progress) runs.push(run);
      run = null;
    }
    if (!run) {
      const cutoff = shiftDay(p.day, -90);
      const preceding = points
        .slice(Math.max(0, i - 90), i)
        .filter((v) => v.day >= cutoff)
        .map((v) => v.value)
        .sort((a, b) => a - b);
      if (goal) threshold = 100;
      else {
        if (
          preceding.length < 30 ||
          preceding.at(-1)! - preceding[0] < resolution
        ) {
          previousDay = p.day;
          continue;
        }
        threshold =
          preceding[
            Math.floor(
              (preceding.length - 1) * (direction === "high" ? 0.75 : 0.25),
            )
          ];
      }
      if (succeeds(p.value))
        run = {
          day: p.day,
          startDay: p.day,
          value: 1,
          duration: 1,
          threshold,
          baselineStart: shiftDay(p.day, -90),
          baselineEnd: shiftDay(p.day, -1),
        };
    } else {
      run = {
        ...run,
        day: p.day,
        value: run.value + 1,
        duration: run.value + 1,
      };
    }
    if (progress && run) runs.push({ ...run });
    previousDay = p.day;
  }
  if (run && !progress) runs.push(run);
  return runs.filter((r) => r.value >= 3);
}
function eventTitle(
  m: MetricDefinition,
  family: RuleFamily,
  direction: "high" | "low",
  rank: number,
  tied: number,
  period: number,
  evidence: RecordEvidence,
): string {
  const rankText = rank === 1 ? "" : `${ordinal(rank)} `;
  const extremum =
    family === "spread"
      ? direction === "high"
        ? "highest"
        : "lowest"
      : m.clock
        ? direction === "high"
          ? "latest"
          : "earliest"
        : m.interpretation === "higher"
          ? direction === "high"
            ? "best"
            : "lowest"
          : m.interpretation === "lower"
            ? direction === "low"
              ? "best"
              : "highest"
            : direction === "high"
              ? "highest"
              : "lowest";
  const label = m.label
    .toLowerCase()
    .replace("hrv", "HRV")
    .replace("rem", "REM");
  if (family === "streak") return `${rankText}longest ${label} streak`;
  if (family === "change")
    return `${label[0].toUpperCase()}${label.slice(1)}: ${rankText}${direction === "high" ? "largest rise" : "largest fall"}`;
  const subject =
    family === "daily"
      ? label
      : family === "spread"
        ? `${period}-day variation in ${label}`
        : `${family === "week" ? "week" : family === "month" ? "month" : `${period}-day ${family === "sum" ? "total" : "average"}`} of ${label}`;
  const wording = `${tied > 1 ? "Tied " : ""}${rankText}${extremum} ${subject} ${comparisonLabel(evidence)}`;
  return wording[0].toUpperCase() + wording.slice(1);
}
export const formatRecordValue = (
  m: MetricDefinition,
  value: number,
  family: RuleFamily,
) =>
  m.clock && (family === "change" || family === "spread")
    ? formatMetricValue({ ...m, clock: false, unit: "seconds" }, value * 60)
    : formatMetricValue(m, value);
function buildCandidate(
  m: MetricDefinition,
  family: RuleFamily,
  direction: "high" | "low",
  current: Point,
  comparison: Point[],
  windowDays: number | null,
  options: EvaluateOptions,
): HighlightEvent | null {
  if (comparison.length < (family === "daily" ? 10 : 3)) return null;
  const resolution = family === "streak" ? 1 : m.resolution;
  const values = comparison.map((p) => p.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high - low < resolution) return null;
  const effectiveDirection = family === "streak" ? "high" : direction;
  const better = values.filter((v) =>
    effectiveDirection === "high"
      ? v > current.value + resolution / 100
      : v < current.value - resolution / 100,
  ).length;
  const tied = values.filter(
    (v) => Math.abs(v - current.value) < resolution / 100,
  ).length;
  const rank = better + 1;
  const rarity = clamp(
    1 - (better + Math.max(0, tied - 1) / 2) / comparison.length,
  );
  if ((rank > 10 && rarity < 0.95) || rarity < 0.7) return null;
  const previous = comparison
    .filter((p) => p.day < current.day)
    .map((p) => p.value);
  if (!previous.length) return null;
  const avg = mean(previous);
  const sd = deviation(previous, avg);
  const sourceCoverage = options.coverage?.[m.source];
  const coverageStart =
    comparison[0]?.startDay || comparison[0]?.day || current.day;
  const evidence: RecordEvidence = {
    windowDays,
    coverageStart,
    completeHistory:
      sourceCoverage?.complete === true &&
      sourceCoverage.status === "ready" &&
      sourceCoverage.endDay >= current.day,
    rank,
    tied,
    sampleCount: comparison.length,
    baseline: avg,
    difference: current.value - avg,
    ...(current.threshold != null
      ? {
          threshold: current.threshold,
          baselineStart: current.baselineStart,
          baselineEnd: current.baselineEnd,
        }
      : {}),
  };
  const repeat = (options.priorEvents || []).find(
    (e) =>
      e.metricId === m.id &&
      e.family === family &&
      e.direction === direction &&
      e.day < current.day &&
      dayDistance(e.day, current.day) <= 7,
  );
  const improved =
    repeat &&
    (rank < repeat.evidence.rank ||
      Math.abs(current.value - repeat.value) >=
        Math.max(resolution, Math.abs(repeat.value) * 0.1));
  const factors: NotabilityFactors = {
    rarity,
    depth: clamp(Math.log10(comparison.length) / 3),
    magnitude: clamp(
      Math.abs(current.value - avg) / Math.max(resolution, sd * 3),
    ),
    persistence: clamp(Math.log2((current.duration || 1) + 1) / 5),
    novelty: repeat && !improved ? 0 : 1,
    recency: clamp(1 - dayDistance(current.day, options.asOfDay) / 7),
  };
  const score = notabilityScore(factors);
  if (score < 40) return null;
  const period = current.duration || 1;
  const tone =
    family === "spread" || m.interpretation === "neutral"
      ? "neutral"
      : (direction === "high") === (m.interpretation === "higher")
        ? "positive"
        : "unfavorable";
  const title =
    eventTitle(m, family, direction, rank, tied, period, evidence) +
    (family === "streak"
      ? ` ${direction === "high" ? "at or above" : "below"} ${formatMetricValue(m, current.threshold)}`
      : "");
  const provisional =
    m.accumulating && current.day === (options.today || options.asOfDay);
  return {
    id: `${options.profileId}:${m.id}:${family}:${period}:${direction}:${current.day}`,
    profileId: options.profileId,
    metricId: m.id,
    category: m.category,
    family,
    direction,
    tone,
    day: current.day,
    startDay: current.startDay || current.day,
    value: current.value,
    unit: family === "streak" ? "days" : m.unit,
    title,
    description: `${family === "streak" ? `${current.value} consecutive days` : family === "change" ? `${formatRecordValue(m, Math.abs(current.value), family)} ${direction === "high" ? "increase" : "decrease"} in the 7-day average` : formatRecordValue(m, current.value, family)} · ${comparison.length.toLocaleString()} ${family === "daily" ? "recorded days" : "comparable periods"}${provisional ? " · Still updating" : ""}`,
    score,
    factors,
    evidence,
    relatedEvidence: [],
    sourceIds:
      options.observations.find((o) => o.day === current.day)?.sources[m.id] ||
      [],
    revision: options.revision || RULES_VERSION,
    provisional,
    detailPath: `/metrics/${m.id}?profile=${encodeURIComponent(options.profileId)}&day=${current.day}`,
  };
}
export function selectFeatured(events: HighlightEvent[]): HighlightEvent[] {
  const chosen: HighlightEvent[] = [];
  const metrics = new Set<string>();
  const categories = new Map<string, number>();
  const representatives = new Map<string, HighlightEvent>();
  const isDeepDailyRank = (e: HighlightEvent) =>
    e.family === "daily" &&
    e.evidence.windowDays == null &&
    e.evidence.sampleCount >= 100 &&
    e.evidence.rank <= 10 &&
    e.score >= 65 &&
    e.factors.novelty > 0;
  for (const event of events) {
    const previous = representatives.get(event.metricId);
    if (
      !previous ||
      (isDeepDailyRank(event) && !isDeepDailyRank(previous)) ||
      (isDeepDailyRank(event) === isDeepDailyRank(previous) &&
        event.score > previous.score)
    )
      representatives.set(event.metricId, event);
  }
  for (const event of [...representatives.values()].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  )) {
    if (
      event.score < 65 ||
      event.factors.novelty === 0 ||
      metrics.has(event.metricId) ||
      (categories.get(event.category) || 0) >= 2
    )
      continue;
    chosen.push(event);
    metrics.add(event.metricId);
    categories.set(event.category, (categories.get(event.category) || 0) + 1);
    if (chosen.length === 3) break;
  }
  return chosen;
}
type PreparedSeries = {
  family: RuleFamily;
  points: Point[];
  direction?: "high" | "low";
};
const preparedCache = new WeakMap<
  MetricObservation[],
  Map<string, PreparedSeries[]>
>();
function prepareSeries(
  observations: MetricObservation[],
  m: MetricDefinition,
): PreparedSeries[] {
  let cache = preparedCache.get(observations);
  if (!cache) {
    cache = new Map();
    preparedCache.set(observations, cache);
  }
  const found = cache.get(m.id);
  if (found) return found;
  const points = metricSeries(observations, m.id).sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const series: Array<{
    family: RuleFamily;
    points: Point[];
    direction?: "high" | "low";
  }> = [{ family: "daily", points }];
  for (const aggregation of m.aggregations)
    for (const days of PERIOD_DAYS)
      series.push({
        family: aggregation,
        points: rollingPeriods(points, days, aggregation),
      });
  for (const family of ["week", "month"] as const)
    series.push({ family, points: calendarPeriods(points, family) });
  for (const direction of ["high", "low"] as const)
    series.push({
      family: "streak",
      points: baselineStreaks(
        points,
        direction,
        m.resolution,
        m.id === "activity_goal_percent",
        true,
      ),
      direction,
    });
  const sevenDays = rollingPeriods(points, 7, "mean");
  const sevenByDay = new Map(sevenDays.map((p) => [p.day, p]));
  series.push({
    family: "change",
    points: sevenDays.flatMap((p) => {
      const previous = sevenByDay.get(shiftDay(p.day, -7));
      return previous ? [{ ...p, value: p.value - previous.value }] : [];
    }),
  });
  cache.set(m.id, series);
  return series;
}
export function evaluateHighlights(options: EvaluateOptions): {
  events: HighlightEvent[];
  featured: HighlightEvent[];
} {
  const sourceObservations = options.observations;
  const observations = sourceObservations
    .filter((o) => o.day <= options.asOfDay)
    .sort((a, b) => a.day.localeCompare(b.day));
  options = { ...options, observations };
  const candidates: HighlightEvent[] = [];
  for (const m of METRICS) {
    if (
      !m.recordable ||
      (options.metricIds && !options.metricIds.includes(m.id))
    )
      continue;
    const coverage = options.coverage?.[m.source];
    if (coverage?.status === "unavailable" || coverage?.status === "failed")
      continue;
    const points = metricSeries(observations, m.id);
    if (!points.length || points.at(-1)!.day !== options.asOfDay) continue;
    const series = prepareSeries(sourceObservations, m).map((item) => {
      const prior = item.points.filter((p) => p.day <= options.asOfDay);
      return {
        ...item,
        points:
          item.family === "streak"
            ? [...new Map(prior.map((p) => [p.startDay, p])).values()]
            : prior,
      };
    });
    for (const item of series) {
      const current = item.points.at(-1);
      if (!current || current.day !== options.asOfDay) continue;
      for (const direction of item.direction
        ? [item.direction]
        : (["high", "low"] as const)) {
        if (
          m.accumulating &&
          current.day === (options.today || options.asOfDay) &&
          (direction === "low" || item.family !== "daily")
        )
          continue;
        if (
          item.family === "change" &&
          ((direction === "high" && current.value <= 0) ||
            (direction === "low" && current.value >= 0))
        )
          continue;
        for (const windowDays of COMPARISON_WINDOWS) {
          if (windowDays && (current.duration || 1) > windowDays) continue;
          const cutoff = windowDays
            ? shiftDay(options.asOfDay, -windowDays + 1)
            : null;
          const comparison = cutoff
            ? item.points.filter((p) => (p.startDay || p.day) >= cutoff)
            : item.points;
          const candidate = buildCandidate(
            m,
            item.family,
            direction,
            current,
            comparison,
            windowDays,
            options,
          );
          if (candidate) candidates.push(candidate);
        }
      }
    }
  }
  // One outcome absorbs its overlapping comparison windows. Prefer the broadest evidence.
  const merged = new Map<string, HighlightEvent>();
  for (const candidate of candidates.sort(
    (a, b) =>
      (b.evidence.windowDays ?? Infinity) -
        (a.evidence.windowDays ?? Infinity) || b.score - a.score,
  )) {
    const prior = merged.get(candidate.id);
    if (prior) {
      prior.relatedEvidence.push(candidate.evidence);
      prior.score = Math.max(prior.score, candidate.score);
    } else merged.set(candidate.id, candidate);
  }
  const events = [...merged.values()];
  for (const peer of options.peers || []) {
    for (const m of METRICS.filter(
      (m) => m.comparison === "direct" && m.recordable,
    )) {
      if (
        m.accumulating &&
        options.asOfDay === (options.today || options.asOfDay)
      )
        continue;
      const own = metricSeries(observations, m.id);
      const peerValues = new Map(
        metricSeries(peer.observations, m.id, undefined, options.asOfDay).map(
          (p) => [p.day, p.value],
        ),
      );
      const matched = own.filter((p) => peerValues.has(p.day));
      const current = matched.at(-1);
      const previous = matched.at(-2);
      if (
        !current ||
        !previous ||
        current.day !== options.asOfDay ||
        matched.length < 30 ||
        dayDistance(previous.day, current.day) !== 1
      )
        continue;
      const gap = current.value - peerValues.get(current.day)!;
      const oldGap = previous.value - peerValues.get(previous.day)!;
      const family =
        gap > 0 && oldGap <= 0
          ? "friend_lead"
          : Math.abs(gap) <= m.resolution && Math.abs(oldGap) > m.resolution
            ? "friend_close"
            : null;
      if (!family) continue;
      const gaps = matched.map((p) => ({
        day: p.day,
        value:
          family === "friend_close"
            ? Math.abs(p.value - peerValues.get(p.day)!)
            : p.value - peerValues.get(p.day)!,
      }));
      const sample = buildCandidate(
        m,
        "daily",
        family === "friend_close" ? "low" : "high",
        gaps.at(-1)!,
        gaps,
        null,
        options,
      );
      if (!sample) continue;
      sample.evidence = {
        ...sample.evidence,
        completeHistory: false,
        coverageStart: matched[0].day,
      };
      const factors = {
        ...sample.factors,
        rarity: family === "friend_lead" ? 0.85 : 0.75,
        novelty: 1,
      };
      events.push({
        ...sample,
        id: `${options.profileId}:${m.id}:${family}:${peer.profileId}:${current.day}`,
        family,
        peerId: peer.profileId,
        value: gap,
        tone: "neutral",
        factors,
        score: notabilityScore(factors),
        title:
          family === "friend_lead"
            ? `A new lead in ${m.label.toLowerCase()}`
            : `Neck and neck in ${m.label.toLowerCase()}`,
        description: `${formatMetricValue(m, Math.abs(gap))} apart · ${matched.length} shared days`,
        relatedEvidence: [],
      });
    }
    for (const own of events.filter(
      (e) => e.family === "daily" && e.score >= 65 && !e.peerId,
    )) {
      const m = METRIC_BY_ID[own.metricId];
      if (m.comparison !== "direct") continue;
      const peerPoints = metricSeries(
        peer.observations,
        m.id,
        undefined,
        options.asOfDay,
      );
      const current = peerPoints.at(-1);
      if (!current || current.day !== options.asOfDay || peerPoints.length < 30)
        continue;
      const better = peerPoints.filter((p) =>
        own.direction === "high"
          ? p.value > current.value
          : p.value < current.value,
      ).length;
      if (better <= 2 && own.evidence.rank <= 3)
        events.push({
          ...own,
          id: `${own.id}:shared:${peer.profileId}`,
          family: "shared",
          peerId: peer.profileId,
          title: `An unusual ${m.label.toLowerCase()} day together`,
          description: `Both among your three ${own.direction === "high" ? "highest" : "lowest"} results · ${own.description}`,
          tone: own.tone,
        });
    }
  }
  return {
    events: events.sort(
      (a, b) => b.score - a.score || a.id.localeCompare(b.id),
    ),
    featured: selectFeatured(events),
  };
}

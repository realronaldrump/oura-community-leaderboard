import {
  METRIC_BY_ID,
  dayDistance,
  shiftDay,
  metricSeries,
  formatMetricValue,
  type MetricCategory,
  type MetricCoverage,
  type MetricObservation,
} from "./metrics.js";
import {
  RECORD_SPECS,
  RECORD_SPEC_BY_ID,
  type RecordDirection,
  type RecordPeriod,
  type RecordSpec,
} from "./recordSpecs.js";
import { recordHeadline, recordValueLine } from "./recordCopy.js";

export { RECORD_SPECS, RECORD_SPEC_BY_ID };
export type { RecordDirection, RecordPeriod, RecordSpec };

export const RULES_VERSION = "records-2";
export const WEEK_MIN_DAYS = 6;
export const MONTH_MIN_FRACTION = 0.8;
export const MIN_STREAK_RECORD = 5;
export const STREAK_RANK_MIN = 3;
export const STREAK_MIN_HISTORY_DAYS = 30;
/** Periods of history needed before anything in that period can be called a record. */
export const MIN_PRIOR: Record<RecordPeriod, number> = { day: 30, week: 8, month: 4 };
export const TOP3_MIN_SAMPLES: Record<RecordPeriod, number> = { day: 60, week: 12, month: 6 };
/** "Best in a while" and "lowest in a while" need at least this long since the last one. */
export const SINCE_MIN_DAYS: Record<RecordPeriod, number> = { day: 90, week: 84, month: 182 };
/** Lows need a longer quiet stretch, so the feed stays mostly about what went well. */
export const LOW_SINCE_MIN_DAYS: Record<RecordPeriod, number> = { day: 120, week: 112, month: 182 };
export const FEATURED_LOW_MIN_DAYS: Record<RecordPeriod, number> = { day: 180, week: 182, month: 365 };
export const USUAL_WINDOW_DAYS: Record<RecordPeriod, number> = { day: 90, week: 84, month: 183 };
const USUAL_EXPECTED: Record<RecordPeriod, number> = { day: 90, week: 12, month: 6 };
export const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365];
export const LOW_WEAR_LIMIT_SECONDS = 3 * 3600;
const EPS = 1e-9;

export type RecordKind =
  | "personal_best"
  | "top3"
  | "best_since"
  | "worst"
  | "streak_record"
  | "streak_milestone"
  | "friend_lead"
  | "friend_close"
  | "shared";
/** "mean", "sum", "spread" and "change" only appear on archived records-1 events. */
export type RuleFamily =
  | "daily"
  | "week"
  | "month"
  | "streak"
  | "friend_lead"
  | "friend_close"
  | "shared"
  | "mean"
  | "sum"
  | "spread"
  | "change";
export type EventPeriod = RecordPeriod | "streak";
export interface RecordPoint {
  value: number;
  day: string;
  startDay: string;
}
/** Legacy notability inputs, kept only so archived records-1 events still type-check. */
export interface NotabilityFactors {
  rarity: number;
  depth: number;
  magnitude: number;
  persistence: number;
  novelty: number;
  recency: number;
}
export interface RecordEvidence {
  /** Always null for records-2: every comparison is against the whole history. */
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
  /** The best (or, for lows, worst) earlier period; for streaks, the prior longest run. */
  previousRecord?: RecordPoint | null;
  /** The most recent earlier period at least as good (or as bad). */
  lastAsExtreme?: RecordPoint | null;
  usual?: { value: number; count: number } | null;
  coveredDays?: number;
  expectedDays?: number;
  total?: number;
}
export interface HighlightEvent {
  id: string;
  profileId: string;
  metricId: string;
  category: MetricCategory;
  family: RuleFamily;
  kind?: RecordKind;
  period?: EventPeriod;
  direction: RecordDirection;
  tone: "positive" | "unfavorable" | "neutral";
  day: string;
  startDay: string;
  value: number;
  unit: string;
  title: string;
  description: string;
  score: number;
  factors?: NotabilityFactors;
  evidence: RecordEvidence;
  relatedEvidence: RecordEvidence[];
  sourceIds: string[];
  revision: string;
  provisional: boolean;
  peerId?: string;
  detailPath: string;
}
export interface FeaturedCooldown {
  id: string;
  metricId: string;
  period?: EventPeriod;
  kind?: RecordKind;
  tone: HighlightEvent["tone"];
  provisional?: boolean;
  featuredOn: string;
}
export interface BestRow extends RecordPoint {
  rank: number;
}
export interface PeriodBests {
  rows: BestRow[];
  sampleCount: number;
}
export interface CurrentProgress {
  period: "week" | "month" | "streak";
  startDay: string;
  day: string;
  value: number;
  recordedDays: number;
  wouldRank: number | null;
  best: number | null;
}
export interface MetricBests {
  metricId: string;
  coverageStart: string;
  completeHistory: boolean;
  day?: PeriodBests;
  week?: PeriodBests;
  month?: PeriodBests;
  streak?: PeriodBests & { threshold: number };
  current: CurrentProgress[];
}
export interface PersonalBests {
  asOfDay: string;
  metrics: MetricBests[];
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
  personalBests?: PersonalBests;
}
export interface EvaluateOptions {
  profileId: string;
  observations: MetricObservation[];
  asOfDay: string;
  today?: string;
  coverage?: MetricCoverage;
  peers?: Array<{ profileId: string; observations: MetricObservation[] }>;
  /** What was featured recently. Only affects `featured`, never which records exist. */
  cooldowns?: FeaturedCooldown[];
  revision?: string;
  metricIds?: string[];
}

/** The archive day is the first date after the profile prefix; profile ids may contain dates. */
export const recordEventDay = (profileId: string, eventId: string) =>
  (eventId.startsWith(`${profileId}:`) ? eventId.slice(profileId.length + 1) : eventId).match(
    /\d{4}-\d{2}-\d{2}/,
  )?.[0];
export const isFriendRecord = (e: Pick<HighlightEvent, "family">) =>
  e.family === "friend_lead" || e.family === "friend_close" || e.family === "shared";
const LEGACY_PRESENTABLE = new Set<RuleFamily>([
  "daily",
  "week",
  "month",
  "friend_lead",
  "friend_close",
  "shared",
]);
/** Records-1 rolling windows, variation, baseline streaks and non-record metrics stay hidden. */
export const isPresentableRecord = (
  e: Pick<HighlightEvent, "metricId" | "kind" | "family" | "evidence">,
) =>
  Boolean(RECORD_SPEC_BY_ID[e.metricId]) &&
  (e.kind
    ? true
    : LEGACY_PRESENTABLE.has(e.family) && e.evidence?.windowDays == null);

const TIER: Record<RecordKind, number> = {
  personal_best: 7,
  streak_record: 6,
  top3: 5,
  shared: 4,
  streak_milestone: 4,
  best_since: 3,
  friend_lead: 3,
  worst: 2,
  friend_close: 1,
};
const PERIOD_WEIGHT: Record<EventPeriod, number> = { month: 3, week: 2, streak: 2, day: 1 };
export const recordScore = (
  kind: RecordKind,
  period: EventPeriod,
  value: number,
  usual?: number | null,
) =>
  TIER[kind] * 100 +
  PERIOD_WEIGHT[period] * 10 +
  (usual != null && Math.abs(usual) > EPS
    ? Math.min(9, Math.round((30 * Math.abs(value - usual)) / Math.abs(usual)))
    : 0);
const specPriority = (e: HighlightEvent) => RECORD_SPEC_BY_ID[e.metricId]?.priority ?? 99;
export const compareRecordPriority = (a: HighlightEvent, b: HighlightEvent) =>
  b.score - a.score || specPriority(a) - specPriority(b) || a.id.localeCompare(b.id);

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
/** Ranks use the same precision people see, so two identical-looking values always tie. */
export function roundRecordValue(spec: RecordSpec, period: EventPeriod, value: number) {
  const m = METRIC_BY_ID[spec.metricId];
  if (period === "streak") return value;
  if (m.unit === "seconds") return Math.round(value / 60) * 60;
  if (period === "day" || spec.aggregate === "sum" || spec.perDay) return roundTo(value, m.precision);
  return roundTo(value, Math.max(1, m.precision));
}

type SeriesPoint = RecordPoint & {
  raw: number;
  lowEligible: boolean;
  covered?: number;
  expected?: number;
  total?: number;
};
interface StreakRun {
  startDay: string;
  endDay: string;
}
export interface RecordSeries {
  day: SeriesPoint[];
  week: SeriesPoint[];
  month: SeriesPoint[];
  runs: StreakRun[];
}
const lowEligibleDay = (spec: RecordSpec, o: MetricObservation) =>
  spec.lowGate === "scoredNight"
    ? o.values.sleep_score != null
    : spec.lowGate === "worn"
      ? (o.values.non_wear_time ?? 0) <= LOW_WEAR_LIMIT_SECONDS
      : true;
const periodStart = (day: string, period: "week" | "month") =>
  period === "week"
    ? shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7))
    : `${day.slice(0, 7)}-01`;
const periodEnd = (start: string, period: "week" | "month") =>
  period === "week"
    ? shiftDay(start, 6)
    : new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0, 12))
        .toISOString()
        .slice(0, 10);
const minimumDays = (period: "week" | "month", expected: number) =>
  period === "week" ? WEEK_MIN_DAYS : Math.ceil(expected * MONTH_MIN_FRACTION);

/** Mon–Sun weeks and calendar months. A period ends on its calendar end, even if that day is missing. */
function calendarPeriods(
  points: SeriesPoint[],
  period: "week" | "month",
  spec: RecordSpec,
): SeriesPoint[] {
  const groups = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    const start = periodStart(p.day, period);
    const group = groups.get(start);
    if (group) group.push(p);
    else groups.set(start, [p]);
  }
  const result: SeriesPoint[] = [];
  for (const [start, group] of groups) {
    const end = periodEnd(start, period);
    const expected = dayDistance(start, end) + 1;
    if (group.length < minimumDays(period, expected)) continue;
    const total = group.reduce((sum, p) => sum + p.raw, 0);
    const raw = spec.aggregate === "sum" ? total : total / group.length;
    result.push({
      day: end,
      startDay: start,
      raw,
      value: roundRecordValue(spec, period, raw),
      covered: group.length,
      expected,
      total: spec.perDay ? Math.round(total) : undefined,
      lowEligible:
        group.every((p) => p.lowEligible) &&
        (spec.aggregate !== "sum" || group.length === expected),
    });
  }
  return result;
}
/** A streak is consecutive calendar days at or above a fixed, stated threshold. */
function streakRuns(points: SeriesPoint[], threshold: number): StreakRun[] {
  const runs: StreakRun[] = [];
  let run: StreakRun | null = null;
  for (const p of points) {
    const hit = p.raw >= threshold;
    if (run && (shiftDay(run.endDay, 1) !== p.day || !hit)) {
      runs.push(run);
      run = null;
    }
    if (hit) run = run ? { ...run, endDay: p.day } : { startDay: p.day, endDay: p.day };
  }
  if (run) runs.push(run);
  return runs;
}

const seriesCache = new WeakMap<MetricObservation[], Map<string, RecordSeries>>();
export function recordSeries(observations: MetricObservation[], spec: RecordSpec): RecordSeries {
  let cache = seriesCache.get(observations);
  if (!cache) {
    cache = new Map();
    seriesCache.set(observations, cache);
  }
  const found = cache.get(spec.metricId);
  if (found) return found;
  const day: SeriesPoint[] = [];
  for (const o of observations) {
    const raw = o.values[spec.metricId];
    if (raw == null) continue;
    day.push({
      day: o.day,
      startDay: o.day,
      raw,
      value: roundRecordValue(spec, "day", raw),
      lowEligible: lowEligibleDay(spec, o),
    });
  }
  day.sort((a, b) => a.day.localeCompare(b.day));
  const series: RecordSeries = {
    day,
    week: spec.periods.includes("week") ? calendarPeriods(day, "week", spec) : [],
    month: spec.periods.includes("month") ? calendarPeriods(day, "month", spec) : [],
    runs: spec.streak ? streakRuns(day, spec.streak.threshold) : [],
  };
  cache.set(spec.metricId, series);
  return series;
}
const countThrough = (points: RecordPoint[], day: string) => {
  let low = 0,
    high = points.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid].day <= day) low = mid + 1;
    else high = mid;
  }
  return low;
};
function streaksAsOf(series: RecordSeries, day: string): SeriesPoint[] {
  const result: SeriesPoint[] = [];
  for (const run of series.runs) {
    if (run.startDay > day) break;
    const end = run.endDay <= day ? run.endDay : day;
    const length = dayDistance(run.startDay, end) + 1;
    if (length >= STREAK_RANK_MIN)
      result.push({ day: end, startDay: run.startDay, value: length, raw: length, lowEligible: false });
  }
  return result;
}
/** Every comparable period that had finished by `day`, in time order. */
export function comparisonSet(series: RecordSeries, period: EventPeriod, day: string): SeriesPoint[] {
  if (period === "streak") return streaksAsOf(series, day);
  const points = series[period];
  return points.slice(0, countThrough(points, day));
}
const isBetter = (a: number, b: number, direction: RecordDirection) =>
  direction === "high" ? a > b + EPS : a < b - EPS;
export function competitionRank(values: number[], value: number, direction: RecordDirection) {
  let better = 0,
    tied = 0;
  for (const v of values) {
    if (Math.abs(v - value) <= EPS) tied++;
    else if (isBetter(v, value, direction)) better++;
  }
  return { rank: better + 1, tied };
}
const extreme = (points: SeriesPoint[], direction: RecordDirection) =>
  points.reduce<SeriesPoint | null>(
    (best, p) => (!best || !isBetter(best.value, p.value, direction) ? p : best),
    null,
  );
const lastWhere = (points: SeriesPoint[], test: (p: SeriesPoint) => boolean) => {
  for (let i = points.length - 1; i >= 0; i--) if (test(points[i])) return points[i];
  return null;
};
const toPoint = (p: SeriesPoint | null): RecordPoint | null =>
  p ? { value: p.value, day: p.day, startDay: p.startDay } : null;
function usualValue(spec: RecordSpec, prior: SeriesPoint[], period: RecordPeriod, day: string) {
  const from = shiftDay(day, -USUAL_WINDOW_DAYS[period]);
  const values: number[] = [];
  for (let i = prior.length - 1; i >= 0 && prior[i].day > from; i--) values.push(prior[i].raw);
  if (values.length < Math.ceil(USUAL_EXPECTED[period] / 3)) return null;
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  return { value: roundRecordValue(spec, period, median), count: values.length };
}
export const detailRange = (period: EventPeriod, days = 1) =>
  period === "month" ? "90" : days > 90 ? "365" : days > 30 ? "90" : "30";

interface Context {
  options: EvaluateOptions;
  today: string;
  day: string;
}
function buildEvent(
  ctx: Context,
  spec: RecordSpec,
  period: EventPeriod,
  kind: RecordKind,
  direction: RecordDirection,
  current: SeriesPoint,
  all: SeriesPoint[],
  extras: Partial<RecordEvidence>,
): HighlightEvent {
  const { options, day } = ctx;
  const m = METRIC_BY_ID[spec.metricId];
  const { rank, tied } = competitionRank(all.map((p) => p.value), current.value, direction);
  const coverage = options.coverage?.[m.source];
  const usual = extras.usual ?? null;
  const baseline =
    usual?.value ?? all.slice(0, -1).reduce((sum, p) => sum + p.value, 0) / Math.max(1, all.length - 1);
  const evidence: RecordEvidence = {
    windowDays: null,
    coverageStart: all[0].startDay,
    completeHistory:
      coverage?.complete === true && coverage.status === "ready" && coverage.endDay >= day,
    rank,
    tied,
    sampleCount: all.length,
    baseline,
    difference: current.value - baseline,
    ...extras,
  };
  const provisional = period === "day" && m.accumulating && day === ctx.today;
  const event: HighlightEvent = {
    id: `${options.profileId}:${m.id}:${period}:${day}`,
    profileId: options.profileId,
    metricId: m.id,
    category: m.category,
    family: period === "day" ? "daily" : period,
    kind,
    period,
    direction,
    tone: kind === "worst" ? "unfavorable" : "positive",
    day,
    startDay: current.startDay,
    value: current.value,
    unit: period === "streak" ? "days" : m.unit,
    title: "",
    description: "",
    score: recordScore(kind, period, current.value, usual?.value),
    evidence,
    relatedEvidence: [],
    sourceIds:
      period === "day"
        ? options.observations.find((o) => o.day === day)?.sources[m.id] || []
        : [],
    revision: options.revision || RULES_VERSION,
    provisional,
    detailPath: `/metrics/${m.id}?profile=${encodeURIComponent(options.profileId)}&day=${day}&range=${detailRange(period, dayDistance(current.startDay, day) + 1)}`,
  };
  event.title = recordHeadline(event);
  event.description = recordValueLine(event);
  return event;
}
function periodRecord(
  ctx: Context,
  spec: RecordSpec,
  series: RecordSeries,
  period: RecordPeriod,
): HighlightEvent | null {
  const { day } = ctx;
  const all = comparisonSet(series, period, day);
  const current = all.at(-1);
  if (!current || current.day !== day) return null;
  const prior = all.slice(0, -1);
  if (prior.length < MIN_PRIOR[period]) return null;
  const partialToday = METRIC_BY_ID[spec.metricId].accumulating && day === ctx.today;
  if (partialToday && period !== "day") return null;
  const better = spec.better;
  const worse: RecordDirection = better === "high" ? "low" : "high";
  const usual = usualValue(spec, prior, period, day);
  const extras = {
    usual,
    coveredDays: current.covered,
    expectedDays: current.expected,
    total: current.total,
  };
  const high = competitionRank(all.map((p) => p.value), current.value, better);
  const best = extreme(prior, better);
  if (high.rank === 1 && high.tied <= 2)
    return buildEvent(ctx, spec, period, "personal_best", better, current, all, {
      ...extras,
      previousRecord: toPoint(best),
    });
  if (
    high.rank >= 2 &&
    high.rank <= 3 &&
    all.length >= TOP3_MIN_SAMPLES[period] &&
    high.rank + high.tied - 1 <= 4
  )
    return buildEvent(ctx, spec, period, "top3", better, current, all, {
      ...extras,
      previousRecord: toPoint(best),
    });
  const asGood = lastWhere(prior, (p) => !isBetter(current.value, p.value, better));
  if (asGood && dayDistance(asGood.day, day) >= SINCE_MIN_DAYS[period])
    return buildEvent(ctx, spec, period, "best_since", better, current, all, {
      ...extras,
      previousRecord: toPoint(best),
      lastAsExtreme: toPoint(asGood),
    });
  if (partialToday || !spec.lowPeriods.includes(period) || !current.lowEligible) return null;
  // Lows are strict: a tie with a recent period is not "the lowest in a while".
  const asBad = lastWhere(prior, (p) => !isBetter(current.value, p.value, worse));
  if (asBad && dayDistance(asBad.day, day) < LOW_SINCE_MIN_DAYS[period]) return null;
  return buildEvent(ctx, spec, period, "worst", worse, current, all, {
    ...extras,
    previousRecord: toPoint(extreme(prior, worse)),
    lastAsExtreme: toPoint(asBad),
  });
}
export const isStreakMilestone = (length: number) =>
  MILESTONES.includes(length) || (length > 365 && length % 100 === 0);
function streakRecord(ctx: Context, spec: RecordSpec, series: RecordSeries): HighlightEvent | null {
  const { day } = ctx;
  if (!spec.streak) return null;
  if (METRIC_BY_ID[spec.metricId].accumulating && day === ctx.today) return null;
  if (countThrough(series.day, shiftDay(day, -1)) < STREAK_MIN_HISTORY_DAYS) return null;
  const all = comparisonSet(series, "streak", day);
  const current = all.at(-1);
  if (!current || current.day !== day) return null;
  const earlier = all.filter((p) => p.startDay < current.startDay);
  const previous = extreme(earlier, "high");
  const length = current.value;
  const kind: RecordKind | null =
    length === Math.max(MIN_STREAK_RECORD, (previous?.value ?? 0) + 1)
      ? "streak_record"
      : isStreakMilestone(length)
        ? "streak_milestone"
        : null;
  if (!kind) return null;
  return buildEvent(ctx, spec, "streak", kind, "high", current, all, {
    coverageStart: series.day[0].day,
    threshold: spec.streak.threshold,
    previousRecord: toPoint(previous),
  });
}

function friendRecords(ctx: Context, own: HighlightEvent[]): HighlightEvent[] {
  const { options, day, today } = ctx;
  const events: HighlightEvent[] = [];
  if (!options.peers?.length) return events;
  const observations = options.observations
    .filter((o) => o.day <= day)
    .sort((a, b) => a.day.localeCompare(b.day));
  for (const peer of options.peers) {
    for (const spec of RECORD_SPECS) {
      const m = METRIC_BY_ID[spec.metricId];
      if (
        m.comparison !== "direct" ||
        !spec.periods.includes("day") ||
        (options.metricIds && !options.metricIds.includes(m.id)) ||
        (m.accumulating && day === today)
      )
        continue;
      const mine = metricSeries(observations, m.id);
      const theirs = new Map(
        metricSeries(peer.observations, m.id, undefined, day).map((p) => [p.day, p.value]),
      );
      const matched = mine.filter((p) => theirs.has(p.day));
      const current = matched.at(-1);
      const previous = matched.at(-2);
      if (
        !current ||
        !previous ||
        current.day !== day ||
        matched.length < 30 ||
        dayDistance(previous.day, current.day) !== 1
      )
        continue;
      const gap = current.value - theirs.get(current.day)!;
      const oldGap = previous.value - theirs.get(previous.day)!;
      const kind: RecordKind | null =
        gap > 0 && oldGap <= 0
          ? "friend_lead"
          : Math.abs(gap) <= m.resolution && Math.abs(oldGap) > m.resolution
            ? "friend_close"
            : null;
      if (!kind) continue;
      const close = kind === "friend_close";
      const gaps = matched.map((p) => {
        const g = p.value - theirs.get(p.day)!;
        return close ? Math.abs(g) : g;
      });
      const direction: RecordDirection = close ? "low" : "high";
      const { rank, tied } = competitionRank(gaps, gaps.at(-1)!, direction);
      const rarity = 1 - (rank - 1 + (tied - 1) / 2) / gaps.length;
      if (rarity < 0.7) continue;
      const baseline = gaps.slice(0, -1).reduce((a, b) => a + b, 0) / (gaps.length - 1);
      const label = spec.name.toLowerCase();
      events.push({
        id: `${options.profileId}:${m.id}:${kind}:${day}:${peer.profileId}`,
        profileId: options.profileId,
        metricId: m.id,
        category: m.category,
        family: kind,
        kind,
        period: "day",
        direction,
        tone: "neutral",
        day,
        startDay: day,
        value: gap,
        unit: m.unit,
        title: close ? `Neck and neck in ${label}` : `A new lead in ${label}`,
        description: `${formatMetricValue(m, Math.abs(gap))} apart · ${matched.length} shared days`,
        score: recordScore(kind, "day", 0),
        evidence: {
          windowDays: null,
          coverageStart: matched[0].day,
          completeHistory: false,
          rank,
          tied,
          sampleCount: gaps.length,
          baseline,
          difference: gaps.at(-1)! - baseline,
        },
        relatedEvidence: [],
        sourceIds: [],
        revision: options.revision || RULES_VERSION,
        provisional: false,
        peerId: peer.profileId,
        detailPath: `/metrics/${m.id}?profile=${encodeURIComponent(options.profileId)}&day=${day}`,
      });
    }
    for (const record of own) {
      const spec = RECORD_SPEC_BY_ID[record.metricId];
      const m = METRIC_BY_ID[record.metricId];
      if (
        record.period !== "day" ||
        record.tone !== "positive" ||
        record.provisional ||
        record.evidence.rank > 3 ||
        m.comparison !== "direct"
      )
        continue;
      const points = metricSeries(peer.observations, m.id, undefined, day);
      const current = points.at(-1);
      if (!current || current.day !== day || points.length < 30) continue;
      const ahead = points.filter((p) => isBetter(p.value, current.value, spec.better)).length;
      if (ahead > 2) continue;
      events.push({
        ...record,
        id: `${record.id}:shared:${peer.profileId}`,
        family: "shared",
        kind: "shared",
        peerId: peer.profileId,
        title: `A standout ${spec.name.toLowerCase()} day for you both`,
        description: `Both among your own top 3 · ${record.description}`,
        score: recordScore("shared", "day", 0),
      });
    }
  }
  return events;
}

export function evaluateHighlights(options: EvaluateOptions): {
  events: HighlightEvent[];
  featured: HighlightEvent[];
} {
  const ctx: Context = { options, day: options.asOfDay, today: options.today ?? options.asOfDay };
  const events: HighlightEvent[] = [];
  for (const spec of RECORD_SPECS) {
    const m = METRIC_BY_ID[spec.metricId];
    if (!m || (options.metricIds && !options.metricIds.includes(m.id))) continue;
    const coverage = options.coverage?.[m.source];
    if (coverage?.status === "unavailable" || coverage?.status === "failed") continue;
    // The shared cache is keyed by the caller's array, so later days reuse the same series.
    const series = recordSeries(options.observations, spec);
    for (const period of spec.periods) {
      const event = periodRecord(ctx, spec, series, period);
      if (event) events.push(event);
    }
    const streak = streakRecord(ctx, spec, series);
    if (streak) events.push(streak);
  }
  events.push(...friendRecords(ctx, events));
  return {
    events: events.sort(compareRecordPriority),
    featured: selectFeatured(events, options.cooldowns, options.asOfDay),
  };
}

export const toCooldown = (e: HighlightEvent, featuredOn: string): FeaturedCooldown => ({
  id: e.id,
  metricId: e.metricId,
  period: e.period,
  kind: e.kind,
  tone: e.tone,
  provisional: e.provisional,
  featuredOn,
});
/** At most three, one per metric, two per category, and never more than one low. */
export function selectFeatured(
  events: HighlightEvent[],
  cooldowns: FeaturedCooldown[] = [],
  asOfDay = events.reduce((day, e) => (e.day > day ? e.day : day), ""),
): HighlightEvent[] {
  const recent = cooldowns.filter(
    (c) => c.featuredOn < asOfDay && dayDistance(c.featuredOn, asOfDay) <= 7,
  );
  const eligible = events
    .filter((e) => {
      if (!e.kind || !isPresentableRecord(e)) return false;
      const shown = recent.find((c) => c.id === e.id);
      if (
        shown &&
        !(shown.provisional && !e.provisional) &&
        TIER[e.kind] <= TIER[shown.kind ?? e.kind]
      )
        return false;
      if (
        e.kind === "best_since" &&
        recent.some(
          (c) =>
            c.kind === "best_since" &&
            c.metricId === e.metricId &&
            c.period === e.period &&
            dayDistance(c.featuredOn, asOfDay) <= 3,
        )
      )
        return false;
      if (e.tone === "unfavorable") {
        const last = e.evidence.lastAsExtreme;
        const period = (e.period === "streak" ? "day" : e.period) || "day";
        if (last && dayDistance(last.day, e.day) < FEATURED_LOW_MIN_DAYS[period]) return false;
        if (recent.some((c) => c.tone === "unfavorable" && c.metricId === e.metricId)) return false;
      }
      return true;
    })
    // A low never outranks a positive record for the headline slot.
    .sort(
      (a, b) =>
        Number(a.tone === "unfavorable") - Number(b.tone === "unfavorable") ||
        compareRecordPriority(a, b),
    );
  const chosen: HighlightEvent[] = [];
  const metrics = new Set<string>();
  const categories = new Map<string, number>();
  let lows = 0;
  for (const e of eligible) {
    if (
      metrics.has(e.metricId) ||
      (categories.get(e.category) || 0) >= 2 ||
      (e.tone === "unfavorable" && lows >= 1)
    )
      continue;
    chosen.push(e);
    metrics.add(e.metricId);
    categories.set(e.category, (categories.get(e.category) || 0) + 1);
    if (e.tone === "unfavorable") lows++;
    if (chosen.length === 3) break;
  }
  return chosen;
}

/** The morning feed also recognizes the accumulating day, week or month that just finished. */
export function evaluateDailyHighlights(options: EvaluateOptions) {
  const today = options.today ?? options.asOfDay;
  const current = evaluateHighlights({ ...options, today });
  const completedDay = options.asOfDay === today ? shiftDay(options.asOfDay, -1) : null;
  const completed = completedDay
    ? evaluateHighlights({ ...options, asOfDay: completedDay, today })
    : null;
  const recentCompleted = (completed?.events || []).filter(
    (e) =>
      METRIC_BY_ID[e.metricId]?.accumulating || e.period === "week" || e.period === "month",
  );
  return {
    ...current,
    completedDay,
    completedEvents: completed?.events || [],
    featured: selectFeatured(
      [...current.events, ...recentCompleted],
      options.cooldowns,
      options.asOfDay,
    ),
  };
}

export interface RecordRankingRow {
  position: number;
  rank: number;
  tied: number;
  day: string;
  startDay: string;
  value: number;
  selected: boolean;
  threshold?: number;
  ownValue?: number;
  peerValue?: number;
}
function rankRows(
  points: Array<RecordPoint & Partial<RecordRankingRow>>,
  direction: RecordDirection,
  event: Pick<HighlightEvent, "day" | "startDay">,
): RecordRankingRow[] {
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const bound = (value: number, inclusive: boolean) => {
    let low = 0,
      high = values.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (inclusive ? values[mid] <= value : values[mid] < value) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return points
    .map((p) => {
      const below = bound(p.value - EPS, false);
      const through = bound(p.value + EPS, true);
      return {
        ...p,
        rank: 1 + (direction === "high" ? values.length - through : below),
        tied: through - below,
        selected: p.day === event.day && p.startDay === event.startDay,
      };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (direction === "high" ? b.value - a.value : a.value - b.value) ||
        b.day.localeCompare(a.day),
    )
    .map((row, position) => ({ ...row, position }));
}
/** Recomputes exactly the comparison set the evaluator used, as of the record's day. */
export function rankRecordHistory(
  event: HighlightEvent,
  observations: MetricObservation[],
  peerObservations: MetricObservation[] = [],
): RecordRankingRow[] {
  const metric = METRIC_BY_ID[event.metricId];
  if (!metric || !event.kind) return [];
  if (event.kind === "friend_lead" || event.kind === "friend_close") {
    const peer = new Map(
      metricSeries(peerObservations, metric.id, undefined, event.day).map((p) => [p.day, p.value]),
    );
    const points = metricSeries(observations, metric.id, undefined, event.day).flatMap((p) => {
      const other = peer.get(p.day);
      if (other == null) return [];
      const gap = p.value - other;
      return [
        {
          day: p.day,
          startDay: p.day,
          value: event.kind === "friend_close" ? Math.abs(gap) : gap,
          ownValue: p.value,
          peerValue: other,
        },
      ];
    });
    return rankRows(points, event.direction, event);
  }
  const spec = RECORD_SPEC_BY_ID[event.metricId];
  const period: EventPeriod | undefined = event.kind === "shared" ? "day" : event.period;
  if (!spec || !period) return [];
  const points = comparisonSet(recordSeries(observations, spec), period, event.day).map((p) => ({
    day: p.day,
    startDay: p.startDay,
    value: p.value,
    ...(period === "streak" && spec.streak ? { threshold: spec.streak.threshold } : {}),
  }));
  return rankRows(points, period === "streak" ? "high" : event.direction, event);
}
export function surroundingRankings(rows: RecordRankingRow[]): RecordRankingRow[] {
  const selected = rows.findIndex((row) => row.selected);
  if (selected < 0) return rows.slice(0, 6);
  return rows.filter(
    (_row, index) =>
      index < 3 || (index >= Math.max(0, selected - 3) && index < Math.max(6, selected + 4)),
  );
}

function topRows(points: SeriesPoint[], direction: RecordDirection, limit: number): BestRow[] {
  const sorted = [...points].sort(
    (a, b) => (direction === "high" ? b.value - a.value : a.value - b.value) || b.day.localeCompare(a.day),
  );
  const rows: BestRow[] = [];
  for (let i = 0; i < sorted.length && rows.length < limit; i++) {
    const p = sorted[i];
    const rank =
      i > 0 && Math.abs(sorted[i - 1].value - p.value) <= EPS ? rows[i - 1].rank : i + 1;
    rows.push({ value: p.value, day: p.day, startDay: p.startDay, rank });
  }
  return rows;
}
/** The trophy case: top results per period, plus how the current week, month and streak compare. */
export function computePersonalBests(input: {
  observations: MetricObservation[];
  asOfDay: string;
  today?: string;
  coverage?: MetricCoverage;
  limit?: number;
}): PersonalBests {
  const { observations, asOfDay, coverage, limit = 5 } = input;
  const today = input.today ?? asOfDay;
  const metrics: MetricBests[] = [];
  for (const spec of RECORD_SPECS) {
    const m = METRIC_BY_ID[spec.metricId];
    const source = coverage?.[m.source];
    if (source?.status === "unavailable" || source?.status === "failed") continue;
    const series = recordSeries(observations, spec);
    const through = m.accumulating && asOfDay === today ? shiftDay(asOfDay, -1) : asOfDay;
    const days = comparisonSet(series, "day", through);
    if (!days.length) continue;
    const entry: MetricBests = {
      metricId: spec.metricId,
      coverageStart: days[0].day,
      completeHistory:
        source?.complete === true && source.status === "ready" && source.endDay >= through,
      current: [],
    };
    for (const period of spec.periods) {
      const set = comparisonSet(series, period, through);
      if (set.length) entry[period] = { rows: topRows(set, spec.better, limit), sampleCount: set.length };
      if (period === "day") continue;
      const start = periodStart(through, period);
      if (periodEnd(start, period) <= through) continue;
      const partial = days.slice(countThrough(days, shiftDay(start, -1)));
      if (partial.length < 3) continue;
      const total = partial.reduce((sum, p) => sum + p.raw, 0);
      const value = roundRecordValue(spec, period, spec.aggregate === "sum" ? total : total / partial.length);
      entry.current.push({
        period,
        startDay: start,
        day: through,
        value,
        recordedDays: partial.length,
        wouldRank:
          spec.aggregate === "sum" || !set.length
            ? null
            : competitionRank([...set.map((p) => p.value), value], value, spec.better).rank,
        best: extreme(set, spec.better)?.value ?? null,
      });
    }
    if (spec.streak) {
      const set = comparisonSet(series, "streak", through);
      if (set.length)
        entry.streak = { rows: topRows(set, "high", limit), sampleCount: set.length, threshold: spec.streak.threshold };
      const run = series.runs.find((r) => r.startDay <= through && r.endDay >= through);
      if (run) {
        const length = dayDistance(run.startDay, through) + 1;
        const earlier = set.filter((p) => p.startDay < run.startDay).map((p) => p.value);
        entry.current.push({
          period: "streak",
          startDay: run.startDay,
          day: through,
          value: length,
          recordedDays: length,
          wouldRank: 1 + earlier.filter((v) => v > length).length,
          best: earlier.length ? Math.max(...earlier) : null,
        });
      }
    }
    metrics.push(entry);
  }
  return { asOfDay, metrics };
}

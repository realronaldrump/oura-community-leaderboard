import type { DailyStats, SleepSession, UserProfile } from "../types.js";

export type MetricCategory =
  | "sleep"
  | "recovery"
  | "activity"
  | "body"
  | "mind";
export type MetricUnit =
  | "score"
  | "percent"
  | "seconds"
  | "minutes"
  | "count"
  | "bpm"
  | "ms"
  | "celsius"
  | "meters"
  | "kcal"
  | "breaths"
  | "years"
  | "vo2"
  | "met";
export type MetricSource = keyof DailyStats;
export type Aggregation = "mean" | "sum" | "spread";
export interface MetricDefinition {
  id: string;
  label: string;
  category: MetricCategory;
  source: MetricSource;
  field: string;
  unit: MetricUnit;
  precision: number;
  interpretation: "higher" | "lower" | "neutral";
  aggregations: Aggregation[];
  comparison: "direct" | "baseline" | "none";
  accumulating: boolean;
  clock: boolean;
  resolution: number;
  recordable: boolean;
  description: string;
}
export interface MetricObservation {
  day: string;
  values: Record<string, number>;
  sources: Record<string, string[]>;
}
export interface CollectionCoverage {
  startDay: string;
  endDay: string;
  complete: boolean;
  status: "ready" | "partial" | "unavailable" | "failed";
  intervals?: Array<{ startDay: string; endDay: string }>;
}
export type MetricCoverage = Partial<Record<MetricSource, CollectionCoverage>>;
export const CATEGORIES: Record<MetricCategory, string> = {
  sleep: "Sleep",
  recovery: "Recovery",
  activity: "Activity",
  body: "Heart & body",
  mind: "Stress & restoration",
};
export const DAY_MS = 86_400_000;
export const validDay = (day: unknown): day is string =>
  typeof day === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) &&
  new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
export const shiftDay = (day: string, amount: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY_MS)
    .toISOString()
    .slice(0, 10);
export const dayDistance = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS,
  );
export const localDay = (
  profile: Pick<UserProfile, "lastKnownUtcOffsetMinutes">,
  now = new Date(),
) =>
  new Date(now.getTime() + (profile.lastKnownUtcOffsetMinutes ?? 0) * 60_000)
    .toISOString()
    .slice(0, 10);
export const exclusionKey = (
  profile: Pick<UserProfile, "dataExclusionRanges">,
) =>
  JSON.stringify(
    (profile.dataExclusionRanges || [])
      .map((r) => [r.startDay, r.endDay].sort())
      .sort(),
  );
export const excludedDay = (
  day: string,
  profile: Pick<UserProfile, "dataExclusionRanges">,
) =>
  (profile.dataExclusionRanges || []).some(
    (r) =>
      day >= (r.startDay < r.endDay ? r.startDay : r.endDay) &&
      day <= (r.endDay > r.startDay ? r.endDay : r.startDay),
  );
const numberAt = (record: unknown, path: string): number | null => {
  const value = path
    .split(".")
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[part]
          : undefined,
      record,
    );
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const definitions: MetricDefinition[] = [];
function metric(
  id: string,
  label: string,
  category: MetricCategory,
  source: MetricSource,
  field: string,
  unit: MetricUnit,
  options: Partial<MetricDefinition> = {},
) {
  const accumulating =
    source === "activity" ||
    (["stress", "workout", "guidedSession"].includes(source) &&
      unit !== "score");
  definitions.push({
    id,
    label,
    category,
    source,
    field,
    unit,
    precision: ["celsius", "breaths", "years", "vo2", "met"].includes(unit)
      ? 1
      : 0,
    interpretation: unit === "score" ? "higher" : "neutral",
    aggregations: ["mean", "spread"],
    comparison: unit === "score" || id === "steps" ? "direct" : "baseline",
    accumulating,
    clock: unit === "minutes",
    resolution: unit === "seconds" ? 60 : unit === "celsius" ? 0.1 : 1,
    recordable: true,
    description:
      "An observation from your Oura history. Comparisons use your own recorded data.",
    ...options,
  });
}
metric("sleep_score", "Sleep score", "sleep", "sleep", "score", "score");
metric(
  "readiness_score",
  "Readiness score",
  "recovery",
  "readiness",
  "score",
  "score",
);
metric(
  "activity_score",
  "Activity score",
  "activity",
  "activity",
  "score",
  "score",
  { accumulating: true },
);
const contributorGroups = [
  [
    "sleep",
    "sleep",
    [
      "deep_sleep",
      "efficiency",
      "latency",
      "rem_sleep",
      "restfulness",
      "timing",
      "total_sleep",
    ],
  ],
  [
    "readiness",
    "recovery",
    [
      "activity_balance",
      "body_temperature",
      "hrv_balance",
      "previous_day_activity",
      "previous_night",
      "recovery_index",
      "resting_heart_rate",
      "sleep_balance",
      "sleep_regularity",
    ],
  ],
  [
    "activity",
    "activity",
    [
      "meet_daily_targets",
      "move_every_hour",
      "recovery_time",
      "stay_active",
      "training_frequency",
      "training_volume",
    ],
  ],
  ["resilience", "mind", ["sleep_recovery", "daytime_recovery", "stress"]],
] as const;
const humanize = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/hrv/gi, "HRV")
    .replace(/rem/gi, "REM");
for (const [source, category, fields] of contributorGroups)
  for (const field of fields)
    metric(
      `${source}_${field}`,
      `${humanize(field)} contributor`,
      category,
      source,
      `contributors.${field}`,
      "score",
      {
        description: `Oura's ${humanize(field).toLowerCase()} contribution to ${source}. This is a contribution score, not a physiological measurement.`,
      },
    );
const sessionFields: Array<
  [string, string, string, MetricUnit, MetricCategory]
> = [
  ["sleep_duration", "Time asleep", "total_sleep_duration", "seconds", "sleep"],
  ["time_in_bed", "Time in bed", "time_in_bed", "seconds", "sleep"],
  ["deep_sleep", "Deep sleep", "deep_sleep_duration", "seconds", "sleep"],
  ["rem_sleep", "REM sleep", "rem_sleep_duration", "seconds", "sleep"],
  ["light_sleep", "Light sleep", "light_sleep_duration", "seconds", "sleep"],
  ["awake_time", "Awake time", "awake_time", "seconds", "sleep"],
  ["latency", "Time to fall asleep", "latency", "seconds", "sleep"],
  ["efficiency", "Sleep efficiency", "efficiency", "percent", "sleep"],
  [
    "restless_periods",
    "Restless periods",
    "restless_periods",
    "count",
    "sleep",
  ],
  ["hrv", "Heart rate variability", "average_hrv", "ms", "body"],
  [
    "heart_rate",
    "Average sleeping heart rate",
    "average_heart_rate",
    "bpm",
    "body",
  ],
  [
    "lowest_hr",
    "Lowest sleeping heart rate",
    "lowest_heart_rate",
    "bpm",
    "body",
  ],
  ["breathing_rate", "Breathing rate", "average_breath", "breaths", "body"],
];
for (const [id, label, field, unit, category] of sessionFields)
  metric(id, label, category, "session", field, unit, {
    description:
      "Measured during your main sleep session on this Oura day. Naps are shown separately.",
  });
metric("bedtime", "Bedtime", "sleep", "session", "bedtime_start", "minutes", {
  comparison: "none",
});
metric("wake_time", "Wake time", "sleep", "session", "bedtime_end", "minutes", {
  comparison: "none",
});
for (const stage of ["deep", "rem", "light"])
  metric(
    `${stage}_sleep_percent`,
    `${stage === "rem" ? "REM" : humanize(stage)} sleep share`,
    "sleep",
    "session",
    `${stage}_sleep_duration`,
    "percent",
  );
metric(
  "all_sleep",
  "Sleep including naps",
  "sleep",
  "session",
  "total_sleep_duration",
  "seconds",
  { aggregations: ["mean", "sum", "spread"] },
);
metric(
  "nap_duration",
  "Time napping",
  "sleep",
  "session",
  "total_sleep_duration",
  "seconds",
  { aggregations: ["mean", "sum", "spread"] },
);
metric("nap_count", "Naps", "sleep", "session", "", "count", {
  aggregations: ["mean", "sum", "spread"],
});
const activityFields: Array<[string, string, MetricUnit]> = [
  ["steps", "Steps", "count"],
  ["active_calories", "Active calories", "kcal"],
  ["total_calories", "Total calories", "kcal"],
  ["equivalent_walking_distance", "Walking equivalent", "meters"],
  ["high_activity_time", "High activity", "seconds"],
  ["medium_activity_time", "Moderate activity", "seconds"],
  ["low_activity_time", "Light activity", "seconds"],
  ["resting_time", "Resting time", "seconds"],
  ["sedentary_time", "Sedentary time", "seconds"],
  ["inactivity_alerts", "Inactivity alerts", "count"],
  ["average_met_minutes", "Average metabolic activity", "met"],
  ["high_activity_met_minutes", "High activity MET minutes", "met"],
  ["medium_activity_met_minutes", "Moderate activity MET minutes", "met"],
  ["low_activity_met_minutes", "Light activity MET minutes", "met"],
  ["sedentary_met_minutes", "Sedentary MET minutes", "met"],
  ["target_calories", "Activity calorie target", "kcal"],
  ["target_meters", "Walking target", "meters"],
  ["meters_to_target", "Distance to target", "meters"],
  ["non_wear_time", "Ring off time", "seconds"],
];
for (const [field, label, unit] of activityFields)
  metric(field, label, "activity", "activity", field, unit, {
    aggregations: ["mean", "sum", "spread"],
    recordable: ![
      "target_calories",
      "target_meters",
      "meters_to_target",
      "non_wear_time",
    ].includes(field),
  });
metric(
  "activity_goal_percent",
  "Activity goal reached",
  "activity",
  "activity",
  "active_calories",
  "percent",
  { interpretation: "higher", comparison: "direct" },
);
metric(
  "temperature",
  "Temperature deviation",
  "body",
  "readiness",
  "temperature_deviation",
  "celsius",
);
metric(
  "temperature_trend",
  "Temperature trend deviation",
  "body",
  "readiness",
  "temperature_trend_deviation",
  "celsius",
);
metric(
  "spo2",
  "Blood oxygen",
  "body",
  "spo2",
  "spo2_percentage.average",
  "percent",
);
metric(
  "breathing_disturbance",
  "Breathing disturbance index",
  "body",
  "spo2",
  "breathing_disturbance_index",
  "count",
);
metric(
  "stress_high",
  "High stress time",
  "mind",
  "stress",
  "stress_high",
  "seconds",
  { aggregations: ["mean", "sum", "spread"] },
);
metric(
  "recovery_high",
  "Restorative time",
  "mind",
  "stress",
  "recovery_high",
  "seconds",
  { aggregations: ["mean", "sum", "spread"] },
);
metric(
  "cardiovascular_age",
  "Cardiovascular age",
  "body",
  "cardiovascularAge",
  "vascular_age",
  "years",
);
metric("vo2_max", "VO₂ max", "body", "vo2Max", "vo2_max", "vo2");
for (const [source, category, prefix] of [
  ["workout", "activity", "workout"],
  ["guidedSession", "mind", "guided"],
] as const) {
  metric(
    `${prefix}_duration`,
    source === "workout" ? "Workout time" : "Guided session time",
    category,
    source,
    "",
    "seconds",
    { aggregations: ["mean", "sum", "spread"] },
  );
  metric(
    `${prefix}_count`,
    source === "workout" ? "Workouts" : "Guided sessions",
    category,
    source,
    "",
    "count",
    { aggregations: ["mean", "sum", "spread"] },
  );
}
metric(
  "workout_distance",
  "Workout distance",
  "activity",
  "workout",
  "distance",
  "meters",
  { aggregations: ["mean", "sum", "spread"] },
);
metric(
  "workout_calories",
  "Workout calories",
  "activity",
  "workout",
  "calories",
  "kcal",
  { aggregations: ["mean", "sum", "spread"] },
);
export const METRICS: readonly MetricDefinition[] = definitions;
export const METRIC_BY_ID = Object.fromEntries(
  METRICS.map((m) => [m.id, m]),
) as Record<string, MetricDefinition>;
export const metricColor = (category: MetricCategory) =>
  `var(--color-${category === "body" || category === "mind" ? "insight" : category === "recovery" ? "readiness" : category})`;
export const clockMinutes = (
  timestamp: unknown,
  bedtime = false,
): number | null => {
  if (typeof timestamp !== "string") return null;
  const match = /T(\d{2}):(\d{2})/.exec(timestamp);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return bedtime && minutes < 12 * 60 ? minutes + 1440 : minutes;
};
export function mainSleepSession(
  sessions: SleepSession[],
): SleepSession | undefined {
  return sessions
    .filter((s) => !["deleted", "rest", "late_nap"].includes(s.type || ""))
    .sort(
      (a, b) =>
        Number(b.type === "long_sleep") - Number(a.type === "long_sleep") ||
        (b.total_sleep_duration ?? 0) - (a.total_sleep_duration ?? 0) ||
        (b.bedtime_end || "").localeCompare(a.bedtime_end || "") ||
        b.id.localeCompare(a.id),
    )[0];
}
const rowDay = (row: Record<string, unknown>) =>
  [
    row.day,
    ...["start_datetime", "start_time", "timestamp"].map((k) =>
      typeof row[k] === "string" ? row[k].slice(0, 10) : null,
    ),
  ].find(validDay);
export function normalizeMetricDays(
  stats: DailyStats,
  profile: Pick<UserProfile, "dataExclusionRanges"> = {},
  options: { coverage?: MetricCoverage; sessionsComplete?: boolean } = {},
): MetricObservation[] {
  const bySource = new Map<
    MetricSource,
    Map<string, Record<string, unknown>[]>
  >();
  const days = new Set<string>();
  for (const source of new Set(METRICS.map((m) => m.source))) {
    const buckets = new Map<string, Record<string, unknown>[]>();
    const items = Array.isArray(stats[source])
      ? (stats[source] as unknown as Record<string, unknown>[])
      : [];
    const unique = new Map<string, Record<string, unknown>>();
    for (const row of items) {
      const day = rowDay(row);
      if (!day || excludedDay(day, profile)) continue;
      const key = String(
        row.id || `${day}|${row.timestamp || row.start_datetime || ""}`,
      );
      const prior = unique.get(key);
      if (
        !prior ||
        String(row.updatedAt || row.timestamp || "") >=
          String(prior.updatedAt || prior.timestamp || "")
      )
        unique.set(key, row);
    }
    for (const row of unique.values()) {
      const day = rowDay(row)!;
      if (
        source === "session" &&
        ["deleted", "rest"].includes(String(row.type))
      )
        continue;
      days.add(day);
      buckets.set(day, [...(buckets.get(day) || []), row]);
    }
    bySource.set(source, buckets);
  }
  return [...days].sort().map((day) => {
    const values: Record<string, number> = {};
    const sources: Record<string, string[]> = {};
    for (const m of METRICS) {
      const rows = bySource.get(m.source)?.get(day) || [];
      if (!rows.length) {
        const covered = options.coverage?.[m.source];
        const observedDay = bySource.get("activity")?.get(day)?.[0];
        const successful =
          covered &&
          (covered.status === "ready" || covered.status === "partial") &&
          (
            covered.intervals || [
              { startDay: covered.startDay, endDay: covered.endDay },
            ]
          ).some(
            (interval) => day >= interval.startDay && day <= interval.endDay,
          );
        if (
          (m.source === "workout" || m.source === "guidedSession") &&
          successful &&
          observedDay &&
          (numberAt(observedDay, "non_wear_time") || 0) < 23 * 3600
        ) {
          values[m.id] = 0;
          sources[m.id] = [];
        }
        continue;
      }
      if (
        options.sessionsComplete === false &&
        ["nap_count", "nap_duration", "all_sleep"].includes(m.id)
      )
        continue;
      const main =
        m.source === "session"
          ? (mainSleepSession(rows as unknown as SleepSession[]) as unknown as
              | Record<string, unknown>
              | undefined)
          : undefined;
      const row =
        m.source === "session"
          ? main
          : [...rows].sort((a, b) =>
              String(b.timestamp || b.updatedAt || b.id || "").localeCompare(
                String(a.timestamp || a.updatedAt || a.id || ""),
              ),
            )[0];
      if (
        m.source === "activity" &&
        (numberAt(row, "non_wear_time") ?? 0) >= 23 * 3600 &&
        m.id !== "non_wear_time"
      )
        continue;
      let value = row ? numberAt(row, m.field) : null;
      let refs = row ? [String(row.id || day)] : [];
      if (m.clock) value = clockMinutes(row?.[m.field], m.id === "bedtime");
      if (m.id.endsWith("_sleep_percent")) {
        const total = numberAt(row, "total_sleep_duration");
        value =
          value != null && total && total > 0 ? (value / total) * 100 : null;
      }
      if (["all_sleep", "nap_duration", "nap_count"].includes(m.id)) {
        const selected =
          m.id === "all_sleep" ? rows : rows.filter((r) => r !== main);
        if (selected.length || main) {
          const durations = selected.map((r) =>
            numberAt(r, "total_sleep_duration"),
          );
          value =
            m.id === "nap_count"
              ? selected.length
              : durations.every((v) => v != null)
                ? durations.reduce<number>((sum, v) => sum + v!, 0)
                : null;
          refs = selected.map((r) => String(r.id || day));
        }
      }
      if (m.id === "activity_goal_percent") {
        const goal = numberAt(row, "target_calories");
        value = value != null && goal && goal > 0 ? (value / goal) * 100 : null;
      }
      if (m.source === "workout" || m.source === "guidedSession") {
        refs = rows.map((r) => String(r.id || day));
        if (m.id.endsWith("_count")) value = rows.length;
        else if (m.id.endsWith("_duration")) {
          const durations = rows.map((r) => {
            const start = r.start_datetime || r.start_time;
            const end = r.end_datetime || r.end_time;
            const duration =
              typeof start === "string" && typeof end === "string"
                ? (Date.parse(end) - Date.parse(start)) / 1000
                : NaN;
            return Number.isFinite(duration) && duration > 0 ? duration : null;
          });
          value = durations.every((v) => v != null)
            ? durations.reduce<number>((a, b) => a + b!, 0)
            : null;
        } else {
          const numbers = rows
            .map((r) => numberAt(r, m.field))
            .filter((v): v is number => v != null);
          value = numbers.length ? numbers.reduce((a, b) => a + b, 0) : null;
        }
      }
      if (value == null || !Number.isFinite(value)) continue;
      if (
        ["bpm", "ms", "breaths", "vo2", "years"].includes(m.unit) &&
        value <= 0
      )
        continue;
      if (
        m.unit !== "celsius" &&
        !m.clock &&
        value < 0 &&
        m.id !== "meters_to_target"
      )
        continue;
      if (
        (m.unit === "score" ||
          (m.unit === "percent" && m.id !== "activity_goal_percent")) &&
        value > 100
      )
        continue;
      values[m.id] = value;
      sources[m.id] = refs;
    }
    return { day, values, sources };
  });
}
export function formatMetricValue(
  metric: MetricDefinition | string,
  value: number | null | undefined,
): string {
  const m = typeof metric === "string" ? METRIC_BY_ID[metric] : metric;
  if (!m || value == null || !Number.isFinite(value)) return "—";
  if (m.clock) {
    const v = ((Math.round(value) % 1440) + 1440) % 1440;
    const hour = Math.floor(v / 60);
    return `${hour % 12 || 12}:${String(v % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  }
  if (m.unit === "seconds") {
    const minutes = Math.round(value / 60);
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  }
  if (m.unit === "meters") return `${(value / 1609.344).toFixed(1)} mi`;
  const suffix: Partial<Record<MetricUnit, string>> = {
    percent: "%",
    bpm: " bpm",
    ms: " ms",
    celsius: " °C",
    kcal: " kcal",
    breaths: " /min",
    years: " years",
    vo2: " ml/kg/min",
    met: " MET",
  };
  return `${value.toLocaleString("en-US", { maximumFractionDigits: m.precision })}${suffix[m.unit] || ""}`;
}
export const metricSeries = (
  observations: MetricObservation[],
  id: string,
  start?: string,
  end?: string,
) =>
  observations
    .filter(
      (o) =>
        o.values[id] != null &&
        (!start || o.day >= start) &&
        (!end || o.day <= end),
    )
    .map((o) => ({ day: o.day, value: o.values[id] }));

export const metricMask = (ids: string[]) =>
  METRICS.reduce(
    (mask, m, i) => (ids.includes(m.id) ? mask | (1n << BigInt(i)) : mask),
    0n,
  ).toString(16);
export const hasMetricInMask = (mask: string, ids: string[]) =>
  Boolean(BigInt(`0x${mask || "0"}`) & BigInt(`0x${metricMask(ids)}`));

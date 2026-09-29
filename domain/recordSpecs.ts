/** Records only cover measures people track, in calendar periods they recognize. */
export type RecordPeriod = "day" | "week" | "month";
export type RecordDirection = "high" | "low";
export interface RecordSpec {
  metricId: string;
  /** Short name for the trophy case. */
  name: string;
  better: RecordDirection;
  periods: RecordPeriod[];
  /** How a calendar week or month is summarized. */
  aggregate: "mean" | "sum";
  /** Weekly and monthly means are shown as a daily average with the total alongside. */
  perDay?: boolean;
  unit: "night" | "day";
  best: Record<RecordPeriod, string>;
  worst: Record<RecordPeriod, string>;
  valueSuffix?: string;
  lowPeriods: RecordPeriod[];
  /** Keeps a ring-off day or a missing night from reading as a low. */
  lowGate?: "worn" | "scoredNight";
  streak?: { threshold: number; condition: string };
  priority: number;
}
const periods = (day: string, week: string, month: string) => ({ day, week, month });
const scored = (
  metricId: string,
  name: string,
  noun: string,
  priority: number,
  options: Partial<RecordSpec> = {},
): RecordSpec => ({
  metricId,
  name,
  better: "high",
  periods: ["day", "week", "month"],
  aggregate: "mean",
  unit: "day",
  best: periods(`Best ${noun}`, `Best weekly ${noun}`, `Best monthly ${noun}`),
  worst: periods(`Lowest ${noun}`, `Lowest weekly ${noun}`, `Lowest monthly ${noun}`),
  lowPeriods: ["day", "week", "month"],
  priority,
  ...options,
});
export const RECORD_SPECS: readonly RecordSpec[] = [
  scored("sleep_score", "Sleep score", "sleep score", 1, {
    unit: "night",
    lowGate: "scoredNight",
    streak: { threshold: 85, condition: "with a sleep score of 85+" },
  }),
  scored("readiness_score", "Readiness", "readiness", 2, {
    streak: { threshold: 85, condition: "with readiness of 85+" },
  }),
  scored("activity_score", "Activity score", "activity score", 3, {
    lowGate: "worn",
    streak: { threshold: 85, condition: "with an activity score of 85+" },
  }),
  {
    metricId: "sleep_duration",
    name: "Time asleep",
    better: "high",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    unit: "night",
    best: periods("Longest sleep", "Most weekly sleep", "Most monthly sleep"),
    worst: periods("Shortest sleep", "Least weekly sleep", "Least monthly sleep"),
    lowPeriods: ["day", "week", "month"],
    lowGate: "scoredNight",
    streak: { threshold: 7 * 3600, condition: "with 7+ hours of sleep" },
    priority: 4,
  },
  {
    metricId: "hrv",
    name: "HRV",
    better: "high",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    unit: "night",
    best: periods("Highest HRV", "Highest weekly HRV", "Highest monthly HRV"),
    worst: periods("Lowest HRV", "Lowest weekly HRV", "Lowest monthly HRV"),
    lowPeriods: ["day", "week", "month"],
    lowGate: "scoredNight",
    priority: 5,
  },
  {
    metricId: "lowest_hr",
    name: "Resting heart rate",
    better: "low",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    unit: "night",
    best: periods(
      "Lowest resting heart rate",
      "Lowest weekly resting heart rate",
      "Lowest monthly resting heart rate",
    ),
    worst: periods(
      "Highest resting heart rate",
      "Highest weekly resting heart rate",
      "Highest monthly resting heart rate",
    ),
    lowPeriods: ["day", "week", "month"],
    lowGate: "scoredNight",
    priority: 6,
  },
  {
    metricId: "steps",
    name: "Steps",
    better: "high",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    perDay: true,
    unit: "day",
    best: periods("Most steps", "Most weekly steps", "Most monthly steps"),
    worst: periods("Fewest steps", "Fewest weekly steps", "Fewest monthly steps"),
    valueSuffix: " steps",
    lowPeriods: ["day", "week", "month"],
    lowGate: "worn",
    streak: { threshold: 10000, condition: "with 10,000+ steps" },
    priority: 7,
  },
  {
    metricId: "active_calories",
    name: "Active calories",
    better: "high",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    perDay: true,
    unit: "day",
    best: periods(
      "Most active calories",
      "Most weekly active calories",
      "Most monthly active calories",
    ),
    worst: periods(
      "Fewest active calories",
      "Fewest weekly active calories",
      "Fewest monthly active calories",
    ),
    lowPeriods: ["day", "week", "month"],
    lowGate: "worn",
    priority: 8,
  },
  {
    metricId: "deep_sleep",
    name: "Deep sleep",
    better: "high",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    unit: "night",
    best: periods("Most deep sleep", "Most weekly deep sleep", "Most monthly deep sleep"),
    worst: periods("Least deep sleep", "Least weekly deep sleep", "Least monthly deep sleep"),
    lowPeriods: ["day", "week", "month"],
    lowGate: "scoredNight",
    priority: 9,
  },
  {
    metricId: "rem_sleep",
    name: "REM sleep",
    better: "high",
    periods: ["day", "week", "month"],
    aggregate: "mean",
    unit: "night",
    best: periods("Most REM sleep", "Most weekly REM sleep", "Most monthly REM sleep"),
    worst: periods("Least REM sleep", "Least weekly REM sleep", "Least monthly REM sleep"),
    lowPeriods: ["day", "week", "month"],
    lowGate: "scoredNight",
    priority: 10,
  },
  {
    metricId: "workout_count",
    name: "Workouts",
    better: "high",
    periods: ["week", "month"],
    aggregate: "sum",
    unit: "day",
    best: periods("Most workouts", "Most weekly workouts", "Most monthly workouts"),
    worst: periods("Fewest workouts", "Fewest weekly workouts", "Fewest monthly workouts"),
    valueSuffix: " workouts",
    // Month lengths differ, so only complete weeks are compared on the low side.
    lowPeriods: ["week"],
    lowGate: "worn",
    priority: 11,
  },
  {
    metricId: "workout_duration",
    name: "Workout time",
    better: "high",
    periods: ["week", "month"],
    aggregate: "sum",
    unit: "day",
    best: periods("Most workout time", "Most weekly workout time", "Most monthly workout time"),
    worst: periods(
      "Least workout time",
      "Least weekly workout time",
      "Least monthly workout time",
    ),
    lowPeriods: ["week"],
    lowGate: "worn",
    priority: 12,
  },
  {
    metricId: "activity_goal_percent",
    name: "Activity goal",
    better: "high",
    periods: [],
    aggregate: "mean",
    unit: "day",
    best: periods("", "", ""),
    worst: periods("", "", ""),
    lowPeriods: [],
    streak: { threshold: 100, condition: "hitting your activity goal" },
    priority: 13,
  },
];
export const RECORD_SPEC_BY_ID: Readonly<Record<string, RecordSpec>> =
  Object.fromEntries(RECORD_SPECS.map((spec) => [spec.metricId, spec]));

import { describe, expect, it } from "vitest";
import { METRIC_BY_ID, shiftDay, type MetricCoverage, type MetricObservation } from "./metrics";
import {
  RECORD_SPECS,
  RECORD_SPEC_BY_ID,
  evaluateDailyHighlights,
  evaluateHighlights,
  recordEventDay,
  recordSeries,
  selectFeatured,
  toCooldown,
  type HighlightEvent,
} from "./records";
import { recordContext, recordHeadline, recordValueLine } from "./recordCopy";

const START = "2020-01-01";
const series = (
  count: number,
  value: (i: number) => number | null,
  metric = "sleep_score",
  extra: (i: number) => Record<string, number> = () => ({}),
  start = START,
): MetricObservation[] =>
  Array.from({ length: count }, (_, i) => {
    const v = value(i);
    return {
      day: shiftDay(start, i),
      values: { ...(v == null ? {} : { [metric]: v }), ...extra(i) },
      sources: v == null ? {} : { [metric]: [`source-${i}`] },
    };
  });
const complete = (source: keyof MetricCoverage, end: string): MetricCoverage => ({
  [source]: { startDay: "2000-01-01", endDay: end, status: "ready", complete: true },
});
const evaluate = (rows: MetricObservation[], metricIds: string[], options: Partial<Parameters<typeof evaluateHighlights>[0]> = {}) =>
  evaluateHighlights({
    profileId: "me",
    observations: rows,
    asOfDay: rows.at(-1)!.day,
    today: "2030-01-01",
    metricIds,
    ...options,
  });

describe("record specs", () => {
  it("covers only real, trackable metrics with wording for every period", () => {
    expect(new Set(RECORD_SPECS.map((s) => s.metricId)).size).toBe(RECORD_SPECS.length);
    for (const spec of RECORD_SPECS) {
      expect(METRIC_BY_ID[spec.metricId], spec.metricId).toBeDefined();
      expect(spec.lowPeriods.every((p) => spec.periods.includes(p)), spec.metricId).toBe(true);
      for (const period of spec.periods) {
        expect(spec.best[period], spec.metricId).toBeTruthy();
        expect(spec.worst[period], spec.metricId).toBeTruthy();
      }
      expect(spec.periods.length > 0 || Boolean(spec.streak), spec.metricId).toBe(true);
    }
    expect(RECORD_SPEC_BY_ID.sleep_restfulness).toBeUndefined();
    expect(RECORD_SPEC_BY_ID.workout_count.lowPeriods).toEqual(["week"]);
  });
  it("finds the archive day after the profile prefix, even when a profile id looks like a date", () => {
    expect(recordEventDay("2024-01-01-me", "2024-01-01-me:sleep_score:week:2025-03-09")).toBe("2025-03-09");
    expect(recordEventDay("me", "me:sleep_score:friend_lead:2025-03-09:2024-01-01-peer")).toBe("2025-03-09");
  });
});

describe("personal bests and top results", () => {
  it("names a personal best, what it beat, and says 'ever' only for a complete year of history", () => {
    const rows = series(400, (i) => (i === 399 ? 99 : 60 + (i % 35)));
    const day = rows.at(-1)!.day;
    const result = evaluate(rows, ["sleep_score"], { coverage: complete("sleep", day) });
    const record = result.events.find((e) => e.period === "day")!;
    expect(record).toMatchObject({ kind: "personal_best", tone: "positive", id: `me:sleep_score:day:${day}` });
    expect(record.evidence).toMatchObject({ rank: 1, tied: 1, sampleCount: 400, windowDays: null });
    expect(record.evidence.previousRecord).toMatchObject({ value: 94, day: shiftDay(START, 384) });
    expect(recordHeadline(record)).toBe("Best sleep score ever");
    expect(recordValueLine(record)).toBe(`99 · previous best 94 (Jan 19, 2021)`);
    expect(result.featured.map((e) => e.id)).toContain(record.id);
    const partial = evaluate(rows, ["sleep_score"]).events.find((e) => e.period === "day")!;
    expect(recordHeadline(partial)).toBe("Best sleep score since Jan 2020");
  });
  it("reports top-three places and ties honestly without using later data", () => {
    const rows = series(100, (i) => (i === 99 ? 97 : i === 0 ? 99 : i === 1 ? 98 : 50 + (i % 40)));
    const later = [...rows, { day: shiftDay(rows.at(-1)!.day, 1), values: { sleep_score: 100 }, sources: {} }];
    const third = evaluate(later, ["sleep_score"], { asOfDay: rows.at(-1)!.day }).events.find((e) => e.period === "day")!;
    expect(third).toMatchObject({ kind: "top3", evidence: { rank: 3, tied: 1, sampleCount: 100 } });
    expect(recordHeadline(third)).toBe("3rd best sleep score since Jan 2020");
    expect(recordValueLine(third)).toBe("97 · your best is 99 (Jan 1, 2020)");
    const tie = series(100, (i) => (i === 5 || i === 99 ? 99 : 50 + (i % 40)));
    const tied = evaluate(tie, ["sleep_score"]).events.find((e) => e.period === "day")!;
    expect(tied).toMatchObject({ kind: "personal_best", evidence: { rank: 1, tied: 2 } });
    expect(recordHeadline(tied)).toBe("Tied for best sleep score since Jan 2020");
    expect(recordValueLine(tied)).toBe("99 · same as Jan 6, 2020");
  });
  it("calls something the best in a while only after at least three months", () => {
    const build = (gap: number) =>
      series(200, (i) => (i === 199 ? 84 : i === 199 - gap ? 85 : i >= 10 && i <= 12 ? 95 + i - 10 : 60 + (i % 10)));
    const at90 = evaluate(build(90), ["sleep_score"]).events.find((e) => e.period === "day")!;
    expect(at90.kind).toBe("best_since");
    expect(recordHeadline(at90)).toBe("Best sleep score in 3 months");
    expect(evaluate(build(89), ["sleep_score"]).events.filter((e) => e.period === "day")).toEqual([]);
  });
  it("keeps a genuinely unchanging history quiet", () => {
    const rows = series(365, () => 80);
    const result = evaluate(rows, ["sleep_score"]);
    expect(result.events).toEqual([]);
    expect(result.featured).toEqual([]);
  });
  it("does not call unavailable history a record", () => {
    const rows = series(100, (i) => i);
    const result = evaluate(rows, ["sleep_score"], {
      coverage: { sleep: { startDay: rows[0].day, endDay: rows.at(-1)!.day, status: "failed", complete: true } },
    });
    expect(result.events).toEqual([]);
  });
});

describe("worth noticing", () => {
  it("is strict, and needs a scored night for sleep-derived lows", () => {
    const withSleep = () => ({ sleep_score: 80 });
    const low = series(200, (i) => (i === 199 ? 45 : 50 + (i % 10)), "hrv", withSleep);
    const record = evaluate(low, ["hrv"]).events.find((e) => e.period === "day")!;
    expect(record).toMatchObject({ kind: "worst", direction: "low", tone: "unfavorable", evidence: { rank: 1, tied: 1 } });
    expect(recordHeadline(record)).toBe("Lowest HRV since Jan 2020");
    const unscored = low.map((o, i) => (i === 199 ? { ...o, values: { hrv: 45 } } : o));
    expect(evaluate(unscored, ["hrv"]).events).toEqual([]);
    const tie = series(200, (i) => (i === 199 ? 50 : 50 + (i % 10)), "hrv", withSleep);
    expect(evaluate(tie, ["hrv"]).events).toEqual([]);
  });
  it("ignores a ring-off day and a still-counting day", () => {
    const worn = (hours: number) => (i: number) => ({ non_wear_time: i === 199 ? hours * 3600 : 600 });
    const low = (hours: number) => series(200, (i) => (i === 199 ? 500 : 8000 + (i % 10) * 100), "steps", worn(hours));
    expect(evaluate(low(1), ["steps"]).events.find((e) => e.period === "day")).toMatchObject({ kind: "worst" });
    expect(evaluate(low(5), ["steps"]).events).toEqual([]);
    const today = low(1).at(-1)!.day;
    expect(evaluate(low(1), ["steps"], { today }).events).toEqual([]);
  });
  it("recognizes the first zero-workout week and not the next one soon after", () => {
    const rows = series(
      260,
      (i) => ((i >= 140 && i <= 146) || (i >= 210 && i <= 216) ? 0 : i % 2 ? 0 : 1),
      "workout_count",
      () => ({ non_wear_time: 0 }),
      "2024-01-01",
    );
    const first = evaluate(rows, ["workout_count"], {
      asOfDay: rows[146].day,
      coverage: complete("workout", rows.at(-1)!.day),
    }).events;
    expect(first.find((e) => e.period === "week")).toMatchObject({ kind: "worst", value: 0 });
    expect(recordHeadline(first.find((e) => e.period === "week")!)).toBe("Fewest weekly workouts since you started");
    const second = evaluate(rows, ["workout_count"], { asOfDay: rows[216].day }).events;
    expect(second.find((e) => e.period === "week")).toBeUndefined();
  });
});

describe("calendar periods and streaks", () => {
  it("counts a week with six recorded days and a month with 80% of its days", () => {
    const rows = series(60, (i) => ([6, 9, 10].includes(i) ? null : 70 + (i % 5)), "sleep_score", () => ({}), "2024-01-01");
    const weeks = recordSeries(rows, RECORD_SPEC_BY_ID.sleep_score).week;
    expect(weeks[0]).toMatchObject({ startDay: "2024-01-01", day: "2024-01-07", covered: 6, expected: 7 });
    expect(weeks.some((w) => w.startDay === "2024-01-08")).toBe(false);
    const february = series(29, (i) => (i < 23 ? 70 : null), "sleep_score", () => ({}), "2024-02-01");
    expect(recordSeries(february, RECORD_SPEC_BY_ID.sleep_score).month).toEqual([]);
    const enough = series(29, (i) => (i < 24 ? 70 : null), "sleep_score", () => ({}), "2024-02-01");
    expect(recordSeries(enough, RECORD_SPEC_BY_ID.sleep_score).month[0]).toMatchObject({ day: "2024-02-29", covered: 24 });
  });
  it("recognizes a streak when it becomes the longest and at milestones, not every day", () => {
    const rows = series(76, (i) => ((i >= 35 && i <= 42) || i >= 60 ? 120 : 50), "activity_goal_percent");
    const found: Array<[number, string, string]> = [];
    for (let i = 60; i < 76; i++)
      for (const e of evaluate(rows.slice(0, i + 1), ["activity_goal_percent"]).events)
        if (e.period === "streak") found.push([e.value, e.kind!, recordHeadline(e)]);
    expect(found).toEqual([
      [7, "streak_milestone", "7 days in a row hitting your activity goal"],
      [9, "streak_record", "New longest streak: 9 days hitting your activity goal"],
      [14, "streak_milestone", "14 days in a row hitting your activity goal"],
    ]);
  });
  it("breaks a streak across a missing day", () => {
    const rows = series(12, (i) => (i === 5 ? null : 90), "sleep_score");
    expect(recordSeries(rows, RECORD_SPEC_BY_ID.sleep_score).runs).toEqual([
      { startDay: rows[0].day, endDay: rows[4].day },
      { startDay: rows[6].day, endDay: rows[11].day },
    ]);
  });
});

describe("today and featured records", () => {
  it("features yesterday's finished activity record and never a still-counting low", () => {
    const rows = series(100, (i) => (i === 98 ? 24000 : i === 99 ? 0 : 7000 + i * 10), "steps");
    const today = rows[99].day;
    const result = evaluateDailyHighlights({ profileId: "me", observations: rows, asOfDay: today, today });
    const yesterday = result.featured.find((e) => e.metricId === "steps")!;
    expect(yesterday).toMatchObject({ day: rows[98].day, kind: "personal_best", provisional: false });
    expect(recordContext(yesterday, today)).toBe("Yesterday");
    expect(result.events.some((e) => e.metricId === "steps")).toBe(false);
  });
  it("marks a still-counting personal best and skips partial weeks", () => {
    const rows = series(100, (i) => (i === 99 ? 50000 : 7000 + i * 10), "steps");
    const today = rows[99].day;
    const events = evaluate(rows, ["steps"], { today }).events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ period: "day", kind: "personal_best", provisional: true });
    expect(recordValueLine(events[0])).toContain("still counting");
  });
  it("features at most one low, never ahead of a good result, and not a recent repeat", () => {
    const pb = evaluate(series(400, (i) => (i === 399 ? 99 : 60 + (i % 35))), ["sleep_score"]).events.find((e) => e.period === "day")!;
    const low = (metricId: string, category: HighlightEvent["category"], gapDays: number | null): HighlightEvent => ({
      ...pb,
      id: `me:${metricId}:day:${pb.day}`,
      metricId,
      category,
      kind: "worst",
      tone: "unfavorable",
      score: 900,
      evidence: {
        ...pb.evidence,
        lastAsExtreme: gapDays == null ? null : { value: 1, day: shiftDay(pb.day, -gapDays), startDay: shiftDay(pb.day, -gapDays) },
      },
    });
    const featured = selectFeatured([low("hrv", "body", null), low("lowest_hr", "body", 400), pb]);
    expect(featured.map((e) => e.metricId)).toEqual(["sleep_score", "hrv"]);
    expect(selectFeatured([low("hrv", "body", 120)])).toEqual([]);
    const later = shiftDay(pb.day, 1);
    expect(selectFeatured([pb], [toCooldown(pb, pb.day)], later)).toEqual([]);
    expect(selectFeatured([pb], [toCooldown(pb, pb.day)], pb.day)).toHaveLength(1);
    const counting = { ...pb, provisional: true };
    expect(selectFeatured([pb], [toCooldown(counting, pb.day)], later)).toHaveLength(1);
  });
  it("keeps a noisy year to a handful of plainly worded records a week", () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const noise = (size: number) => (random() + random() + random() - 1.5) * size;
    const rows: MetricObservation[] = [];
    for (let i = 0; i < 1200; i++) {
      if (random() < 0.03) continue;
      const trend = Math.sin(i / 120) * 3;
      const steps = Math.max(1500, Math.round(8500 + trend * 400 + noise(6000)));
      rows.push({
        day: shiftDay("2023-06-01", i),
        sources: {},
        values: {
          sleep_score: Math.round(Math.min(100, 76 + trend + noise(12))),
          readiness_score: Math.round(Math.min(100, 75 + trend + noise(12))),
          sleep_duration: Math.round(25200 + trend * 300 + noise(4000)),
          hrv: Math.max(10, Math.round(45 + trend + noise(14))),
          lowest_hr: Math.round(52 - trend / 2 + noise(5)),
          steps,
          active_calories: Math.max(0, Math.round(steps / 25 + noise(120))),
          workout_count: random() < 0.35 ? 1 : 0,
          non_wear_time: 1800,
        },
      });
    }
    let total = 0;
    const recentDays = rows.slice(-365).map((o) => o.day);
    for (const asOfDay of recentDays) {
      const result = evaluateHighlights({ profileId: "me", observations: rows, asOfDay, today: "2030-01-01" });
      total += result.events.length;
      for (const e of result.events) {
        expect(recordHeadline(e)).not.toMatch(/contributor|comparable|-day average|rolling|variation/i);
        expect(recordValueLine(e)).not.toMatch(/comparable periods/);
      }
      const lows = result.featured.filter((e) => e.tone === "unfavorable");
      expect(lows.length).toBeLessThanOrEqual(1);
      if (result.featured.some((e) => e.tone === "positive")) expect(result.featured[0].tone).toBe("positive");
    }
    const perWeek = (total / recentDays.length) * 7;
    expect(perWeek).toBeGreaterThan(1);
    expect(perWeek).toBeLessThan(7);
  }, 20000);
  it("evaluates ten years of every record metric within a small worker budget", () => {
    const ids = RECORD_SPECS.map((s) => s.metricId);
    const rows = Array.from({ length: 3650 }, (_, i) => ({
      day: shiftDay("2016-01-01", i),
      values: {
        ...Object.fromEntries(ids.map((id, j) => [id, 50 + ((i * 17 + j * 7) % 47)])),
        non_wear_time: 0,
      },
      sources: {},
    }));
    const start = performance.now();
    evaluateHighlights({ profileId: "me", observations: rows, asOfDay: rows.at(-1)!.day });
    const cold = performance.now() - start;
    const warm = performance.now();
    for (let i = 2; i < 32; i++)
      evaluateHighlights({ profileId: "me", observations: rows, asOfDay: rows.at(-i)!.day });
    expect(cold).toBeLessThan(5000);
    expect((performance.now() - warm) / 30).toBeLessThan(250);
  }, 20000);
});

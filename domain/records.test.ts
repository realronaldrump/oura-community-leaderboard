import { describe, expect, it } from "vitest";
import {
  normalizeMetricDays,
  shiftDay,
  clockMinutes,
  mainSleepSession,
  type MetricObservation,
} from "./metrics";
import {
  baselineStreaks,
  evaluateHighlights,
  RECORD_RULES,
  rollingPeriods,
  selectFeatured,
} from "./records";
import { updateSourceCoverage } from "./coverage";
const observations = (
  count: number,
  value: (i: number) => number,
  metric = "sleep_score",
): MetricObservation[] =>
  Array.from({ length: count }, (_, i) => ({
    day: shiftDay("2020-01-01", i),
    values: { [metric]: value(i) },
    sources: { [metric]: [`source-${i}`] },
  }));
const empty = () => ({
  sleep: [],
  readiness: [],
  activity: [],
  session: [],
  spo2: [],
  stress: [],
  resilience: [],
});
describe("canonical metric observations", () => {
  it("separates the main sleep, naps, deleted sessions, and record-local bedtime", () => {
    const day = "2026-08-11";
    const stats = {
      ...empty(),
      session: [
        {
          id: "main",
          day,
          type: "long_sleep" as const,
          total_sleep_duration: 27000,
          bedtime_start: "2026-08-10T23:30:00-06:00",
        },
        {
          id: "nap",
          day,
          type: "late_nap" as const,
          total_sleep_duration: 1800,
        },
        {
          id: "deleted",
          day,
          type: "deleted" as const,
          total_sleep_duration: 50000,
        },
      ],
    };
    const result = normalizeMetricDays(stats);
    expect(result).toHaveLength(1);
    expect(result[0].values).toMatchObject({
      sleep_duration: 27000,
      nap_duration: 1800,
      nap_count: 1,
      all_sleep: 28800,
      bedtime: 1410,
    });
    expect(mainSleepSession(stats.session)?.id).toBe("main");
    expect(clockMinutes("2026-08-11T00:15:00+05:30", true)).toBe(1455);
    expect(
      normalizeMetricDays(stats, {
        dataExclusionRanges: [{ id: "x", startDay: day, endDay: day }],
      }),
    ).toEqual([]);
  });
  it("keeps legitimate zeros and excludes a non-wear activity day", () => {
    const row = {
      id: "a",
      day: "2026-08-11",
      steps: 0,
      active_calories: 0,
      total_calories: 2000,
      target_calories: 300,
      contributors: {},
    };
    expect(
      normalizeMetricDays({ ...empty(), activity: [row] })[0].values.steps,
    ).toBe(0);
    expect(
      normalizeMetricDays({
        ...empty(),
        activity: [{ ...row, non_wear_time: 86400 }],
      })[0].values.steps,
    ).toBeUndefined();
  });
});
describe("general recognition engine", () => {
  it("generates thousands of eligible unique rules", () => {
    expect(RECORD_RULES.length).toBeGreaterThan(3000);
    expect(new Set(RECORD_RULES.map((r) => r.id)).size).toBe(
      RECORD_RULES.length,
    );
  });
  it("features a fifth-best score over several years, with one merged daily event", () => {
    const rows = observations(1100, (i) =>
      i < 4 ? 100 : i === 1099 ? 99 : 60 + (i % 35),
    );
    const day = rows.at(-1)!.day;
    const result = evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: day,
      today: day,
      metricIds: ["sleep_score"],
      coverage: {
        sleep: {
          startDay: "2016-01-01",
          endDay: day,
          status: "ready",
          complete: true,
        },
      },
    });
    const record = result.events.find(
      (e) => e.family === "daily" && e.direction === "high",
    )!;
    expect(record.evidence.rank).toBe(5);
    expect(record.title).toContain("5th best sleep score of all time");
    expect(record.relatedEvidence.length).toBeGreaterThan(0);
    expect(
      result.featured.some(
        (e) =>
          e.metricId === "sleep_score" &&
          e.family === "daily" &&
          e.evidence.rank === 5,
      ),
    ).toBe(true);
    expect(
      result.events.filter(
        (e) => e.family === "daily" && e.direction === "high",
      ),
    ).toHaveLength(1);
  });
  it("reports ties and incomplete history honestly and does not use future data", () => {
    const rows = observations(100, (i) => (i >= 98 ? 95 : 70 + (i % 20)));
    rows.push({
      day: shiftDay(rows.at(-1)!.day, 1),
      values: { sleep_score: 100 },
      sources: {},
    });
    const result = evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows[99].day,
    });
    const record = result.events.find(
      (e) => e.family === "daily" && e.direction === "high",
    )!;
    expect(record.evidence.rank).toBe(1);
    expect(record.evidence.tied).toBe(2);
    expect(record.title).toContain("Tied");
    expect(record.title).not.toContain("all time");
    expect(record.evidence.sampleCount).toBe(100);
  });
  it("requires complete calendar windows and breaks streaks across gaps", () => {
    const points = observations(50, (i) => (i < 40 ? 50 + (i % 20) : 95)).map(
      (o) => ({ day: o.day, value: o.values.sleep_score }),
    );
    const gapped = points.filter((_, i) => i !== 45);
    expect(
      rollingPeriods(gapped, 7, "mean").some((p) => p.day === points[49].day),
    ).toBe(false);
    expect(baselineStreaks(gapped, "high", 1).at(-1)?.value).toBe(4);
  });
  it("does not publish current-day accumulating lows or partial period achievements", () => {
    const rows = observations(
      100,
      (i) => (i === 99 ? 0 : 5000 + i * 10),
      "steps",
    );
    const result = evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows.at(-1)!.day,
    });
    expect(result.events.some((e) => e.metricId === "steps")).toBe(false);
  });
  it("keeps a genuinely unchanging history quiet and enforces feature diversity", () => {
    const rows = observations(365, () => 80);
    const result = evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows.at(-1)!.day,
    });
    expect(result.featured).toEqual([]);
    expect(selectFeatured(result.events)).toEqual([]);
  });
  it("does not call unavailable history an all-time record", () => {
    const rows = observations(100, (i) => i);
    const result = evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows.at(-1)!.day,
      coverage: {
        sleep: {
          startDay: rows[0].day,
          endDay: rows.at(-1)!.day,
          status: "failed",
          complete: true,
        },
      },
    });
    expect(result.events).toEqual([]);
  });
});
describe("scanned history coverage", () => {
  it("advances across successfully scanned empty intervals and does not certify failed intervals", () => {
    const first = updateSourceCoverage(
      undefined,
      { startDay: "2026-01-01", endDay: "2026-01-31" },
      "ready",
    );
    const older = updateSourceCoverage(
      first,
      { startDay: "2025-12-01", endDay: "2025-12-31" },
      "ready",
    );
    expect(older.startDay).toBe("2025-12-01");
    expect(older.intervals).toHaveLength(1);
    expect(older.complete).toBe(false);
    const failed = updateSourceCoverage(
      older,
      { startDay: "2016-01-01", endDay: "2025-11-30" },
      "failed",
    );
    expect(failed.complete).toBe(false);
    const complete = updateSourceCoverage(
      older,
      { startDay: "2016-01-01", endDay: "2025-11-30" },
      "ready",
    );
    expect(complete.complete).toBe(true);
  });
});

describe("record semantics and long histories", () => {
  it("does not turn a missing session duration into a zero record", () => {
    const stats = {
      ...empty(),
      session: [{ id: "s", day: "2026-01-01", type: "long_sleep" as const }],
      guidedSession: [{ id: "g", day: "2026-01-01" }],
    };
    const values = normalizeMetricDays(stats)[0].values;
    expect(values.all_sleep).toBeUndefined();
    expect(values.guided_duration).toBeUndefined();
  });
  it("keeps unfavorable shared lows unfavorable", () => {
    const rows = observations(100, (i) => (i === 99 ? 1 : 70 + (i % 20)));
    const result = evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows.at(-1)!.day,
      peers: [{ profileId: "friend", observations: rows }],
    });
    const shared = result.events.find((e) => e.family === "shared");
    expect(shared?.tone).toBe("unfavorable");
    expect(shared?.description).toContain("lowest");
  });
  it("evaluates and reuses ten years of metric history within a bounded worker budget", async () => {
    const { METRICS } = await import("./metrics");
    const rows = Array.from({ length: 3650 }, (_, i) => ({
      day: shiftDay("2016-01-01", i),
      values: Object.fromEntries(
        METRICS.filter((m) => m.recordable).map((m, j) => [
          m.id,
          50 + ((i * 17 + j * 7) % 47),
        ]),
      ),
      sources: {},
    }));
    const start = performance.now();
    evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows.at(-1)!.day,
    });
    const cold = performance.now() - start;
    const warmStart = performance.now();
    evaluateHighlights({
      profileId: "me",
      observations: rows,
      asOfDay: rows.at(-2)!.day,
    });
    expect(cold).toBeLessThan(15000);
    expect(performance.now() - warmStart).toBeLessThan(3000);
  }, 20000);
});

it("features yesterday’s completed activity record without presenting today’s partial low as a record", async () => {
  const { evaluateDailyHighlights } = await import("./records");
  const rows = observations(
    100,
    (i) => (i === 98 ? 24000 : i === 99 ? 0 : 7000 + i * 10),
    "steps",
  );
  const result = evaluateDailyHighlights({
    profileId: "me",
    observations: rows,
    asOfDay: rows[99].day,
    today: rows[99].day,
  });
  expect(
    result.featured.some(
      (e) =>
        e.metricId === "steps" &&
        e.day === rows[98].day &&
        e.description.startsWith("Yesterday"),
    ),
  ).toBe(true);
  expect(
    result.events.some((e) => e.metricId === "steps" && e.direction === "low"),
  ).toBe(false);
});

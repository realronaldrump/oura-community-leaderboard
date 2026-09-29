import { describe, expect, it } from "vitest";
import {
  normalizeMetricDays,
  clockMinutes,
  mainSleepSession,
} from "./metrics";
import { updateSourceCoverage } from "./coverage";
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
      { startDay: "2000-01-01", endDay: "2025-11-30" },
      "ready",
    );
    expect(complete.complete).toBe(true);
  });
});

describe("record semantics", () => {
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
});

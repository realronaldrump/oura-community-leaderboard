import { describe, expect, it } from "vitest";
import { shiftDay } from "./metrics";
import { RECORD_SPECS, computePersonalBests } from "./records";

const START = "2024-01-01";
describe("personal bests", () => {
  it("lists the top results with shared ranks and compares the current week, month and streak", () => {
    const count = 80;
    const observations = Array.from({ length: count }, (_, i) => ({
      day: shiftDay(START, i),
      values: { sleep_score: i === 5 || i === 6 || i >= count - 3 ? 99 : i === 20 ? 97 : 70 + (i % 10) },
      sources: {},
    }));
    const asOfDay = observations.at(-1)!.day;
    const sleep = computePersonalBests({ observations, asOfDay }).metrics.find((m) => m.metricId === "sleep_score")!;
    expect(sleep.day?.rows.map((r) => [r.rank, r.value])).toEqual([[1, 99], [1, 99], [1, 99], [1, 99], [1, 99]]);
    expect(sleep.day?.sampleCount).toBe(count);
    expect(sleep.week?.rows[0]).toMatchObject({ rank: 1, value: 79.7, startDay: START, day: "2024-01-07" });
    expect(sleep.current.find((c) => c.period === "week")).toMatchObject({
      startDay: "2024-03-18",
      day: asOfDay,
      value: 99,
      recordedDays: 3,
      wouldRank: 1,
      best: 79.7,
    });
    expect(sleep.current.find((c) => c.period === "month")).toMatchObject({ startDay: "2024-03-01", recordedDays: 20 });
    expect(sleep.current.find((c) => c.period === "streak")).toMatchObject({ value: 3, best: null });
    expect(sleep.streak?.rows[0]).toMatchObject({ value: 3, startDay: "2024-03-18" });
  });
  it("leaves out today's still-counting activity", () => {
    const observations = Array.from({ length: 40 }, (_, i) => ({
      day: shiftDay(START, i),
      values: { steps: i === 39 ? 90000 : 8000 + i },
      sources: {},
    }));
    const today = observations.at(-1)!.day;
    const steps = computePersonalBests({ observations, asOfDay: today, today }).metrics.find((m) => m.metricId === "steps")!;
    expect(steps.day?.rows[0]).toMatchObject({ value: 8038, day: shiftDay(today, -1) });
    expect(steps.day?.sampleCount).toBe(39);
  });
  it("stays small for ten years of every record metric", () => {
    const ids = RECORD_SPECS.map((s) => s.metricId);
    const observations = Array.from({ length: 3650 }, (_, i) => ({
      day: shiftDay("2016-01-01", i),
      values: Object.fromEntries(ids.map((id, j) => [id, 40 + ((i * 13 + j * 5) % 70)])),
      sources: {},
    }));
    const bests = computePersonalBests({ observations, asOfDay: observations.at(-1)!.day });
    expect(bests.metrics).toHaveLength(RECORD_SPECS.length);
    expect(JSON.stringify(bests).length).toBeLessThan(20000);
  });
});

import { describe, expect, it } from "vitest";
import { METRIC_BY_ID, dayDistance, shiftDay, type MetricObservation } from "./metrics";
import { compareRecordPriority, evaluateHighlights, formatRecordValue, rankRecordHistory, recordTitle, selectFeatured, surroundingRankings, type HighlightEvent } from "./records";

const days = (values: number[], metricId = "sleep_score") => values.map((value, i) => ({
  day: shiftDay("2025-01-01", i), values: { [metricId]: value }, sources: {},
}));
const findDaily = (rows: MetricObservation[]) => evaluateHighlights({ profileId: "me", observations: rows,
  asOfDay: rows.at(-1)!.day, today: shiftDay(rows.at(-1)!.day, 1), metricIds: ["sleep_score"]
}).events.find(e => e.family === "daily" && e.direction === "high" && e.evidence.windowDays == null)!;

describe("surrounding record rankings", () => {
  it("shows first, second, the selected third, and the following results, without future data", () => {
    const rows = days([99, 98, 96, 95, 94, ...Array.from({ length: 70 }, (_, i) => 50 + i % 20), 97]);
    const event = findDaily(rows);
    const ranked = rankRecordHistory(event, [...rows, { day: shiftDay(event.day, 1), values: { sleep_score: 100 }, sources: {} }]);
    expect(event.evidence.rank).toBe(3);
    expect(surroundingRankings(ranked).slice(0, 6).map(r => [r.rank, r.value, r.selected])).toEqual([
      [1, 99, false], [2, 98, false], [3, 97, true], [4, 96, false], [5, 95, false], [6, 94, false],
    ]);
    expect(ranked).toHaveLength(rows.length);
  });
  it("keeps competition ranks for ties and preserves lower-is-record ordering", () => {
    const rows = days([99, 98, 98, ...Array.from({ length: 60 }, (_, i) => 50 + i % 20), 98]);
    const event = findDaily(rows);
    const ranked = rankRecordHistory(event, rows);
    expect(ranked.slice(0, 4).map(r => r.rank)).toEqual([1, 2, 2, 2]);
    expect(ranked.find(r => r.selected)).toMatchObject({ rank: 2, tied: 3 });
    const reversed = rankRecordHistory({ ...event, direction: "low" }, rows);
    expect(reversed[0].value).toBe(50);
    expect(reversed.at(-1)?.value).toBe(99);
  });
  it("matches every shared evaluator, including rolling windows, calendar periods and streaks", () => {
    const end = "2026-05-31";
    const rows: MetricObservation[] = Array.from({ length: dayDistance("2025-01-01", end) + 1 }, (_, i) => ({
      day: shiftDay("2025-01-01", i), sources: {}, values: {
        sleep_score: i > 480 ? (i % 2 ? 98 : 30) : 55 + i % 31,
        steps: 1000 + i * 37 + i % 7 * 1800,
        bedtime: 1380 + (i > 480 ? i % 2 * 100 : i % 9),
      },
    }));
    const families = new Set<string>();
    for (const asOfDay of [end, "2026-05-24", "2026-04-30"]) {
      const events = evaluateHighlights({ profileId: "me", observations: rows, asOfDay, today: shiftDay(end, 1), metricIds: ["sleep_score", "steps", "bedtime"] }).events;
      for (const event of events) {
        const ranked = rankRecordHistory(event, rows);
        const selected = ranked.find(r => r.selected);
        expect(ranked.length, event.id).toBe(event.evidence.sampleCount);
        expect(selected?.rank, event.id).toBe(event.evidence.rank);
        expect(selected?.value, event.id).toBeCloseTo(event.value, 8);
        expect(ranked.every(r => r.day <= asOfDay)).toBe(true);
        if (event.evidence.windowDays) expect(ranked.every(r => r.startDay >= shiftDay(asOfDay, -event.evidence.windowDays! + 1))).toBe(true);
        families.add(event.family);
      }
    }
    for (const family of ["daily", "mean", "sum", "spread", "week", "month", "change"])
      expect(families.has(family), family).toBe(true);
  });
  it("counts each streak once and highlights the current run among completed runs", () => {
    const rows = days([0,100,100,100,0,100,100,100,100,0,100,100,100,100,100,0,100,100,100,100,100,100], "activity_goal_percent");
    const day = rows.at(-1)!.day;
    const event = evaluateHighlights({ profileId: "me", observations: rows, asOfDay: day, today: shiftDay(day, 1), metricIds: ["activity_goal_percent"] }).events.find(e => e.family === "streak" && e.direction === "high" && e.evidence.windowDays == null)!;
    expect(event).toBeDefined();
    const ranked = rankRecordHistory(event, rows);
    expect(ranked.map(r => r.value)).toEqual([6,5,4,3]);
    expect(ranked[0]).toMatchObject({ rank: 1, selected: true, threshold: 100 });
  });
  it("ranks friend gaps only on eligible matched dates, and shared events by personal results", () => {
    for (const close of [false, true]) {
      const own = days([...Array.from({ length: 80 }, (_, i) => (close ? 85 : 60) + i % 5), 99]);
      const peer = days([...Array.from({ length: 80 }, () => close ? 70 : 80), close ? 98 : 80]);
      peer.splice(10, 1);
      const events = evaluateHighlights({ profileId: "me", observations: own, peers: [{ profileId: "peer", observations: peer }],
        asOfDay: own.at(-1)!.day, metricIds: ["sleep_score"] }).events;
      const friend = events.find(e => e.family === (close ? "friend_close" : "friend_lead"))!;
      expect(friend).toBeDefined();
      const ranked = rankRecordHistory(friend, own, peer);
      expect(ranked).toHaveLength(peer.length);
      expect(ranked.find(r => r.selected)?.rank).toBe(friend.evidence.rank);
      const shared = events.find(e => e.family === "shared");
      if (shared) expect(rankRecordHistory(shared, own, peer).find(r => r.selected)?.rank).toBe(shared.evidence.rank);
    }
  });
});

describe("intuitive record priority and wording", () => {
  it("keeps even a higher-scoring contributor spread below clear outcomes and out of featured slots", () => {
    const base = findDaily(days([...Array.from({ length: 80 }, (_, i) => 50 + i % 20), 99]));
    const variance = { ...base, id: "variance", metricId: "sleep_restfulness", family: "spread", score: 100 } as HighlightEvent;
    const daily = { ...base, score: 70 };
    const bedtime = { ...base, id: "clock", metricId: "bedtime", family: "spread", direction: "low", score: 90 } as HighlightEvent;
    expect([variance, daily, bedtime].sort(compareRecordPriority).map(e => e.id)).toEqual([bedtime.id, daily.id, variance.id]);
    expect(selectFeatured([variance, daily, bedtime]).map(e => e.id)).toEqual([bedtime.id, daily.id]);
    expect(recordTitle(bedtime).toLowerCase()).toContain("most consistent bedtimes");
    expect(formatRecordValue(METRIC_BY_ID.bedtime, 15, "spread")).toBe("15m");
    expect(formatRecordValue(METRIC_BY_ID.sleep_score, 83.4285714, "mean")).toBe("83.4");
    expect(formatRecordValue(METRIC_BY_ID.hrv, 6, "streak")).toBe("6 days");
  });
});

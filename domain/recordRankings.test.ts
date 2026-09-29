import { describe, expect, it } from "vitest";
import { dayDistance, shiftDay, type MetricObservation } from "./metrics";
import {
  compareRecordPriority,
  evaluateHighlights,
  rankRecordHistory,
  recordScore,
  surroundingRankings,
  type HighlightEvent,
} from "./records";
import { rankLabel } from "./recordCopy";

const days = (values: number[], metricId = "sleep_score") => values.map((value, i) => ({
  day: shiftDay("2025-01-01", i), values: { [metricId]: value }, sources: {},
}));
const findDaily = (rows: MetricObservation[]) => evaluateHighlights({ profileId: "me", observations: rows,
  asOfDay: rows.at(-1)!.day, today: shiftDay(rows.at(-1)!.day, 1), metricIds: ["sleep_score"]
}).events.find(e => e.period === "day" && e.kind !== "shared")!;

describe("surrounding record rankings", () => {
  it("shows first, second, the selected third, and the following results, without future data", () => {
    const rows = days([99, 98, 96, 95, 94, ...Array.from({ length: 70 }, (_, i) => 50 + i % 20), 97]);
    const event = findDaily(rows);
    const ranked = rankRecordHistory(event, [...rows, { day: shiftDay(event.day, 1), values: { sleep_score: 100 }, sources: {} }]);
    expect(event).toMatchObject({ kind: "top3", evidence: { rank: 3 } });
    expect(surroundingRankings(ranked).slice(0, 6).map(r => [r.rank, r.value, r.selected])).toEqual([
      [1, 99, false], [2, 98, false], [3, 97, true], [4, 96, false], [5, 95, false], [6, 94, false],
    ]);
    expect(ranked).toHaveLength(rows.length);
    expect(rankLabel(event)).toBe("#3 of 76 nights");
  });
  it("keeps competition ranks for ties and preserves lower-is-better ordering", () => {
    const rows = days([99, 98, 98, ...Array.from({ length: 60 }, (_, i) => 50 + i % 20), 98]);
    const event = findDaily(rows);
    expect(event).toMatchObject({ kind: "top3", evidence: { rank: 2, tied: 3 } });
    const ranked = rankRecordHistory(event, rows);
    expect(ranked.slice(0, 4).map(r => r.rank)).toEqual([1, 2, 2, 2]);
    expect(ranked.find(r => r.selected)).toMatchObject({ rank: 2, tied: 3 });
    const reversed = rankRecordHistory({ ...event, direction: "low" }, rows);
    expect(reversed[0].value).toBe(50);
    expect(reversed.at(-1)?.value).toBe(99);
  });
  it("matches the evaluator for days, weeks, months, streaks and lows, including a week missing its Sunday", () => {
    const end = "2026-05-31";
    const total = dayDistance("2024-06-01", end) + 1;
    const recent = total - 130;
    const missingSunday = "2026-04-26";
    const rows: MetricObservation[] = Array.from({ length: total }, (_, i) => {
      const day = shiftDay("2024-06-01", i);
      const values: Record<string, number> = {
        sleep_score: i >= total - 25 ? 90 + i % 5 : i >= recent ? 70 + (i * 7) % 30 : 60 + (i * 7) % 25,
        steps: 6000 + (i * 37) % 3000 + (i >= total - 60 ? 4000 : 0),
        lowest_hr: i === total - 40 ? 70 : 50 + (i * 3) % 8,
        workout_count: (i >= total - 50 && i < total - 43) ? 0 : i % 2,
        non_wear_time: 0,
      };
      if (day >= shiftDay(missingSunday, -6) && day < missingSunday) values.sleep_score = 99;
      if (day === missingSunday) delete values.sleep_score;
      return { day, values, sources: {} };
    });
    const periods = new Set<string>(), tones = new Set<string>();
    let sundayWeek = false;
    for (let i = 90; i >= 1; i--) {
      const asOfDay = rows.at(-i)!.day;
      const events = evaluateHighlights({ profileId: "me", observations: rows, asOfDay, today: shiftDay(end, 1),
        metricIds: ["sleep_score", "steps", "lowest_hr", "workout_count"] }).events;
      for (const event of events) {
        const ranked = rankRecordHistory(event, rows.filter(o => o.day <= event.day));
        const selected = ranked.find(r => r.selected);
        expect(ranked.length, event.id).toBe(event.evidence.sampleCount);
        expect(selected?.rank, event.id).toBe(event.evidence.rank);
        expect(selected?.value, event.id).toBeCloseTo(event.value, 8);
        expect(rankRecordHistory(event, rows)).toEqual(ranked);
        for (let j = 1; j < ranked.length; j++)
          if (event.period !== "day" && event.period !== "streak")
            expect(ranked.filter(r => r.startDay <= ranked[j].day && r.day >= ranked[j].startDay), event.id).toHaveLength(1);
        periods.add(event.period!);
        tones.add(event.tone);
        if (event.period === "week" && event.day === missingSunday && event.metricId === "sleep_score") sundayWeek = true;
      }
    }
    for (const period of ["day", "week", "month", "streak"]) expect(periods.has(period), period).toBe(true);
    expect(tones.has("unfavorable")).toBe(true);
    expect(sundayWeek).toBe(true);
  });
  it("counts each streak once and highlights the current run among completed runs", () => {
    const rows = days([...Array(30).fill(0), 0,100,100,100,0,100,100,100,100,0,100,100,100,100,100,0,100,100,100,100,100,100], "activity_goal_percent");
    const day = rows.at(-1)!.day;
    const event = evaluateHighlights({ profileId: "me", observations: rows, asOfDay: day, today: shiftDay(day, 1), metricIds: ["activity_goal_percent"] })
      .events.find(e => e.period === "streak")!;
    expect(event).toMatchObject({ kind: "streak_record", value: 6 });
    const ranked = rankRecordHistory(event, rows);
    expect(ranked.map(r => r.value)).toEqual([6,5,4,3]);
    expect(ranked[0]).toMatchObject({ rank: 1, selected: true, threshold: 100 });
  });
  it("ranks friend gaps only on matched dates, and shared records by personal results", () => {
    for (const close of [false, true]) {
      const own = days([...Array.from({ length: 80 }, (_, i) => (close ? 85 : 60) + i % 5), 99]);
      const peer = days([...Array.from({ length: 80 }, () => close ? 70 : 80), close ? 98 : 80]);
      peer.splice(10, 1);
      const events = evaluateHighlights({ profileId: "me", observations: own, peers: [{ profileId: "peer", observations: peer }],
        asOfDay: own.at(-1)!.day, metricIds: ["sleep_score"] }).events;
      const friend = events.find(e => e.kind === (close ? "friend_close" : "friend_lead"))!;
      expect(friend).toBeDefined();
      const ranked = rankRecordHistory(friend, own, peer);
      expect(ranked).toHaveLength(peer.length);
      expect(ranked.find(r => r.selected)?.rank).toBe(friend.evidence.rank);
      const shared = events.find(e => e.kind === "shared");
      if (shared) expect(rankRecordHistory(shared, own, peer).find(r => r.selected)?.rank).toBe(shared.evidence.rank);
    }
  });
  it("never builds a shared record from a low", () => {
    const rows = days(Array.from({ length: 100 }, (_, i) => (i === 99 ? 1 : 70 + (i % 20))));
    const events = evaluateHighlights({ profileId: "me", observations: rows, asOfDay: rows.at(-1)!.day,
      peers: [{ profileId: "friend", observations: rows }] }).events;
    expect(events.find(e => e.kind === "worst")).toBeDefined();
    expect(events.some(e => e.kind === "shared")).toBe(false);
  });
  it("returns no ranking for archived records-1 events rather than a contradictory one", () => {
    const rows = days(Array.from({ length: 100 }, (_, i) => 50 + i % 40));
    const legacy = { ...findDaily(days([...rows.map(r => r.values.sleep_score), 99])), kind: undefined, family: "mean" } as HighlightEvent;
    expect(rankRecordHistory(legacy, rows)).toEqual([]);
  });
});

describe("record priority", () => {
  it("puts personal bests ahead of streaks, top results, milestones, the best in a while, and lows", () => {
    const order = (["worst", "best_since", "streak_milestone", "top3", "streak_record", "personal_best"] as const)
      .map(kind => ({ id: kind, metricId: "sleep_score", score: recordScore(kind, "day", 0) }) as HighlightEvent)
      .sort(compareRecordPriority).map(e => e.id);
    expect(order).toEqual(["personal_best", "streak_record", "top3", "streak_milestone", "best_since", "worst"]);
    expect(recordScore("personal_best", "month", 0)).toBeGreaterThan(recordScore("personal_best", "day", 0));
    expect(recordScore("worst", "month", 100, 50)).toBeLessThan(recordScore("best_since", "day", 0));
  });
});

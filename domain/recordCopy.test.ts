import { describe, expect, it } from "vitest";
import type { HighlightEvent } from "./records";
import {
  everLabel,
  gapLabel,
  periodLabel,
  rankLabel,
  recordContext,
  recordEyebrow,
  recordHeadline,
  recordValueLine,
} from "./recordCopy";

const base: HighlightEvent = {
  id: "me:hrv:day:2026-09-29",
  profileId: "me",
  metricId: "hrv",
  category: "body",
  family: "daily",
  kind: "best_since",
  period: "day",
  direction: "high",
  tone: "positive",
  day: "2026-09-29",
  startDay: "2026-09-29",
  value: 68,
  unit: "ms",
  title: "stored",
  description: "stored description",
  score: 310,
  evidence: {
    windowDays: null,
    coverageStart: "2023-01-01",
    completeHistory: true,
    rank: 14,
    tied: 1,
    sampleCount: 1200,
    baseline: 52,
    difference: 16,
    lastAsExtreme: { value: 70, day: "2026-02-12", startDay: "2026-02-12" },
    usual: { value: 52, count: 88 },
  },
  relatedEvidence: [],
  sourceIds: [],
  revision: "r",
  provisional: false,
  detailPath: "/metrics/hrv",
};

describe("record wording", () => {
  it("describes gaps, coverage and periods in plain language", () => {
    expect([1, 7, 30, 55, 90, 229, 729, 730, 1100].map(gapLabel)).toEqual([
      "1 day", "7 days", "4 weeks", "8 weeks", "3 months", "8 months", "24 months", "2 years", "3 years",
    ]);
    expect(everLabel({ completeHistory: true, coverageStart: "2023-01-01" }, "2026-09-29")).toBe("ever");
    expect(everLabel({ completeHistory: true, coverageStart: "2026-01-01" }, "2026-09-29")).toBe("since you started");
    expect(everLabel({ completeHistory: false, coverageStart: "2024-03-10" }, "2026-09-29")).toBe("since Mar 2024");
    expect(periodLabel("week", "2026-09-21", "2026-09-27")).toBe("Week of Sep 21–27, 2026");
    expect(periodLabel("week", "2026-08-31", "2026-09-06", false)).toBe("Week of Aug 31 – Sep 6");
    expect(periodLabel("week", "2025-12-29", "2026-01-04")).toBe("Week of Dec 29, 2025 – Jan 4, 2026");
    expect(periodLabel("month", "2026-09-01", "2026-09-30")).toBe("September 2026");
    expect(periodLabel("day", "2026-09-29", "2026-09-29")).toBe("Sep 29, 2026");
  });
  it("says what happened, how it compares, and when", () => {
    expect(recordHeadline(base)).toBe("Highest HRV in 8 months");
    expect(recordValueLine(base)).toBe("68 ms · usually 52 ms");
    expect(recordEyebrow(base)).toEqual({ label: "Best in a while", icon: "sparkles" });
    expect(rankLabel(base)).toBe("#14 of 1,200 nights");
    expect(recordContext(base)).toBeNull();
    expect(recordContext(base, "2026-09-30")).toBe("Yesterday");
    const week: HighlightEvent = {
      ...base,
      metricId: "sleep_score",
      kind: "personal_best",
      period: "week",
      family: "week",
      startDay: "2026-09-21",
      day: "2026-09-27",
      value: 86.4,
      evidence: { ...base.evidence, rank: 1, sampleCount: 142, previousRecord: { value: 84.1, day: "2025-03-09", startDay: "2025-03-03" } },
    };
    expect(recordHeadline(week)).toBe("Best weekly sleep score ever");
    expect(recordValueLine(week)).toBe("Averaged 86.4 · previous best 84.1 (week of Mar 3, 2025)");
    expect(recordContext(week)).toBe("Week of Sep 21–27");
    expect(rankLabel(week)).toBe("#1 of 142 weeks");
    const steps: HighlightEvent = { ...week, metricId: "steps", value: 11240, kind: "top3", evidence: { ...week.evidence, rank: 2, previousRecord: { value: 12010, day: "2025-03-09", startDay: "2025-03-03" } } };
    expect(recordHeadline(steps)).toBe("2nd most weekly steps ever");
    expect(recordValueLine(steps)).toBe("Averaged 11,240 steps a day · your best is 12,010 (week of Mar 3, 2025)");
    const heart: HighlightEvent = { ...base, metricId: "lowest_hr", kind: "worst", direction: "high", tone: "unfavorable", value: 58, evidence: { ...base.evidence, rank: 1, usual: { value: 51, count: 80 } } };
    expect(recordHeadline(heart)).toBe("Highest resting heart rate in 8 months");
    expect(recordEyebrow(heart).label).toBe("Worth noticing");
    expect(rankLabel(heart)).toBe("#1 highest of 1,200 nights");
    const streak: HighlightEvent = { ...base, metricId: "steps", kind: "streak_record", period: "streak", family: "streak", value: 12, startDay: "2026-09-18", evidence: { ...base.evidence, previousRecord: { value: 9, day: "2025-03-20", startDay: "2025-03-12" } } };
    expect(recordHeadline(streak)).toBe("New longest streak: 12 days with 10,000+ steps");
    expect(recordValueLine(streak)).toBe("Previous longest 9 (Mar 2025)");
    expect(recordContext(streak)).toBe("Since Sep 18");
  });
  it("names the friend in friend records, with a sensible fallback", () => {
    const run: HighlightEvent = { ...base, metricId: "steps", family: "friend_streak", kind: "friend_streak", period: "streak", tone: "neutral", value: 7, startDay: "2026-09-23", peerId: "p", peerName: "Sam", evidence: { ...base.evidence, rank: 1, sampleCount: 6, previousRecord: { value: 9, day: "2025-05-10", startDay: "2025-05-02" } } };
    expect(recordHeadline(run)).toBe("You out-stepped Sam 7 days in a row");
    expect(recordValueLine(run)).toBe("Your longest run is 9");
    expect(recordEyebrow(run)).toEqual({ label: "You vs Sam", icon: "users" });
    expect(rankLabel(run)).toBe("#1 of 6 winning runs");
    expect(recordContext(run)).toBe("Since Sep 23");
    expect(recordHeadline({ ...run, peerName: undefined })).toBe("You out-stepped your friend 7 days in a row");
    expect(recordHeadline({ ...run, metricId: "readiness_score", value: 5, evidence: { ...run.evidence, previousRecord: null } }, "Alex"))
      .toBe("New longest run: you beat Alex’s readiness 5 days in a row");
  });
  it("shows archived records-1 events exactly as they were stored", () => {
    const legacy = { ...base, kind: undefined, title: "Best 30-day average sleep score of all time", description: "79 · 477 comparable periods", evidence: { ...base.evidence, rank: 1 } };
    expect(recordHeadline(legacy)).toBe("Best 30-day average sleep score");
    expect(recordValueLine(legacy)).toBe("79 · 477 comparable periods");
    expect(recordContext(legacy)).toBe("of all time");
    expect(recordEyebrow(legacy).label).toBe("A new record");
  });
});

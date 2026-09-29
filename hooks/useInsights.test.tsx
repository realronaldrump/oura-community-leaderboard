import React from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInsights } from "./useInsights";
import { readInsightSummary, readRecordDay, subscribeInsights, type PublishedInsights } from "../services/insightsService";
import { evaluateHighlights, RULES_VERSION, type HighlightEvent } from "../domain/records";
import { shiftDay } from "../domain/metrics";

vi.mock("../services/insightsService", () => ({
  readInsightSummary: vi.fn(),
  readRecordDay: vi.fn(),
  subscribeInsights: vi.fn(),
}));

const profile = { id: "me" };
const recordDay = "2026-09-27";
const today = "2026-09-29";
const observations = Array.from({ length: 400 }, (_, i) => ({
  day: shiftDay(recordDay, i - 399),
  values: { sleep_score: i === 399 ? 99 : 60 + (i % 30) },
  sources: {},
}));
const best = evaluateHighlights({
  profileId: profile.id,
  observations,
  asOfDay: recordDay,
  today,
}).events.find((event) => event.period === "day" && event.kind === "personal_best")!;
const summary = (overrides: Partial<PublishedInsights> = {}): PublishedInsights => ({
  profileId: profile.id,
  day: today,
  generatedAt: "",
  rulesVersion: RULES_VERSION,
  revision: "r",
  exclusions: "[]",
  generation: "g",
  status: "ready",
  featured: [],
  recent: [best],
  coverage: {},
  months: {},
  archiveBefore: null,
  archiveIndex: "archive-a",
  ...overrides,
});
const clients: QueryClient[] = [];
const show = (day = recordDay, value = summary()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(["insights", profile.id], value);
  return renderHook(({ selectedDay }) => useInsights(profile, [profile], selectedDay), {
    initialProps: { selectedDay: day },
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readInsightSummary).mockResolvedValue(summary());
  vi.mocked(readRecordDay).mockResolvedValue([best]);
  vi.mocked(subscribeInsights).mockReturnValue(() => undefined);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("selected-day highlights", () => {
  it("loads saved records for a past day even when today's featured list is empty", async () => {
    const { result } = show();
    await waitFor(() => expect(result.current.highlights).toEqual([best]));
    expect(readRecordDay).toHaveBeenCalledWith(profile.id, "archive-a", recordDay);
  });

  it("preserves today's server-selected highlights without reading the archive", () => {
    const { result } = show(today, summary({ featured: [best] }));
    expect(result.current.highlights).toEqual([best]);
    expect(readRecordDay).not.toHaveBeenCalled();
  });

  it("applies the same peer and legacy-record exclusions to historical cards", async () => {
    const friend = { ...best, id: "friend", metricId: "steps", family: "friend_lead", kind: "friend_lead", peerId: "removed-peer" } as HighlightEvent;
    const legacy = { ...best, id: "legacy", metricId: "readiness_sleep_regularity", kind: undefined, family: "mean" } as HighlightEvent;
    vi.mocked(readRecordDay).mockResolvedValue([friend, legacy, best]);
    const { result } = show();
    await waitFor(() => expect(result.current.highlights).toEqual([best]));
  });

  it("keeps unfinished archive dates pending instead of reporting a quiet day", () => {
    const { result } = show(recordDay, summary({ archiveBefore: recordDay }));
    expect(result.current.highlightsPending).toBe(true);
    expect(readRecordDay).not.toHaveBeenCalled();
  });

  it("reports a failed day lookup and never reuses another day's cards", async () => {
    const { result, rerender } = show();
    await waitFor(() => expect(result.current.highlights).toEqual([best]));
    vi.mocked(readRecordDay).mockRejectedValue(new Error("offline"));
    rerender({ selectedDay: "2026-09-26" });
    await waitFor(() => expect(result.current.highlightsError).toBe(true));
    expect(result.current.highlights).toEqual([]);
  });
});

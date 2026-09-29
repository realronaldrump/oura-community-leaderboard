import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecordsView from "./RecordsView";
import HighlightCard from "./HighlightCard";
import { readRecordPage } from "../../services/insightsService";
import { shiftDay } from "../../domain/metrics";
import {
  RULES_VERSION,
  computePersonalBests,
  evaluateHighlights,
  type HighlightEvent,
} from "../../domain/records";
import type { PublishedInsights } from "../../services/insightsService";

vi.mock("../../services/insightsService", () => ({
  readRecordPage: vi.fn(),
  readRecordEvent: vi.fn(),
  readRecordRankings: vi.fn(),
}));
vi.mock("./MetricDetail", () => ({ RecordEvidenceSheet: () => null }));

const observations = Array.from({ length: 400 }, (_, i) => ({
  day: shiftDay("2024-01-01", i),
  values: { sleep_score: i === 399 ? 99 : 60 + (i % 35), hrv: i === 399 ? 20 : 50 + (i % 10) },
  sources: {},
}));
const day = observations.at(-1)!.day;
const scanned = { startDay: "2000-01-01", endDay: day, status: "ready" as const, complete: true };
const coverage = { sleep: scanned, session: scanned };
const events = evaluateHighlights({ profileId: "me", observations, asOfDay: day, today: day, coverage }).events;
const best = events.find((e) => e.metricId === "sleep_score" && e.period === "day")!;
const low = events.find((e) => e.metricId === "hrv" && e.period === "day")!;
const legacy = {
  ...best,
  id: `me:sleep_regularity:mean:30:high:${day}`,
  metricId: "readiness_sleep_regularity",
  kind: undefined,
  period: undefined,
  family: "mean",
  title: "Best 30-day average sleep regularity contributor of all time",
} as HighlightEvent;
const summary = (overrides: Partial<PublishedInsights> = {}): PublishedInsights => ({
  profileId: "me",
  day,
  generatedAt: "",
  rulesVersion: RULES_VERSION,
  revision: "r",
  exclusions: "[]",
  generation: "g",
  status: "ready",
  featured: [best],
  recent: [best, low, legacy],
  coverage: {},
  months: {},
  archiveBefore: null,
  archiveIndex: "index",
  personalBests: computePersonalBests({ observations, asOfDay: day, coverage }),
  ...overrides,
});
const show = (value: PublishedInsights) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecordsView summary={value} profileId="me" />
    </QueryClientProvider>,
  );
beforeEach(() => {
  window.history.replaceState(null, "", "/records");
  vi.mocked(readRecordPage).mockResolvedValue({ events: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Records tab", () => {
  it("opens with your bests and plain-language records, hiding archived rolling-window results", async () => {
    show(summary());
    expect(best).toMatchObject({ kind: "personal_best" });
    expect(low).toMatchObject({ kind: "worst" });
    const bests = screen.getByRole("region", { name: "Your bests" });
    const tile = within(bests).getByRole("button", { name: /^Sleep score: 99/ });
    expect(screen.getByRole("heading", { name: "Best sleep score ever" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lowest HRV ever" })).toBeInTheDocument();
    expect(screen.queryByText(/sleep regularity contributor/)).toBeNull();
    fireEvent.click(tile);
    const sheet = await screen.findByRole("dialog", { name: "Sleep score: your bests" });
    expect(within(sheet).getByRole("heading", { name: "Top nights" })).toBeInTheDocument();
    expect(within(sheet).getAllByRole("list", { name: "Top nights" })[0].querySelectorAll("li")).toHaveLength(5);
  });
  it("filters by the kind of record", () => {
    show(summary());
    fireEvent.click(screen.getByRole("button", { name: "Worth noticing" }));
    expect(screen.queryByRole("heading", { name: "Best sleep score ever" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Lowest HRV ever" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your bests" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Bests" }));
    expect(screen.getByRole("heading", { name: "Best sleep score ever" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Lowest HRV ever" })).toBeNull();
  });
  it("says when records are being refreshed under new rules", () => {
    show(summary({ rulesVersion: "records-1", personalBests: undefined, recent: [legacy] }));
    expect(screen.getByText(/Your records are being refreshed/)).toBeInTheDocument();
    expect(screen.queryByText(/contributor/)).toBeNull();
  });
});

describe("record cards", () => {
  it("labels the kind of record and a finished yesterday", () => {
    render(<HighlightCard event={low} relativeTo={shiftDay(day, 1)} onClick={() => {}} />);
    expect(screen.getByText("Worth noticing")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    cleanup();
    render(<HighlightCard event={best} hero onClick={() => {}} />);
    expect(screen.getByText("Personal best")).toBeInTheDocument();
    expect(screen.getByText("#1 of 400 nights")).toBeInTheDocument();
  });
});

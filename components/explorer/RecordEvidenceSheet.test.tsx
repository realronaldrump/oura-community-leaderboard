import React from "react";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import RecordEvidenceSheet from "./RecordEvidenceSheet";
import { readRecordRankings } from "../../services/insightsService";
import { evaluateHighlights, rankRecordHistory, surroundingRankings } from "../../domain/records";
import { shiftDay } from "../../domain/metrics";
vi.mock("../../services/insightsService", () => ({ readRecordRankings: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const observations = Array.from({ length: 50 }, (_, i) => ({ day: shiftDay("2025-01-01", i), values: { sleep_score: i === 49 ? 97 : i === 0 ? 99 : i === 1 ? 98 : 50 + i % 40 }, sources: {} }));
const event = evaluateHighlights({ profileId: "me", observations, asOfDay: observations.at(-1)!.day, metricIds: ["sleep_score"] }).events.find(e => e.family === "daily" && e.direction === "high" && e.evidence.windowDays == null)!;
const rows = rankRecordHistory(event, observations);
const setup = (open = true) => {
  const explore = vi.fn(), close = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecordEvidenceSheet event={open ? event : null} onClose={close} onExplore={explore} /></QueryClientProvider>);
  return { explore, close };
};
it("does not load rankings before a record is opened", () => {
  setup(false);
  expect(readRecordRankings).not.toHaveBeenCalled();
});
it("shows the selected rank, browses more results, and preserves an explicit detail destination", async () => {
  vi.mocked(readRecordRankings).mockImplementation(async (_profile, _event, page) => ({ event, revision: "published", total: rows.length,
    nearby: surroundingRankings(rows), rows: rows.slice(page.offset, page.offset + 20), nextOffset: page.offset + 20 < rows.length ? page.offset + 20 : null }));
  const { explore, close } = setup();
  await screen.findByText("This record");
  const list = screen.getByRole("list", { name: "Historical rankings" });
  expect(within(list).getAllByRole("button")).toHaveLength(6);
  const selected = list.querySelector<HTMLButtonElement>('[aria-current="true"]')!;
  expect(selected.textContent).toContain("#3");
  expect(selected.textContent).toContain("97");
  fireEvent.click(screen.getByRole("button", { name: "Browse all 50 results" }));
  expect(within(list).getAllByRole("button")).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: "Show more rankings" }));
  await waitFor(() => expect(within(list).getAllByRole("button")).toHaveLength(40));
  expect(readRecordRankings).toHaveBeenLastCalledWith("me", event.id, { offset: 20, revision: "published" }, expect.any(AbortSignal));
  fireEvent.click(selected);
  expect(explore).toHaveBeenCalledWith(expect.stringContaining(`day=${event.day}`));
  expect(close).not.toHaveBeenCalled();
});
it("offers an honest retry when matching history is being rebuilt", async () => {
  vi.mocked(readRecordRankings).mockRejectedValue(Object.assign(new Error("rankings_preparing"), { code: "rankings_preparing" }));
  setup();
  const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
  expect(alert).toHaveTextContent("Your history is being updated");
  expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
});

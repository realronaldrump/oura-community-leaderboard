import { describe, expect, it } from "vitest";
import { canonicalDestination, navigate } from "./useAppRoute";
describe("mobile navigation compatibility", () => {
  it("redirects old entry points into their canonical destination and preserves context", () => {
    expect(canonicalDestination("/leaderboard?day=2026-09-01")).toBe(
      "/friends?day=2026-09-01",
    );
    expect(
      canonicalDestination("/leaderboard/compete?competitionInvite=abc"),
    ).toBe("/friends/challenges?competitionInvite=abc");
    expect(canonicalDestination("/trends/streaks")).toBe("/records");
    expect(canonicalDestination("/more/export")).toBe("/settings/export");
    expect(canonicalDestination("/trends/insights?insight=rhythm")).toBe(
      "/metrics/bedtime",
    );
  });
  it("stores the return destination and scrolling context for detail navigation", () => {
    window.history.replaceState({}, "", "/friends?day=2026-09-01");
    navigate("/metrics/sleep_score?profile=friend&day=2026-09-01");
    expect(window.history.state.returnTo).toBe("/friends?day=2026-09-01");
    expect(window.location.pathname).toBe("/metrics/sleep_score");
  });
});

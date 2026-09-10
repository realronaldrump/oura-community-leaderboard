import { useEffect, useState } from "react";
const current = () => window.location.pathname + window.location.search;
export function canonicalDestination(destination: string): string {
  const url = new URL(destination, window.location.origin);
  const aliases: Record<string, string> = {
    "/leaderboard": "/friends",
    "/leaderboard/compete": "/friends/challenges",
    "/more": "/settings",
    "/more/export": "/settings/export",
    "/trends/streaks": "/records",
  };
  if (url.pathname === "/trends/insights") {
    const tool = url.searchParams.get("insight");
    url.pathname =
      tool === "rhythm"
        ? "/metrics/bedtime"
        : tool === "timeline" || tool === "snapshot"
          ? "/"
          : tool === "milestones" || tool === "patterns"
            ? "/records"
            : tool === "correlation"
              ? "/metrics/sleep_score"
              : "/trends";
    if (tool === "timeline") url.searchParams.set("detail", "day");
    if (tool === "correlation") url.searchParams.set("relationships", "1");
    url.searchParams.delete("insight");
  } else url.pathname = aliases[url.pathname] || url.pathname;
  return url.pathname + url.search;
}
export const navigate = (destination: string, replace = false) => {
  const path = canonicalDestination(destination);
  window.history.replaceState(
    { ...window.history.state, scrollY: window.scrollY },
    "",
    current(),
  );
  if (replace) window.history.replaceState({ app: true, scrollY: 0 }, "", path);
  else
    window.history.pushState(
      { app: true, returnTo: current(), scrollY: 0 },
      "",
      path,
    );
  window.dispatchEvent(new PopStateEvent("popstate"));
};
export const goBack = (fallback = "/") => {
  if (window.history.state?.returnTo) window.history.back();
  else navigate(fallback, true);
};
export function useAppRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const canonical = canonicalDestination(current());
    if (canonical !== current()) {
      window.history.replaceState(window.history.state, "", canonical);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    const update = () => {
      setRoute(current());
      requestAnimationFrame(() =>
        window.scrollTo({
          top: window.history.state?.scrollY || 0,
          behavior: "instant",
        }),
      );
    };
    window.addEventListener("popstate", update);
    update();
    return () => window.removeEventListener("popstate", update);
  }, []);
  return new URL(route, window.location.origin);
}

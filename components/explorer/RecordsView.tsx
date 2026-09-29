import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search, Sparkles, X } from "lucide-react";
import { Button } from "../ui";
import { METRIC_BY_ID, CATEGORIES } from "../../domain/metrics";
import {
  RECORD_SPECS,
  RECORD_SPEC_BY_ID,
  RULES_VERSION,
  compareRecordPriority,
  isFriendRecord,
  isPresentableRecord,
  type HighlightEvent,
} from "../../domain/records";
import { recordHeadline, shortDate } from "../../domain/recordCopy";
import {
  readRecordPage,
  readRecordEvent,
  type PublishedInsights,
} from "../../services/insightsService";
import { goBack, navigate } from "../../hooks/useAppRoute";
import HighlightCard from "./HighlightCard";
import TrophyCase from "./TrophyCase";
import PersonalBestsSheet from "./PersonalBestsSheet";
import { RecordEvidenceSheet } from "./MetricDetail";

const FILTERS = [
  ["all", "All"],
  ["bests", "Bests"],
  ["streaks", "Streaks"],
  ["lows", "Worth noticing"],
  ["friends", "Friends"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const matchesFilter = (e: HighlightEvent, filter: Filter) => {
  switch (filter) {
    case "bests":
      return e.tone === "positive" && !isFriendRecord(e) && e.family !== "streak";
    case "streaks":
      return e.family === "streak";
    case "lows":
      return e.tone === "unfavorable";
    case "friends":
      return isFriendRecord(e);
    default:
      return true;
  }
};
const metricText = (metricId: string) => {
  const m = METRIC_BY_ID[metricId];
  return `${RECORD_SPEC_BY_ID[metricId]?.name || ""} ${m?.label || ""} ${m ? CATEGORIES[m.category] : ""}`.toLowerCase();
};
export default function RecordsView({
  summary,
  profileId,
}: {
  summary: PublishedInsights | null;
  profileId: string;
}) {
  const initialMetric = new URLSearchParams(window.location.search).get("metric") || "";
  const [metric, setMetric] = useState(RECORD_SPEC_BY_ID[initialMetric] ? initialMetric : "");
  const [visibleCount, setVisibleCount] = useState(20);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [event, setEvent] = useState<HighlightEvent | null>(null);
  const [bestsFor, setBestsFor] = useState<string | null>(null);
  const eventId = window.location.pathname.startsWith("/records/")
    ? decodeURIComponent(window.location.pathname.slice("/records/".length))
    : null;
  const linked = useQuery({
    queryKey: ["record", profileId, summary?.archiveIndex, eventId],
    queryFn: () => readRecordEvent(profileId, summary!.archiveIndex, eventId!),
    enabled: Boolean(summary?.archiveIndex && eventId),
  });
  useEffect(() => {
    if (eventId)
      setEvent(
        (summary?.recent || []).find((e) => e.id === eventId) ||
          linked.data ||
          null,
      );
    else setEvent(null);
  }, [eventId, summary, linked.data]);
  const querySearch = useDeferredValue(search).trim().toLowerCase();
  const metricIds = metric
    ? [metric]
    : querySearch
      ? RECORD_SPECS.filter((s) => metricText(s.metricId).includes(querySearch)).map((s) => s.metricId)
      : [];
  const records = useInfiniteQuery({
    queryKey: [
      "records",
      profileId,
      summary?.generation,
      summary?.archiveIndex,
      metricIds.join(","),
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      readRecordPage(profileId, summary!.archiveIndex, pageParam, metricIds),
    getNextPageParam: (page) => page.cursor,
    enabled: Boolean(summary?.archiveIndex),
    staleTime: 60_000,
  });
  const events = useMemo(
    () =>
      [
        ...new Map(
          [
            ...(summary?.recent || []),
            ...(records.data?.pages.flatMap((p) => p.events) || []),
          ].map((e) => [e.id, e]),
        ).values(),
      ]
        .filter(
          (e) =>
            isPresentableRecord(e) &&
            (!metric || e.metricId === metric) &&
            matchesFilter(e, filter) &&
            `${recordHeadline(e)} ${metricText(e.metricId)}`
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
        )
        .sort((a, b) => b.day.localeCompare(a.day) || compareRecordPriority(a, b)),
    [summary, records.data, metric, filter, search],
  );
  // A narrow filter may match nothing in the newest archive pages; look back a little on its own.
  const [autoPages, setAutoPages] = useState(0);
  useEffect(() => setAutoPages(0), [filter, metric, querySearch]);
  const { hasNextPage, isFetching, fetchNextPage } = records;
  useEffect(() => {
    if (events.length >= 5 || !hasNextPage || isFetching || autoPages >= 6) return;
    setAutoPages((pages) => pages + 1);
    void fetchNextPage();
  }, [events.length, hasNextPage, isFetching, autoPages, fetchNextPage]);
  const visibleEvents = events.slice(0, visibleCount);
  const days = [...new Set(visibleEvents.map((e) => e.day))];
  const clearMetric = () => {
    setMetric("");
    const url = new URL(window.location.href);
    url.searchParams.delete("metric");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };
  const bests = summary?.personalBests?.metrics.find((m) => m.metricId === bestsFor) || null;
  const browsing = !metric && !search.trim() && filter === "all";
  return (
    <div>
      <header className="page-heading">
        <p className="eyebrow">Your history, ranked</p>
        <h1>Records</h1>
        <p>Personal bests, streaks and the days that stood out.</p>
      </header>
      {summary && summary.rulesVersion !== RULES_VERSION && (
        <p className="fine-print records-refresh" role="status">
          Your records are being refreshed. New personal bests and streaks will appear shortly.
        </p>
      )}
      {browsing && summary?.personalBests && (
        <TrophyCase bests={summary.personalBests} onOpen={setBestsFor} />
      )}
      <div className="record-search">
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            aria-label="Search records"
            placeholder="Search sleep, steps, HRV…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="record-chips" role="group" aria-label="Kind of record">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {metric && (
        <button type="button" className="metric-pill" onClick={clearMetric}>
          {RECORD_SPEC_BY_ID[metric].name}
          <X size={14} aria-label="Show every metric" />
        </button>
      )}
      {days.map((day) => (
        <section className="record-day" key={day}>
          <h2>
            {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </h2>
          {visibleEvents
            .filter((e) => e.day === day)
            .map((e) => (
              <HighlightCard
                key={e.id}
                event={e}
                onClick={() => navigate(`/records/${encodeURIComponent(e.id)}`)}
              />
            ))}
        </section>
      ))}
      {records.isFetching && (
        <p className="empty-note" role="status">
          Finding your records…
        </p>
      )}
      {records.isError && (
        <p className="empty-note" role="alert">
          Records couldn’t load.{" "}
          <button type="button" onClick={() => void records.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!events.length && !records.isFetching && (
        <div className="quiet-state">
          <Sparkles size={30} />
          <h2>
            {summary ? "Nothing here yet" : "Your story is taking shape"}
          </h2>
          <p>
            {summary
              ? records.hasNextPage
                ? "Nothing matches in recent weeks. Look further back, or try another filter."
                : "No records match this view. Try another filter or search."
              : "Your history is being checked for personal bests and streaks."}
          </p>
        </div>
      )}
      {events.length > visibleCount && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setVisibleCount((count) => count + 20)}
        >
          More records
        </Button>
      )}
      {events.length <= visibleCount && records.hasNextPage && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={records.isFetchingNextPage}
          onClick={() => void records.fetchNextPage()}
        >
          Look further back
        </Button>
      )}
      {summary?.archiveBefore && summary.archiveThrough && (
        <p className="fine-print">
          Earlier history is still being checked. Records are ready from{" "}
          {shortDate(summary.archiveThrough)}.
        </p>
      )}
      <PersonalBestsSheet
        bests={bests}
        profileId={profileId}
        onClose={() => setBestsFor(null)}
        onExplore={(destination) => {
          setBestsFor(null);
          navigate(destination);
        }}
        onSeeRecords={(metricId) => {
          setBestsFor(null);
          setSearch("");
          setFilter("all");
          setMetric(metricId);
        }}
      />
      <RecordEvidenceSheet
        event={event}
        onExplore={destination => { setEvent(null); navigate(destination); }}
        onClose={() => {
          setEvent(null);
          if (eventId) goBack("/records");
        }}
      />
    </div>
  );
}

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button, Dialog } from "../ui";
import { METRICS, METRIC_BY_ID, CATEGORIES } from "../../domain/metrics";
import { compareRecordPriority, recordTitle, type HighlightEvent } from "../../domain/records";
import {
  readRecordPage,
  readRecordEvent,
  type PublishedInsights,
} from "../../services/insightsService";
import { goBack, navigate } from "../../hooks/useAppRoute";
import HighlightCard from "./HighlightCard";
import { RecordEvidenceSheet } from "./MetricDetail";
export default function RecordsView({
  summary,
  profileId,
}: {
  summary: PublishedInsights | null;
  profileId: string;
}) {
  const initialMetric =
    new URLSearchParams(window.location.search).get("metric") || "";
  const [visibleCount, setVisibleCount] = useState(20);
  const [search, setSearch] = useState(
    METRIC_BY_ID[initialMetric]?.label || "",
  );
  const [filters, setFilters] = useState(false);
  const [category, setCategory] = useState("all");
  const [tone, setTone] = useState("all");
  const [family, setFamily] = useState("all");
  const [windowDays, setWindowDays] = useState("all");
  const [event, setEvent] = useState<HighlightEvent | null>(null);
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
  const querySearch = useDeferredValue(search);
  const metricIds = querySearch.trim()
    ? METRICS.filter((m) =>
        `${m.label} ${CATEGORIES[m.category]}`
          .toLowerCase()
          .includes(querySearch.toLowerCase()),
      ).map((m) => m.id)
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
            (category === "all" || e.category === category) &&
            (tone === "all" || e.tone === tone) &&
            (family === "all" || e.family === family) &&
            (windowDays === "all" || windowDays === "history"
              ? windowDays !== "history" || e.evidence.windowDays == null
              : e.evidence.windowDays === Number(windowDays) ||
                e.relatedEvidence.some(
                  (v) => v.windowDays === Number(windowDays),
                )) &&
            `${recordTitle(e)} ${METRIC_BY_ID[e.metricId]?.label || ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) => b.day.localeCompare(a.day) || compareRecordPriority(a, b)),
    [summary, records.data, category, tone, family, windowDays, search],
  );
  const visibleEvents = events.slice(0, visibleCount);
  const days = [...new Set(visibleEvents.map((e) => e.day))];
  return (
    <div>
      <header className="page-heading">
        <p className="eyebrow">Your history has highlights</p>
        <h1>Worth remembering</h1>
        <p>Highs, lows, and everything that stands out.</p>
      </header>
      <div className="record-search">
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            aria-label="Search records"
            placeholder="Search your records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="icon-button"
          type="button"
          aria-label="Filter records"
          onClick={() => setFilters(true)}
        >
          <SlidersHorizontal size={20} />
        </button>
      </div>
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
          Finding your highlights…
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
            {summary ? "A quieter stretch" : "Your story is taking shape"}
          </h2>
          <p>
            {summary
              ? "No recognitions match this view. Try another search or look further back."
              : "Your recorded history is being checked for the moments that deserve attention."}
          </p>
        </div>
      )}
      {events.length > visibleCount && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setVisibleCount((count) => count + 20)}
        >
          More highlights
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
      {summary?.archiveBefore && (
        <p className="fine-print">
          Earlier history is being prepared. Records are ready from{" "}
          {summary.archiveThrough}.
        </p>
      )}
      <Dialog
        isOpen={filters}
        title="Find your kind of record"
        onClose={() => setFilters(false)}
      >
        <div className="filter-fields">
          <label className="field-label">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">Every category</option>
              {Object.entries(CATEGORIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Kind
            <select value={tone} onChange={(e) => setTone(e.target.value)}>
              <option value="all">Every kind</option>
              <option value="positive">Positive</option>
              <option value="unfavorable">Unfavorable</option>
              <option value="neutral">Neutral</option>
            </select>
          </label>
          <label className="field-label">
            Recognition
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="all">All recognitions</option>
              <option value="daily">Daily ranks</option>
              <option value="streak">Streaks</option>
              <option value="change">Changes</option>
              <option value="mean">Rolling averages</option>
              <option value="sum">Rolling totals</option>
              <option value="spread">Consistency & variation</option>
              <option value="week">Calendar weeks</option>
              <option value="month">Calendar months</option>
              <option value="friend_lead">Friend leads</option>
              <option value="friend_close">Close results</option>
              <option value="shared">Shared achievements</option>
            </select>
          </label>
          <label className="field-label">
            Comparison window
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
            >
              <option value="all">Every window</option>
              <option value="history">Full available history</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">365 days</option>
            </select>
          </label>
          <Button onClick={() => setFilters(false)}>Show records</Button>
          <Button
            variant="quiet"
            onClick={() => {
              setCategory("all");
              setTone("all");
              setFamily("all");
              setWindowDays("all");
              setSearch("");
            }}
          >
            Reset filters
          </Button>
        </div>
      </Dialog>
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

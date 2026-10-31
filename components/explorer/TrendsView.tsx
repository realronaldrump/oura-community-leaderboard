import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, LoaderCircle } from "lucide-react";
import {
  CATEGORIES,
  HISTORY_RANGES,
  METRICS,
  METRIC_BY_ID,
  formatMetricValue,
  historyRange,
  historyStart,
  metricSeries,
  filterMetricObservationsForProfile,
  mergeMetricObservations,
  metricColor,
  type MetricCategory,
  type MetricObservation,
} from "../../domain/metrics";
import type { UserProfile } from "../../types";
import {
  readMetricHistory,
  type PublishedInsights,
} from "../../services/insightsService";
import { navigate } from "../../hooks/useAppRoute";
import MetricChart from "./MetricChart";
const SCORE_IDS = ["sleep_score", "readiness_score", "activity_score"];
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export default function TrendsView({
  profile,
  summary,
  fallback,
  day,
}: {
  profile: UserProfile;
  summary: PublishedInsights | null;
  fallback: MetricObservation[];
  day: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<MetricCategory | "all">("all");
  const [metricId, setMetricId] = useState("sleep_score");
  const range = historyRange(new URLSearchParams(window.location.search).get("range"));
  const start = historyStart(day, range);
  const history = useQuery({
    queryKey: ["metric-history", profile.id, summary?.revision, start, day],
    queryFn: () => readMetricHistory(profile.id, summary!.months, start, day),
    enabled: Boolean(summary),
    staleTime: Infinity,
  });
  const observations = useMemo(
    () =>
      filterMetricObservationsForProfile(mergeMetricObservations(history.data || [],
      fallback.filter((o) => (!start || o.day >= start) && o.day <= day)), profile, { startDay: start, endDay: day }),
    [history.data, fallback, start, day, profile],
  );
  const metric = METRIC_BY_ID[metricId];
  const points = metricSeries(observations, metricId);
  const values = points.map((p) => p.value);
  const average = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
  const query = search.trim().toLowerCase();
  const visible = METRICS.filter(
    (m) =>
      (category === "all" || m.category === category) &&
      `${m.label} ${CATEGORIES[m.category]}`.toLowerCase().includes(query) &&
      observations.some((o) => o.values[m.id] != null),
  );
  const open = (id: string) =>
    navigate(`/metrics/${id}?profile=${profile.id}&day=${day}&range=${range}`);
  return (
    <div>
      <header className="page-heading">
        <h1>Trends</h1>
      </header>
      <div className="range-tabs" role="group" aria-label="Trend range">
        {HISTORY_RANGES.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={range === value}
            onClick={() => navigate(`/trends?range=${value}`, true)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="trend-feature" aria-label={`${metric.label} trend`} aria-busy={history.isFetching || undefined}>
        {history.isFetching && <p className="history-feedback" role="status"><LoaderCircle size={16} className="history-spinner" aria-hidden="true" /> Loading {range === 'all' ? 'all' : `${range}-day`} history…</p>}
        {history.isError && <p className="history-feedback history-feedback--error" role="alert">History couldn’t load. <button type="button" onClick={() => void history.refetch()}>Try again</button></p>}
        {!summary && <p className="history-feedback" role="status">Full history is being prepared. Showing available recent days.</p>}
        <div
          className="score-selector"
          role="group"
          aria-label="Score to chart"
        >
          {SCORE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === metricId}
              onClick={() => setMetricId(id)}
            >
              {METRIC_BY_ID[id].label.replace(" score", "")}
            </button>
          ))}
        </div>
        <div className="trend-feature__reading">
          <div>
            <span>Average</span>
            <strong>{formatMetricValue(metric, average)}</strong>
          </div>
          {values.length ? (
            <dl>
              <dt>Low</dt>
              <dd>{formatMetricValue(metric, Math.min(...values))}</dd>
              <dt>High</dt>
              <dd>{formatMetricValue(metric, Math.max(...values))}</dd>
              <dt>Days</dt>
              <dd>{values.length}</dd>
            </dl>
          ) : (
            <p>No data yet</p>
          )}
        </div>
        <MetricChart
          onSelectDay={selected => navigate(`/metrics/${metricId}?profile=${encodeURIComponent(profile.id)}&day=${selected}&range=${range}`)}
          metric={metric}
          series={[
            {
              label: metric.label,
              color: metricColor(metric.category),
              points,
            },
          ]}
        />
        <p className="history-coverage">{points.length} recorded {points.length === 1 ? 'day' : 'days'}{points.length > 0 ? ` · ${shortDate(points[0].day)} – ${shortDate(points.at(-1)!.day)}` : ''}</p>
        <button
          type="button"
          className="text-action"
          onClick={() => open(metricId)}
        >
          {metric.label} details <ChevronRight size={16} aria-hidden="true" />
        </button>
      </section>
      <section className="detail-section" aria-labelledby="all-measurements">
        <div className="section-title">
          <h2 id="all-measurements">All measurements</h2>
          <span>{visible.length}</span>
        </div>
        <div className="measurement-filters">
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Find a measurement"
              placeholder="Find a measurement"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="field-label">
            <span className="sr-only">Category</span>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as MetricCategory | "all")
              }
            >
              <option value="all">All categories</option>
              {Object.entries(CATEGORIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {Object.entries(CATEGORIES).map(([cat, label]) => {
          const metrics = visible
            .filter((m) => m.category === cat)
            .sort(
              (a, b) =>
                Number(a.field.startsWith("contributors")) -
                Number(b.field.startsWith("contributors")),
            );
          return metrics.length ? (
            <details
              className="metric-group"
              key={cat}
              open={Boolean(query) || category !== "all"}
            >
              <summary>
                <span className={`category-dot tone-${cat}`} aria-hidden="true" />
                <span>{label}</span>
                <small>{metrics.length}</small>
              </summary>
              <div className="metric-list">
                {metrics.map((m) => {
                  const latest = metricSeries(observations, m.id).at(-1);
                  return (
                    <button
                      type="button"
                      className="metric-row"
                      key={m.id}
                      onClick={() => open(m.id)}
                    >
                      <span>
                        {m.label}
                        {latest && <small>{latest.day === day ? "Latest" : shortDate(latest.day)}</small>}
                      </span>
                      <strong>{formatMetricValue(m, latest?.value)}</strong>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </details>
          ) : null;
        })}
        {!visible.length && (
          <p className="empty-note">
            {query ? "No measurements match your search." : "No measurements in this range."}
          </p>
        )}
      </section>
    </div>
  );
}

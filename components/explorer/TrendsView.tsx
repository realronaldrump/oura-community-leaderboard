import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import {
  CATEGORIES,
  METRICS,
  METRIC_BY_ID,
  formatMetricValue,
  metricSeries,
  metricColor,
  shiftDay,
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
  const range =
    new URLSearchParams(window.location.search).get("range") || "30";
  const start = range === "all" ? undefined : shiftDay(day, -Number(range) + 1);
  const history = useQuery({
    queryKey: ["metric-history", profile.id, summary?.revision, start, day],
    queryFn: () => readMetricHistory(profile.id, summary!.months, start, day),
    enabled: Boolean(summary),
    staleTime: Infinity,
  });
  const observations = useMemo(
    () =>
      history.data ||
      fallback.filter((o) => (!start || o.day >= start) && o.day <= day),
    [history.data, fallback, start, day],
  );
  const metric = METRIC_BY_ID[metricId];
  const points = metricSeries(observations, metricId);
  const first = points[0];
  const last = points.at(-1);
  const average = points.length
    ? points.reduce((a, p) => a + p.value, 0) / points.length
    : null;
  const visible = METRICS.filter(
    (m) =>
      (category === "all" || m.category === category) &&
      `${m.label} ${CATEGORIES[m.category]}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      observations.some((o) => o.values[m.id] != null),
  );
  const open = (id: string) =>
    navigate(`/metrics/${id}?profile=${profile.id}&day=${day}&range=${range}`);
  return (
    <div>
      <header className="page-heading">
        <p className="eyebrow">The longer view</p>
        <h1>Your progress</h1>
        <p>Small changes. A bigger picture.</p>
      </header>
      <div className="range-tabs" role="group" aria-label="Trend range">
        {[
          ["7", "7D"],
          ["30", "30D"],
          ["90", "90D"],
          ["365", "1Y"],
          ["all", "All"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={range === value}
            onClick={() => navigate(`/trends?range=${value}`)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="trend-feature">
        <div
          className="score-selector"
          role="group"
          aria-label="Score to chart"
        >
          {["sleep_score", "readiness_score", "activity_score"].map((id) => (
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
            <span>Average {metric.label.toLowerCase()}</span>
            <strong>{formatMetricValue(metric, average)}</strong>
          </div>
          <p>
            {first && last
              ? `${points.length} recorded days`
              : "Waiting for measurements"}
          </p>
        </div>
        <MetricChart
          metric={metric}
          series={[
            {
              label: metric.label,
              color: metricColor(metric.category),
              points,
            },
          ]}
        />
        <button
          type="button"
          className="text-action"
          onClick={() => open(metricId)}
        >
          Explore {metric.label.toLowerCase()} <ChevronRight size={16} />
        </button>
      </section>
      {!summary && (
        <p className="empty-note">
          Showing recent saved measurements while your full history is prepared.
        </p>
      )}
      {history.isError && (
        <p role="alert" className="empty-note">
          History couldn’t load.{" "}
          <button type="button" onClick={() => void history.refetch()}>
            Try again
          </button>
        </p>
      )}
      {history.isFetching && (
        <p role="status" className="fine-print">
          Loading history…
        </p>
      )}
      <section className="detail-section">
        <div className="section-title">
          <h2>Every measurement</h2>
          <span>{visible.length}</span>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            aria-label="Find a measurement"
            placeholder="Find a measurement"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field-label">
          <span className="sr-only">Metric category</span>
          <select
            aria-label="Metric category"
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
              open={Boolean(search) || category !== "all"}
            >
              <summary>
                <span>{label}</span>
                <small>{metrics.length} metrics</small>
              </summary>
              <div className="metric-list">
                {metrics.map((m) => {
                  const series = metricSeries(observations, m.id);
                  return (
                    <button
                      type="button"
                      className="metric-row"
                      key={m.id}
                      onClick={() => open(m.id)}
                    >
                      <span>
                        {m.label}
                        <small>Latest · {series.at(-1)?.day}</small>
                      </span>
                      <strong>
                        {formatMetricValue(m, series.at(-1)?.value)}
                      </strong>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            </details>
          ) : null;
        })}
        {!visible.length && (
          <p className="empty-note">
            No recorded measurements match this search.
          </p>
        )}
      </section>
    </div>
  );
}

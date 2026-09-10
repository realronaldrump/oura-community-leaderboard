import React, { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Moon, Sparkles } from "lucide-react";
import { Button, Dialog, Skeleton } from "../ui";
import {
  CATEGORIES,
  METRICS,
  METRIC_BY_ID,
  formatMetricValue,
  mainSleepSession,
  metricColor,
  metricSeries,
  shiftDay,
  type MetricObservation,
} from "../../domain/metrics";
import { comparisonLabel, type HighlightEvent } from "../../domain/records";
import type { DailyStats, UserProfile } from "../../types";
import {
  readDayDetail,
  readMetricHistory,
  type PublishedInsights,
} from "../../services/insightsService";
import { filterDailyStatsForProfile } from "../../utils/dataExclusions";
import { goBack, navigate } from "../../hooks/useAppRoute";
import MetricChart from "./MetricChart";
import HighlightCard from "./HighlightCard";
const SleepStagesChart = lazy(() => import("../charts/SleepStagesChart"));
const HeartRateChart = lazy(() => import("../charts/HeartRateChart"));
const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export function RecordEvidenceSheet({
  event,
  onClose,
}: {
  event: HighlightEvent | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={Boolean(event)}
      title="The story behind the record"
      onClose={onClose}
    >
      {event && (
        <div className="record-evidence">
          <p className="eyebrow">{dateLabel(event.day)}</p>
          <h2>{event.title}</h2>
          <p>{event.description}</p>
          <dl className="evidence-grid">
            <div>
              <dt>Rank on this date</dt>
              <dd>
                #{event.evidence.rank}
                {event.evidence.tied > 1
                  ? ` · tied with ${event.evidence.tied - 1}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Compared with</dt>
              <dd>
                {event.evidence.sampleCount.toLocaleString()}{" "}
                {event.family === "daily" ? "days" : "periods"}
              </dd>
            </div>
            <div>
              <dt>Comparison</dt>
              <dd>{comparisonLabel(event.evidence)}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>
                {event.startDay === event.day
                  ? dateLabel(event.day)
                  : `${dateLabel(event.startDay)} – ${dateLabel(event.day)}`}
              </dd>
            </div>
          </dl>
          {event.provisional && (
            <p className="empty-note">
              This day is still updating. Its result may change.
            </p>
          )}
          {event.relatedEvidence.length > 0 && (
            <details>
              <summary>Also stands out in…</summary>
              {event.relatedEvidence.map((e) => (
                <p key={e.windowDays || "all"}>
                  #{e.rank} {comparisonLabel(e)} · {e.sampleCount} observations
                </p>
              ))}
            </details>
          )}
          {event.evidence.threshold != null && (
            <p>
              This run stayed{" "}
              {event.direction === "high" ? "at or above" : "below"}{" "}
              {formatMetricValue(event.metricId, event.evidence.threshold)}. Its
              baseline was fixed using {event.evidence.baselineStart} through{" "}
              {event.evidence.baselineEnd}.
            </p>
          )}
          <details>
            <summary>Why this surfaced</summary>
            <p>
              Notability {event.score}/100. This ranks interesting observations;
              it is not a health or confidence score.
            </p>
            <dl className="evidence-grid">
              {Object.entries(event.factors).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{Math.round(value * 100)}%</dd>
                </div>
              ))}
            </dl>
          </details>
          <Button
            className="w-full"
            onClick={() => {
              onClose();
              navigate(event.detailPath);
            }}
          >
            Explore this metric <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </Dialog>
  );
}
function Relationships({
  observations,
  metricId,
}: {
  observations: MetricObservation[];
  metricId: string;
}) {
  const [second, setSecond] = useState(
    metricId === "sleep_score" ? "readiness_score" : "sleep_score",
  );
  const metric = METRIC_BY_ID[metricId];
  const other = METRIC_BY_ID[second];
  const compatible = METRICS.filter(
    (m) =>
      m.id !== metricId &&
      !m.clock &&
      !m.field.startsWith("contributors") &&
      observations.some((o) => o.values[m.id] != null),
  );
  const pairs = observations
    .filter((o) => o.values[metricId] != null && o.values[second] != null)
    .map((o) => ({ x: o.values[metricId], y: o.values[second], day: o.day }));
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / pairs.length;
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
  const sx = pairs.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const sy = pairs.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const r =
    sx > 0 && sy > 0
      ? pairs.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) /
        Math.sqrt(sx * sy)
      : null;
  const extent = (values: number[]) => [
    Math.min(...values),
    Math.max(...values),
  ];
  const [minX, maxX] = extent(pairs.map((p) => p.x));
  const [minY, maxY] = extent(pairs.map((p) => p.y));
  return (
    <div className="relationship-detail">
      <label className="field-label">
        Compare with
        <select value={second} onChange={(e) => setSecond(e.target.value)}>
          {compatible.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {pairs.length < 30 || r == null ? (
        <p className="empty-note">
          At least 30 matched days with variation in both measurements are
          needed.
        </p>
      ) : (
        <>
          <p>
            <strong>r = {r.toFixed(2)}</strong> across {pairs.length} matched
            days.
          </p>
          <svg
            viewBox="0 0 340 190"
            className="relationship-plot"
            role="img"
            aria-label={`${metric.label} against ${other.label}, ${pairs.length} matched days, Pearson correlation ${r.toFixed(2)}`}
          >
            <line x1="25" y1="155" x2="330" y2="155" className="chart-grid" />
            {pairs.map((p) => (
              <circle
                key={p.day}
                cx={30 + ((p.x - minX) / Math.max(1e-6, maxX - minX)) * 290}
                cy={145 - ((p.y - minY) / Math.max(1e-6, maxY - minY)) * 125}
                r="3"
                fill={metricColor(metric.category)}
                opacity="0.55"
              >
                <title>
                  {dateLabel(p.day)}: {formatMetricValue(metric, p.x)},{" "}
                  {formatMetricValue(other, p.y)}
                </title>
              </circle>
            ))}
            <text x="25" y="180">
              {metric.label} →
            </text>
            <text x="25" y="12">
              {other.label}
            </text>
          </svg>
          <p className="fine-print">
            This describes how two measurements moved together. It does not show
            that one caused the other.
          </p>
        </>
      )}
    </div>
  );
}
export function DayContext({ stats, day }: { stats: DailyStats; day: string }) {
  const sessions = stats.session.filter(
    (s) => s.day === day && s.type !== "deleted" && s.type !== "rest",
  );
  const main = mainSleepSession(sessions);
  const entries = [
    ...sessions.map((s) => ({
      id: s.id,
      at: s.bedtime_start,
      end: s.bedtime_end,
      title: s.id === main?.id ? "Main sleep" : "Nap",
      detail: formatMetricValue("sleep_duration", s.total_sleep_duration),
    })),
    ...(stats.workout || []).map((w) => ({
      id: w.id,
      at: w.start_datetime,
      end: w.end_datetime,
      title: w.activity || "Workout",
      detail: w.intensity || "",
    })),
    ...(stats.guidedSession || []).map((g) => ({
      id: g.id,
      at: g.start_datetime,
      end: g.end_datetime,
      title: "Guided session",
      detail: g.type || "",
    })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const clock = (value: string | undefined) =>
    value?.match(/T(\d\d:\d\d)/)?.[1] || "—";
  return (
    <div className="day-context">
      <h3>Your day, in detail</h3>
      <div className="day-timeline">
        {entries.length ? (
          entries.map((e) => (
            <div className="timeline-entry" key={e.id}>
              <time>{clock(e.at)}</time>
              <div>
                <strong>{e.title}</strong>
                <p>
                  {e.detail}
                  {e.end ? ` · until ${clock(e.end)}` : ""}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="empty-note">No sessions recorded for this day.</p>
        )}
      </div>
      {stats.enhancedTag?.length || stats.tag?.length ? (
        <>
          <h3>Notes & tags</h3>
          {[...(stats.enhancedTag || []), ...(stats.tag || [])].map(
            (tag, i) => (
              <p key={tag.id || i}>
                {tag.comment ||
                  tag.text ||
                  tag.custom_name ||
                  tag.tag_type_code ||
                  (tag.tags || []).join(", ") ||
                  "Recorded tag"}
              </p>
            ),
          )}
        </>
      ) : null}
      {stats.sleepTime?.length ? (
        <details>
          <summary>Oura sleep timing guidance</summary>
          {stats.sleepTime.map((s, i) => (
            <p key={s.id || i}>
              {s.recommendation || s.status || "Timing estimate available"}
              {s.optimal_bedtime?.start_offset != null
                ? ` · ${Math.round(s.optimal_bedtime.start_offset / 60)} minutes from local midnight`
                : ""}
            </p>
          ))}
        </details>
      ) : null}
    </div>
  );
}
export default function MetricDetail({
  id,
  profile,
  day,
  summary,
  fallback,
}: {
  id: string;
  profile: UserProfile;
  day: string;
  summary: PublishedInsights | null;
  fallback: MetricObservation[];
}) {
  const metric = METRIC_BY_ID[id];
  const params = new URLSearchParams(window.location.search);
  const [range, setRange] = useState(params.get("range") || "30");
  const [event, setEvent] = useState<HighlightEvent | null>(null);
  const [showRelationships, setShowRelationships] = useState(
    params.has("relationships"),
  );
  const start = range === "all" ? undefined : shiftDay(day, -Number(range) + 1);
  const history = useQuery({
    queryKey: ["metric-history", profile.id, summary?.revision, start, day],
    queryFn: () => readMetricHistory(profile.id, summary!.months, start, day),
    enabled: Boolean(summary),
    staleTime: Infinity,
  });
  const raw = useQuery({
    queryKey: ["day-detail", profile.id, day, summary?.revision],
    queryFn: () => readDayDetail(profile.id, day),
    staleTime: 60_000,
  });
  const stats = filterDailyStatsForProfile(raw.data, profile);
  const observations = useMemo(
    () =>
      history.data ||
      fallback.filter((o) => (!start || o.day >= start) && o.day <= day),
    [history.data, fallback, start, day],
  );
  if (!metric)
    return (
      <div className="empty-note">
        <h1>Metric unavailable</h1>
        <Button onClick={() => goBack("/trends")}>Back to trends</Button>
      </div>
    );
  const points = metricSeries(observations, id);
  const current = points.find((p) => p.day === day);
  const values = points.map((p) => p.value);
  const average = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
  const records = (summary?.recent || [])
    .filter((e) => e.metricId === id)
    .slice(0, 3);
  const main = mainSleepSession(
    (stats?.session || []).filter((s) => s.day === day),
  );
  const selectRange = (value: string) => {
    setRange(value);
    const url = new URL(window.location.href);
    url.searchParams.set("range", value);
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search,
    );
  };
  return (
    <div className="detail-screen">
      <button
        type="button"
        className="back-link"
        onClick={() => goBack("/trends")}
      >
        <ArrowLeft size={18} /> Back
      </button>
      <header className="page-heading">
        <p className="eyebrow">
          {CATEGORIES[metric.category]} · {profile.firstName || "Your history"}
        </p>
        <h1>{metric.label}</h1>
        <p>{dateLabel(day)}</p>
      </header>
      <section className={`metric-hero tone-${metric.category}`}>
        <span>{current ? "On this day" : "No measurement on this day"}</span>
        <strong>{formatMetricValue(metric, current?.value)}</strong>
        <p>{metric.description}</p>
      </section>
      <div className="range-tabs" role="group" aria-label="History range">
        {[
          ["7", "7D"],
          ["30", "30D"],
          ["90", "90D"],
          ["365", "1Y"],
          ["all", "All"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => selectRange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {history.isFetching && (
        <p className="fine-print" role="status">
          Loading your history…
        </p>
      )}
      {history.isError && (
        <p className="empty-note" role="alert">
          History couldn’t load.{" "}
          <button type="button" onClick={() => void history.refetch()}>
            Try again
          </button>
        </p>
      )}
      <section className="chart-surface">
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
        <div className="metric-stats">
          <div>
            <span>Average</span>
            <strong>{formatMetricValue(metric, average)}</strong>
          </div>
          <div>
            <span>Lowest</span>
            <strong>
              {formatMetricValue(
                metric,
                values.length ? Math.min(...values) : null,
              )}
            </strong>
          </div>
          <div>
            <span>Highest</span>
            <strong>
              {formatMetricValue(
                metric,
                values.length ? Math.max(...values) : null,
              )}
            </strong>
          </div>
        </div>
        <p className="fine-print">
          {points.length} recorded days
          {points.length
            ? ` · ${dateLabel(points[0].day)} – ${dateLabel(points.at(-1)!.day)}`
            : ""}
          {!summary ? " · Available recent history" : ""}
        </p>
      </section>
      {metric.category === "sleep" && (
        <section className="detail-section">
          <div className="section-title">
            <Moon size={18} />
            <h2>Inside this sleep</h2>
          </div>
          {main ? (
            <>
              <div className="sleep-clock">
                <div>
                  <span>Bedtime</span>
                  <strong>
                    {main.bedtime_start?.match(/T(\d\d:\d\d)/)?.[1] || "—"}
                  </strong>
                </div>
                <div>
                  <span>Wake time</span>
                  <strong>
                    {main.bedtime_end?.match(/T(\d\d:\d\d)/)?.[1] || "—"}
                  </strong>
                </div>
              </div>
              <Suspense fallback={<Skeleton className="h-40" />}>
                <SleepStagesChart data={[main]} />
              </Suspense>
            </>
          ) : (
            <p className="empty-note">No main sleep session for this date.</p>
          )}
          <details className="quiet-disclosure">
            <summary>Sleep rhythm across this period</summary>
            <MetricChart
              metric={METRIC_BY_ID.bedtime}
              series={[
                {
                  label: "Bedtime",
                  color: metricColor("sleep"),
                  points: metricSeries(observations, "bedtime"),
                },
              ]}
            />
            <MetricChart
              metric={METRIC_BY_ID.wake_time}
              series={[
                {
                  label: "Wake time",
                  color: metricColor("activity"),
                  points: metricSeries(observations, "wake_time"),
                },
              ]}
            />
          </details>
        </section>
      )}
      {metric.category === "body" && stats?.heartrate?.length ? (
        <section className="detail-section">
          <h2>Heart rate through the day</h2>
          <div className="h-56">
            <Suspense fallback={<Skeleton className="h-full" />}>
              <HeartRateChart data={stats.heartrate} />
            </Suspense>
          </div>
        </section>
      ) : null}
      {metric.unit === "score" && !metric.field.startsWith("contributors") && (
        <section className="detail-section">
          <h2>What shaped the score</h2>
          <div className="metric-list">
            {METRICS.filter(
              (m) =>
                m.source === metric.source &&
                m.field.startsWith("contributors"),
            ).map((m) => (
              <button
                className="metric-row"
                key={m.id}
                onClick={() =>
                  navigate(`/metrics/${m.id}?profile=${profile.id}&day=${day}`)
                }
              >
                <span>{m.label}</span>
                <strong>
                  {formatMetricValue(
                    m,
                    observations.find((o) => o.day === day)?.values[m.id],
                  )}
                </strong>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      {records.length > 0 && (
        <section className="detail-section">
          <h2>Recent recognitions</h2>
          {records.map((e) => (
            <HighlightCard key={e.id} event={e} onClick={() => setEvent(e)} />
          ))}
        </section>
      )}
      <section className="detail-section">
        <button
          className="text-action"
          onClick={() => navigate(`/records?metric=${id}`)}
        >
          <Sparkles size={16} /> All records for this metric{" "}
          <ChevronRight size={16} />
        </button>
      </section>
      {!metric.clock && (
        <details
          className="quiet-disclosure"
          open={showRelationships}
          onToggle={(e) => setShowRelationships(e.currentTarget.open)}
        >
          <summary>Explore a relationship</summary>
          {showRelationships && (
            <Relationships observations={observations} metricId={id} />
          )}
        </details>
      )}
      <details className="quiet-disclosure">
        <summary>Sessions, notes & context</summary>
        {raw.isFetching ? (
          <p role="status">Loading this day…</p>
        ) : stats ? (
          <DayContext stats={stats} day={day} />
        ) : (
          <p className="empty-note">Day details couldn’t load.</p>
        )}
      </details>
      <RecordEvidenceSheet event={event} onClose={() => setEvent(null)} />
    </div>
  );
}

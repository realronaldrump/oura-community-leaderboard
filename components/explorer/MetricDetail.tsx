import React, { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Moon, Sparkles } from "lucide-react";
import { Button, Dialog, Skeleton } from "../ui";
import {
  CATEGORIES,
  HISTORY_RANGES,
  METRICS,
  METRIC_BY_ID,
  formatMetricValue,
  historyRange,
  historyStart,
  mainSleepSession,
  metricColor,
  metricSeries,
  normalizeMetricDays,
  mergeMetricObservations,
  filterMetricObservationsForProfile,
  type MetricObservation,
} from "../../domain/metrics";
import { RECORD_SPEC_BY_ID, compareRecordPriority, isPresentableRecord, type HighlightEvent } from "../../domain/records";
import RecordEvidenceSheet from "./RecordEvidenceSheet";
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
import { DayDataControl } from "../DataExclusionEditor";
import DayCalendar from "../DayCalendar";
import { localDay } from "../../domain/metrics";
const SleepStagesChart = lazy(() => import("../charts/SleepStagesChart"));
const HeartRateChart = lazy(() => import("../charts/HeartRateChart"));
const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export { RecordEvidenceSheet };
/** "10:47 PM" from an Oura local timestamp ("2026-10-24T22:47:00-05:00"), without converting zones. */
export const clockLabel = (value: string | undefined) => {
  const match = value?.match(/T(\d\d):(\d\d)/);
  return match ? formatMetricValue("bedtime", Number(match[1]) * 60 + Number(match[2])) : "—";
};
const humanize = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
const minutesBetween = (start?: string, end?: string) => {
  const ms = Date.parse(end || "") - Date.parse(start || "");
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : null;
};
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
          Needs at least 30 days with both measurements. Try a longer range.
        </p>
      ) : (
        <>
          <p>
            Correlation <strong>r = {r.toFixed(2)}</strong> over {pairs.length} days.
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
            Shows how the two move together, not that one causes the other.
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
      detail: `${formatMetricValue("sleep_duration", s.total_sleep_duration)} asleep`,
    })),
    ...(stats.workout || []).map((w) => ({
      id: w.id,
      at: w.start_datetime,
      end: w.end_datetime,
      title: w.activity ? humanize(w.activity) : "Workout",
      detail: [
        w.intensity ? humanize(w.intensity) : "",
        minutesBetween(w.start_datetime, w.end_datetime) != null
          ? `${minutesBetween(w.start_datetime, w.end_datetime)} min`
          : "",
      ].filter(Boolean).join(" · "),
    })),
    ...(stats.guidedSession || []).map((g) => ({
      id: g.id,
      at: g.start_datetime,
      end: g.end_datetime,
      title: "Guided session",
      detail: g.type ? humanize(g.type) : "",
    })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return (
    <div className="day-context">
      <h3>Sessions</h3>
      <div className="day-timeline">
        {entries.length ? (
          entries.map((e) => (
            <div className="timeline-entry" key={e.id}>
              <time>{clockLabel(e.at)}</time>
              <div>
                <strong>{e.title}</strong>
                <p>
                  {[e.detail, e.end ? `until ${clockLabel(e.end)}` : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="empty-note">Nothing recorded for this day.</p>
        )}
      </div>
      {stats.enhancedTag?.length || stats.tag?.length ? (
        <>
          <h3>Tags</h3>
          {[...(stats.enhancedTag || []), ...(stats.tag || [])].map(
            (tag, i) => (
              <p key={tag.id || i}>
                {tag.comment ||
                  tag.text ||
                  tag.custom_name ||
                  (tag.tag_type_code ? humanize(String(tag.tag_type_code).replace(/^tag_(generic_)?/, "")) : "") ||
                  (tag.tags || []).join(", ") ||
                  "Tag"}
              </p>
            ),
          )}
        </>
      ) : null}
      {stats.sleepTime?.length ? (
        <details>
          <summary>Bedtime guidance</summary>
          {stats.sleepTime.map((s, i) => (
            <p key={s.id || i}>
              {[
                s.recommendation || s.status ? humanize(String(s.recommendation || s.status)) : "",
                s.optimal_bedtime?.start_offset != null && s.optimal_bedtime?.end_offset != null
                  ? `Best bedtime ${formatMetricValue("bedtime", s.optimal_bedtime.start_offset / 60)} to ${formatMetricValue("bedtime", s.optimal_bedtime.end_offset / 60)}`
                  : "",
              ].filter(Boolean).join(" · ") || "No guidance"}
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
  historySummary,
  fallback,
}: {
  id: string;
  profile: UserProfile;
  day: string;
  summary: PublishedInsights | null;
  historySummary?: PublishedInsights | null;
  fallback: MetricObservation[];
}) {
  const metric = METRIC_BY_ID[id];
  const params = new URLSearchParams(window.location.search);
  const [range, setRange] = useState(() => historyRange(params.get("range")));
  const [event, setEvent] = useState<HighlightEvent | null>(null);
  const [calendar, setCalendar] = useState(false);
  const [showRelationships, setShowRelationships] = useState(
    params.has("relationships"),
  );
  const start = historyStart(day, range);
  const historySource = historySummary || summary;
  const history = useQuery({
    queryKey: ["metric-history", profile.id, historySource?.revision, start, day],
    queryFn: () => readMetricHistory(profile.id, historySource!.months, start, day),
    enabled: Boolean(historySource),
    staleTime: Infinity,
  });
  const raw = useQuery({
    queryKey: ["day-detail", profile.id, day, summary?.revision],
    queryFn: () => readDayDetail(profile.id, day),
    staleTime: 60_000,
  });
  const stats = filterDailyStatsForProfile(raw.data, profile, { startDay: day, endDay: day });
  const observations = useMemo(
    () =>
      filterMetricObservationsForProfile(mergeMetricObservations(history.data || [],
      fallback.filter((o) => (!start || o.day >= start) && o.day <= day)), profile, { startDay: start, endDay: day }),
    [history.data, fallback, start, day, profile],
  );
  if (!metric)
    return (
      <div className="quiet-state">
        <h2>Measurement not found</h2>
        <p>This link may be out of date.</p>
        <Button onClick={() => goBack("/trends")}>Back to Trends</Button>
      </div>
    );
  const points = metricSeries(observations, id);
  const current = points.find((p) => p.day === day);
  const selectedValues = stats ? normalizeMetricDays(stats, profile, { coverage: summary?.coverage }).find(row => row.day === day)?.values : undefined;
  const currentValue = selectedValues ? selectedValues[id] : current?.value;
  const corrected = metric.field === 'score' && (stats?.[metric.source] as Array<{ day?: string; scoreSource?: string }> | undefined)
    ?.some(row => row.day === day && row.scoreSource === 'oura_app');
  const values = points.map((p) => p.value);
  const average = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
  const records = (summary?.recent || [])
    .filter((e) => e.metricId === id && isPresentableRecord(e))
    .sort(compareRecordPriority)
    .slice(0, 3);
  const main = mainSleepSession(
    (stats?.session || []).filter((s) => s.day === day),
  );
  const selectRange = (value: (typeof HISTORY_RANGES)[number][0]) => {
    setRange(value);
    const url = new URL(window.location.href);
    url.searchParams.set("range", value);
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search,
    );
  };
  const selectDay = (selected: string) => {
    navigate(`/metrics/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile.id)}&day=${selected}&range=${range}`);
    setCalendar(false);
  };
  return (
    <div className="detail-screen">
      <button
        type="button"
        className="back-link"
        onClick={() => goBack("/trends")}
      >
        <ArrowLeft size={18} aria-hidden="true" /> Back
      </button>
      <header className="page-heading">
        <p className="eyebrow">
          {CATEGORIES[metric.category]}
          {profile.firstName ? ` · ${profile.firstName}` : ""}
        </p>
        <h1>{metric.label}</h1>
        <button type="button" className="date-pill mt-3" aria-label="Choose measurement day" onClick={() => setCalendar(true)}>{dateLabel(day)}</button>
      </header>
      <DayDataControl key={`${profile.id}:${day}:${id}`} profile={profile} day={day} source={metric.source} />
      <section className={`metric-hero tone-${metric.category}`}>
        <span>{currentValue != null ? dateLabel(day) : `No data for ${dateLabel(day)}`}</span>
        <strong>{formatMetricValue(metric, currentValue)}</strong>
        {corrected && <small className="measurement-status">Confirmed in Oura · used while its API score is missing</small>}
        {metric.description && <p>{metric.description}</p>}
      </section>
      <div className="range-tabs" role="group" aria-label="History range">
        {HISTORY_RANGES.map(([value, label]) => (
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
          Loading history…
        </p>
      )}
      {history.isError && (
        <p className="empty-note" role="alert">
          History didn’t load.{" "}
          <button type="button" onClick={() => void history.refetch()}>
            Try again
          </button>
        </p>
      )}
      <section className="chart-surface">
        <MetricChart
          metric={metric}
          onSelectDay={selectDay}
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
          {points.length} {points.length === 1 ? "day" : "days"}
          {points.length
            ? ` · ${dateLabel(points[0].day)} to ${dateLabel(points.at(-1)!.day)}`
            : ""}
          {!historySource ? " · Recent days only" : ""}
        </p>
      </section>
      {calendar && <Dialog isOpen title="Choose a day" onClose={() => setCalendar(false)}><DayCalendar key={day} selectedDay={day} today={localDay(profile)} ranges={profile.dataExclusionRanges} onSelect={selectDay} /></Dialog>}
      {metric.category === "sleep" && (
        <section className="detail-section">
          <div className="section-title">
            <Moon size={18} aria-hidden="true" />
            <h2>Main sleep</h2>
          </div>
          {main ? (
            <>
              <div className="sleep-clock">
                <div>
                  <span>Bedtime</span>
                  <strong>{clockLabel(main.bedtime_start)}</strong>
                </div>
                <div>
                  <span>Wake time</span>
                  <strong>{clockLabel(main.bedtime_end)}</strong>
                </div>
              </div>
              <Suspense fallback={<Skeleton className="h-24" />}>
                <SleepStagesChart data={[main]} />
              </Suspense>
            </>
          ) : (
            <p className="empty-note">No main sleep recorded for {dateLabel(day)}.</p>
          )}
          <details className="quiet-disclosure">
            <summary>Bedtime and wake time trend</summary>
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
          <h2>Heart rate</h2>
          <div className="chart-surface">
            <Suspense fallback={<Skeleton className="h-48" />}>
              <HeartRateChart data={stats.heartrate} day={day} offsetMinutes={profile.lastKnownUtcOffsetMinutes} />
            </Suspense>
          </div>
        </section>
      ) : null}
      {metric.unit === "score" && !metric.field.startsWith("contributors") && (
        <section className="detail-section">
          <h2>Score contributors</h2>
          <div className="metric-list list-panel">
            {METRICS.filter(
              (m) =>
                m.source === metric.source &&
                m.field.startsWith("contributors"),
            ).map((m) => (
              <button
                type="button"
                className="metric-row"
                key={m.id}
                onClick={() =>
                  navigate(`/metrics/${m.id}?profile=${profile.id}&day=${day}`)
                }
              >
                <span>{m.label.replace(" contributor", "")}</span>
                <strong>
                  {formatMetricValue(
                    m,
                    observations.find((o) => o.day === day)?.values[m.id],
                  )}
                </strong>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}
      {records.length > 0 && (
        <section className="detail-section">
          <h2>Recent records</h2>
          {records.map((e) => (
            <HighlightCard key={e.id} event={e} onClick={() => setEvent(e)} />
          ))}
        </section>
      )}
      {RECORD_SPEC_BY_ID[id] && (
        <section className="detail-section">
          <button
            type="button"
            className="text-action"
            onClick={() => navigate(`/records?metric=${id}`)}
          >
            <Sparkles size={16} aria-hidden="true" /> All {RECORD_SPEC_BY_ID[id].name} records
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
      {!metric.clock && (
        <details
          className="quiet-disclosure"
          open={showRelationships}
          onToggle={(e) => setShowRelationships(e.currentTarget.open)}
        >
          <summary>Compare with another measurement</summary>
          {showRelationships && (
            <Relationships observations={observations} metricId={id} />
          )}
        </details>
      )}
      <details className="quiet-disclosure">
        <summary>Sessions and tags</summary>
        {raw.isFetching ? (
          <p className="empty-note" role="status">Loading…</p>
        ) : stats ? (
          <DayContext stats={stats} day={day} />
        ) : (
          <p className="empty-note">Day details didn’t load.</p>
        )}
      </details>
      <RecordEvidenceSheet event={event} onClose={() => setEvent(null)} />
    </div>
  );
}

import React, { useMemo, useState } from "react";
import {
  dayDistance,
  formatMetricValue,
  type MetricDefinition,
} from "../../domain/metrics";
import { getDataAwareChartDomain } from "../../utils/chartScale";
export interface ChartSeries {
  label: string;
  color: string;
  points: Array<{ day: string; value: number }>;
}
export default function MetricChart({
  metric,
  series,
  compact = false,
}: {
  metric: MetricDefinition;
  series: ChartSeries[];
  compact?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const days = useMemo(
    () =>
      [...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].sort(),
    [series],
  );
  if (!days.length)
    return <p className="empty-note">No measurements in this period.</p>;
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const domain = getDataAwareChartDomain(values, {
    ...(metric.unit === "score" ||
    (metric.unit === "percent" && metric.id !== "activity_goal_percent")
      ? { min: 0, max: 100 }
      : {}),
  });
  const low = Number(domain[0]);
  const high = Number(domain[1]);
  const W = 360;
  const H = compact ? 80 : 200;
  const left = compact ? 2 : 56;
  const right = W - 8;
  const top = 12;
  const bottom = H - (compact ? 4 : 28);
  const distance = Math.max(1, dayDistance(days[0], days.at(-1)!));
  const x = (day: string) =>
    left + (dayDistance(days[0], day) / distance) * (right - left);
  const y = (value: number) =>
    bottom - ((value - low) / Math.max(0.001, high - low)) * (bottom - top);
  const active = selected && days.includes(selected) ? selected : days.at(-1)!;
  const shortDate = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const inspect = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = ((event.clientX - bounds.left) / bounds.width) * W;
    setSelected(
      days.reduce((best, day) =>
        Math.abs(x(day) - target) < Math.abs(x(best) - target) ? day : best,
      ),
    );
  };
  return (
    <div
      className={
        compact ? "metric-chart metric-chart--compact" : "metric-chart"
      }
    >
      {!compact && (
        <div className="chart-reading" aria-live="polite">
          <span>{shortDate(active)}</span>
          {series.map((s) => (
            <strong key={s.label}>
              <i style={{ background: s.color }} />
              {series.length > 1 && `${s.label} `}
              {formatMetricValue(
                metric,
                s.points.find((p) => p.day === active)?.value,
              )}
            </strong>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${metric.label}, ${shortDate(days[0])} to ${shortDate(days.at(-1)!)}. ${values.length} observations.`}
        onPointerDown={compact ? undefined : inspect}
        onPointerMove={
          compact
            ? undefined
            : (e) => {
                if (e.buttons || e.pointerType === "mouse") inspect(e);
              }
        }
      >
        {!compact &&
          [0, 0.5, 1].map((f) => {
            const value = low + (high - low) * f;
            return (
              <g key={f}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(value)}
                  y2={y(value)}
                  className="chart-grid"
                />
                <text x={left - 8} y={y(value) + 4} textAnchor="end">
                  {formatMetricValue(metric, value)
                    .replace(" years", "y")
                    .replace(" ml/kg/min", "")
                    .replace(" kcal", "")
                    .replace(" MET", "")}
                </text>
              </g>
            );
          })}
        {series.map((s) => (
          <g key={s.label}>
            <path
              d={s.points
                .map(
                  (p, i) =>
                    `${i === 0 || dayDistance(s.points[i - 1].day, p.day) > 1 ? "M" : "L"}${x(p.day).toFixed(2)},${y(p.value).toFixed(2)}`,
                )
                .join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={compact ? 2.5 : 2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {s.points.length === 1 && (
              <circle
                cx={x(s.points[0].day)}
                cy={y(s.points[0].value)}
                r="3"
                fill={s.color}
              />
            )}
          </g>
        ))}
        {!compact && (
          <>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={top}
              y2={bottom}
              className="chart-guide"
            />
            {series.map((s) => {
              const p = s.points.find((p) => p.day === active);
              return p ? (
                <circle
                  key={s.label}
                  cx={x(active)}
                  cy={y(p.value)}
                  r="4"
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              ) : null;
            })}
            <text x={left} y={H - 6}>
              {shortDate(days[0])}
            </text>
            <text x={right} y={H - 6} textAnchor="end">
              {shortDate(days.at(-1)!)}
            </text>
          </>
        )}
      </svg>
      {!compact && (
        <label className="chart-scrubber">
          <span className="sr-only">Inspect chart date</span>
          <input
            type="range"
            min="0"
            max={days.length - 1}
            value={days.indexOf(active)}
            onChange={(e) => setSelected(days[Number(e.target.value)])}
            aria-label={`Inspect ${metric.label} date`}
            aria-valuetext={`${shortDate(active)}: ${series.map((s) => formatMetricValue(metric, s.points.find((p) => p.day === active)?.value)).join(", ")}`}
          />
        </label>
      )}
    </div>
  );
}

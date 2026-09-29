import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { METRIC_BY_ID } from "../../domain/metrics";
import {
  RECORD_SPEC_BY_ID,
  type CurrentProgress,
  type MetricBests,
  type PersonalBests,
} from "../../domain/records";
import { formatRecordNumber, periodLabel, shortDate } from "../../domain/recordCopy";

/** The single most telling best for a metric: its best day, else week, month or streak. */
export function headlineBest(bests: MetricBests) {
  const spec = RECORD_SPEC_BY_ID[bests.metricId];
  for (const period of ["day", "week", "month"] as const) {
    const row = bests[period]?.rows[0];
    if (row)
      return {
        value: formatRecordNumber(bests.metricId, period, row.value, period === "day"),
        note:
          period === "day"
            ? `Best ${spec.unit} · ${shortDate(row.day)}`
            : `Best ${period} · ${periodLabel(period, row.startDay, row.day)}`,
      };
  }
  const streak = bests.streak?.rows[0];
  return streak
    ? {
        value: formatRecordNumber(bests.metricId, "streak", streak.value),
        note: `Longest streak · ${periodLabel("streak", streak.startDay, streak.day)}`,
      }
    : null;
}
/** One encouraging line about what is in progress right now, if anything is. */
export function paceNote(bests: MetricBests): string | null {
  const spec = RECORD_SPEC_BY_ID[bests.metricId];
  const find = (period: CurrentProgress["period"]) => bests.current.find((c) => c.period === period);
  const month = find("month");
  if (month?.wouldRank === 1 && month.recordedDays >= 7) return "On track: best month";
  const week = find("week");
  if (week?.wouldRank === 1 && week.recordedDays >= 4) return "On track: best week";
  const streak = find("streak");
  if (streak && streak.value >= 3)
    return `${streak.value}-${spec.unit} streak going`;
  return null;
}
const COLLAPSED = 6;
export default function TrophyCase({
  bests,
  onOpen,
}: {
  bests: PersonalBests;
  onOpen: (metricId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tiles = bests.metrics
    .filter((m) => RECORD_SPEC_BY_ID[m.metricId])
    .sort((a, b) => RECORD_SPEC_BY_ID[a.metricId].priority - RECORD_SPEC_BY_ID[b.metricId].priority)
    .flatMap((m) => {
      const best = headlineBest(m);
      return best ? [{ bests: m, best, pace: paceNote(m) }] : [];
    });
  if (!tiles.length) return null;
  return (
    <section className="trophy-case" aria-labelledby="trophy-case-title">
      <div className="section-title">
        <h2 id="trophy-case-title">Your bests</h2>
        <span>Tap for your top 5</span>
      </div>
      <div className="trophy-grid" id="trophy-grid">
        {(expanded ? tiles : tiles.slice(0, COLLAPSED)).map(({ bests: m, best, pace }) => {
          const spec = RECORD_SPEC_BY_ID[m.metricId];
          return (
            <button
              key={m.metricId}
              type="button"
              className={`trophy-tile trophy-tile--${METRIC_BY_ID[m.metricId].category}`}
              onClick={() => onOpen(m.metricId)}
              aria-label={`${spec.name}: ${best.value}. ${best.note}. See your top results`}
            >
              <span className="trophy-tile__name">
                {spec.name}
                <ChevronRight size={14} aria-hidden="true" />
              </span>
              <strong>{best.value}</strong>
              <small>{best.note}</small>
              {pace && <span className="trophy-tile__pace">{pace}</span>}
            </button>
          );
        })}
      </div>
      {tiles.length > COLLAPSED && (
        <button
          type="button"
          className="text-action trophy-more"
          aria-expanded={expanded}
          aria-controls="trophy-grid"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show fewer" : `Show all ${tiles.length} bests`}
        </button>
      )}
    </section>
  );
}

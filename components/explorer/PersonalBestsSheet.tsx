import React from "react";
import { ChevronRight } from "lucide-react";
import { Button, Dialog } from "../ui";
import { dayDistance } from "../../domain/metrics";
import {
  RECORD_SPEC_BY_ID,
  detailRange,
  type BestRow,
  type CurrentProgress,
  type EventPeriod,
  type MetricBests,
} from "../../domain/records";
import { formatRecordNumber, periodLabel } from "../../domain/recordCopy";

const periodTitle = (period: EventPeriod, unit: "night" | "day") =>
  period === "day" ? `Top ${unit}s` : period === "streak" ? "Longest streaks" : `Top ${period}s`;
function progressLine(metricId: string, progress: CurrentProgress): string {
  const spec = RECORD_SPEC_BY_ID[metricId];
  const number = (value: number) => formatRecordNumber(metricId, progress.period, value, false);
  if (progress.period === "streak")
    return `Current streak: ${formatRecordNumber(metricId, "streak", progress.value)} · ${
      progress.best == null || progress.value > progress.best
        ? "your longest yet"
        : `longest is ${progress.best}`
    }`;
  const so = `This ${progress.period} so far:`;
  if (spec.aggregate === "sum")
    return `${so} ${formatRecordNumber(metricId, progress.period, progress.value)}${progress.best != null ? ` · best is ${number(progress.best)}` : ""}`;
  const pace =
    progress.wouldRank === 1 ? "on pace for your best" : progress.wouldRank ? `on pace for #${progress.wouldRank}` : "";
  return [
    `${so} averaging ${number(progress.value)} over ${progress.recordedDays} ${spec.unit}s`,
    pace,
  ]
    .filter(Boolean)
    .join(" · ");
}
export default function PersonalBestsSheet({
  bests,
  profileId,
  onClose,
  onExplore,
  onSeeRecords,
}: {
  bests: MetricBests | null;
  profileId: string;
  onClose: () => void;
  onExplore: (destination: string) => void;
  onSeeRecords: (metricId: string) => void;
}) {
  const spec = bests ? RECORD_SPEC_BY_ID[bests.metricId] : null;
  const open = (period: EventPeriod, row: BestRow) =>
    onExplore(
      `/metrics/${bests!.metricId}?profile=${encodeURIComponent(profileId)}&day=${row.day}&range=${detailRange(period, dayDistance(row.startDay, row.day) + 1)}`,
    );
  const sections = bests
    ? (["day", "week", "month", "streak"] as const).flatMap((period) => {
        const set = bests[period];
        return set ? [{ period, set }] : [];
      })
    : [];
  return (
    <Dialog isOpen={Boolean(bests && spec)} title={spec ? `${spec.name}: your bests` : "Your bests"} onClose={onClose}>
      {bests && spec && (
        <div className="bests-sheet">
          {sections.map(({ period, set }) => {
            const progress = bests.current.find((c) => c.period === period);
            return (
              <section key={period} className="bests-section" aria-labelledby={`bests-${period}`}>
                <h3 id={`bests-${period}`}>{periodTitle(period, spec.unit)}</h3>
                <p className="fine-print">
                  {period === "streak"
                    ? `Consecutive ${spec.unit}s ${spec.streak?.condition || ""}`
                    : `${set.sampleCount.toLocaleString("en-US")} ${period === "day" ? `${spec.unit}s` : `${period}s`} recorded${
                        period !== "day" && spec.perDay ? " · daily average" : ""
                      }`}
                </p>
                {progress && <p className="bests-progress">{progressLine(bests.metricId, progress)}</p>}
                <ol className="ranking-list" aria-label={periodTitle(period, spec.unit)}>
                  {set.rows.map((row) => (
                    <li key={`${row.startDay}:${row.day}`}>
                      <button type="button" className="ranking-row" onClick={() => open(period, row)}>
                        <span className="ranking-number">#{row.rank}</span>
                        <span className="ranking-period">{periodLabel(period, row.startDay, row.day)}</span>
                        <strong className="ranking-value">
                          {formatRecordNumber(bests.metricId, period, row.value, false)}
                        </strong>
                        <ChevronRight size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
          {!bests.completeHistory && (
            <p className="fine-print">Based on your history since {periodLabel("day", bests.coverageStart, bests.coverageStart)}.</p>
          )}
          <Button variant="secondary" className="w-full" onClick={() => onSeeRecords(bests.metricId)}>
            See all {spec.name.toLowerCase()} records
          </Button>
        </div>
      )}
    </Dialog>
  );
}

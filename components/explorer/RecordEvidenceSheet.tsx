import React, { Fragment, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Button, Dialog } from "../ui";
import { METRIC_BY_ID, dayDistance, formatMetricValue, shiftDay } from "../../domain/metrics";
import { comparisonLabel, formatRecordValue, isSecondaryRecord, recordTitle, type HighlightEvent, type RecordRankingRow } from "../../domain/records";
import { readRecordRankings } from "../../services/insightsService";
import { navigate } from "../../hooks/useAppRoute";

const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});
export function recordPeriodLabel(start: string, end: string): string {
  if (start === end) return dateLabel(end);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}–${Number(end.slice(-2))}, ${end.slice(0, 4)}`;
  return `${dateLabel(start)} – ${dateLabel(end)}`;
}
const rankingKind = (event: HighlightEvent) => {
  const days = dayDistance(event.startDay, event.day) + 1;
  switch (event.family) {
    case "mean": return `${days}-day averages`;
    case "sum": return `${days}-day totals`;
    case "spread": return `${days}-day ${METRIC_BY_ID[event.metricId]?.clock ? "consistency" : "variation"}`;
    case "week": return "calendar weeks";
    case "month": return "calendar months";
    case "streak": return "streaks";
    case "change": return "changes in the 7-day average";
    case "friend_close": case "friend_lead": return "gaps on shared days";
    default: return "recorded days";
  }
};
const valueLabel = (event: HighlightEvent, value: number) => {
  const signed = event.family === "change" || event.family === "friend_lead";
  return `${signed && value !== 0 ? value > 0 ? "+" : "−" : ""}${formatRecordValue(METRIC_BY_ID[event.metricId], signed ? Math.abs(value) : value, event.family)}`;
};

function EvidenceContent({ event: supplied, onExplore }: { event: HighlightEvent; onExplore: (destination: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const rankings = useInfiniteQuery({
    queryKey: ["record-rankings", supplied.profileId, supplied.id, supplied.revision],
    initialPageParam: { offset: 0 } as { offset: number; revision?: string },
    queryFn: ({ pageParam, signal }) => readRecordRankings(supplied.profileId, supplied.id, pageParam, signal),
    getNextPageParam: page => page.nextOffset == null ? undefined : { offset: page.nextOffset, revision: page.revision },
    staleTime: 60_000, retry: 1,
  });
  const first = rankings.data?.pages[0];
  const event = first?.event || supplied;
  const rows = expanded ? rankings.data?.pages.flatMap(page => page.rows) || [] : first?.nearby || [];
  const openRow = (row: RecordRankingRow) => onExplore(`/metrics/${event.metricId}?profile=${encodeURIComponent(event.profileId)}&day=${row.day}&range=${Math.max(7, dayDistance(row.startDay, row.day) + 1)}`);
  const comparison = comparisonLabel(event.evidence);
  return <div className="record-evidence">
    <p className="eyebrow">{recordPeriodLabel(event.startDay, event.day)}</p>
    <h2>{recordTitle(event).replace(` ${comparison}`, "")}</h2>
    <div className="record-result">
      <strong>{valueLabel(event, event.family === "friend_close" ? Math.abs(event.value) : event.value)}</strong>
      <span>#{event.evidence.rank}{event.evidence.tied > 1 ? " · tied" : ""}<small>of {event.evidence.sampleCount.toLocaleString()} {rankingKind(event)}</small></span>
    </div>
    <p className="record-comparison">{comparison[0].toUpperCase() + comparison.slice(1)}</p>
    {event.provisional && <p className="empty-note">Still updating today. This result can change.</p>}
    <section className="record-rankings" aria-labelledby="record-rankings-title">
      <h3 id="record-rankings-title">How this compares</h3>
      <p className="fine-print">{event.family === "streak" ? "Longest first" : event.family === "friend_close" ? "Closest first" : event.family === "spread" ? event.direction === "low" ? "Most consistent first" : "Most changeable first" : event.direction === "high" ? "Highest first" : "Lowest first"} · Ranked as of {dateLabel(event.day)}</p>
      {rankings.isPending && <p className="empty-note" role="status">Finding the results around this record…</p>}
      {rankings.isError && <div className="empty-note" role="alert">
        <p>{["rankings_preparing", "rankings_updated"].includes((rankings.error as { code?: string })?.code || "")
          ? "Your history is being updated. The matching rankings will be ready shortly."
          : "The surrounding results couldn’t load."}</p>
        <Button variant="secondary" onClick={() => void rankings.refetch()}>Try again</Button>
      </div>}
      <ol className="ranking-list" aria-label="Historical rankings">
        {rows.map((row, index) => <Fragment key={`${row.startDay}:${row.day}`}>
          {index > 0 && row.position > rows[index - 1].position + 1 && <li className="ranking-gap">Other results between these ranks</li>}
          <li>
            <button type="button" className={`ranking-row ${row.selected ? "ranking-row--selected" : ""}`}
              aria-current={row.selected ? "true" : undefined} onClick={() => openRow(row)}>
              <span className="ranking-number">#{row.rank}{row.tied > 1 && <small>Tied</small>}</span>
              <span className="ranking-period">{recordPeriodLabel(row.startDay, row.day)}
                {row.selected && <small className="ranking-selected-label">This record</small>}
                {event.family === "change" && <small>vs {recordPeriodLabel(shiftDay(row.startDay, -7), shiftDay(row.day, -7))}</small>}
                {row.threshold != null && <small>{event.direction === "high" ? "At or above" : "Below"} {formatMetricValue(event.metricId, row.threshold)}</small>}
                {row.ownValue != null && <small>You {formatMetricValue(event.metricId, row.ownValue)} · Friend {formatMetricValue(event.metricId, row.peerValue)}</small>}
              </span>
              <strong className="ranking-value">{valueLabel(event, row.value)}</strong>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </li>
        </Fragment>)}
      </ol>
      {first && !expanded && first.total > first.nearby.length && <Button variant="secondary" className="w-full" onClick={() => setExpanded(true)}>Browse all {first.total.toLocaleString()} results</Button>}
      {expanded && rankings.hasNextPage && <Button variant="secondary" className="w-full" disabled={rankings.isFetchingNextPage} onClick={() => void rankings.fetchNextPage()}>{rankings.isFetchingNextPage ? "Loading…" : "Show more rankings"}</Button>}
      {expanded && <button type="button" className="text-action ranking-reset" onClick={() => setExpanded(false)}>Back to the surrounding results</button>}
      {first && <p className="fine-print">Tap a result to explore that date. Tied results share a rank.{["mean", "sum", "spread", "change"].includes(event.family) ? " Rolling periods can overlap." : ""}</p>}
    </section>
    <details>
      <summary>About this comparison</summary>
      <p>Only results recorded on or before {dateLabel(event.day)} are included. Missing or excluded days do not count toward complete periods or streaks.</p>
      {event.family === "spread" && <p>Smaller numbers mean the daily values stayed closer together; larger numbers mean they changed more.</p>}
      {event.evidence.threshold != null && <p>Each streak uses its own baseline, fixed before the streak began.{event.evidence.baselineStart && event.evidence.baselineEnd ? ` This one used ${dateLabel(event.evidence.baselineStart)} through ${dateLabel(event.evidence.baselineEnd)}.` : ""}</p>}
      {event.relatedEvidence.length > 0 && <><h4>Also stands out in</h4>{event.relatedEvidence.map(e => <p key={e.windowDays || "all"}>#{e.rank} {comparisonLabel(e)} · {e.sampleCount.toLocaleString()} results</p>)}</>}
    </details>
    <details>
      <summary>Why this stood out</summary>
      <p>This result ranked #{event.evidence.rank} among {event.evidence.sampleCount.toLocaleString()} comparable results. Its notability score is {event.score}/100, based on rarity, history, size of change, persistence and how recently it happened.</p>
      {isSecondaryRecord(event) && <p>Variation records stay in your archive; clearer day-to-day achievements take priority in your highlights.</p>}
    </details>
    <Button className="w-full" onClick={() => onExplore(event.detailPath)}>Explore this metric <ChevronRight size={16} /></Button>
  </div>;
}

export default function RecordEvidenceSheet({ event, onClose, onExplore }: {
  event: HighlightEvent | null; onClose: () => void; onExplore?: (destination: string) => void;
}) {
  const explore = onExplore || ((destination: string) => { onClose(); navigate(destination); });
  return <Dialog isOpen={Boolean(event)} title="The story behind the record" onClose={onClose}>
    {event && <EvidenceContent key={`${event.id}:${event.revision}`} event={event} onExplore={explore} />}
  </Dialog>;
}

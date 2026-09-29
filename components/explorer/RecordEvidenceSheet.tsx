import React, { Fragment, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Button, Dialog } from "../ui";
import { dayDistance, formatMetricValue } from "../../domain/metrics";
import {
  RECORD_SPEC_BY_ID,
  detailRange,
  isFriendRecord,
  type EventPeriod,
  type HighlightEvent,
  type RecordPoint,
  type RecordRankingRow,
} from "../../domain/records";
import {
  eventPeriod,
  formatRecordNumber,
  friendName,
  gapLabel,
  legacyComparisonLabel,
  periodLabel,
  rankNoun,
  rankOrderLabel,
  recordHeadline,
  shortDate,
  streakCondition,
} from "../../domain/recordCopy";
import { readRecordRankings } from "../../services/insightsService";
import { navigate } from "../../hooks/useAppRoute";
import { useProfileFirstName } from "../../contexts/UserContext";

const signed = (event: HighlightEvent, value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMetricValue(event.metricId, Math.abs(value))}`;
function valueLabel(event: HighlightEvent, period: EventPeriod | null, value: number) {
  if (event.kind === "friend_margin") return signed(event, value);
  if (!event.kind || !period) return formatMetricValue(event.metricId, value);
  return formatRecordNumber(event.metricId, period, value, false);
}
const pointLabel = (point: RecordPoint, period: EventPeriod) =>
  periodLabel(period, point.startDay, point.day);

function Glance({ event, period, name }: { event: HighlightEvent; period: EventPeriod; name: string }) {
  const { previousRecord, lastAsExtreme, usual, coveredDays, expectedDays, total, ownValue, peerValue } = event.evidence;
  const spec = RECORD_SPEC_BY_ID[event.metricId];
  const number = (value: number) => formatRecordNumber(event.metricId, period, value, false);
  const rows: Array<[string, string, string?]> = [];
  const high = event.direction === "high";
  if (event.kind === "friend_margin") {
    const day = (value: number) => formatRecordNumber(event.metricId, "day", value, false);
    if (ownValue != null) rows.push(["You", day(ownValue), shortDate(event.day)]);
    if (peerValue != null) rows.push([name, day(peerValue), shortDate(event.day)]);
    if (previousRecord)
      rows.push(["Previous biggest win", signed(event, previousRecord.value), `${shortDate(previousRecord.day)} · stood for ${gapLabel(dayDistance(previousRecord.day, event.day))}`]);
  } else if (event.kind === "friend_streak") {
    rows.push(["Counts when", `Every ${spec?.unit === "night" ? "night" : "day"} you both record and you come out ahead`]);
    if (previousRecord) rows.push(["Previous longest run", number(previousRecord.value), pointLabel(previousRecord, "streak")]);
  } else if (event.kind === "streak_record" || event.kind === "streak_milestone") {
    rows.push(["Counts when", `Every ${spec?.unit === "night" ? "night" : "day"} ${streakCondition(event.metricId)}`]);
    if (previousRecord)
      rows.push(["Previous longest", number(previousRecord.value), pointLabel(previousRecord, "streak")]);
  } else {
    if (event.kind === "personal_best" && previousRecord)
      rows.push([
        event.evidence.tied > 1 ? "Matches" : "Previous best",
        number(previousRecord.value),
        `${pointLabel(previousRecord, period)} · stood for ${gapLabel(dayDistance(previousRecord.day, event.day))}`,
      ]);
    if (event.kind === "top3" && previousRecord)
      rows.push(["Your best", number(previousRecord.value), pointLabel(previousRecord, period)]);
    if (event.kind === "worst" && previousRecord && !lastAsExtreme)
      rows.push(["Previous low", number(previousRecord.value), pointLabel(previousRecord, period)]);
    if (lastAsExtreme)
      rows.push([
        `Last this ${high ? "high" : "low"}`,
        number(lastAsExtreme.value),
        pointLabel(lastAsExtreme, period),
      ]);
    if (usual) {
      const window = period === "day" ? "previous 90 days" : period === "week" ? "previous 12 weeks" : "previous 6 months";
      rows.push(["Your usual", number(usual.value), `Median of the ${window}`]);
      const difference = event.value - usual.value;
      if (Math.abs(difference) > 1e-9)
        rows.push(["Difference", `${difference > 0 ? "+" : "−"}${number(Math.abs(difference))}`, "Compared with your usual"]);
    }
    if (period !== "day" && coveredDays && expectedDays)
      rows.push(["Recorded", `${coveredDays} of ${expectedDays} days`, spec?.perDay && total ? `${total.toLocaleString("en-US")} total` : undefined]);
  }
  if (!rows.length) return null;
  return (
    <dl className="record-glance">
      {rows.map(([label, value, note]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value}
            {note && <small>{note}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HowRecordsWork({ event }: { event: HighlightEvent }) {
  const spec = RECORD_SPEC_BY_ID[event.metricId];
  if (isFriendRecord(event))
    return (
      <details>
        <summary>How friend records work</summary>
        <p>Friend records only compare days you both recorded, up to {shortDate(event.day)}.</p>
        <p>
          A biggest win counts once you have at least 10 earlier wins and needs a bigger margin than
          all of them. A winning run counts consecutive days you came out ahead; a tie or a missing
          day ends it. Runs are recognized when they become your longest or reach 7, 14, 21 or 30
          days and beyond.
        </p>
      </details>
    );
  return (
    <details>
      <summary>How records work</summary>
      <p>
        Every record compares against your whole history up to {shortDate(event.day)}. Nothing
        recorded later is counted.
      </p>
      <p>
        Weeks run Monday to Sunday and need at least 6 recorded days. Months need 80% of their
        days. {spec?.aggregate === "sum" ? "Weekly and monthly workouts are totals." : "Weeks and months use your daily average."}
      </p>
      {spec?.streak && (
        <p>
          Streaks count consecutive days {spec.streak.condition}. A missing day ends a streak.
        </p>
      )}
      <p>
        “Best in a while” means nothing this good has happened in at least 3 months.
        “Worth noticing” means nothing this far off has happened in at least 4 months.
      </p>
      {!event.evidence.completeHistory && (
        <p>Your earlier history isn’t fully available, so “ever” means since {shortDate(event.evidence.coverageStart)}.</p>
      )}
    </details>
  );
}

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
  const name = friendName(event, useProfileFirstName(event.peerId));
  const period = eventPeriod(event);
  const legacy = !event.kind;
  const rows = expanded ? rankings.data?.pages.flatMap(page => page.rows) || [] : first?.nearby || [];
  const openRow = (row: RecordRankingRow) => onExplore(`/metrics/${event.metricId}?profile=${encodeURIComponent(event.profileId)}&day=${row.day}&range=${detailRange(period || "day", dayDistance(row.startDay, row.day) + 1)}`);
  const lowSide = event.kind === "worst" ? (RECORD_SPEC_BY_ID[event.metricId]?.better === "low" ? "highest " : "lowest ") : "";
  return <div className="record-evidence">
    <p className="eyebrow">{period ? periodLabel(period, event.startDay, event.day) : shortDate(event.day)}</p>
    <h2>{recordHeadline(event, name)}</h2>
    <div className="record-result">
      <strong>{valueLabel(event, period, event.value)}</strong>
      <span>#{event.evidence.rank}{event.evidence.tied > 1 ? " · tied" : ""}<small>{lowSide}of {event.evidence.sampleCount.toLocaleString("en-US")} {rankNoun(event)}</small></span>
    </div>
    {legacy && <p className="record-comparison">{legacyComparisonLabel(event.evidence).replace(/^./, c => c.toUpperCase())}</p>}
    {!legacy && period && <Glance event={event} period={period} name={name} />}
    {event.provisional && <p className="empty-note">Still counting today. This result can change.</p>}
    <section className="record-rankings" aria-labelledby="record-rankings-title">
      <h3 id="record-rankings-title">How this compares</h3>
      <p className="fine-print">{rankOrderLabel(event)} · Through {shortDate(event.day)}</p>
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
              <span className="ranking-period">{period ? periodLabel(period, row.startDay, row.day) : shortDate(row.day)}
                {row.selected && <small className="ranking-selected-label">This record</small>}
                {row.ownValue != null && <small>You {formatMetricValue(event.metricId, row.ownValue)} · {name} {formatMetricValue(event.metricId, row.peerValue)}</small>}
              </span>
              <strong className="ranking-value">{valueLabel(event, period, row.value)}</strong>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </li>
        </Fragment>)}
      </ol>
      {first && !expanded && first.total > first.nearby.length && <Button variant="secondary" className="w-full" onClick={() => setExpanded(true)}>Browse all {first.total.toLocaleString("en-US")} results</Button>}
      {expanded && rankings.hasNextPage && <Button variant="secondary" className="w-full" disabled={rankings.isFetchingNextPage} onClick={() => void rankings.fetchNextPage()}>{rankings.isFetchingNextPage ? "Loading…" : "Show more rankings"}</Button>}
      {expanded && <button type="button" className="text-action ranking-reset" onClick={() => setExpanded(false)}>Back to the surrounding results</button>}
      {first && <p className="fine-print">Tap a result to explore that date. Tied results share a rank.</p>}
    </section>
    {!legacy && <HowRecordsWork event={event} />}
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

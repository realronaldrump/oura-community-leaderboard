import { METRIC_BY_ID, dayDistance, formatMetricValue, shiftDay } from "./metrics.js";
import { MIN_STREAK_RECORD, RECORD_SPEC_BY_ID, type RecordSpec } from "./recordSpecs.js";
import type {
  EventPeriod,
  HighlightEvent,
  RecordEvidence,
  RecordPoint,
} from "./records.js";

/** Plain-language wording for records. Pure, shared by the server and the app. */
const date = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
export const shortDate = (day: string) => date(day, { month: "short", day: "numeric", year: "numeric" });
const monthDay = (day: string) => date(day, { month: "short", day: "numeric" });
export const monthYear = (day: string) => date(day, { month: "short", year: "numeric" });
const longMonth = (day: string) => date(day, { month: "long", year: "numeric" });
const weekdayDate = (day: string) => date(day, { weekday: "short", month: "short", day: "numeric" });
export const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const eventPeriod = (e: Pick<HighlightEvent, "period" | "family">): EventPeriod | null =>
  e.period ??
  (e.family === "week" || e.family === "month" || e.family === "streak"
    ? e.family
    : ["daily", "shared", "friend_lead", "friend_close", "friend_margin"].includes(e.family)
      ? "day"
      : null);

/** "Sep 29, 2026", "Week of Sep 21–27, 2026", "September 2026", "Sep 12 – 29, 2026". */
export function periodLabel(period: EventPeriod, startDay: string, day: string, withYear = true): string {
  if (period === "day") return withYear ? shortDate(day) : weekdayDate(day);
  if (period === "month") return withYear ? longMonth(day) : date(day, { month: "long" });
  const year = withYear ? `, ${day.slice(0, 4)}` : "";
  const range =
    startDay === day
      ? monthDay(day)
      : startDay.slice(0, 4) !== day.slice(0, 4)
        ? `${shortDate(startDay)} – ${shortDate(day)}`
        : startDay.slice(0, 7) === day.slice(0, 7)
          ? `${monthDay(startDay)}–${Number(day.slice(8))}${year}`
          : `${monthDay(startDay)} – ${monthDay(day)}${year}`;
  return period === "week" ? `Week of ${range}` : range;
}
const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
/** "3 months", "8 weeks", "2 years": how long since this last happened. */
export function gapLabel(days: number): string {
  if (days < 14) return plural(Math.max(1, days), "day");
  if (days < 56) return plural(Math.round(days / 7), "week");
  if (days < 730) return plural(Math.round(days / 30.44), "month");
  return plural(Math.round(days / 365.25), "year");
}
/** "ever" only when the whole history was scanned and covers at least a year. */
export function everLabel(evidence: Pick<RecordEvidence, "completeHistory" | "coverageStart">, day: string) {
  if (!evidence.completeHistory) return `since ${monthYear(evidence.coverageStart)}`;
  if (dayDistance(evidence.coverageStart, day) < 365) return "since you started";
  return "ever";
}
const units = (spec: RecordSpec | undefined, count: number) =>
  `${spec?.unit === "night" ? "night" : "day"}${count === 1 ? "" : "s"}`;
/** A bare value in the record's own terms: "92", "7h 31m", "11,240 steps", "12 nights". */
export function formatRecordNumber(
  metricId: string,
  period: EventPeriod,
  value: number,
  withSuffix = true,
): string {
  const m = METRIC_BY_ID[metricId];
  const spec = RECORD_SPEC_BY_ID[metricId];
  if (!m) return String(value);
  if (period === "streak") return `${value} ${units(spec, value)}`;
  if (m.unit === "seconds" || m.clock) return formatMetricValue(m, value);
  const precision =
    period === "day" || spec?.aggregate === "sum" || spec?.perDay ? m.precision : Math.max(1, m.precision);
  return `${formatMetricValue({ ...m, precision }, value)}${withSuffix ? spec?.valueSuffix || "" : ""}`;
}
const when = (point: RecordPoint, period: EventPeriod) =>
  period === "day"
    ? shortDate(point.day)
    : period === "week"
      ? `week of ${shortDate(point.startDay)}`
      : monthYear(point.day);

export function legacyComparisonLabel(evidence: RecordEvidence) {
  return evidence.windowDays
    ? `in ${evidence.windowDays} days`
    : evidence.completeHistory
      ? "of all time"
      : `since ${shortDate(evidence.coverageStart)}`;
}
/** The friend's current name when the app knows it, else the name stored with the record. */
export const friendName = (e: Pick<HighlightEvent, "peerName">, current?: string) =>
  current || e.peerName || "your friend";
const possessive = (name: string) => (name === "your friend" ? "your friend’s" : `${name}’s`);
/** "You out-stepped Sam", "You beat Sam’s sleep score". */
const beat = (e: HighlightEvent, name: string) => {
  const rival = RECORD_SPEC_BY_ID[e.metricId]?.rival;
  return rival?.verb ? `You ${rival.verb} ${name}` : `You beat ${possessive(name)} ${rival?.noun || "result"}`;
};
function friendHeadline(e: HighlightEvent, name: string) {
  const spec = RECORD_SPEC_BY_ID[e.metricId];
  if (e.kind === "friend_margin") return `Your biggest ${spec?.rival?.noun || "result"} win over ${name}`;
  const run = `${beat(e, name)} ${e.value} ${units(spec, e.value)} in a row`;
  const previous = e.evidence.previousRecord;
  return e.value === Math.max(MIN_STREAK_RECORD, (previous?.value ?? 0) + 1)
    ? `New longest run: ${lowerFirst(run)}`
    : run;
}

export function recordHeadline(e: HighlightEvent, peerName?: string): string {
  if (!e.kind) return e.title.replace(` ${legacyComparisonLabel(e.evidence)}`, "");
  if (e.kind === "friend_margin" || e.kind === "friend_streak") return friendHeadline(e, friendName(e, peerName));
  const spec = RECORD_SPEC_BY_ID[e.metricId];
  const period = eventPeriod(e);
  if (!spec || !period) return e.title;
  if (period === "streak") {
    const condition = spec.streak?.condition || "";
    return e.kind === "streak_record"
      ? `New longest streak: ${e.value} ${units(spec, e.value)} ${condition}`
      : `${e.value} ${units(spec, e.value)} in a row ${condition}`;
  }
  const best = spec.best[period];
  const worst = spec.worst[period];
  const ever = everLabel(e.evidence, e.day);
  const last = e.evidence.lastAsExtreme;
  const gap = last ? gapLabel(dayDistance(last.day, e.day)) : "";
  switch (e.kind) {
    case "personal_best":
      return e.evidence.tied > 1 ? `Tied for ${lowerFirst(best)} ${ever}` : `${best} ${ever}`;
    case "top3":
      return upperFirst(
        `${e.evidence.tied > 1 ? "tied for " : ""}${ordinal(e.evidence.rank)} ${lowerFirst(best)} ${ever}`,
      );
    case "best_since":
      return `${best} in ${gap}`;
    case "worst":
      return last ? `${worst} in ${gap}` : `${worst} ${ever}`;
    default:
      return e.title;
  }
}

/** The value and what it means: "92 · previous best 90 (Jun 3, 2025)". */
export function recordValueLine(e: HighlightEvent, peerName?: string): string {
  if (!e.kind) return e.description;
  if (e.kind === "friend_margin" || e.kind === "friend_streak") {
    const name = friendName(e, peerName);
    const plain = (value: number) => formatRecordNumber(e.metricId, "day", value, false);
    const previous = e.evidence.previousRecord;
    const scores =
      e.kind === "friend_margin" && e.evidence.ownValue != null && e.evidence.peerValue != null
        ? `You ${plain(e.evidence.ownValue)}, ${name} ${plain(e.evidence.peerValue)}`
        : "";
    const clause =
      e.kind === "friend_margin"
        ? previous
          ? `previous biggest win ${plain(previous.value)} (${shortDate(previous.day)})`
          : ""
        : previous && previous.value >= e.value
          ? `your longest run is ${previous.value}`
          : previous
            ? `previous longest ${previous.value} (${monthYear(previous.day)})`
            : "your longest run yet";
    return upperFirst([scores, clause].filter(Boolean).join(" · "));
  }
  const spec = RECORD_SPEC_BY_ID[e.metricId];
  const period = eventPeriod(e);
  if (!spec || !period) return e.description;
  const plain = (value: number) => formatRecordNumber(e.metricId, period, value, false);
  const m = METRIC_BY_ID[e.metricId];
  const previous = e.evidence.previousRecord;
  const usual = e.evidence.usual;
  const last = e.evidence.lastAsExtreme;
  let main = "";
  if (period === "day") main = formatRecordNumber(e.metricId, period, e.value);
  else if (period !== "streak")
    main =
      spec.aggregate === "sum"
        ? formatRecordNumber(e.metricId, period, e.value)
        : `Averaged ${formatRecordNumber(e.metricId, period, e.value)}${spec.perDay ? " a day" : m?.unit === "seconds" ? " a night" : ""}`;
  let clause = "";
  switch (e.kind) {
    case "personal_best":
      clause = previous
        ? e.evidence.tied > 1
          ? `same as ${when(previous, period)}`
          : `previous best ${plain(previous.value)} (${when(previous, period)})`
        : "";
      break;
    case "top3":
      clause = previous ? `your best is ${plain(previous.value)} (${when(previous, period)})` : "";
      break;
    case "best_since":
    case "worst":
      clause = usual
        ? `usually ${plain(usual.value)}`
        : last
          ? `last this ${(e.direction === "high") ? "high" : "low"} ${when(last, period)}`
          : "";
      break;
    case "streak_record":
      clause = previous
        ? `Previous longest ${previous.value} (${monthYear(previous.day)})`
        : "Your first streak this long";
      break;
    case "streak_milestone":
      clause = previous && previous.value > e.value ? `Your longest is ${previous.value}` : "Your longest yet";
      break;
  }
  return [main, clause, e.provisional ? "still counting" : ""].filter(Boolean).join(" · ");
}

/** A short "when" line for cards. Day records rely on the surrounding date unless it's yesterday. */
export function recordContext(e: HighlightEvent, relativeTo?: string): string | null {
  if (!e.kind) return legacyComparisonLabel(e.evidence);
  const period = eventPeriod(e);
  if (period === "week" || period === "month") return periodLabel(period, e.startDay, e.day, false);
  if (period === "streak") return `Since ${monthDay(e.startDay)}`;
  if (!relativeTo || e.day === relativeTo) return null;
  return e.day === shiftDay(relativeTo, -1) ? "Yesterday" : weekdayDate(e.day);
}

export type RecordIcon = "trophy" | "medal" | "sparkles" | "flame" | "trending-down" | "users";
export function recordEyebrow(e: HighlightEvent, peerName?: string): { label: string; icon: RecordIcon } {
  switch (e.kind) {
    case "personal_best":
      return { label: "Personal best", icon: "trophy" };
    case "top3":
      return { label: "One of your best", icon: "medal" };
    case "best_since":
      return { label: "Best in a while", icon: "sparkles" };
    case "streak_record":
      return { label: "Longest streak", icon: "flame" };
    case "streak_milestone":
      return { label: "Streak", icon: "flame" };
    case "worst":
      return { label: "Worth noticing", icon: "trending-down" };
    case "friend_margin":
    case "friend_streak":
      return { label: `You vs ${friendName(e, peerName)}`, icon: "users" };
  }
  return e.tone === "unfavorable"
    ? { label: "Worth noticing", icon: "trending-down" }
    : e.evidence.rank === 1
      ? { label: "A new record", icon: "trophy" }
      : { label: "Something stands out", icon: "sparkles" };
}
export function rankNoun(e: HighlightEvent): string {
  if (e.kind === "friend_margin") return "days you both recorded";
  if (e.kind === "friend_streak") return "winning runs";
  const period = eventPeriod(e);
  const spec = RECORD_SPEC_BY_ID[e.metricId];
  if (!e.kind || !period) return "results";
  return period === "day" ? units(spec, 2) : `${period}s`;
}
/** "#1 of 142 weeks", "Tied #2 of 900 nights", "#1 lowest of 900 nights". */
export function rankLabel(e: HighlightEvent): string {
  const spec = RECORD_SPEC_BY_ID[e.metricId];
  const side = e.kind === "worst" ? (spec?.better === "low" ? " highest" : " lowest") : "";
  return `${e.evidence.tied > 1 ? "Tied " : ""}#${e.evidence.rank}${side} of ${e.evidence.sampleCount.toLocaleString("en-US")} ${rankNoun(e)}`;
}
export function rankOrderLabel(e: HighlightEvent): string {
  if (e.kind === "streak_record" || e.kind === "streak_milestone" || e.family === "streak") return "Longest first";
  if (e.kind === "friend_streak") return "Longest first";
  if (e.kind === "friend_margin") return "Biggest margin first";
  return e.direction === "high" ? "Highest first" : "Lowest first";
}
export const streakCondition = (metricId: string) => RECORD_SPEC_BY_ID[metricId]?.streak?.condition || "";

import React from "react";
import { ArrowUpRight, Sparkles, TrendingDown, Trophy } from "lucide-react";
import { comparisonLabel, recordTitle, type HighlightEvent } from "../../domain/records";
export default function HighlightCard({
  event,
  hero = false,
  onClick,
}: {
  event: HighlightEvent;
  hero?: boolean;
  onClick: () => void;
}) {
  const Icon =
    event.tone === "unfavorable"
      ? TrendingDown
      : event.evidence.rank === 1
        ? Trophy
        : Sparkles;
  return (
    <button
      type="button"
      className={`highlight-card ${hero ? "highlight-card--hero" : ""} highlight-card--${event.category}`}
      onClick={onClick}
    >
      <div className="highlight-card__top">
        <span>
          <Icon size={15} />
          {event.tone === "unfavorable"
            ? "Worth noticing"
            : event.evidence.rank === 1
              ? "A new record"
              : "Something stands out"}
        </span>
        <ArrowUpRight size={18} />
      </div>
      <h2>{recordTitle(event).replace(` ${comparisonLabel(event.evidence)}`, "")}</h2>
      <p>{event.description}</p>
      <p className="highlight-context">{comparisonLabel(event.evidence)}</p>
      {hero && (
        <div className="highlight-card__foot">
          <span>
            {event.evidence.completeHistory
              ? "Your history, in perspective"
              : `Your history since ${event.evidence.coverageStart.slice(0, 4)}`}
          </span>
          <span>Take a closer look</span>
        </div>
      )}
    </button>
  );
}

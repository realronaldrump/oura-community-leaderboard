import React from "react";
import {
  ArrowUpRight,
  Flame,
  Medal,
  Sparkles,
  TrendingDown,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { HighlightEvent } from "../../domain/records";
import {
  rankLabel,
  recordContext,
  recordEyebrow,
  recordHeadline,
  recordValueLine,
  type RecordIcon,
} from "../../domain/recordCopy";
const ICONS: Record<RecordIcon, LucideIcon> = {
  trophy: Trophy,
  medal: Medal,
  sparkles: Sparkles,
  flame: Flame,
  "trending-down": TrendingDown,
  users: Users,
};
export default function HighlightCard({
  event,
  hero = false,
  relativeTo,
  onClick,
}: {
  event: HighlightEvent;
  hero?: boolean;
  /** The day the card is shown on, so a record from the day before reads "Yesterday". */
  relativeTo?: string;
  onClick: () => void;
}) {
  const eyebrow = recordEyebrow(event);
  const Icon = ICONS[eyebrow.icon];
  const context = recordContext(event, relativeTo);
  return (
    <button
      type="button"
      className={`highlight-card ${hero ? "highlight-card--hero" : ""} highlight-card--${event.category} ${event.tone === "unfavorable" ? "highlight-card--unfavorable" : ""}`}
      onClick={onClick}
    >
      <div className="highlight-card__top">
        <span>
          <Icon size={15} aria-hidden="true" />
          {eyebrow.label}
        </span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </div>
      <h2>{recordHeadline(event)}</h2>
      <p className="highlight-value">{recordValueLine(event)}</p>
      {context && <p className="highlight-context">{context}</p>}
      {hero && (
        <div className="highlight-card__foot">
          <span>{event.kind ? rankLabel(event) : "Your history, in perspective"}</span>
          <span>Take a closer look</span>
        </div>
      )}
    </button>
  );
}

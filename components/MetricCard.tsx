import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export type MetricType = 'sleep_duration' | 'time_in_bed' | 'deep_sleep' | 'rem_sleep' | 'light_sleep' | 'efficiency' |
    'lowest_hr' | 'avg_hr' | 'heart_rate' | 'hrv' | 'spo2' |
    'steps' | 'active_calories' | 'total_calories' | 'walking_distance' | 'high_activity' | 'medium_activity' | 'low_activity' | 'sedentary_time';

interface MetricCardProps {
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  subtext?: string;
  color?: string;
  icon?: React.ReactNode;
  glowColor?: string;
  onClick?: () => void;
  metricType?: MetricType;
  showDrillDownIndicator?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtext,
  color = '#2D2A26',
  icon,
  onClick,
  showDrillDownIndicator = false,
}) => {
  const content = (
    <>
      <div className="metric-card__header">
        <h3>{title}</h3>
        {icon ? <span style={{ color: value != null ? color : undefined }}>{icon}</span> : null}
        {showDrillDownIndicator && onClick ? <ArrowUpRight className="metric-card__indicator" aria-hidden="true" /> : null}
      </div>
      <div className="metric-card__value-row">
        <span className="metric-card__value" style={{ color: value != null ? color : undefined }}>
          {value ?? '—'}
        </span>
        {unit && value != null ? <span className="metric-card__unit">{unit}</span> : null}
      </div>
      {subtext ? <p className="metric-card__support">{subtext}</p> : null}
    </>
  );

  if (!onClick) {
    return <div className="metric-card">{content}</div>;
  }

  const spokenValue = value == null ? 'Not available' : `${value}${unit ? ` ${unit}` : ''}`;
  const spokenSupport = subtext?.trim().replace(/[.!?]+$/, '');
  return (
    <button
      type="button"
      className="metric-card metric-card--interactive"
      aria-label={`${title}: ${spokenValue}.${spokenSupport ? ` ${spokenSupport}.` : ''} View details`}
      onClick={() => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        onClick();
      }}
    >
      {content}
    </button>
  );
};

export default React.memo(MetricCard);

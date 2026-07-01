import React, { useState } from 'react';
import { useHapticFeedback } from './ios';
import { Info } from 'lucide-react';

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
  glowColor,
  onClick,
  metricType,
  showDrillDownIndicator = false,
}) => {
  const { triggerHaptic } = useHapticFeedback();
  const [isPressed, setIsPressed] = useState(false);

  const handleTouchStart = () => {
    setIsPressed(true);
    if (onClick) {
      triggerHaptic('light');
    }
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      className={`bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] p-4 flex flex-col justify-between min-h-[96px] ${isPressed ? 'shadow-clay-inset' : 'shadow-clay-sm'} ${onClick ? 'cursor-pointer ios-card hover:shadow-clay hover:-translate-y-0.5' : ''} relative group/card transition-all duration-200`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={onClick}
    >
      {/* Drill Down Indicator */}
      {showDrillDownIndicator && onClick && (
        <div className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-40 transition-opacity duration-200">
          <Info className="w-3.5 h-3.5 text-[#A8A29E]" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2 relative z-10 pr-5">
        <h3 className="text-[#A8A29E] text-xs font-semibold tracking-wide">
          {title}
        </h3>
        {icon && (
          <span
            className="text-[#A8A29E]"
            style={{ color: value != null ? color : undefined }}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5 relative z-10">
        <span
          className="text-2xl font-mono font-bold transition-all duration-200"
          style={{
            color,
            transform: isPressed ? 'scale(0.95)' : 'scale(1)',
          }}
        >
          {value ?? '--'}
        </span>
        {unit && value != null && (
          <span className="text-[#C8C2BB] text-xs font-medium">{unit}</span>
        )}
      </div>

      {/* Subtext */}
      {subtext && (
        <p className="text-[11px] text-[#A8A29E] mt-2 relative z-10 leading-relaxed">
          {subtext}
        </p>
      )}

    </div>
  );
};

export default React.memo(MetricCard);

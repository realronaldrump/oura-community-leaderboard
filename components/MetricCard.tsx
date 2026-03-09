import React, { useRef, useState } from 'react';
import { useTilt } from '../hooks/useMousePosition';
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
  tiltEnabled?: boolean;
  onClick?: () => void;
  metricType?: MetricType;
  showDrillDownIndicator?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtext,
  color = '#f5f5f5',
  icon,
  glowColor,
  tiltEnabled = true,
  onClick,
  metricType,
  showDrillDownIndicator = false,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { style: tiltStyle } = useTilt(cardRef as React.RefObject<HTMLElement>, 8);
  const { triggerHaptic } = useHapticFeedback();
  const [isPressed, setIsPressed] = useState(false);

  const effectiveGlow = glowColor || color;

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
      ref={cardRef}
      className={`bg-[#141414] rounded-xl border border-[#1E1E1E] p-4 flex flex-col justify-between min-h-[96px] ${onClick ? 'cursor-pointer ios-card' : ''} relative group/card transition-all duration-200 hover:border-[#2A2A2A] hover:bg-[#161616]`}
      style={tiltEnabled ? tiltStyle : undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
    >
      {/* Drill Down Indicator */}
      {showDrillDownIndicator && onClick && (
        <div className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-50 transition-opacity duration-200">
          <Info className="w-3.5 h-3.5 text-[#666666]" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2 relative z-10 pr-5">
        <h3 className="text-[#666666] text-xs font-medium tracking-wide">
          {title}
        </h3>
        {icon && (
          <span
            className="text-[#666666]"
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
          <span className="text-[#888] text-xs font-medium">{unit}</span>
        )}
      </div>

      {/* Subtext */}
      {subtext && (
        <p className="text-[11px] text-[#888] mt-2 relative z-10 leading-relaxed">
          {subtext}
        </p>
      )}

    </div>
  );
};

export default MetricCard;

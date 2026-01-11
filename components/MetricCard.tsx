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
      className={`bg-[#141414] rounded-2xl border border-[#222] p-5 flex flex-col justify-between min-h-[120px] ${onClick ? 'cursor-pointer ios-card' : ''} relative`}
      style={tiltEnabled ? tiltStyle : undefined}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClick}
    >
      {/* Drill Down Indicator */}
      {showDrillDownIndicator && onClick && (
        <div className="absolute top-3 right-3 opacity-50 group-hover:opacity-100 transition-opacity">
          <Info className="w-4 h-4 text-[#666666]" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10 pr-6">
        <h3 className="text-[#666666] text-sm font-medium">
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
      <div className="flex items-baseline gap-2 relative z-10">
        <span
          className="text-3xl font-mono font-bold transition-all duration-200"
          style={{
            color,
            transform: isPressed ? 'scale(0.95)' : 'scale(1)',
          }}
        >
          {value ?? '--'}
        </span>
        {unit && value != null && (
          <span className="text-[#666666] text-sm font-medium">{unit}</span>
        )}
      </div>

      {/* Subtext */}
      {subtext && (
        <p className="text-xs text-[#666666] mt-3 relative z-10">
          {subtext}
        </p>
      )}

      {/* Click hint overlay */}
      {showDrillDownIndicator && onClick && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/0 via-black/0 to-black/0 hover:from-black/5 hover:via-black/0 hover:to-black/0 transition-all rounded-2xl pointer-events-none" />
      )}
    </div>
  );
};

export default MetricCard;

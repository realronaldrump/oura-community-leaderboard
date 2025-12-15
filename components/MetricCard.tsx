import React, { useRef } from 'react';
import { useTilt } from '../hooks/useMousePosition';

interface MetricCardProps {
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  subtext?: string;
  color?: string;
  icon?: React.ReactNode;
  glowColor?: string;
  tiltEnabled?: boolean;
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
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { style: tiltStyle } = useTilt(cardRef as React.RefObject<HTMLElement>, 8);

  const effectiveGlow = glowColor || color;

  return (
    <div
      ref={cardRef}
      className="glass-card p-5 flex flex-col justify-between min-h-[120px] cursor-pointer group"
      style={tiltEnabled ? tiltStyle : undefined}
    >
      {/* Glow effect on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 100%, ${effectiveGlow}15, transparent 70%)`,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <h3 className="text-text-muted text-sm font-medium group-hover:text-text-secondary transition-colors">
          {title}
        </h3>
        {icon && (
          <span
            className="text-text-muted group-hover:scale-110 transition-transform"
            style={{ color: value != null ? color : undefined }}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-2 relative z-10">
        <span
          className="text-3xl font-mono font-bold transition-all duration-300 group-hover:scale-105"
          style={{
            color,
            textShadow: value != null ? `0 0 30px ${effectiveGlow}40` : undefined,
          }}
        >
          {value ?? '--'}
        </span>
        {unit && value != null && (
          <span className="text-text-muted text-sm font-medium">{unit}</span>
        )}
      </div>

      {/* Subtext */}
      {subtext && (
        <p className="text-xs text-text-dim mt-3 relative z-10 group-hover:text-text-muted transition-colors">
          {subtext}
        </p>
      )}

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}60, transparent)`,
        }}
      />
    </div>
  );
};

export default MetricCard;

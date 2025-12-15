import React, { useEffect, useState } from 'react';

interface ScoreRingProps {
  score: number | null | undefined;
  label: string;
  color: string;
  size?: number;
  showGlow?: boolean;
  animated?: boolean;
}

const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  label,
  color,
  size = 120,
  showGlow = true,
  animated = true,
}) => {
  const displayScore = score ?? 0;
  const strokeWidth = size * 0.06;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;

  // Animated counter
  const [displayedNumber, setDisplayedNumber] = useState(0);

  useEffect(() => {
    if (!animated || score == null) {
      setDisplayedNumber(score ?? 0);
      return;
    }

    const duration = 1200;
    const steps = 60;
    const stepDuration = duration / steps;
    const increment = displayScore / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= displayScore) {
        setDisplayedNumber(displayScore);
        clearInterval(timer);
      } else {
        setDisplayedNumber(Math.round(current));
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [score, animated, displayScore]);

  // Glow intensity based on score
  const glowIntensity = (displayScore / 100) * 20 + 10;
  const pulseOpacity = displayScore > 70 ? 0.6 : 0.3;

  return (
    <div className="flex flex-col items-center justify-center group">
      <div
        className="relative transition-transform duration-300 group-hover:scale-105"
        style={{ width: size, height: size }}
      >
        {/* Background glow */}
        {showGlow && (
          <div
            className="absolute inset-0 rounded-full animate-pulse-glow"
            style={{
              background: `radial-gradient(circle, ${color}20, transparent 70%)`,
              filter: `blur(${size * 0.15}px)`,
              opacity: pulseOpacity,
            }}
          />
        )}

        <svg className="w-full h-full -rotate-90">
          {/* Track (background circle) */}
          <circle
            strokeWidth={strokeWidth}
            stroke="rgba(255, 255, 255, 0.08)"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id={`ring-gradient-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* Progress arc */}
          <circle
            className="transition-all duration-1000 ease-out"
            stroke={`url(#ring-gradient-${label})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={score != null ? offset : circumference}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              filter: showGlow ? `drop-shadow(0 0 ${glowIntensity}px ${color})` : undefined,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold text-text-primary transition-all duration-300"
            style={{
              fontSize: size * 0.28,
              textShadow: showGlow ? `0 0 20px ${color}60` : undefined,
            }}
          >
            {score != null ? displayedNumber : '--'}
          </span>
        </div>
      </div>

      {/* Label */}
      <span className="mt-3 text-xs font-semibold text-text-muted uppercase tracking-widest group-hover:text-text-secondary transition-colors">
        {label}
      </span>
    </div>
  );
};

export default ScoreRing;

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

  return (
    <div className="flex flex-col items-center justify-center group">
      <div
        className="relative transition-transform duration-300 group-hover:scale-105 rounded-full bg-white shadow-clay"
        style={{
          width: size,
          height: size,
        }}
      >
        <svg className="w-full h-full -rotate-90">
          {/* Track (background circle) */}
          <circle
            strokeWidth={strokeWidth}
            stroke={`${color}18`}
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />

          {/* Progress arc */}
          <circle
            className="transition-all duration-1000 ease-out"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={score != null ? offset : circumference}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{ opacity: 0.85 }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold transition-all duration-300"
            style={{
              fontSize: size * 0.28,
              color: color,
            }}
          >
            {score != null ? displayedNumber : '--'}
          </span>
        </div>
      </div>

      {/* Label */}
      <span className="mt-3 text-xs font-bold text-[#A8A29E] uppercase tracking-widest group-hover:text-[#7A756E] transition-colors">
        {label}
      </span>
    </div>
  );
};

export default ScoreRing;

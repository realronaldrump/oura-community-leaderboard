import React from 'react';

interface ScoreRingProps {
  score: number | null | undefined;
  label: string;
  color: string;
  size?: number;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ score, label, color, size = 120 }) => {
  const displayScore = score ?? 0;
  const strokeWidth = size * 0.06;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 w-full h-full">
          {/* Track */}
          <circle
            strokeWidth={strokeWidth}
            stroke="#2a2a2a"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Progress */}
          <circle
            className="transition-all duration-700 ease-out"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={score != null ? offset : circumference}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono font-semibold text-text-primary"
            style={{ fontSize: size * 0.28 }}
          >
            {score ?? '--'}
          </span>
        </div>
      </div>
      <span className="mt-2 text-xs font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
};

export default ScoreRing;

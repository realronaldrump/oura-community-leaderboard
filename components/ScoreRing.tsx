import React from 'react';

interface ScoreRingProps {
  score: number;
  label: string;
  color: string;
  size?: number;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ score, label, color, size = 120 }) => {
  const strokeWidth = size * 0.08; // Proportional stroke width
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90 w-full h-full"
        >
          {/* Track */}
          <circle
            className="text-gray-800"
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Progress */}
          <circle
            className="transition-all duration-1000 ease-out"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white">{score}</span>
        </div>
      </div>
      <span className="mt-3 text-sm font-medium text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
  );
};

export default ScoreRing;

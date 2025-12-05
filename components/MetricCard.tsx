import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number | null | undefined;
  unit?: string;
  subtext?: string;
  color?: string;
  icon?: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  subtext,
  color = '#f5f5f5',
  icon
}) => {
  return (
    <div className="card p-4 flex flex-col justify-between min-h-[100px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-text-secondary text-sm font-medium">{title}</h3>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-2xl font-mono font-semibold"
          style={{ color }}
        >
          {value ?? '--'}
        </span>
        {unit && value != null && (
          <span className="text-text-muted text-sm">{unit}</span>
        )}
      </div>
      {subtext && (
        <p className="text-xs text-text-muted mt-2">{subtext}</p>
      )}
    </div>
  );
};

export default MetricCard;

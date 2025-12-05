import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  colorClass?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, unit, subtext, colorClass = "text-white" }) => {
  return (
    <div className="bg-oura-card rounded-2xl p-5 border border-gray-800 flex flex-col justify-between hover:border-gray-700 transition-colors">
      <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
      <div className="flex items-end gap-1">
        <span className={`text-2xl font-bold ${colorClass}`}>{value}</span>
        {unit && <span className="text-gray-500 text-sm mb-1">{unit}</span>}
      </div>
      {subtext && <p className="text-xs text-gray-500 mt-2">{subtext}</p>}
    </div>
  );
};

export default MetricCard;

import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface HistoryChartProps {
  data: any[];
  dataKey: string;
  color: string;
  height?: number;
}

const HistoryChart: React.FC<HistoryChartProps> = ({ data, dataKey, color, height = 64 }) => {
  // Take only last 7 days for cleanliness
  const chartData = [...data].reverse().slice(-7);

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-text-muted text-xs"
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div style={{ height, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis
            dataKey="day"
            hide
          />
          <YAxis
            domain={['auto', 'auto']}
            hide
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '6px',
              fontSize: '12px'
            }}
            labelFormatter={(value) => {
              const d = new Date(value);
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }}
            formatter={(value: number) => [value, '']}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HistoryChart;

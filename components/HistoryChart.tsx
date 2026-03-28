import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Dot } from 'recharts';

interface HistoryChartProps {
  data: any[];
  dataKey: string;
  color: string;
  height?: number;
  onDataPointClick?: (dataPoint: any) => void;
}

const HistoryChart: React.FC<HistoryChartProps> = ({ data, dataKey, color, height = 64, onDataPointClick }) => {
  // Take only last 7 days for cleanliness
  const chartData = [...data].reverse().slice(-7);

  const handleDataPointClick = (data: any) => {
    onDataPointClick?.(data.payload);
  };

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    return (
      <Dot
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke={color}
        strokeWidth={2}
        className="cursor-pointer"
        onClick={() => handleDataPointClick(payload)}
      />
    );
  };

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
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={height}
        initialDimension={{ width: 400, height }}
      >
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
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '12px',
              fontSize: '12px',
              color: '#2D2A26',
              boxShadow: '4px 4px 8px rgba(0,0,0,0.06), -4px -4px 8px rgba(255,255,255,0.8)',
            }}
            labelFormatter={(value) => {
              const d = new Date(value + 'T12:00:00');
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }}
            formatter={(value: number) => [value, '']}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6, stroke: color, strokeWidth: 3 }}
            isAnimationActive={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HistoryChart;

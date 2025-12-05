import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface HistoryChartProps {
  data: any[];
  dataKey: string;
  color: string;
}

const HistoryChart: React.FC<HistoryChartProps> = ({ data, dataKey, color }) => {
  // Take only last 7 days for cleanliness, reverse to show chronological
  const chartData = [...data].reverse().slice(-7);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-oura-card border border-gray-700 p-2 rounded shadow-lg">
          <p className="text-gray-300 text-xs mb-1">{label}</p>
          <p className="text-white font-bold" style={{ color: color }}>
            {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
          <XAxis 
            dataKey="day" 
            tick={{ fill: '#718096', fontSize: 10 }} 
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => {
              const d = new Date(value);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis 
            domain={[40, 100]} 
            tick={{ fill: '#718096', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            hide
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#4A5568', strokeWidth: 1 }} />
          <Line 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={3} 
            dot={{ r: 4, fill: '#1E1E1E', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HistoryChart;

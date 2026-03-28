import React, { useMemo } from 'react';
import { CLAY_TOOLTIP_STYLE } from '../../utils/chartStyles';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { HeartRate } from '../../types';

export interface ComparisonHeartRateSeries {
    id: string;
    name: string;
    color: string;
    data: HeartRate[];
}

interface ComparisonHeartRateChartProps {
    series: ComparisonHeartRateSeries[];
}

const ComparisonHeartRateChart: React.FC<ComparisonHeartRateChartProps> = ({ series }) => {
    const activeSeries = series.filter((entry) => entry.data.length > 0);

    const formattedData = useMemo(() => {
        const dataMap = new Map<string, Record<string, number | string>>();

        activeSeries.forEach((entry) => {
            entry.data.forEach((point) => {
                const date = new Date(point.timestamp);
                const roundedMinutes = Math.floor(date.getMinutes() / 5) * 5;
                date.setMinutes(roundedMinutes, 0, 0);

                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (!dataMap.has(timeStr)) {
                    dataMap.set(timeStr, { time: timeStr, timestamp: date.getTime() });
                }

                const bucket = dataMap.get(timeStr)!;
                bucket[`series_${entry.id}`] = point.bpm;
            });
        });

        return Array.from(dataMap.values()).sort((a, b) => {
            const left = typeof a.timestamp === 'number' ? a.timestamp : 0;
            const right = typeof b.timestamp === 'number' ? b.timestamp : 0;
            return left - right;
        });
    }, [activeSeries]);

    if (activeSeries.length === 0) {
        return <div className="text-center text-[#A8A29E]">No heart rate data available</div>;
    }

    return (
        <div className="w-full h-64">
            <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={200}
                initialDimension={{ width: 640, height: 220 }}
            >
                <LineChart data={formattedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis
                        dataKey="time"
                        stroke="#A8A29E"
                        fontSize={12}
                        tick={{ fill: '#A8A29E' }}
                        interval="preserveStartEnd"
                        minTickGap={30}
                    />
                    <YAxis
                        stroke="#A8A29E"
                        fontSize={12}
                        tick={{ fill: '#A8A29E' }}
                        domain={['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip
                        contentStyle={CLAY_TOOLTIP_STYLE}
                        itemStyle={{ color: '#2D2A26' }}
                    />
                    <Legend />
                    {activeSeries.map((entry) => (
                        <Line
                            key={entry.id}
                            type="monotone"
                            dataKey={`series_${entry.id}`}
                            name={entry.name}
                            stroke={entry.color}
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ComparisonHeartRateChart;

import React, { useMemo } from 'react';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartStyles';
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
import {
    formatClockTimeFromHourMinute,
    getLocalMinutesOfDayFromIso,
} from '../../utils/temporal';
import { getDataAwareChartDomain } from '../../utils/chartScale';

export interface ComparisonHeartRateSeries {
    id: string;
    name: string;
    color: string;
    data: HeartRate[];
}

interface ComparisonHeartRateChartProps {
    series: ComparisonHeartRateSeries[];
}

export const buildComparisonHeartRateChartData = (series: ComparisonHeartRateSeries[]): Record<string, number | string>[] => {
    const dataMap = new Map<number, Record<string, number | string>>();

    series.filter((entry) => entry.data.length > 0).forEach((entry) => {
        entry.data.forEach((point) => {
            const minutesOfDay = getLocalMinutesOfDayFromIso(point.timestamp);
            if (minutesOfDay == null) return;
            const roundedMinutes = Math.floor(minutesOfDay / 5) * 5;
            const hour = Math.floor(roundedMinutes / 60) % 24;
            const minute = roundedMinutes % 60;

            if (!dataMap.has(roundedMinutes)) {
                dataMap.set(roundedMinutes, {
                    time: formatClockTimeFromHourMinute(hour, minute, 'en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                    timestamp: roundedMinutes * 60_000,
                });
            }

            const bucket = dataMap.get(roundedMinutes)!;
            bucket[`series_${entry.id}`] = point.bpm;
        });
    });

    return Array.from(dataMap.values()).sort((a, b) => {
        const left = typeof a.timestamp === 'number' ? a.timestamp : 0;
        const right = typeof b.timestamp === 'number' ? b.timestamp : 0;
        return left - right;
    });
};

const ComparisonHeartRateChart: React.FC<ComparisonHeartRateChartProps> = ({ series }) => {
    const activeSeries = series.filter((entry) => entry.data.length > 0);

    const formattedData = useMemo(() => buildComparisonHeartRateChartData(activeSeries), [activeSeries]);
    const chartDomain = getDataAwareChartDomain(
        formattedData.flatMap((point) => Object.entries(point).flatMap(([key, value]) => (
            key.startsWith('series_') && typeof value === 'number' ? [value] : []
        ))),
        { min: 0 }
    );

    if (activeSeries.length === 0) {
        return <div className="text-center text-ink-muted">No heart rate data available</div>;
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
                        domain={chartDomain}
                        tickCount={5}
                    />
                    <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
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

import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { HeartRate } from '../../types';

interface Props {
    data: HeartRate[];
    showLabels?: boolean;
}

const HeartRateChart: React.FC<Props> = ({ data, showLabels = false }) => {
    // Filter to last 24 hours and transform data for chart
    const chartData = useMemo(() => {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        return data
            .filter(hr => new Date(hr.timestamp) >= twentyFourHoursAgo)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map((hr) => ({
                timestamp: new Date(hr.timestamp).getTime(),
                bpm: hr.bpm,
                time: new Date(hr.timestamp).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }),
                hour: new Date(hr.timestamp).getHours(),
                source: hr.source
            }));
    }, [data]);

    // Calculate stats
    const bpmValues = chartData.map(d => d.bpm).filter(Boolean);
    const avgBpm = bpmValues.length > 0
        ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length)
        : null;
    const minBpm = bpmValues.length > 0 ? Math.min(...bpmValues) : null;
    const maxBpm = bpmValues.length > 0 ? Math.max(...bpmValues) : null;

    if (chartData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No heart rate data available for the last 24 hours
            </div>
        );
    }

    // Format hour for X-axis ticks
    const formatHour = (timestamp: number) => {
        const date = new Date(timestamp);
        const hours = date.getHours();
        if (hours === 0) return '12am';
        if (hours === 12) return '12pm';
        return hours > 12 ? `${hours - 12}pm` : `${hours}am`;
    };

    return (
        <div className="h-full">
            {showLabels && (
                <div className="flex gap-4 mb-2 text-xs text-text-secondary">
                    <span>Min: <span className="text-metric-hr font-mono">{minBpm}</span></span>
                    <span>Avg: <span className="text-text-primary font-mono">{avgBpm}</span></span>
                    <span>Max: <span className="text-metric-hr font-mono">{maxBpm}</span></span>
                    <span className="ml-auto text-text-muted">Last 24 hours</span>
                </div>
            )}
            <ResponsiveContainer width="100%" height={showLabels ? "85%" : "100%"}>
                <LineChart data={chartData}>
                    <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        hide={!showLabels}
                        tick={{ fill: '#737373', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={formatHour}
                        interval="preserveStartEnd"
                        minTickGap={40}
                    />
                    <YAxis
                        domain={['auto', 'auto']}
                        hide
                    />
                    {avgBpm && (
                        <ReferenceLine
                            y={avgBpm}
                            stroke="#3a3a3a"
                            strokeDasharray="3 3"
                        />
                    )}
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #2a2a2a',
                            borderRadius: '8px',
                            fontSize: '12px'
                        }}
                        labelStyle={{ color: '#737373' }}
                        labelFormatter={(timestamp: number) => new Date(timestamp).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        })}
                        formatter={(value: number) => [`${value} bpm`, 'Heart Rate']}
                    />
                    <Line
                        type="monotone"
                        dataKey="bpm"
                        stroke="#ef4444"
                        dot={false}
                        strokeWidth={1.5}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default HeartRateChart;

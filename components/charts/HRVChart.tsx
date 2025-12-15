import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, Area, AreaChart } from 'recharts';
import { SleepSession } from '../../types';

interface Props {
    session: SleepSession | null | undefined;
    showLabels?: boolean;
}

const HRVChart: React.FC<Props> = ({ session, showLabels = false }) => {
    // Transform HRV data from sleep session
    const chartData = useMemo(() => {
        if (!session?.hrv?.items || !session.bedtime_start) return [];

        const startTime = new Date(session.bedtime_start).getTime();
        const intervalMs = (session.hrv.interval || 300) * 1000; // interval in ms (default 5 min = 300s)

        return session.hrv.items
            .map((value, idx) => {
                const timestamp = startTime + (idx * intervalMs);
                return {
                    timestamp,
                    hrv: value,
                    time: new Date(timestamp).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    })
                };
            })
            .filter(d => d.hrv > 0); // Filter out zero/null values
    }, [session]);

    // Calculate stats
    const hrvValues = chartData.map(d => d.hrv).filter(Boolean);
    const avgHrv = hrvValues.length > 0
        ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length)
        : null;
    const minHrv = hrvValues.length > 0 ? Math.min(...hrvValues) : null;
    const maxHrv = hrvValues.length > 0 ? Math.max(...hrvValues) : null;

    if (chartData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No HRV data available for this sleep session
            </div>
        );
    }

    // Format time for X-axis ticks
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        if (minutes === 0) {
            if (hours === 0) return '12am';
            if (hours === 12) return '12pm';
            return hours > 12 ? `${hours - 12}pm` : `${hours}am`;
        }
        return '';
    };

    return (
        <div className="h-full">
            {showLabels && (
                <div className="flex gap-4 mb-2 text-xs text-text-secondary">
                    <span>Min: <span className="text-accent-purple font-mono">{minHrv}</span></span>
                    <span>Avg: <span className="text-text-primary font-mono">{avgHrv}</span></span>
                    <span>Max: <span className="text-accent-purple font-mono">{maxHrv}</span></span>
                    <span className="ml-auto text-text-muted">During sleep</span>
                </div>
            )}
            <ResponsiveContainer width="100%" height={showLabels ? "85%" : "100%"}>
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="hrvGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="timestamp"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        hide={!showLabels}
                        tick={{ fill: '#737373', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={formatTime}
                        interval="preserveStartEnd"
                        minTickGap={40}
                    />
                    <YAxis
                        domain={['auto', 'auto']}
                        hide
                    />
                    {avgHrv && (
                        <ReferenceLine
                            y={avgHrv}
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
                        formatter={(value: number) => [`${value} ms`, 'HRV']}
                    />
                    <Area
                        type="monotone"
                        dataKey="hrv"
                        stroke="#8b5cf6"
                        fill="url(#hrvGradient)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default HRVChart;

import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, Area, AreaChart } from 'recharts';
import { SleepSession } from '../../types';
import { CLAY_TOOLTIP_STYLE, CLAY_TOOLTIP_LABEL_STYLE } from '../../utils/chartStyles';
import {
    formatClockTimeFromOffsetTimestamp,
    getWallClockTimestampMs,
    parseUtcOffsetMinutesFromIso,
} from '../../utils/temporal';

interface Props {
    session: SleepSession | null | undefined;
    showLabels?: boolean;
}

const HRVChart: React.FC<Props> = ({ session, showLabels = false }) => {
    // Transform HRV data from sleep session
    const chartData = useMemo(() => {
        if (!session?.hrv?.items || !session.bedtime_start) return [];

        const startTime = new Date(session.bedtime_start).getTime();
        const offsetMinutes = parseUtcOffsetMinutesFromIso(session.bedtime_start) ?? 0;
        const intervalMs = (session.hrv.interval || 300) * 1000; // interval in ms (default 5 min = 300s)

        return session.hrv.items
            .map((value, idx) => {
                const timestamp = startTime + (idx * intervalMs);
                const localTimestamp = getWallClockTimestampMs(timestamp, offsetMinutes);
                return {
                    timestamp: localTimestamp,
                    hrv: value,
                    time: formatClockTimeFromOffsetTimestamp(timestamp, offsetMinutes)
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
        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
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
            <ResponsiveContainer
                width="100%"
                height={showLabels ? "85%" : "100%"}
                minWidth={0}
                minHeight={100}
                initialDimension={{ width: 560, height: 160 }}
            >
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="hrvGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#A08BBE" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#A08BBE" stopOpacity={0} />
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
                        contentStyle={CLAY_TOOLTIP_STYLE}
                        labelStyle={CLAY_TOOLTIP_LABEL_STYLE}
                        labelFormatter={(timestamp: number) => new Date(timestamp).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'UTC',
                        })}
                        formatter={(value: number) => [`${value} ms`, 'HRV']}
                    />
                    <Area
                        type="monotone"
                        dataKey="hrv"
                        stroke="#A08BBE"
                        fill="url(#hrvGradient)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default HRVChart;

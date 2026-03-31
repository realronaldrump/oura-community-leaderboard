import React, { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { HeartRate } from '../../types';
import { IOSModal, IOSButton, IOSListItem } from '../ios';
import { Clock, Info } from 'lucide-react';
import { CLAY_TOOLTIP_STYLE, CLAY_TOOLTIP_LABEL_STYLE } from '../../utils/chartStyles';

type TimeRange = '6h' | '12h' | '24h' | '48h';

interface Props {
    data: HeartRate[];
    showLabels?: boolean;
}

const HeartRateChart: React.FC<Props> = ({ data, showLabels = false }) => {
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');
    const [selectedPoint, setSelectedPoint] = useState<HeartRate | null>(null);

    const handleDataPointClick = (data: any) => {
        if (data?.payload) {
            setSelectedPoint(data.payload);
        }
    };

    const getTimeRangeHours = (range: TimeRange): number => {
        switch (range) {
            case '6h': return 6;
            case '12h': return 12;
            case '24h': return 24;
            case '48h': return 48;
            default: return 24;
        }
    };

    // Filter to selected time range and transform data for chart
    const chartData = useMemo(() => {
        const now = new Date();
        const hoursAgo = new Date(now.getTime() - getTimeRangeHours(timeRange) * 60 * 60 * 1000);

        return data
            .filter(hr => new Date(hr.timestamp) >= hoursAgo)
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
                source: hr.source,
                fullData: hr
            }));
    }, [data, timeRange]);

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
        <>
            <div className="h-full">
                {/* Time Range Selector */}
                {showLabels && (
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex gap-2">
                            {(['6h', '12h', '24h', '48h'] as TimeRange[]).map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setTimeRange(range)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${timeRange === range
                                        ? 'bg-[#D4897B] text-white'
                                        : 'bg-[#F2EDE8] text-text-muted hover:text-text-primary'
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-text-secondary">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Min: <span className="text-metric-hr font-mono">{minBpm}</span>
                            </span>
                            <span className="flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                Avg: <span className="text-text-primary font-mono">{avgBpm}</span>
                            </span>
                            <span>Max: <span className="text-metric-hr font-mono">{maxBpm}</span></span>
                        </div>
                    </div>
                )}
                <ResponsiveContainer
                    width="100%"
                    height={showLabels ? "80%" : "100%"}
                    minWidth={0}
                    minHeight={100}
                    initialDimension={{ width: 560, height: 160 }}
                >
                    <LineChart data={chartData}>
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            hide={!showLabels}
                            tick={{ fill: '#A8A29E', fontSize: 10 }}
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
                                stroke="rgba(0,0,0,0.1)"
                                strokeDasharray="3 3"
                            />
                        )}
                        <Tooltip
                            contentStyle={CLAY_TOOLTIP_STYLE}
                            labelStyle={CLAY_TOOLTIP_LABEL_STYLE}
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
                            stroke="#D4897B"
                            dot={false}
                            activeDot={false}
                            strokeWidth={2}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Data Point Detail Modal */}
            {selectedPoint && (
                <IOSModal
                    isOpen={!!selectedPoint}
                    onClose={() => setSelectedPoint(null)}
                    title="Heart Rate Detail"
                >
                    <div className="space-y-4">
                        <IOSListItem
                            title="Heart Rate"
                            subtitle={`${selectedPoint.bpm} bpm`}
                            icon={<div className="text-[#D4897B]"><Clock className="w-4 h-4" /></div>}
                            rightElement={<div className="text-xs text-text-muted">
                                {new Date(selectedPoint.timestamp).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                })}
                            </div>}
                        />
                        <IOSListItem
                            title="Date & Time"
                            subtitle={new Date(selectedPoint.timestamp).toLocaleString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                            })}
                            icon={<div className="text-[#6B7280]"><Info className="w-4 h-4" /></div>}
                        />
                        <IOSListItem
                            title="Source"
                            subtitle={selectedPoint.source}
                            icon={<div className="text-[#7BA8D4]"><Clock className="w-4 h-4" /></div>}
                        />
                        <IOSButton onClick={() => setSelectedPoint(null)} className="w-full" variant="secondary">
                            Close
                        </IOSButton>
                    </div>
                </IOSModal>
            )}
        </>
    );
};

export default HeartRateChart;

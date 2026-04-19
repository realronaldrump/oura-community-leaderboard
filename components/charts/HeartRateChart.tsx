import React, { useMemo, useState } from 'react';
import {
    AreaChart, Area, LineChart, Line, ResponsiveContainer, YAxis,
    Tooltip, ReferenceLine,
} from 'recharts';
import { HeartRate } from '../../types';
import { Moon, Sun, Zap } from 'lucide-react';
import { CLAY_TOOLTIP_STYLE, CLAY_TOOLTIP_LABEL_STYLE } from '../../utils/chartStyles';
import {
    formatRecordLocalClockTime,
    getWallClockTimestampMsFromIso,
} from '../../utils/temporal';

type TimeRange = '24h' | '48h';

interface Props {
    data: HeartRate[];
    showLabels?: boolean;
}

type ZoneType = 'sleep' | 'daytime' | 'active';

type ChartPoint = {
    timestamp: number;
    bpm: number;
    time: string;
    source: HeartRate['source'];
};

interface HeartRateZone {
    type: ZoneType;
    label: string;
    startTime: string;
    endTime: string;
    points: ChartPoint[];
    min: number;
    max: number;
    avg: number;
}

const SOURCE_TO_ZONE: Record<HeartRate['source'], ZoneType> = {
    sleep: 'sleep',
    rest: 'daytime',
    awake: 'daytime',
    live: 'daytime',
    workout: 'active',
    session: 'active',
};

const ZONE_STYLES: Record<ZoneType, {
    stroke: string;
    bg: string;
}> = {
    sleep: {
        stroke: '#7BA8D4',
        bg: 'rgba(123,168,212,0.06)',
    },
    daytime: {
        stroke: '#D4A574',
        bg: 'rgba(212,165,116,0.06)',
    },
    active: {
        stroke: '#D4897B',
        bg: 'rgba(212,137,123,0.08)',
    },
};

const ZONE_ICONS: Record<ZoneType, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
    sleep: Moon,
    daytime: Sun,
    active: Zap,
};

function classifyZone(source: HeartRate['source']): ZoneType {
    return SOURCE_TO_ZONE[source] || 'daytime';
}

function getZoneLabel(type: ZoneType, hourOfDay: number): string {
    if (type === 'sleep') return 'Sleep';
    if (type === 'active') return 'Active';
    if (hourOfDay >= 18) return 'Evening';
    if (hourOfDay >= 12) return 'Afternoon';
    if (hourOfDay >= 5) return 'Morning';
    return 'Late Night';
}

function buildZones(points: ChartPoint[]): HeartRateZone[] {
    if (points.length === 0) return [];

    // Group consecutive points by zone type
    const rawSegments: { type: ZoneType; points: ChartPoint[] }[] = [];
    let currentType = classifyZone(points[0].source);
    let currentPoints: ChartPoint[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
        const type = classifyZone(points[i].source);
        if (type !== currentType) {
            rawSegments.push({ type: currentType, points: currentPoints });
            currentType = type;
            currentPoints = [points[i]];
        } else {
            currentPoints.push(points[i]);
        }
    }
    rawSegments.push({ type: currentType, points: currentPoints });

    // Absorb very short segments (< 4 readings ≈ <20 min) into the previous segment
    const merged: typeof rawSegments = [];
    for (const seg of rawSegments) {
        if (seg.points.length < 4 && merged.length > 0) {
            merged[merged.length - 1].points.push(...seg.points);
        } else {
            merged.push({ type: seg.type, points: [...seg.points] });
        }
    }

    // Consolidate adjacent same-type segments
    const consolidated: typeof rawSegments = [];
    for (const seg of merged) {
        if (consolidated.length > 0 && consolidated[consolidated.length - 1].type === seg.type) {
            consolidated[consolidated.length - 1].points.push(...seg.points);
        } else {
            consolidated.push(seg);
        }
    }

    return consolidated
        .filter(seg => seg.points.length >= 2)
        .map((seg) => {
            const bpms = seg.points.map(p => p.bpm);
            const min = Math.min(...bpms);
            const max = Math.max(...bpms);
            const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
            const firstHour = new Date(seg.points[0].timestamp).getUTCHours();

            return {
                type: seg.type,
                label: getZoneLabel(seg.type, firstHour),
                startTime: seg.points[0].time,
                endTime: seg.points[seg.points.length - 1].time,
                points: seg.points,
                min,
                max,
                avg,
            };
        });
}

const ZoneSparkline: React.FC<{ zone: HeartRateZone; index: number }> = ({ zone, index }) => {
    const style = ZONE_STYLES[zone.type];
    const gradientId = `hr-zone-${index}`;

    return (
        <div className="h-14">
            <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={40}
                initialDimension={{ width: 400, height: 56 }}
            >
                <AreaChart data={zone.points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={style.stroke} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={style.stroke} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <YAxis domain={[zone.min - 3, zone.max + 3]} hide />
                    <ReferenceLine y={zone.avg} stroke="rgba(0,0,0,0.06)" strokeDasharray="2 4" />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const point = payload[0].payload as ChartPoint;
                            return (
                                <div style={{ ...CLAY_TOOLTIP_STYLE, padding: '6px 10px' }}>
                                    <div className="text-[10px]" style={CLAY_TOOLTIP_LABEL_STYLE}>{point.time}</div>
                                    <div className="text-xs font-mono" style={{ color: style.stroke }}>
                                        {point.bpm} bpm
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="bpm"
                        stroke={style.stroke}
                        fill={`url(#${gradientId})`}
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 3, fill: style.stroke, strokeWidth: 0 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

const ZoneCard: React.FC<{ zone: HeartRateZone; index: number }> = ({ zone, index }) => {
    const style = ZONE_STYLES[zone.type];
    const Icon = ZONE_ICONS[zone.type];

    const durationMin = zone.points.length > 1
        ? Math.round((zone.points[zone.points.length - 1].timestamp - zone.points[0].timestamp) / 60000)
        : 0;
    const durationLabel = durationMin >= 60
        ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
        : `${durationMin}m`;

    return (
        <div
            className="rounded-xl px-3.5 py-2.5"
            style={{
                backgroundColor: style.bg,
                opacity: 0,
                animation: `fade-in-up 0.35s ease-out ${index * 50}ms both`,
            }}
        >
            {/* Zone header */}
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${style.stroke}18` }}
                    >
                        <Icon className="w-3 h-3" style={{ color: style.stroke }} />
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-semibold text-text-primary">{zone.label}</span>
                            <span className="text-[10px] text-text-muted">{durationLabel}</span>
                        </div>
                        <span className="text-[10px] text-text-muted leading-none">
                            {zone.startTime} – {zone.endTime}
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-sm font-mono font-medium" style={{ color: style.stroke }}>
                        {zone.avg}
                    </div>
                    <div className="text-[9px] text-text-muted uppercase tracking-wide">avg bpm</div>
                </div>
            </div>

            {/* Sparkline */}
            <ZoneSparkline zone={zone} index={index} />

            {/* Stats footer */}
            <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
                <span className="font-mono">{zone.min} – {zone.max} bpm</span>
                <span>·</span>
                <span>{zone.points.length} readings</span>
            </div>
        </div>
    );
};

const HeartRateChart: React.FC<Props> = ({ data, showLabels = false }) => {
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');

    const chartData = useMemo(() => {
        const now = new Date();
        const hours = timeRange === '48h' ? 48 : 24;
        const hoursAgo = new Date(now.getTime() - hours * 60 * 60 * 1000);

        return data
            .filter(hr => new Date(hr.timestamp) >= hoursAgo)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map((hr): ChartPoint => ({
                timestamp: getWallClockTimestampMsFromIso(hr.timestamp) ?? new Date(hr.timestamp).getTime(),
                bpm: hr.bpm,
                time: formatRecordLocalClockTime(hr.timestamp),
                source: hr.source,
            }));
    }, [data, timeRange]);

    const bpmValues = chartData.map(d => d.bpm).filter(Boolean);
    const avgBpm = bpmValues.length > 0
        ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length)
        : null;
    const minBpm = bpmValues.length > 0 ? Math.min(...bpmValues) : null;
    const maxBpm = bpmValues.length > 0 ? Math.max(...bpmValues) : null;

    const zones = useMemo(() => buildZones(chartData), [chartData]);

    if (chartData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No heart rate data available
            </div>
        );
    }

    // Compact mode: simple sparkline for non-detail contexts
    if (!showLabels) {
        return (
            <div className="h-full">
                <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    minHeight={60}
                    initialDimension={{ width: 400, height: 80 }}
                >
                    <LineChart data={chartData}>
                        <YAxis domain={['auto', 'auto']} hide />
                        <Line type="monotone" dataKey="bpm" stroke="#D4897B" dot={false} strokeWidth={1.5} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        );
    }

    return (
        <div>
            {/* Summary Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-baseline gap-5">
                    {[
                        { value: minBpm, label: 'low', color: '#7BA8D4' },
                        { value: avgBpm, label: 'avg', color: '#7A756E' },
                        { value: maxBpm, label: 'peak', color: '#D4897B' },
                    ].map(({ value, label, color }) => (
                        <div key={label} className="flex items-baseline gap-1">
                            <span
                                className="text-xl font-light tracking-tight tabular-nums"
                                style={{ color }}
                            >
                                {value ?? '--'}
                            </span>
                            <span className="text-[10px] text-text-muted uppercase tracking-widest">{label}</span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-1.5">
                    {(['24h', '48h'] as TimeRange[]).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                timeRange === range
                                    ? 'bg-[#D4897B] text-white shadow-sm'
                                    : 'bg-[#F2EDE8] text-text-muted hover:text-text-primary'
                            }`}
                        >
                            {range}
                        </button>
                    ))}
                </div>
            </div>

            {/* Zone Cards */}
            <div className="flex flex-col gap-2">
                {zones.map((zone, i) => (
                    <ZoneCard key={`${zone.type}-${i}`} zone={zone} index={i} />
                ))}
            </div>
        </div>
    );
};

export default HeartRateChart;

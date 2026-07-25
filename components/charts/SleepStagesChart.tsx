import React, { useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SleepSession } from '../../types';
import { IOSModal, IOSButton } from '../ios';
import { formatISODateForDisplay } from '../../utils/date';

// Custom tooltip component with total
interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    const formatDuration = (value: number) => {
        const hours = Math.floor(value);
        const minutes = Math.round((value % 1) * 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    // Calculate total (excluding Awake time for "actual sleep")
    const totalSleep = payload.reduce((sum, entry) => {
        if (entry.dataKey === 'Awake') return sum;
        return sum + (entry.value || 0);
    }, 0);

    return (
        <div className="rounded-lg border border-line-strong bg-surface-raised p-3 shadow-lg">
            <p className="text-ink-secondary text-xs mb-2">{label}</p>
            {payload.map((entry, index) => (
                <div key={index} className="flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-ink-secondary">{entry.name}</span>
                    </div>
                    <span className="text-ink font-mono">{formatDuration(entry.value)}</span>
                </div>
            ))}
            <div className="border-t border-line mt-2 pt-2">
                <div className="flex items-center justify-between gap-4 text-sm font-semibold">
                    <span className="text-accent">Total Sleep</span>
                    <span className="text-accent font-mono">{formatDuration(totalSleep)}</span>
                </div>
            </div>
        </div>
    );
};

type StageKey = 'deep' | 'rem' | 'light' | 'awake';
type StageDurationKey = 'deep_sleep_duration' | 'rem_sleep_duration' | 'light_sleep_duration' | 'awake_time';

interface Props {
    data: SleepSession[];
    onStageClick?: (stage: StageKey, session: SleepSession) => void;
}

type StageDetail = {
    name: string;
    color: string;
    description: string;
    dataKey: StageDurationKey;
};

const STAGE_DETAILS: Record<StageKey, StageDetail> = {
    deep: {
        name: 'Deep Sleep',
        color: '#7BA8D4',
        description: 'Slow-wave sleep recorded by Oura. Compare the duration with your own nights and longer-term baseline.',
        dataKey: 'deep_sleep_duration',
    },
    rem: {
        name: 'REM Sleep',
        color: '#A08BBE',
        description: 'Rapid-eye-movement sleep recorded by Oura. Compare the duration with your own nights and longer-term baseline.',
        dataKey: 'rem_sleep_duration',
    },
    light: {
        name: 'Light Sleep',
        color: '#7BA8D4',
        description: 'The lighter non-REM stages recorded by Oura during this sleep period.',
        dataKey: 'light_sleep_duration',
    },
    awake: {
        name: 'Awake Time',
        color: '#6b7280',
        description: 'Time Oura estimated you were awake during the sleep period. Brief awakenings are common.',
        dataKey: 'awake_time',
    },
};

const STAGE_KEYS: StageKey[] = ['deep', 'light', 'rem', 'awake'];

const formatSecondsDuration = (seconds?: number | null) => {
    if (seconds == null) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const SleepStagesChart: React.FC<Props> = ({ data, onStageClick }) => {
    const [selectedStage, setSelectedStage] = useState<{ stage: StageKey; session: SleepSession } | null>(null);
    const [selectedDay, setSelectedDay] = useState<SleepSession | null>(null);
    const [hoveredDay, setHoveredDay] = useState<string | null>(null);

    // Transform data for chart
    const chartData = data.map(session => {
        const deep = (session.deep_sleep_duration || 0) / 3600;
        const rem = (session.rem_sleep_duration || 0) / 3600;
        const light = (session.light_sleep_duration || 0) / 3600;
        const awake = (session.awake_time || 0) / 3600;
        const totalSleep = deep + rem + light; // Total actual sleep (excluding awake)
        const totalWithAwake = deep + rem + light + awake;

        return {
            day: session.day,
            Deep: deep,
            REM: rem,
            Light: light,
            Awake: awake,
            totalSleep,
            totalWithAwake,
            sessionData: session,
        };
    });

    const handleMouseMove = useCallback((state: any) => {
        if (state?.activePayload?.[0]?.payload?.day) {
            setHoveredDay(state.activePayload[0].payload.day);
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        setHoveredDay(null);
    }, []);

    const formatTotalDuration = (hours: number) => {
        const h = Math.floor(hours);
        const m = Math.round((hours % 1) * 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const handleBarClick = (data: any) => {
        const stageName = data.name;
        const stageMap: Record<string, StageKey> = {
            'Deep': 'deep',
            'REM': 'rem',
            'Light': 'light',
            'Awake': 'awake',
        };
        const stageKey = stageMap[stageName];

        if (stageKey && data.payload?.sessionData) {
            setSelectedStage({ stage: stageKey, session: data.payload.sessionData });
            onStageClick?.(stageKey, data.payload.sessionData);
        }
    };

    if (chartData.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No sleep data available
            </div>
        );
    }

    return (
        <>
            <style>{`
                .total-label {
                    transition: opacity 0.2s ease-in-out;
                }
            `}</style>
            <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-[6.25rem] flex-1">
                    <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                        minHeight={100}
                        initialDimension={{ width: 640, height: 180 }}
                    >
                        <BarChart
                            data={chartData}
                            margin={{ top: 24, right: 10, left: 0, bottom: 0 }}
                            barSize={16}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                            <XAxis
                                dataKey="day"
                                stroke="#A8A29E"
                                fontSize={11}
                                tickFormatter={(val) => val.slice(5)}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="#A8A29E"
                                fontSize={11}
                                unit="h"
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                            <Legend
                                verticalAlign="top"
                                height={32}
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }}
                            />
                            <Bar dataKey="Deep" stackId="a" fill="#7BA8D4" name="Deep" radius={[0, 0, 4, 4]} onClick={handleBarClick} className="cursor-pointer" />
                            <Bar dataKey="Light" stackId="a" fill="#7BA8D4" name="Light" onClick={handleBarClick} className="cursor-pointer" />
                            <Bar dataKey="REM" stackId="a" fill="#A08BBE" name="REM" onClick={handleBarClick} className="cursor-pointer" />
                            <Bar
                                dataKey="Awake"
                                stackId="a"
                                fill="#6b7280"
                                name="Awake"
                                radius={[4, 4, 0, 0]}
                                onClick={handleBarClick}
                                className="cursor-pointer"
                                label={(props: any) => {
                                    const { x, y, width, payload } = props;
                                    if (!payload || !payload.day) return null;

                                    const isHovered = payload.day === hoveredDay;
                                    const total = payload.totalSleep;

                                    return (
                                        <text
                                            x={x + width / 2}
                                            y={y - 6}
                                            textAnchor="middle"
                                            fill="#6B9E8A"
                                            fontSize={10}
                                            fontWeight={600}
                                            fontFamily="monospace"
                                            className="total-label"
                                            style={{
                                                opacity: isHovered ? 1 : 0,
                                                pointerEvents: 'none'
                                            }}
                                        >
                                            {formatTotalDuration(total)}
                                        </text>
                                    );
                                }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div
                    className="mt-2 flex shrink-0 gap-2 overflow-x-auto pb-1"
                    role="group"
                    aria-label="Sleep stage details by day"
                >
                    {chartData.map(({ day, sessionData }) => {
                        const fullDate = formatISODateForDisplay(day, undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        });

                        return (
                            <button
                                key={day}
                                type="button"
                                aria-label={`View sleep stage details for ${fullDate}`}
                                className="min-h-11 min-w-11 shrink-0 rounded-lg border border-line bg-surface-raised px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-accent hover:text-ink"
                                onClick={() => setSelectedDay(sessionData)}
                            >
                                <time dateTime={day}>
                                    {formatISODateForDisplay(day, undefined, { month: 'short', day: 'numeric' })}
                                </time>
                            </button>
                        );
                    })}
                </div>
            </div>

            {selectedDay && (
                <IOSModal
                    isOpen={!!selectedDay}
                    onClose={() => setSelectedDay(null)}
                    title={`Sleep stage details for ${formatISODateForDisplay(selectedDay.day, undefined, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}`}
                >
                    <div className="space-y-3 overflow-y-auto ios-scroll max-h-[70vh]">
                        {STAGE_KEYS.map((stage) => {
                            const detail = STAGE_DETAILS[stage];
                            const duration = selectedDay[detail.dataKey];

                            return (
                                <div key={stage} className="rounded-xl border border-line bg-canvas p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span
                                                className="h-3 w-3 shrink-0 rounded-full"
                                                style={{ backgroundColor: detail.color }}
                                                aria-hidden="true"
                                            />
                                            <h3 className="font-medium text-ink">{detail.name}</h3>
                                        </div>
                                        <span className="shrink-0 font-mono font-semibold text-ink">
                                            {formatSecondsDuration(duration)}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-ink-secondary">{detail.description}</p>
                                </div>
                            );
                        })}

                        <IOSButton
                            onClick={() => setSelectedDay(null)}
                            className="w-full"
                            variant="secondary"
                        >
                            Close
                        </IOSButton>
                    </div>
                </IOSModal>
            )}

            {/* Stage Detail Modal */}
            {selectedStage && (
                <IOSModal
                    isOpen={!!selectedStage}
                    onClose={() => setSelectedStage(null)}
                    title={`${STAGE_DETAILS[selectedStage.stage].name} Details`}
                >
                    <div className="space-y-6 overflow-y-auto ios-scroll max-h-[70vh]">
                        {/* Header with color indicator */}
                        <div className="flex items-center gap-4">
                            <div
                                className="w-16 h-16 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: `${STAGE_DETAILS[selectedStage.stage].color}20` }}
                            >
                                <div
                                    className="w-10 h-10 rounded-lg"
                                    style={{ backgroundColor: STAGE_DETAILS[selectedStage.stage].color }}
                                />
                            </div>
                            <div>
                                <p className="text-sm text-text-muted">
                                    {formatISODateForDisplay(selectedStage.session.day, undefined, {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                                <p className="text-2xl font-mono font-bold mt-1" style={{ color: STAGE_DETAILS[selectedStage.stage].color }}>
                                    {formatSecondsDuration(
                                        selectedStage.session[STAGE_DETAILS[selectedStage.stage].dataKey],
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-canvas p-4 rounded-xl border border-line">
                            <p className="text-sm text-ink-secondary">{STAGE_DETAILS[selectedStage.stage].description}</p>
                        </div>
                        <p className="text-xs leading-5 text-ink-muted">
                            Sleep stages are wearable estimates, not medical measurements or universal targets.
                        </p>


                        <IOSButton
                            onClick={() => setSelectedStage(null)}
                            className="w-full"
                            variant="secondary"
                        >
                            Close
                        </IOSButton>
                    </div>
                </IOSModal>
            )}
        </>
    );
};

export default SleepStagesChart;

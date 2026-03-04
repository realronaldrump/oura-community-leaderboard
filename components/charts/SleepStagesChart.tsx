import React, { useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from 'recharts';
import { SleepSession } from '../../types';
import { IOSModal, IOSButton, IOSListItem } from '../ios';
import { Moon, Zap, Wind, Activity, Info } from 'lucide-react';

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

    const totalWithAwake = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);

    return (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-3 shadow-lg">
            <p className="text-[#a3a3a3] text-xs mb-2">{label}</p>
            {payload.map((entry, index) => (
                <div key={index} className="flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-[#a3a3a3]">{entry.name}</span>
                    </div>
                    <span className="text-white font-mono">{formatDuration(entry.value)}</span>
                </div>
            ))}
            <div className="border-t border-[#2a2a2a] mt-2 pt-2">
                <div className="flex items-center justify-between gap-4 text-sm font-semibold">
                    <span className="text-[#00C896]">Total Sleep</span>
                    <span className="text-[#00C896] font-mono">{formatDuration(totalSleep)}</span>
                </div>
            </div>
        </div>
    );
};

interface Props {
    data: SleepSession[];
    onStageClick?: (stage: 'deep' | 'rem' | 'light' | 'awake', session: SleepSession) => void;
}

type StageDetail = {
    name: string;
    color: string;
    description: string;
    optimalRange: string;
    benefits: string[];
    tips: string[];
    dataKey: keyof SleepSession;
};

const STAGE_DETAILS: Record<string, StageDetail> = {
    deep: {
        name: 'Deep Sleep',
        color: '#1e40af',
        description: 'Deep sleep is the most restorative sleep stage where the body repairs tissues, builds muscle and bone, and strengthens the immune system.',
        optimalRange: '15-20% of total sleep (1-2 hours)',
        benefits: [
            'Physical recovery and tissue repair',
            'Muscle growth and bone strengthening',
            'Immune system support',
            'Memory consolidation and learning',
            'Energy restoration for next day'
        ],
        tips: [
            'Exercise regularly (increases deep sleep)',
            'Avoid alcohol before bed (disrupts deep sleep)',
            'Keep bedroom cool (60-67°F is optimal)',
            'Maintain consistent sleep schedule',
            'Reduce stress before bedtime'
        ],
        dataKey: 'deep_sleep_duration'
    },
    rem: {
        name: 'REM Sleep',
        color: '#8b5cf6',
        description: 'REM (Rapid Eye Movement) sleep is crucial for emotional regulation, creativity, and memory consolidation. This is when most vivid dreaming occurs.',
        optimalRange: '20-25% of total sleep (1.5-2 hours)',
        benefits: [
            'Memory consolidation and learning',
            'Emotional processing and regulation',
            'Creativity enhancement',
            'Problem-solving ability',
            'Brain development and maintenance'
        ],
        tips: [
            'Aim for 7-9 hours total sleep (REM comes later)',
            'Avoid alcohol before bed (reduces REM)',
            'Manage stress through relaxation techniques',
            'Limit screen time before bed',
            'Maintain consistent sleep schedule'
        ],
        dataKey: 'rem_sleep_duration'
    },
    light: {
        name: 'Light Sleep',
        color: '#3b82f6',
        description: 'Light sleep serves as a transition between wakefulness and deeper sleep stages. It\'s easier to be awakened from light sleep.',
        optimalRange: '50-60% of total sleep (3.5-5.5 hours)',
        benefits: [
            'Memory processing',
            'Physical restoration',
            'Energy conservation',
            'Preparation for deep sleep',
            'Body temperature regulation'
        ],
        tips: [
            'Practice good sleep hygiene',
            'Minimize disruptions in sleep environment',
            'Use white noise to mask sudden sounds',
            'Keep bedroom dark and cool',
            'Avoid caffeine and heavy meals before bed'
        ],
        dataKey: 'light_sleep_duration'
    },
    awake: {
        name: 'Awake Time',
        color: '#6b7280',
        description: 'Time spent awake during sleep period. Occasional awakenings are normal, but excessive awake time can impact sleep quality.',
        optimalRange: '<5% of total sleep',
        benefits: [
            'Natural sleep cycles include brief awakenings',
            'Allows body adjustments for comfort',
            'May indicate need for better sleep environment'
        ],
        tips: [
            'Address factors causing awakenings (noise, temperature, light)',
            'Limit fluids before bed to reduce bathroom trips',
            'Avoid caffeine and alcohol before sleep',
            'Use blackout curtains or eye mask',
            'Consider earplugs if noise is an issue'
        ],
        dataKey: 'awake_time'
    },
};

const SleepStagesChart: React.FC<Props> = ({ data, onStageClick }) => {
    const [selectedStage, setSelectedStage] = useState<{ stage: 'deep' | 'rem' | 'light' | 'awake'; session: SleepSession } | null>(null);
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

    const getStageDetail = (stage: string): StageDetail | undefined => {
        const stageMap: Record<string, 'deep' | 'rem' | 'light' | 'awake'> = {
            'Deep': 'deep',
            'REM': 'rem',
            'Light': 'light',
            'Awake': 'awake',
        };
        return STAGE_DETAILS[stageMap[stage] || 'light'];
    };

    const handleBarClick = (data: any) => {
        const stageName = data.name;
        const stageMap: Record<string, 'deep' | 'rem' | 'light' | 'awake'> = {
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                    <XAxis
                        dataKey="day"
                        stroke="#737373"
                        fontSize={11}
                        tickFormatter={(val) => val.slice(5)}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        stroke="#737373"
                        fontSize={11}
                        unit="h"
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Legend
                        verticalAlign="top"
                        height={32}
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }}
                    />
                    <Bar dataKey="Deep" stackId="a" fill="#1e40af" name="Deep" radius={[0, 0, 4, 4]} onClick={handleBarClick} className="cursor-pointer" />
                    <Bar dataKey="Light" stackId="a" fill="#3b82f6" name="Light" onClick={handleBarClick} className="cursor-pointer" />
                    <Bar dataKey="REM" stackId="a" fill="#8b5cf6" name="REM" onClick={handleBarClick} className="cursor-pointer" />
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
                                    fill="#00C896"
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
                                    {new Date(selectedStage.session.day).toLocaleDateString(undefined, {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                                <p className="text-2xl font-mono font-bold mt-1" style={{ color: STAGE_DETAILS[selectedStage.stage].color }}>
                                    {selectedStage.session[STAGE_DETAILS[selectedStage.stage].dataKey] != null
                                        ? (() => {
                                            const seconds = selectedStage.session[STAGE_DETAILS[selectedStage.stage].dataKey]! as number;
                                            const hours = Math.floor(seconds / 3600);
                                            const minutes = Math.floor((seconds % 3600) / 60);
                                            return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                                        })()
                                        : '--'}
                                </p>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                            <p className="text-sm text-[#A0A0A0]">{STAGE_DETAILS[selectedStage.stage].description}</p>
                        </div>

                        {/* Optimal Range */}
                        <div>
                            <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">Optimal Range</h4>
                            <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                                <p className="text-sm text-[#FAFAFA]">{STAGE_DETAILS[selectedStage.stage].optimalRange}</p>
                            </div>
                        </div>

                        {/* Benefits */}
                        {STAGE_DETAILS[selectedStage.stage].benefits && STAGE_DETAILS[selectedStage.stage].benefits.length > 0 && (
                            <div>
                                <h4 className="text-xs text-text-muted uppercase tracking-wider mb-3">Key Benefits</h4>
                                <div className="space-y-2">
                                    {STAGE_DETAILS[selectedStage.stage].benefits.map((benefit, idx) => (
                                        <div key={idx} className="flex gap-3 items-start">
                                            <div
                                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                                                style={{ backgroundColor: `${STAGE_DETAILS[selectedStage.stage].color}20`, color: STAGE_DETAILS[selectedStage.stage].color }}
                                            >
                                                <Activity className="w-3 h-3" />
                                            </div>
                                            <p className="text-sm text-[#A0A0A0]">{benefit}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tips */}
                        {STAGE_DETAILS[selectedStage.stage].tips && STAGE_DETAILS[selectedStage.stage].tips.length > 0 && (
                            <div>
                                <h4 className="text-xs text-text-muted uppercase tracking-wider mb-3">Tips to Improve</h4>
                                <div className="space-y-2">
                                    {STAGE_DETAILS[selectedStage.stage].tips.map((tip, idx) => (
                                        <div key={idx} className="flex gap-3">
                                            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[#00C896]/20 text-[#00C896] flex items-center justify-center text-xs font-bold">
                                                {idx + 1}
                                            </div>
                                            <p className="text-sm text-[#A0A0A0]">{tip}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

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

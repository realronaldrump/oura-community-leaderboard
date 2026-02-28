import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, Calendar, Info, Activity, Heart, Droplets, Wind, Zap, Brain, ArrowUp, ArrowDown, Minus, Moon, Trophy, Medal } from 'lucide-react';
import { IOSModal, IOSListItem, IOSButton } from './ios';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, AreaChart } from 'recharts';

interface MetricDataPoint {
    date: string;
    value: number;
    label?: string;
}

interface MetricDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    metricType: 'hrv' | 'heart_rate' | 'lowest_hr' | 'spo2' | 'stress' | 'resilience' | 'steps' | 'calories' | 'sleep_duration' | 'deep_sleep' | 'rem_sleep' | 'efficiency';
    currentValue?: number | null;
    historyData: MetricDataPoint[];
    unit?: string;
    color?: string;
    date?: string;
    isDurationInMinutes?: boolean;
}

type MetricConfig = {
    title: string;
    icon: React.ReactNode;
    description: string;
    optimalRange?: string;
    unit: string;
    color: string;
    goodHigher: boolean;
    categories: { label: string; range: [number, number]; color: string }[];
};

const METRIC_CONFIGS: Record<string, MetricConfig> = {
    hrv: {
        title: 'Heart Rate Variability',
        icon: <Heart className="w-4 h-4" />,
        description: 'HRV measures the variation in time intervals between consecutive heartbeats, recorded primarily during sleep when the body is at rest. This metric is a powerful indicator of your autonomic nervous system\'s balance between stress (sympathetic) and recovery (parasympathetic). Higher HRV typically indicates better cardiovascular fitness, lower stress levels, and more effective recovery. HRV varies significantly between individuals, so compare against your personal baseline rather than absolute values.',
        optimalRange: '50-100 ms (varies by age/fitness)',
        unit: 'ms',
        color: '#8B5CF6',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [100, 999], color: '#10B981' },
            { label: 'Good', range: [50, 100], color: '#3B82F6' },
            { label: 'Fair', range: [30, 50], color: '#F59E0B' },
            { label: 'Low', range: [0, 30], color: '#EF4444' },
        ],
    },
    heart_rate: {
        title: 'Average Heart Rate',
        icon: <Activity className="w-4 h-4" />,
        description: 'Your average heart rate recorded during sleep periods, when the body is at rest. This metric provides insight into your cardiovascular health and how well your body recovers during sleep. A lower sleeping heart rate generally indicates better cardiovascular fitness and more efficient heart function. This value typically runs 10-20 bpm lower than your daytime resting heart rate due to the body\'s relaxed state during sleep.',
        optimalRange: '40-60 bpm (during sleep)',
        unit: 'bpm',
        color: '#EF4444',
        goodHigher: false,
        categories: [
            { label: 'Excellent', range: [0, 50], color: '#10B981' },
            { label: 'Good', range: [50, 60], color: '#3B82F6' },
            { label: 'Fair', range: [60, 70], color: '#F59E0B' },
            { label: 'High', range: [70, 200], color: '#EF4444' },
        ],
    },
    lowest_hr: {
        title: 'Lowest Heart Rate',
        icon: <Heart className="w-4 h-4" />,
        description: 'The minimum heart rate recorded during your sleep period, which typically occurs during deep sleep phases when the body is in its most relaxed state. This metric reflects your heart\'s efficiency and cardiovascular fitness level. A lower sleeping minimum indicates that your heart doesn\'t have to work as hard to maintain circulation during deep rest. This value often improves with consistent aerobic exercise and good sleep quality.',
        optimalRange: '35-45 bpm',
        unit: 'bpm',
        color: '#EF4444',
        goodHigher: false,
        categories: [
            { label: 'Excellent', range: [0, 40], color: '#10B981' },
            { label: 'Good', range: [40, 50], color: '#3B82F6' },
            { label: 'Fair', range: [50, 60], color: '#F59E0B' },
            { label: 'High', range: [60, 200], color: '#EF4444' },
        ],
    },
    spo2: {
        title: 'Blood Oxygen (SpO2)',
        icon: <Droplets className="w-4 h-4" />,
        description: 'Blood oxygen saturation percentage, indicating how much oxygen is being carried by red blood cells throughout your body. Measured during sleep, this metric reveals how effectively your respiratory system oxygenates your blood. Healthy SpO2 levels should remain consistently high throughout the night. Significant drops or consistently lower readings may indicate breathing issues, sleep apnea, or other respiratory conditions that could be disrupting sleep quality.',
        optimalRange: '95-100%',
        unit: '%',
        color: '#3B82F6',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [98, 100], color: '#10B981' },
            { label: 'Good', range: [95, 98], color: '#3B82F6' },
            { label: 'Fair', range: [90, 95], color: '#F59E0B' },
            { label: 'Low', range: [0, 90], color: '#EF4444' },
        ],
    },
    stress: {
        title: 'Stress Levels',
        icon: <Brain className="w-4 h-4" />,
        description: 'Duration spent in elevated stress states throughout the day, measured through heart rate variability patterns and other physiological markers. This metric tracks both sympathetic nervous system activation (stress) and parasympathetic activation (recovery). A healthy day includes balanced periods of stress (necessary for adaptation) and recovery (essential for repair). Too much stress without adequate recovery can lead to burnout, while too much recovery without stress challenges may indicate under-stimulation.',
        optimalRange: 'More recovery than stress',
        unit: 'minutes',
        color: '#F59E0B',
        goodHigher: false,
        categories: [
            { label: 'Low Stress', range: [0, 30], color: '#10B981' },
            { label: 'Moderate', range: [30, 60], color: '#3B82F6' },
            { label: 'High Stress', range: [60, 120], color: '#F59E0B' },
            { label: 'Very High', range: [120, 999], color: '#EF4444' },
        ],
    },
    resilience: {
        title: 'Resilience Score',
        icon: <Zap className="w-4 h-4" />,
        description: 'A composite score measuring how effectively your body recovers from physical and mental stress. This metric analyzes your heart rate variability, heart rate recovery patterns, sleep quality, and recovery periods following activity. Higher resilience indicates your body can bounce back quickly from challenges, meaning you can handle more stress without negative effects. Building resilience involves consistent sleep, proper nutrition, regular exercise, and stress management techniques.',
        optimalRange: 'Above 70',
        unit: 'score',
        color: '#10B981',
        goodHigher: true,
        categories: [
            { label: 'Exceptional', range: [90, 100], color: '#10B981' },
            { label: 'Strong', range: [75, 90], color: '#3B82F6' },
            { label: 'Solid', range: [50, 75], color: '#F59E0B' },
            { label: 'Limited', range: [0, 50], color: '#EF4444' },
        ],
    },
    steps: {
        title: 'Daily Steps',
        icon: <Activity className="w-4 h-4" />,
        description: 'Total number of steps recorded throughout the entire day, measuring your overall movement and activity level. This metric captures all walking and running activities, providing a comprehensive view of your daily movement. Regular walking improves cardiovascular health, helps maintain healthy weight, boosts mood, and increases energy levels. Steps are accumulated from midnight to midnight and include both intentional exercise and incidental movement throughout your daily activities.',
        optimalRange: '7,000-10,000 steps',
        unit: 'steps',
        color: '#06B6D4',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [10000, 99999], color: '#10B981' },
            { label: 'Good', range: [7000, 10000], color: '#3B82F6' },
            { label: 'Fair', range: [4000, 7000], color: '#F59E0B' },
            { label: 'Low', range: [0, 4000], color: '#EF4444' },
        ],
    },
    calories: {
        title: 'Active Calories',
        icon: <Zap className="w-4 h-4" />,
        description: 'Calories burned through physical activity beyond your resting metabolic rate. This metric captures energy expenditure from walking, running, workouts, and other movements throughout the day. Active calories differ from total calories (which includes your baseline metabolic burn) by focusing specifically on the energy used during movement. Tracking active calories helps you understand your exercise intensity and overall physical activity level.',
        optimalRange: '400-800+ (varies by activity)',
        unit: 'kcal',
        color: '#F59E0B',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [800, 9999], color: '#10B981' },
            { label: 'Good', range: [500, 800], color: '#3B82F6' },
            { label: 'Fair', range: [300, 500], color: '#F59E0B' },
            { label: 'Low', range: [0, 300], color: '#EF4444' },
        ],
    },
    sleep_duration: {
        title: 'Total Sleep Duration',
        icon: <Moon className="w-4 h-4" />,
        description: 'The total time spent actually asleep during your sleep period, measured from when you fall asleep until you wake up. This excludes awake time within your sleep period (unlike "Time in Bed" which includes time spent trying to fall asleep or brief awakenings). Most adults need 7-9 hours of quality sleep for optimal health, cognitive function, and physical recovery. This metric includes all sleep stages: light sleep, deep sleep, and REM sleep.',
        optimalRange: '7-9 hours',
        unit: 'hours',
        color: '#6366F1',
        goodHigher: true,
        categories: [
            { label: 'Optimal', range: [420, 540], color: '#10B981' },
            { label: 'Good', range: [360, 420], color: '#3B82F6' },
            { label: 'Fair', range: [300, 360], color: '#F59E0B' },
            { label: 'Low', range: [0, 300], color: '#EF4444' },
        ],
    },
    deep_sleep: {
        title: 'Deep Sleep Duration',
        icon: <Wind className="w-4 h-4" />,
        description: 'The time spent in deep sleep stages (N3 sleep), the most restorative phase of sleep where physical recovery occurs. During deep sleep, your body repairs tissues, builds muscle and bone, strengthens the immune system, and releases essential hormones. This stage typically occurs most in the first half of the night and represents about 15-20% of total sleep in healthy adults. Factors like exercise, temperature, and stress levels can impact deep sleep quality.',
        optimalRange: '1-2 hours',
        unit: 'hours',
        color: '#1E40AF',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [90, 999], color: '#10B981' },
            { label: 'Good', range: [60, 90], color: '#3B82F6' },
            { label: 'Fair', range: [30, 60], color: '#F59E0B' },
            { label: 'Low', range: [0, 30], color: '#EF4444' },
        ],
    },
    rem_sleep: {
        title: 'REM Sleep Duration',
        icon: <Brain className="w-4 h-4" />,
        description: 'The time spent in REM (Rapid Eye Movement) sleep, a critical stage associated with dreaming, emotional processing, creativity, and memory consolidation. REM sleep typically occurs in longer periods during the second half of the night and comprises about 20-25% of total sleep. This stage is characterized by increased brain activity, rapid eye movements, and temporary muscle paralysis. REM sleep is essential for cognitive function, emotional balance, and learning new skills.',
        optimalRange: '1.5-2 hours',
        unit: 'hours',
        color: '#8B5CF6',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [120, 999], color: '#10B981' },
            { label: 'Good', range: [90, 120], color: '#3B82F6' },
            { label: 'Fair', range: [60, 90], color: '#F59E0B' },
            { label: 'Low', range: [0, 60], color: '#EF4444' },
        ],
    },
    efficiency: {
        title: 'Sleep Efficiency',
        icon: <Activity className="w-4 h-4" />,
        description: 'The percentage of time in bed actually spent sleeping, calculated by dividing total sleep duration by total time in bed. This metric measures sleep quality and restlessness. Higher efficiency indicates you fall asleep quickly and stay asleep with minimal awakenings. Factors that can reduce sleep efficiency include difficulty falling asleep, frequent nighttime awakenings, waking too early, or spending time in bed without sleeping. Good sleep hygiene practices often improve this metric.',
        optimalRange: '85-95%',
        unit: '%',
        color: '#3B82F6',
        goodHigher: true,
        categories: [
            { label: 'Excellent', range: [90, 100], color: '#10B981' },
            { label: 'Good', range: [85, 90], color: '#3B82F6' },
            { label: 'Fair', range: [80, 85], color: '#F59E0B' },
            { label: 'Low', range: [0, 80], color: '#EF4444' },
        ],
    },
};

const MetricDetailModal: React.FC<MetricDetailModalProps> = ({
    isOpen,
    onClose,
    metricType,
    currentValue,
    historyData,
    unit,
    color,
    date,
    isDurationInMinutes = false,
}) => {
    const formatDurationValue = (value: number | null | undefined, unit: string | undefined): string => {
        if (value == null) return '--';
        if (isDurationInMinutes) {
            const hours = Math.floor(value / 60);
            const minutes = value % 60;
            return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        }
        return `${value}${unit ? ` ${unit}` : ''}`;
    };

    const formatDurationFromSeconds = (seconds: number | null | undefined): string => {
        if (seconds == null) return '--';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };
    const config = METRIC_CONFIGS[metricType] || METRIC_CONFIGS.hrv;
    const effectiveColor = color || config.color;
    const effectiveUnit = unit || config.unit;

    const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '14d' | '30d'>('7d');
    const [selectedStatistic, setSelectedStatistic] = useState<'best' | 'worst' | null>(null);

    const filterDataByRange = (data: MetricDataPoint[], range: '7d' | '14d' | '30d') => {
        const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
        return data.slice(0, days).reverse();
    };

    const getTopEntries = (sortBy: 'best' | 'worst', limit: number = 10) => {
        const sorted = [...historyData].sort((a, b) => {
            if (sortBy === 'best') {
                return config.goodHigher ? b.value - a.value : a.value - b.value;
            } else {
                return config.goodHigher ? a.value - b.value : b.value - a.value;
            }
        });
        return sorted.slice(0, limit);
    };

    const filteredData = filterDataByRange(historyData, selectedTimeRange);

    const calculateTrend = () => {
        if (filteredData.length < 2) return null;
        const recent = filteredData.slice(0, Math.floor(filteredData.length / 2));
        const older = filteredData.slice(Math.floor(filteredData.length / 2));

        const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
        const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;

        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        return {
            change,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
        };
    };

    const trend = calculateTrend();

    const getCategory = (value: number) => {
        return config.categories.find(cat => value >= cat.range[0] && value < cat.range[1]) || config.categories[config.categories.length - 1];
    };

    const currentCategory = currentValue !== null && currentValue !== undefined ? getCategory(currentValue) : null;

    const getPercentile = (value: number) => {
        const sortedValues = historyData.map(d => d.value).sort((a, b) => a - b);
        const index = sortedValues.findIndex(v => v >= value);
        return Math.round((index / sortedValues.length) * 100);
    };

    const getInsights = () => {
        if (currentValue === null || currentValue === undefined) return [];

        const insights = [];
        const percentile = getPercentile(currentValue);

        if (percentile >= 75) {
            insights.push(`Your ${config.title} is in the top 25% of your personal history. Keep up the great work!`);
        } else if (percentile <= 25) {
            insights.push(`Your ${config.title} is below your typical levels. Consider what factors might be affecting it.`);
        }

        if (trend) {
            if (trend.direction === 'up' && config.goodHigher) {
                insights.push(`Your ${config.title} has been trending upward recently, which is a positive sign.`);
            } else if (trend.direction === 'down' && !config.goodHigher) {
                insights.push(`Your ${config.title} has been trending downward recently, which is a positive sign.`);
            } else if (trend.direction === 'up' && !config.goodHigher) {
                insights.push(`Your ${config.title} has been increasing. Consider if any lifestyle changes are contributing.`);
            }
        }

        return insights;
    };

    return (
        <IOSModal isOpen={isOpen} onClose={onClose} title={config.title}>
            <div className="space-y-6">
                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="text-[#666666] text-sm">
                            {date ? new Date(date).toLocaleDateString() : 'Latest'}
                        </p>
                    </div>
                    <div className="text-right">
                        {config.icon}
                    </div>
                </div>

                <div className="overflow-y-auto ios-scroll max-h-[70vh] space-y-6">
                    {/* Current Value with Trend */}
                    <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-[#666666] text-sm mb-1">Current Value</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold font-mono" style={{ color: effectiveColor }}>
                                        {['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType)
                                            ? formatDurationFromSeconds(currentValue)
                                            : currentValue ?? '--'}
                                    </span>
                                    <span className="text-[#666666] text-sm font-medium">
                                        {['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType) ? '' : effectiveUnit}
                                    </span>
                                </div>
                            </div>
                            {trend && (
                                <div className={`flex items-center gap-1 text-sm font-medium ${trend.direction === 'up' ? 'text-green-400' : trend.direction === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                                    {trend.direction === 'up' ? <TrendingUp className="w-4 h-4" /> : trend.direction === 'down' ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                    <span>{Math.abs(trend.change).toFixed(1)}%</span>
                                    <span className="text-[#666666] text-xs">vs last {selectedTimeRange === '7d' ? '3.5 days' : selectedTimeRange === '14d' ? '7 days' : '15 days'}</span>
                                </div>
                            )}
                        </div>

                        {/* Category Badge */}
                        {currentCategory && (
                            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${currentCategory.color}20`, color: currentCategory.color }}>
                                {currentCategory.label}
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="flex gap-2 p-4 bg-[#0C0C0C] rounded-xl border border-[#222]">
                        <Info className="w-5 h-5 text-[#3B82F6] flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-[#A0A0A0]">{config.description}</p>
                            <p className="text-xs text-[#666666] mt-2">
                                <span className="font-medium">Optimal range:</span> {config.optimalRange}
                            </p>
                        </div>
                    </div>

                    {/* Time Range Selector */}
                    <div className="flex gap-2">
                        {(['7d', '14d', '30d'] as const).map((range) => (
                            <button
                                key={range}
                                onClick={() => setSelectedTimeRange(range)}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedTimeRange === range
                                    ? 'bg-[#00C896]/20 text-[#00C896] border border-[#00C896]/30'
                                    : 'bg-[#0C0C0C] text-[#666666] border border-[#222] hover:border-[#333]'
                                    }`}
                            >
                                {range === '7d' ? '7 Days' : range === '14d' ? '14 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>

                    {/* History Chart */}
                    {filteredData.length > 0 && (
                        <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                            <h4 className="text-sm font-medium text-[#FAFAFA] mb-4 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {config.title} History
                            </h4>
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150}>
                                    <AreaChart data={filteredData}>
                                        <defs>
                                            <linearGradient id={`colorGradient-${metricType}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={effectiveColor} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={effectiveColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fill: '#666666', fontSize: 11 }}
                                            tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            axisLine={{ stroke: '#222' }}
                                        />
                                        <YAxis
                                            tick={{ fill: '#666666', fontSize: 11 }}
                                            axisLine={{ stroke: '#222' }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#0C0C0C',
                                                border: '1px solid #222',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value: number) => [
                                                ['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType)
                                                    ? formatDurationFromSeconds(value)
                                                    : `${value} ${effectiveUnit}`,
                                                config.title
                                            ]}
                                            labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke={effectiveColor}
                                            strokeWidth={2}
                                            fill={`url(#colorGradient-${metricType})`}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Category Breakdown */}
                    <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                        <h4 className="text-sm font-medium text-[#FAFAFA] mb-4">Category Ranges</h4>
                        <div className="space-y-3">
                            {config.categories.map((cat, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm text-[#A0A0A0]">{cat.label}</span>
                                            <span className="text-xs text-[#666666] font-mono">{cat.range[0]}-{cat.range[1] === 999 ? '∞' : cat.range[1]} {effectiveUnit}</span>
                                        </div>
                                        <div className="h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${((cat.range[1] - cat.range[0]) / (config.categories.reduce((max, c) => Math.max(max, c.range[1]), 0))) * 100}%`, backgroundColor: cat.color }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Insights */}
                    {getInsights().length > 0 && (
                        <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                            <h4 className="text-sm font-medium text-[#FAFAFA] mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Insights
                            </h4>
                            <div className="space-y-2">
                                {getInsights().map((insight, idx) => (
                                    <p key={idx} className="text-sm text-[#A0A0A0]">{insight}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Historical Stats */}
                    {historyData.length > 0 && (
                        <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222]">
                            <div className="mb-4">
                                <h4 className="text-sm font-medium text-[#FAFAFA]">Historical Statistics</h4>
                                <p className="text-xs text-[#666666] mt-1">
                                    Average uses your {selectedTimeRange === '7d' ? '7-day' : selectedTimeRange === '14d' ? '14-day' : '30-day'} data. Best/Worst use your all-time history ({historyData.length} days). Click to see top entries.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <IOSListItem
                                    title="Average"
                                    subtitle={
                                        ['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType)
                                            ? formatDurationFromSeconds(filteredData.reduce((sum, d) => sum + d.value, 0) / filteredData.length)
                                            : `${(filteredData.reduce((sum, d) => sum + d.value, 0) / filteredData.length).toFixed(1)} ${effectiveUnit}`
                                    }
                                    icon={<div className="text-[#00C896]"><Minus className="w-4 h-4" /></div>}
                                />
                                <IOSListItem
                                    title="Best (All Time)"
                                    subtitle={
                                        ['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType)
                                            ? formatDurationFromSeconds(config.goodHigher ? Math.max(...historyData.map(d => d.value)) : Math.min(...historyData.map(d => d.value)))
                                            : `${(config.goodHigher ? Math.max(...historyData.map(d => d.value)) : Math.min(...historyData.map(d => d.value))).toFixed(1)} ${effectiveUnit}`
                                    }
                                    icon={<div className="text-[#10B981]"><Trophy className="w-4 h-4" /></div>}
                                    onClick={() => setSelectedStatistic(selectedStatistic === 'best' ? null : 'best')}
                                />
                                <IOSListItem
                                    title="Worst (All Time)"
                                    subtitle={
                                        ['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType)
                                            ? formatDurationFromSeconds(config.goodHigher ? Math.min(...historyData.map(d => d.value)) : Math.max(...historyData.map(d => d.value)))
                                            : `${(config.goodHigher ? Math.min(...historyData.map(d => d.value)) : Math.max(...historyData.map(d => d.value))).toFixed(1)} ${effectiveUnit}`
                                    }
                                    icon={<div className="text-[#EF4444]"><TrendingDown className="w-4 h-4" /></div>}
                                    onClick={() => setSelectedStatistic(selectedStatistic === 'worst' ? null : 'worst')}
                                />
                                <IOSListItem
                                    title="Personal Percentile"
                                    subtitle={`${currentValue !== null && currentValue !== undefined ? getPercentile(currentValue) : '--'}th compared to history`}
                                    icon={<div className="text-[#3B82F6]"><TrendingUp className="w-4 h-4" /></div>}
                                />
                            </div>

                            {selectedStatistic && (
                                <div className="mt-4 pt-4 border-t border-[#222]">
                                    <h5 className="text-sm font-medium text-[#FAFAFA] mb-3 flex items-center gap-2">
                                        {selectedStatistic === 'best' ? <Trophy className="w-4 h-4 text-[#10B981]" /> : <TrendingDown className="w-4 h-4 text-[#EF4444]" />}
                                        Top 10 {selectedStatistic === 'best' ? 'Best' : 'Worst'} Days (All Time)
                                    </h5>
                                    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                                        {getTopEntries(selectedStatistic, 10).map((entry, idx) => (
                                            <div
                                                key={entry.date}
                                                className={`flex items-center justify-between p-3 rounded-lg ${idx === 0 ? 'bg-[#10B981]/10' : 'bg-[#1A1A1A]'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-[#10B981] text-black' :
                                                            idx === 1 ? 'bg-[#C0C0C0] text-black' :
                                                                idx === 2 ? 'bg-[#CD7F32] text-black' :
                                                                    'bg-[#2A2A2A] text-[#666666]'
                                                        }`}>
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-[#FAFAFA]">
                                                            {new Date(entry.date).toLocaleDateString(undefined, {
                                                                weekday: 'short',
                                                                month: 'short',
                                                                day: 'numeric',
                                                                year: 'numeric'
                                                            })}
                                                        </p>
                                                        {entry.label && (
                                                            <p className="text-xs text-[#666666]">{entry.label}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-mono font-bold" style={{ color: effectiveColor }}>
                                                        {['sleep_duration', 'deep_sleep', 'rem_sleep'].includes(metricType)
                                                            ? formatDurationFromSeconds(entry.value)
                                                            : `${entry.value} ${effectiveUnit}`}
                                                    </p>
                                                    {idx === 0 && (
                                                        <p className={`text-xs ${selectedStatistic === 'best' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                                                            {selectedStatistic === 'best'
                                                                ? 'All-time best'
                                                                : config.goodHigher ? 'All-time lowest' : 'All-time highest'
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <IOSButton onClick={onClose} className="w-full" variant="secondary">
                    Close
                </IOSButton>
            </div>
        </IOSModal>
    );
};

export default MetricDetailModal;

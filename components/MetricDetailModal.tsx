import React, { useEffect, useState } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Calendar,
    Info,
    Activity,
    Heart,
    Droplets,
    Wind,
    Zap,
    Brain,
    Minus,
    Moon,
    Trophy,
    Flame,
    Thermometer,
    Sunrise,
} from 'lucide-react';
import { IOSModal, IOSListItem, IOSButton } from './ios';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatISODateForDisplay } from '../utils/date';
import { CHART_TOOLTIP_STYLE } from '../utils/chartStyles';
import { getDataAwareChartDomain } from '../utils/chartScale';
import { formatRecordLocalClockTime, getLocalMinutesOfDayFromIso } from '../utils/temporal';
import type { SleepSession } from '../types';

interface MetricDataPoint {
    date: string;
    value: number;
    label?: string;
}

export type MetricDetailType =
    | 'hrv'
    | 'heart_rate'
    | 'lowest_hr'
    | 'spo2'
    | 'stress'
    | 'resilience'
    | 'steps'
    | 'calories'
    | 'total_calories'
    | 'distance'
    | 'sleep_duration'
    | 'deep_sleep'
    | 'rem_sleep'
    | 'light_sleep'
    | 'efficiency'
    | 'bedtime'
    | 'wake_time'
    | 'latency'
    | 'awake_time'
    | 'breathing_rate'
    | 'body_temperature'
    | 'high_activity_time'
    | 'medium_activity_time'
    | 'low_activity_time'
    | 'sedentary_time';

interface MetricDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    metricType: MetricDetailType;
    currentValue?: number | null;
    currentTimestamp?: string;
    historyData: MetricDataPoint[];
    unit?: string;
    color?: string;
    date?: string;
    sleepSession?: Pick<SleepSession, 'bedtime_start' | 'bedtime_end'>;
}

type MetricValueFormat = 'number' | 'duration' | 'clock' | 'signed';
type MetricEvaluationMode = 'higher_better' | 'lower_better' | 'closer_to_zero';

type MetricConfig = {
    title: string;
    icon: React.ReactNode;
    description: string;
    unit: string;
    color: string;
    valueFormat: MetricValueFormat;
    evaluation: MetricEvaluationMode;
    decimals?: number;
    showTrend?: boolean;
    showInsights?: boolean;
    showPercentile?: boolean;
    bestLabel?: string;
    worstLabel?: string;
    topListBestLabel?: string;
    topListWorstLabel?: string;
    bestBadge?: string;
    worstBadge?: string;
    chartMaximum?: number;
};

const formatDurationFromSeconds = (seconds: number | null | undefined): string => {
    if (seconds == null) return '--';
    const totalSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
};

const normalizeMinutesOfDay = (minutes: number): number => {
    const normalized = Math.round(minutes) % 1440;
    return normalized < 0 ? normalized + 1440 : normalized;
};

const formatClockFromMinutes = (minutes: number | null | undefined): string => {
    if (minutes == null) return '--';

    const normalized = normalizeMinutesOfDay(minutes);
    const hours = Math.floor(normalized / 60);
    const remainder = normalized % 60;
    const date = new Date(Date.UTC(2000, 0, 1, hours, remainder));

    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC',
    });
};

const formatNumber = (value: number, decimals: number): string => {
    if (Math.abs(value) >= 1000 && decimals === 0) {
        return Math.round(value).toLocaleString();
    }

    return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

const METRIC_CONFIGS: Record<MetricDetailType, MetricConfig> = {
    hrv: {
        title: 'Heart Rate Variability',
        icon: <Heart className="w-4 h-4" />,
        description: 'Nightly HRV varies widely by person. Compare this value with your own baseline and longer-term pattern.',
        unit: 'ms',
        color: '#A08BBE',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 0,
    },
    heart_rate: {
        title: 'Average Heart Rate',
        icon: <Activity className="w-4 h-4" />,
        description: 'Average heart rate recorded during sleep. Compare it with your own baseline and recent trend.',
        unit: 'bpm',
        color: '#D4897B',
        valueFormat: 'number',
        evaluation: 'lower_better',
        decimals: 0,
    },
    lowest_hr: {
        title: 'Lowest Heart Rate',
        icon: <Heart className="w-4 h-4" />,
        description: 'Lowest heart rate recorded during the sleep period. Compare it with your own baseline and recent trend.',
        unit: 'bpm',
        color: '#D4897B',
        valueFormat: 'number',
        evaluation: 'lower_better',
        decimals: 0,
    },
    spo2: {
        title: 'Blood Oxygen (SpO2)',
        icon: <Droplets className="w-4 h-4" />,
        description: 'Average blood-oxygen estimate recorded during sleep. Wearable readings are not medical measurements.',
        unit: '%',
        color: '#7BA8D4',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 1,
        chartMaximum: 100,
    },
    stress: {
        title: 'High Stress Time',
        icon: <Brain className="w-4 h-4" />,
        description: 'This tracks how long Oura detected you in high-stress states across the day. Lower totals usually mean your day included more balance between load and recovery.',
        unit: '',
        color: '#D4A574',
        valueFormat: 'duration',
        evaluation: 'lower_better',
        decimals: 0,
        bestLabel: 'Lowest (All Time)',
        worstLabel: 'Highest (All Time)',
        topListBestLabel: 'Lowest',
        topListWorstLabel: 'Highest',
        bestBadge: 'Lowest high-stress day',
        worstBadge: 'Highest high-stress day',
    },
    resilience: {
        title: 'Resilience Score',
        icon: <Zap className="w-4 h-4" />,
        description: 'Oura Resilience summarizes recent stress and recovery signals over time. Compare changes with your own baseline.',
        unit: 'score',
        color: '#7BC4A0',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 0,
        chartMaximum: 100,
    },
    steps: {
        title: 'Daily Steps',
        icon: <Activity className="w-4 h-4" />,
        description: 'Steps capture total daily movement, from deliberate workouts to incidental walking. Higher counts generally mean a more active day overall.',
        unit: 'steps',
        color: '#D4B87B',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 0,
    },
    calories: {
        title: 'Active Calories',
        icon: <Zap className="w-4 h-4" />,
        description: 'Active calories represent the energy you burned through movement beyond baseline metabolism. Higher values typically reflect more total exercise or activity load.',
        unit: 'kcal',
        color: '#D4A574',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 0,
    },
    total_calories: {
        title: 'Total Calories',
        icon: <Flame className="w-4 h-4" />,
        description: 'Total calories combine your resting metabolic burn with activity. This reflects the full amount of energy your body used that day.',
        unit: 'kcal',
        color: '#D4897B',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 0,
    },
    distance: {
        title: 'Walking Distance',
        icon: <Activity className="w-4 h-4" />,
        description: 'Equivalent walking distance is Oura’s estimate of how far your daily movement adds up to. It is a simple way to compare activity volume across days.',
        unit: 'mi',
        color: '#7BA8D4',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 1,
    },
    sleep_duration: {
        title: 'Total Sleep Duration',
        icon: <Moon className="w-4 h-4" />,
        description: 'Total sleep duration measures the time you were actually asleep, excluding time awake in bed. Consistent sleep quantity is one of the clearest recovery signals on the board.',
        unit: '',
        color: '#7BA8D4',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
    },
    deep_sleep: {
        title: 'Deep Sleep Duration',
        icon: <Wind className="w-4 h-4" />,
        description: 'Deep sleep is the most physically restorative phase of sleep. More time here usually points to stronger overnight repair and recovery.',
        unit: '',
        color: '#7BA8D4',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
    },
    rem_sleep: {
        title: 'REM Sleep Duration',
        icon: <Brain className="w-4 h-4" />,
        description: 'REM sleep supports memory, learning, and emotional processing. More REM usually means you gave yourself enough time for the later sleep cycles to unfold.',
        unit: '',
        color: '#A08BBE',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
    },
    light_sleep: {
        title: 'Light Sleep Duration',
        icon: <Moon className="w-4 h-4" />,
        description: 'Light sleep makes up the largest share of most nights. It helps transition between wakefulness, deep sleep, and REM, so the main value here is comparing against your own baseline.',
        unit: '',
        color: '#7BA8D4',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
        showInsights: false,
        showPercentile: false,
        bestLabel: 'Highest (All Time)',
        worstLabel: 'Lowest (All Time)',
        topListBestLabel: 'Highest',
        topListWorstLabel: 'Lowest',
        bestBadge: 'Highest light sleep night',
        worstBadge: 'Lowest light sleep night',
    },
    efficiency: {
        title: 'Sleep Efficiency',
        icon: <Activity className="w-4 h-4" />,
        description: 'Sleep efficiency is the percentage of time in bed that you were actually asleep. Higher efficiency usually means you fell asleep faster and spent less time awake overnight.',
        unit: '%',
        color: '#7BC4A0',
        valueFormat: 'number',
        evaluation: 'higher_better',
        decimals: 0,
        chartMaximum: 100,
    },
    bedtime: {
        title: 'Bedtime',
        icon: <Moon className="w-4 h-4" />,
        description: 'Bedtime tracks when your main sleep session started. The biggest value here is seeing how consistent your timing is from night to night.',
        unit: '',
        color: '#A08BBE',
        valueFormat: 'clock',
        evaluation: 'lower_better',
        decimals: 0,
        showTrend: false,
        showInsights: false,
        showPercentile: false,
        bestLabel: 'Earliest (All Time)',
        worstLabel: 'Latest (All Time)',
        topListBestLabel: 'Earliest',
        topListWorstLabel: 'Latest',
        bestBadge: 'Earliest bedtime',
        worstBadge: 'Latest bedtime',
    },
    wake_time: {
        title: 'Wake Time',
        icon: <Activity className="w-4 h-4" />,
        description: 'Wake time tracks when your main sleep session ended. The chart is most useful for spotting consistency and drift across your recent schedule.',
        unit: '',
        color: '#D4B87B',
        valueFormat: 'clock',
        evaluation: 'lower_better',
        decimals: 0,
        showTrend: false,
        showInsights: false,
        showPercentile: false,
        bestLabel: 'Earliest (All Time)',
        worstLabel: 'Latest (All Time)',
        topListBestLabel: 'Earliest',
        topListWorstLabel: 'Latest',
        bestBadge: 'Earliest wake time',
        worstBadge: 'Latest wake time',
    },
    latency: {
        title: 'Sleep Latency',
        icon: <Moon className="w-4 h-4" />,
        description: 'Sleep latency is how long it took to fall asleep after getting into bed. Lower values generally mean you were ready for sleep and settled quickly.',
        unit: '',
        color: '#7BC4A0',
        valueFormat: 'duration',
        evaluation: 'lower_better',
        decimals: 0,
        bestLabel: 'Shortest (All Time)',
        worstLabel: 'Longest (All Time)',
        topListBestLabel: 'Shortest',
        topListWorstLabel: 'Longest',
        bestBadge: 'Shortest sleep latency',
        worstBadge: 'Longest sleep latency',
    },
    awake_time: {
        title: 'Awake Time',
        icon: <Moon className="w-4 h-4" />,
        description: 'Awake time measures the amount of time you were awake during your main sleep session. Lower values usually mean more continuous sleep with fewer disruptions.',
        unit: '',
        color: '#D4897B',
        valueFormat: 'duration',
        evaluation: 'lower_better',
        decimals: 0,
        bestLabel: 'Shortest (All Time)',
        worstLabel: 'Longest (All Time)',
        topListBestLabel: 'Shortest',
        topListWorstLabel: 'Longest',
        bestBadge: 'Shortest awake time',
        worstBadge: 'Longest awake time',
    },
    breathing_rate: {
        title: 'Breathing Rate',
        icon: <Wind className="w-4 h-4" />,
        description: 'Average breathing rate during sleep can highlight changes in strain, illness, or sleep quality. The most useful comparison is usually your own normal range.',
        unit: 'br/min',
        color: '#7BC4A0',
        valueFormat: 'number',
        evaluation: 'lower_better',
        decimals: 1,
        bestLabel: 'Lowest (All Time)',
        worstLabel: 'Highest (All Time)',
        topListBestLabel: 'Lowest',
        topListWorstLabel: 'Highest',
        bestBadge: 'Lowest breathing rate',
        worstBadge: 'Highest breathing rate',
    },
    body_temperature: {
        title: 'Body Temperature Deviation',
        icon: <Thermometer className="w-4 h-4" />,
        description: 'Difference from your overnight temperature baseline. Trends across several nights matter more than one value.',
        unit: '°F',
        color: '#D4897B',
        valueFormat: 'signed',
        evaluation: 'closer_to_zero',
        decimals: 1,
        showTrend: false,
        showInsights: false,
        showPercentile: false,
        bestLabel: 'Closest to Baseline (All Time)',
        worstLabel: 'Farthest from Baseline (All Time)',
        topListBestLabel: 'Closest to Baseline',
        topListWorstLabel: 'Farthest from Baseline',
        bestBadge: 'Closest to baseline',
        worstBadge: 'Farthest from baseline',
    },
    high_activity_time: {
        title: 'High Activity Time',
        icon: <Flame className="w-4 h-4" />,
        description: 'High activity time reflects your most intense movement blocks during the day. More time here usually means a harder training load.',
        unit: '',
        color: '#D4897B',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
    },
    medium_activity_time: {
        title: 'Medium Activity Time',
        icon: <Activity className="w-4 h-4" />,
        description: 'Medium activity time captures sustained everyday movement and moderate exercise. It is a good proxy for how much of the day you stayed meaningfully active.',
        unit: '',
        color: '#D4A574',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
    },
    low_activity_time: {
        title: 'Low Activity Time',
        icon: <Activity className="w-4 h-4" />,
        description: 'Low activity time represents easy movement such as walking around the house or doing errands. It is best read as part of your overall activity balance, not a score to maximize in isolation.',
        unit: '',
        color: '#7BC4A0',
        valueFormat: 'duration',
        evaluation: 'higher_better',
        decimals: 0,
        showInsights: false,
        showPercentile: false,
        bestLabel: 'Highest (All Time)',
        worstLabel: 'Lowest (All Time)',
        topListBestLabel: 'Highest',
        topListWorstLabel: 'Lowest',
        bestBadge: 'Highest low-activity time',
        worstBadge: 'Lowest low-activity time',
    },
    sedentary_time: {
        title: 'Sedentary Time',
        icon: <Activity className="w-4 h-4" />,
        description: 'Sedentary time is how long the day was dominated by inactivity. Lower values usually mean you broke up sitting time more effectively.',
        unit: '',
        color: '#64748B',
        valueFormat: 'duration',
        evaluation: 'lower_better',
        decimals: 0,
        bestLabel: 'Shortest (All Time)',
        worstLabel: 'Longest (All Time)',
        topListBestLabel: 'Shortest',
        topListWorstLabel: 'Longest',
        bestBadge: 'Shortest sedentary day',
        worstBadge: 'Longest sedentary day',
    },
};

export const getMetricHistoryChartDomain = (
    metricType: MetricDetailType,
    values: Array<number | null | undefined>
): [number, number] => {
    const config = METRIC_CONFIGS[metricType] || METRIC_CONFIGS.hrv;
    return getDataAwareChartDomain(values, {
        min: config.valueFormat === 'signed' ? undefined : 0,
        max: config.chartMaximum,
        includeZero: config.valueFormat === 'signed',
    });
};

const MetricDetailModal: React.FC<MetricDetailModalProps> = ({
    isOpen,
    onClose,
    metricType,
    currentValue,
    currentTimestamp,
    historyData,
    unit,
    color,
    date,
    sleepSession,
}) => {
    const config = METRIC_CONFIGS[metricType] || METRIC_CONFIGS.hrv;
    const effectiveColor = color || config.color;
    const effectiveUnit = unit || config.unit;

    const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '14d' | '30d'>('7d');
    const [selectedStatistic, setSelectedStatistic] = useState<'best' | 'worst' | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedTimeRange('7d');
        setSelectedStatistic(null);
    }, [isOpen, metricType]);

    const showTrend = config.showTrend ?? config.valueFormat !== 'clock';
    const showInsights = config.showInsights ?? true;
    const showPercentile = config.showPercentile ?? true;

    const resolvedCurrentValue = (() => {
        if (config.valueFormat !== 'clock' || !currentTimestamp) return currentValue ?? null;

        const minutes = getLocalMinutesOfDayFromIso(currentTimestamp);
        if (minutes == null) return currentValue ?? null;

        if (metricType === 'bedtime') {
            return minutes < 12 * 60 ? minutes + (24 * 60) : minutes;
        }

        return minutes;
    })();

    const formatMetricValue = (value: number | null | undefined): string => {
        if (value == null) return '--';

        switch (config.valueFormat) {
            case 'duration':
                return formatDurationFromSeconds(value);
            case 'clock':
                return formatClockFromMinutes(value);
            case 'signed': {
                const formatted = `${value > 0 ? '+' : ''}${formatNumber(value, config.decimals ?? 1)}`;
                return effectiveUnit ? `${formatted} ${effectiveUnit}` : formatted;
            }
            case 'number':
            default: {
                const formatted = formatNumber(value, config.decimals ?? 0);
                return effectiveUnit ? `${formatted} ${effectiveUnit}` : formatted;
            }
        }
    };

    const formatCurrentMetricValue = (): string => {
        if (config.valueFormat === 'clock' && currentTimestamp) {
            return formatRecordLocalClockTime(currentTimestamp);
        }

        return formatMetricValue(resolvedCurrentValue);
    };

    const formatSleepTiming = (timestamp?: string): string => {
        const formatted = formatRecordLocalClockTime(timestamp);
        return formatted === '--' ? 'Not available' : formatted;
    };

    const compareMetricValues = (left: number, right: number, sortBy: 'best' | 'worst') => {
        switch (config.evaluation) {
            case 'lower_better':
                return sortBy === 'best' ? left - right : right - left;
            case 'closer_to_zero':
                return sortBy === 'best'
                    ? Math.abs(left) - Math.abs(right)
                    : Math.abs(right) - Math.abs(left);
            case 'higher_better':
            default:
                return sortBy === 'best' ? right - left : left - right;
        }
    };

    const filterDataByRange = (data: MetricDataPoint[], range: '7d' | '14d' | '30d') => {
        const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
        return data.slice(0, days).reverse();
    };

    const getTopEntries = (sortBy: 'best' | 'worst', limit: number = 10) => {
        const sorted = [...historyData].sort((a, b) => compareMetricValues(a.value, b.value, sortBy));
        return sorted.slice(0, limit);
    };

    const filteredData = filterDataByRange(historyData, selectedTimeRange);
    const chartDomain = getMetricHistoryChartDomain(
        metricType,
        filteredData.map((point) => point.value)
    );

    const calculateTrend = () => {
        if (!showTrend || filteredData.length < 2) return null;

        const recent = filteredData.slice(0, Math.floor(filteredData.length / 2));
        const older = filteredData.slice(Math.floor(filteredData.length / 2));

        if (recent.length === 0 || older.length === 0) return null;

        const recentAvg = recent.reduce((sum, point) => sum + point.value, 0) / recent.length;
        const olderAvg = older.reduce((sum, point) => sum + point.value, 0) / older.length;
        if (olderAvg === 0) return null;

        const change = ((recentAvg - olderAvg) / olderAvg) * 100;
        return {
            change,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
            recentAvg,
            olderAvg,
        };
    };

    const trend = calculateTrend();
    const isTrendImproving = trend
        ? trend.direction === 'stable'
            ? null
            : config.evaluation === 'higher_better'
                ? trend.direction === 'up'
                : config.evaluation === 'lower_better'
                    ? trend.direction === 'down'
                    : Math.abs(trend.recentAvg) < Math.abs(trend.olderAvg)
        : null;

    const getPercentile = (value: number) => {
        if (historyData.length === 0) return 0;
        const atOrBelowCount = historyData.filter((point) => point.value <= value).length;
        return Math.round((atOrBelowCount / historyData.length) * 100);
    };

    const getInsights = () => {
        if (!showInsights || resolvedCurrentValue === null || resolvedCurrentValue === undefined) return [];

        const insights: string[] = [];
        const percentile = showPercentile ? getPercentile(resolvedCurrentValue) : null;

        if (percentile !== null) {
            if (percentile >= 75) {
                insights.push(`This value is higher than ${percentile}% of saved values for ${config.title}.`);
            } else if (percentile <= 25) {
                insights.push(`This value is lower than ${100 - percentile}% of saved values for ${config.title}.`);
            }
        }

        if (trend && trend.direction !== 'stable') {
            insights.push(
                `${config.title} moved ${trend.direction === 'up' ? 'up' : 'down'} ${Math.abs(trend.change).toFixed(1)}% between the two segments of this range.`
            );
        }

        return insights;
    };

    const bestLabel = config.bestLabel || 'Best (All Time)';
    const worstLabel = config.worstLabel || 'Worst (All Time)';
    const topListBestLabel = config.topListBestLabel || 'Best';
    const topListWorstLabel = config.topListWorstLabel || 'Worst';
    const bestBadge = config.bestBadge || 'All-time best';
    const worstBadge = config.worstBadge || (config.evaluation === 'lower_better' ? 'All-time highest' : 'All-time worst');

    const averageValue = filteredData.length > 0
        ? filteredData.reduce((sum, point) => sum + point.value, 0) / filteredData.length
        : null;

    const bestValue = historyData.length > 0 ? getTopEntries('best', 1)[0]?.value ?? null : null;
    const worstValue = historyData.length > 0 ? getTopEntries('worst', 1)[0]?.value ?? null : null;

    const stats = [
        {
            title: 'Average',
            subtitle: averageValue !== null ? formatMetricValue(averageValue) : '--',
            icon: <div className="text-accent"><Minus className="w-4 h-4" /></div>,
        },
        {
            title: bestLabel,
            subtitle: bestValue !== null ? formatMetricValue(bestValue) : '--',
            icon: <div className="text-success"><Trophy className="w-4 h-4" /></div>,
            onClick: () => setSelectedStatistic(selectedStatistic === 'best' ? null : 'best'),
        },
        {
            title: worstLabel,
            subtitle: worstValue !== null ? formatMetricValue(worstValue) : '--',
            icon: <div className="text-error"><TrendingDown className="w-4 h-4" /></div>,
            onClick: () => setSelectedStatistic(selectedStatistic === 'worst' ? null : 'worst'),
        },
        ...(showPercentile
            ? [{
                title: 'Personal Percentile',
                subtitle: resolvedCurrentValue !== null && resolvedCurrentValue !== undefined
                    ? `${getPercentile(resolvedCurrentValue)}th compared to history`
                    : '--',
                icon: <div className="text-metric-sleep"><TrendingUp className="w-4 h-4" /></div>,
            }]
            : []),
    ];

    return (
        <IOSModal isOpen={isOpen} onClose={onClose} title={config.title}>
            <div className="space-y-6">
                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="text-ink-muted text-sm">
                            {date ? formatISODateForDisplay(date) : 'Latest'}
                        </p>
                    </div>
                    <div className="text-right">
                        {config.icon}
                    </div>
                </div>

                <div className="overflow-y-auto ios-scroll max-h-[70vh] space-y-6">
                    <div className="bg-surface-raised p-4 rounded-xl border border-line">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-ink-muted text-sm mb-1">Current Value</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold font-mono" style={{ color: effectiveColor }}>
                                        {formatCurrentMetricValue()}
                                    </span>
                                </div>
                            </div>
                            {trend && (
                                <div
                                    className={`flex items-center gap-1 text-sm font-medium ${
                                        trend.direction === 'stable'
                                            ? 'text-ink-muted'
                                            : isTrendImproving
                                                ? 'text-success'
                                                : 'text-error'
                                    }`}
                                >
                                    {trend.direction === 'up'
                                        ? <TrendingUp className="w-4 h-4" />
                                        : trend.direction === 'down'
                                            ? <TrendingDown className="w-4 h-4" />
                                            : <Minus className="w-4 h-4" />}
                                    <span>{Math.abs(trend.change).toFixed(1)}%</span>
                                    <span className="text-ink-muted text-xs">
                                        vs last {selectedTimeRange === '7d' ? '3.5 days' : selectedTimeRange === '14d' ? '7 days' : '15 days'}
                                    </span>
                                </div>
                            )}
                        </div>

                    </div>

                    {metricType === 'sleep_duration' && (
                        <section
                            role="group"
                            aria-label="Sleep timing"
                            className="bg-surface-raised p-4 rounded-xl border border-line"
                        >
                            <div className="mb-4">
                                <h4 className="text-sm font-medium text-ink">Sleep timing</h4>
                                <p className="mt-1 text-xs text-ink-muted">When this sleep session started and ended.</p>
                            </div>
                            <dl className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg bg-surface-subtle p-3">
                                    <dt className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                                        <Moon className="h-4 w-4 text-metric-sleep" aria-hidden="true" />
                                        Bedtime
                                    </dt>
                                    <dd className="mt-2 font-mono text-xl font-semibold text-ink">
                                        {formatSleepTiming(sleepSession?.bedtime_start)}
                                    </dd>
                                    <dd className="mt-1 text-xs text-ink-muted">Fell asleep</dd>
                                </div>
                                <div className="rounded-lg bg-surface-subtle p-3">
                                    <dt className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                                        <Sunrise className="h-4 w-4 text-metric-activity" aria-hidden="true" />
                                        Wake time
                                    </dt>
                                    <dd className="mt-2 font-mono text-xl font-semibold text-ink">
                                        {formatSleepTiming(sleepSession?.bedtime_end)}
                                    </dd>
                                    <dd className="mt-1 text-xs text-ink-muted">Woke up</dd>
                                </div>
                            </dl>
                        </section>
                    )}

                    <div className="flex gap-2 p-4 bg-surface-raised rounded-xl border border-line">
                        <Info className="w-5 h-5 text-metric-sleep flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-ink-secondary">{config.description}</p>
                        </div>
                    </div>

                    <div className="flex gap-2" role="group" aria-label="Metric history time range">
                        {(['7d', '14d', '30d'] as const).map((range) => (
                            <button
                                key={range}
                                type="button"
                                aria-pressed={selectedTimeRange === range}
                                onClick={() => setSelectedTimeRange(range)}
                                className={`min-h-11 flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                    selectedTimeRange === range
                                        ? 'bg-accent/20 text-accent border border-[#6B9E8A]/30'
                                        : 'bg-surface-raised text-ink-muted border border-line hover:border-[rgba(0,0,0,0.12)]'
                                }`}
                            >
                                {range === '7d' ? '7 Days' : range === '14d' ? '14 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>

                    {filteredData.length > 0 && (
                        <div className="bg-surface-raised p-4 rounded-xl border border-line">
                            <h4 className="text-sm font-medium text-ink mb-4 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {config.title} History
                            </h4>
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    minWidth={0}
                                    minHeight={150}
                                    initialDimension={{ width: 560, height: 180 }}
                                >
                                    <AreaChart data={filteredData}>
                                        <defs>
                                            <linearGradient id={`colorGradient-${metricType}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={effectiveColor} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={effectiveColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fill: '#A8A29E', fontSize: 11 }}
                                            tickFormatter={(value) => formatISODateForDisplay(value, undefined, { month: 'short', day: 'numeric' })}
                                            axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                                        />
                                        <YAxis
                                            domain={chartDomain}
                                            tick={{ fill: '#A8A29E', fontSize: 11 }}
                                            axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                                            tickCount={5}
                                            tickFormatter={(value: number) => formatMetricValue(value)}
                                        />
                                        <Tooltip
                                            contentStyle={CHART_TOOLTIP_STYLE}
                                            formatter={(value: number) => [formatMetricValue(value), config.title]}
                                            labelFormatter={(label) => formatISODateForDisplay(label, undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
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

                    {getInsights().length > 0 && (
                        <div className="bg-surface-raised p-4 rounded-xl border border-line">
                            <h4 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Insights
                            </h4>
                            <div className="space-y-2">
                                {getInsights().map((insight, idx) => (
                                    <p key={idx} className="text-sm text-ink-secondary">{insight}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    {historyData.length > 0 && (
                        <div className="bg-surface-raised p-4 rounded-xl border border-line">
                            <div className="mb-4">
                                <h4 className="text-sm font-medium text-ink">Historical Statistics</h4>
                                <p className="text-xs text-ink-muted mt-1">
                                    Average uses your {selectedTimeRange === '7d' ? '7-day' : selectedTimeRange === '14d' ? '14-day' : '30-day'} data. Tap the other rows to inspect the all-time extremes.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {stats.map((stat) => (
                                    <IOSListItem
                                        key={stat.title}
                                        title={stat.title}
                                        subtitle={stat.subtitle}
                                        icon={stat.icon}
                                        onClick={stat.onClick}
                                    />
                                ))}
                            </div>

                            {selectedStatistic && (
                                <div className="mt-4 pt-4 border-t border-line">
                                    <h5 className="text-sm font-medium text-ink mb-3 flex items-center gap-2">
                                        {selectedStatistic === 'best'
                                            ? <Trophy className="w-4 h-4 text-success" />
                                            : <TrendingDown className="w-4 h-4 text-error" />}
                                        Top 10 {selectedStatistic === 'best' ? topListBestLabel : topListWorstLabel} Days (All Time)
                                    </h5>
                                    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                                        {getTopEntries(selectedStatistic, 10).map((entry, idx) => (
                                            <div
                                                key={`${entry.date}-${idx}`}
                                                className={`flex items-center justify-between p-3 rounded-lg ${
                                                    idx === 0 ? 'bg-[#7BC4A0]/10' : 'bg-surface-subtle'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                        idx === 0
                                                            ? 'bg-[#7BC4A0] text-white'
                                                            : idx === 1
                                                                ? 'bg-[#C0C0C0] text-white'
                                                                : idx === 2
                                                                    ? 'bg-[#CD7F32] text-white'
                                                                    : 'bg-[rgba(0,0,0,0.08)] text-ink-muted'
                                                    }`}>
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-ink">
                                                            {formatISODateForDisplay(entry.date, undefined, {
                                                                weekday: 'short',
                                                                month: 'short',
                                                                day: 'numeric',
                                                                year: 'numeric',
                                                            })}
                                                        </p>
                                                        {entry.label && (
                                                            <p className="text-xs text-ink-muted">{entry.label}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-mono font-bold" style={{ color: effectiveColor }}>
                                                        {formatMetricValue(entry.value)}
                                                    </p>
                                                    {idx === 0 && (
                                                        <p className={`text-xs ${selectedStatistic === 'best' ? 'text-success' : 'text-error'}`}>
                                                            {selectedStatistic === 'best' ? bestBadge : worstBadge}
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

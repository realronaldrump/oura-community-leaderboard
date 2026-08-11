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
    categories: { label: string; range: [number, number]; color: string }[];
};

const OPEN_ENDED_RANGE_SENTINELS = new Set([999, 9999, 99999, 999999]);

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

const formatCompactDurationFromSeconds = (seconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0 && minutes === 0) return `${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
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
        categories: [
            { label: 'Low', range: [0, 30], color: '#D4897B' },
            { label: 'Fair', range: [30, 50], color: '#D4A574' },
            { label: 'Good', range: [50, 100], color: '#7BA8D4' },
            { label: 'Excellent', range: [100, 999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Excellent', range: [0, 50], color: '#7BC4A0' },
            { label: 'Good', range: [50, 60], color: '#7BA8D4' },
            { label: 'Fair', range: [60, 70], color: '#D4A574' },
            { label: 'High', range: [70, 200], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Excellent', range: [0, 40], color: '#7BC4A0' },
            { label: 'Good', range: [40, 50], color: '#7BA8D4' },
            { label: 'Fair', range: [50, 60], color: '#D4A574' },
            { label: 'High', range: [60, 200], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 90], color: '#D4897B' },
            { label: 'Fair', range: [90, 95], color: '#D4A574' },
            { label: 'Good', range: [95, 98], color: '#7BA8D4' },
            { label: 'Excellent', range: [98, 101], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Restored', range: [0, 3600], color: '#7BC4A0' },
            { label: 'Moderate', range: [3600, 7200], color: '#7BA8D4' },
            { label: 'High', range: [7200, 10800], color: '#D4A574' },
            { label: 'Very High', range: [10800, 999999], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Limited', range: [0, 35], color: '#D4897B' },
            { label: 'Adequate', range: [35, 55], color: '#D4A574' },
            { label: 'Solid', range: [55, 75], color: '#7BA8D4' },
            { label: 'Strong', range: [75, 90], color: '#6EE7B7' },
            { label: 'Exceptional', range: [90, 101], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 4000], color: '#D4897B' },
            { label: 'Fair', range: [4000, 7000], color: '#D4A574' },
            { label: 'Good', range: [7000, 10000], color: '#7BA8D4' },
            { label: 'Excellent', range: [10000, 99999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 300], color: '#D4897B' },
            { label: 'Fair', range: [300, 500], color: '#D4A574' },
            { label: 'Good', range: [500, 800], color: '#7BA8D4' },
            { label: 'Excellent', range: [800, 9999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 2000], color: '#D4897B' },
            { label: 'Steady', range: [2000, 2500], color: '#D4A574' },
            { label: 'Active', range: [2500, 3000], color: '#7BA8D4' },
            { label: 'Very Active', range: [3000, 99999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 2], color: '#D4897B' },
            { label: 'Fair', range: [2, 4], color: '#D4A574' },
            { label: 'Good', range: [4, 6], color: '#7BA8D4' },
            { label: 'Excellent', range: [6, 999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 18000], color: '#D4897B' },
            { label: 'Fair', range: [18000, 21600], color: '#D4A574' },
            { label: 'Good', range: [21600, 25200], color: '#7BA8D4' },
            { label: 'Reference', range: [25200, 32400], color: '#7BC4A0' },
            { label: 'Extended', range: [32400, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 1800], color: '#D4897B' },
            { label: 'Fair', range: [1800, 3600], color: '#D4A574' },
            { label: 'Good', range: [3600, 5400], color: '#7BA8D4' },
            { label: 'Excellent', range: [5400, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 3600], color: '#D4897B' },
            { label: 'Fair', range: [3600, 5400], color: '#D4A574' },
            { label: 'Good', range: [5400, 7200], color: '#7BA8D4' },
            { label: 'Excellent', range: [7200, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 9000], color: '#D4897B' },
            { label: 'Typical', range: [9000, 14400], color: '#D4A574' },
            { label: 'High', range: [14400, 19800], color: '#7BA8D4' },
            { label: 'Very High', range: [19800, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 80], color: '#D4897B' },
            { label: 'Fair', range: [80, 85], color: '#D4A574' },
            { label: 'Good', range: [85, 90], color: '#7BA8D4' },
            { label: 'Excellent', range: [90, 101], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Very Early', range: [1140, 1260], color: '#7BA8D4' },
            { label: 'Early', range: [1260, 1380], color: '#7BA8D4' },
            { label: 'Typical', range: [1380, 1470], color: '#7BC4A0' },
            { label: 'Late', range: [1470, 1590], color: '#D4A574' },
            { label: 'Very Late', range: [1590, 1800], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Very Early', range: [240, 360], color: '#7BA8D4' },
            { label: 'Early', range: [360, 450], color: '#7BA8D4' },
            { label: 'Typical', range: [450, 570], color: '#7BC4A0' },
            { label: 'Late', range: [570, 690], color: '#D4A574' },
            { label: 'Very Late', range: [690, 900], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Fast', range: [0, 900], color: '#7BC4A0' },
            { label: 'Normal', range: [900, 1800], color: '#7BA8D4' },
            { label: 'Slow', range: [1800, 2700], color: '#D4A574' },
            { label: 'Very Slow', range: [2700, 999999], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Excellent', range: [0, 1800], color: '#7BC4A0' },
            { label: 'Good', range: [1800, 3600], color: '#7BA8D4' },
            { label: 'Fair', range: [3600, 5400], color: '#D4A574' },
            { label: 'Restless', range: [5400, 999999], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Calm', range: [0, 14], color: '#7BC4A0' },
            { label: 'Typical', range: [14, 16], color: '#7BA8D4' },
            { label: 'Elevated', range: [16, 18], color: '#D4A574' },
            { label: 'High', range: [18, 40], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Below Baseline', range: [-4, -1], color: '#7BA8D4' },
            { label: 'Slightly Low', range: [-1, -0.4], color: '#7BA8D4' },
            { label: 'Stable', range: [-0.4, 0.4], color: '#7BC4A0' },
            { label: 'Elevated', range: [0.4, 1], color: '#D4A574' },
            { label: 'High', range: [1, 4], color: '#D4897B' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 900], color: '#D4897B' },
            { label: 'Fair', range: [900, 2700], color: '#D4A574' },
            { label: 'Good', range: [2700, 5400], color: '#7BA8D4' },
            { label: 'High', range: [5400, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 1800], color: '#D4897B' },
            { label: 'Fair', range: [1800, 3600], color: '#D4A574' },
            { label: 'Good', range: [3600, 7200], color: '#7BA8D4' },
            { label: 'High', range: [7200, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 3600], color: '#D4897B' },
            { label: 'Typical', range: [3600, 7200], color: '#D4A574' },
            { label: 'High', range: [7200, 14400], color: '#7BA8D4' },
            { label: 'Very High', range: [14400, 999999], color: '#7BC4A0' },
        ],
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
        categories: [
            { label: 'Low', range: [0, 18000], color: '#7BC4A0' },
            { label: 'Moderate', range: [18000, 28800], color: '#7BA8D4' },
            { label: 'High', range: [28800, 39600], color: '#D4A574' },
            { label: 'Very High', range: [39600, 999999], color: '#D4897B' },
        ],
    },
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

    const formatMetricValue = (
        value: number | null | undefined,
        options?: { includeUnit?: boolean; compact?: boolean }
    ): string => {
        if (value == null) return '--';

        const includeUnit = options?.includeUnit ?? true;
        const compact = options?.compact ?? false;

        switch (config.valueFormat) {
            case 'duration':
                return compact ? formatCompactDurationFromSeconds(value) : formatDurationFromSeconds(value);
            case 'clock':
                return formatClockFromMinutes(value);
            case 'signed': {
                const formatted = `${value > 0 ? '+' : ''}${formatNumber(value, config.decimals ?? 1)}`;
                return includeUnit ? `${formatted} ${effectiveUnit}` : formatted;
            }
            case 'number':
            default: {
                const formatted = formatNumber(value, config.decimals ?? 0);
                return includeUnit && effectiveUnit ? `${formatted} ${effectiveUnit}` : formatted;
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

    const formatThresholdValue = (value: number) => formatMetricValue(value, { includeUnit: false, compact: true });

    const formatCategoryRangeLabel = (range: [number, number]) => {
        const [start, end] = range;
        const startLabel = formatThresholdValue(start);

        if (OPEN_ENDED_RANGE_SENTINELS.has(end)) {
            if (config.valueFormat === 'duration' || config.valueFormat === 'clock') {
                return `${startLabel}+`;
            }
            return effectiveUnit ? `${startLabel}+ ${effectiveUnit}` : `${startLabel}+`;
        }

        const endLabel = formatThresholdValue(end);
        if (config.valueFormat === 'duration' || config.valueFormat === 'clock') {
            return `${startLabel}-${endLabel}`;
        }

        return effectiveUnit ? `${startLabel}-${endLabel} ${effectiveUnit}` : `${startLabel}-${endLabel}`;
    };

    const getCategory = (value: number) => {
        const category = config.categories.find((candidate) => {
            const upperBound = OPEN_ENDED_RANGE_SENTINELS.has(candidate.range[1])
                ? Number.POSITIVE_INFINITY
                : candidate.range[1];
            return value >= candidate.range[0] && value < upperBound;
        });

        if (category) return category;

        const sortedCategories = [...config.categories].sort((a, b) => a.range[0] - b.range[0]);
        if (value < sortedCategories[0].range[0]) return sortedCategories[0];
        return sortedCategories[sortedCategories.length - 1];
    };

    const currentCategory = resolvedCurrentValue !== null && resolvedCurrentValue !== undefined ? getCategory(resolvedCurrentValue) : null;

    const categoryBoundaries = Array.from(
        new Set(config.categories.flatMap((category) => [category.range[0], category.range[1]]))
    ).sort((a, b) => a - b);

    const rawAxisMin = categoryBoundaries[0] ?? 0;
    const rawAxisMax = categoryBoundaries[categoryBoundaries.length - 1] ?? 100;
    const hasOpenEndedTop = OPEN_ENDED_RANGE_SENTINELS.has(rawAxisMax);
    const finiteBoundaries = categoryBoundaries.filter((boundary) => !OPEN_ENDED_RANGE_SENTINELS.has(boundary));
    const finiteAxisMax = finiteBoundaries[finiteBoundaries.length - 1] ?? rawAxisMax;
    const finitePrevBoundary = finiteBoundaries[finiteBoundaries.length - 2] ?? rawAxisMin;
    const inferredOpenEndedSpan = Math.max(finiteAxisMax - finitePrevBoundary, 1);
    const observedMax = historyData.reduce((maxValue, point) => Math.max(maxValue, point.value), Number.NEGATIVE_INFINITY);
    const observedMin = historyData.reduce((minValue, point) => Math.min(minValue, point.value), Number.POSITIVE_INFINITY);

    const axisMin = Math.min(rawAxisMin, observedMin, resolvedCurrentValue ?? Number.POSITIVE_INFINITY);
    const axisMax = Math.max(
        axisMin + 1,
        hasOpenEndedTop
            ? Math.max(finiteAxisMax + inferredOpenEndedSpan, observedMax, resolvedCurrentValue ?? Number.NEGATIVE_INFINITY)
            : Math.max(rawAxisMax, observedMax, resolvedCurrentValue ?? Number.NEGATIVE_INFINITY)
    );

    const toAxisPercent = (value: number) => {
        const pct = ((value - axisMin) / (axisMax - axisMin)) * 100;
        return Math.max(0, Math.min(100, pct));
    };

    const markerPercent = resolvedCurrentValue !== null && resolvedCurrentValue !== undefined ? toAxisPercent(resolvedCurrentValue) : null;
    const axisTickValues = Array.from(new Set([...finiteBoundaries, axisMax])).sort((a, b) => a - b);
    const markerLabelStyle = (() => {
        if (markerPercent === null) return null;
        if (markerPercent <= 8) return { left: '0%', transform: 'translateX(0)' };
        if (markerPercent >= 92) return { left: '100%', transform: 'translateX(-100%)' };
        return { left: `${markerPercent}%`, transform: 'translateX(-50%)' };
    })();

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

                        {currentCategory && (
                            <div
                                className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
                                style={{ backgroundColor: `${currentCategory.color}20`, color: currentCategory.color }}
                            >
                                Reference: {currentCategory.label}
                            </div>
                        )}
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
                            <p className="mt-2 text-xs text-ink-muted">
                                General reference bands are approximate, not medical targets. Your personal baseline matters more.
                            </p>
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
                                            tick={{ fill: '#A8A29E', fontSize: 11 }}
                                            axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
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

                    <div className="bg-surface-raised p-4 rounded-xl border border-line">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <h4 className="text-sm font-medium text-ink">Category Ranges</h4>
                            {resolvedCurrentValue !== null && resolvedCurrentValue !== undefined && (
                                <span className="text-[11px] text-ink-muted font-mono">
                                    Current: {formatCurrentMetricValue()}
                                </span>
                            )}
                        </div>

                        <div className="mb-4">
                            <div className="relative h-5">
                                {axisTickValues.map((tick, idx) => (
                                    <span
                                        key={`${tick}-${idx}`}
                                        className="absolute top-0 text-[10px] text-ink-muted font-mono whitespace-nowrap"
                                        style={{ left: `${toAxisPercent(tick)}%`, transform: 'translateX(-50%)' }}
                                    >
                                        {formatThresholdValue(tick)}
                                    </span>
                                ))}
                            </div>
                            <div className="relative h-8">
                                {markerPercent !== null && markerLabelStyle && (
                                    <span
                                        className="absolute top-0 text-[10px] text-[#FAF7F4] font-semibold bg-[#2D2A26] px-1.5 py-0.5 rounded whitespace-nowrap"
                                        style={markerLabelStyle}
                                    >
                                        {formatCurrentMetricValue()}
                                    </span>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-surface-subtle rounded-full overflow-hidden">
                                    {axisTickValues.map((tick, idx) => (
                                        <span
                                            key={`tick-${tick}-${idx}`}
                                            className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-[rgba(0,0,0,0.10)]"
                                            style={{ left: `${toAxisPercent(tick)}%` }}
                                        />
                                    ))}
                                    {markerPercent !== null && (
                                        <span
                                            className="absolute top-1/2 -translate-y-1/2 h-4 w-[2px] bg-[#2D2A26]"
                                            style={{ left: `${markerPercent}%`, transform: 'translateX(-50%)' }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {config.categories.map((category, idx) => {
                                const isOpenEndedCategory = OPEN_ENDED_RANGE_SENTINELS.has(category.range[1]);
                                const segmentStart = category.range[0];
                                const segmentEnd = isOpenEndedCategory ? axisMax : category.range[1];
                                const leftPct = toAxisPercent(Math.min(segmentStart, segmentEnd));
                                const rightPct = toAxisPercent(Math.max(segmentStart, segmentEnd));
                                const widthPct = Math.max(rightPct - leftPct, 1.5);

                                return (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-1 gap-3">
                                                <span className="text-sm text-ink-secondary">{category.label}</span>
                                                <span className="text-xs text-ink-muted font-mono whitespace-nowrap">
                                                    {formatCategoryRangeLabel(category.range)}
                                                </span>
                                            </div>
                                            <div className="relative h-2 bg-surface-subtle rounded-full overflow-hidden">
                                                <span
                                                    className="absolute top-0 h-full rounded-full"
                                                    style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: category.color }}
                                                />
                                                {markerPercent !== null && (
                                                    <span
                                                        className="absolute top-0 h-full w-[2px] bg-[#2D2A26]/90"
                                                        style={{ left: `${markerPercent}%`, transform: 'translateX(-50%)' }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-ink-muted mt-3">
                            Shared axis: colored segments show each category band, and the white marker shows your current value.
                        </p>
                    </div>

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

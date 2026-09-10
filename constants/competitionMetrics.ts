import { mainSleepSession } from '../domain/metrics';
import { DailyStats, SleepSession } from '../types';
import {
    CompetitionMetricDefinition,
    CompetitionMetricId,
    CompetitionTemplate,
    CompetitionRule,
} from '../types/competitionTypes';
import { getLocalMinutesOfDayFromIso } from '../utils/temporal';

const RESILIENCE_LEVEL_SCORE: Record<string, number> = {
    limited: 20,
    adequate: 40,
    solid: 60,
    strong: 80,
    exceptional: 100,
};

const roundTo = (value: number, precision: number = 0): number => {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
};

const findByDay = <T extends { day?: string }>(items: T[] | undefined, day: string): T | undefined => (
    items?.find((item) => item.day === day)
);

const toAdjustedBedtimeMinutes = (isoString?: string | null): number | null => {
    const minutes = getLocalMinutesOfDayFromIso(isoString);
    if (minutes == null) return null;
    return minutes < (12 * 60) ? minutes + (24 * 60) : minutes;
};

const formatHoursTarget = (hours: number): string => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (minutes === 0) return `${wholeHours}h`;
    return `${wholeHours}h ${minutes}m`;
};

const formatBedtimeMinutes = (value: number): string => {
    const normalized = value >= (24 * 60) ? value - (24 * 60) : value;
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
};

const getSessionsForDay = (sessions: SleepSession[] | undefined, day: string): SleepSession[] => (sessions || []).filter(s => s.day === day && s.type !== 'deleted');
const pickBestSession = mainSleepSession;

const getBestSessionForDay = (data: DailyStats | undefined, day: string): SleepSession | undefined => (
    pickBestSession(getSessionsForDay(data?.session, day))
);

const createRule = (
    metricId: CompetitionMetricId,
    target: number,
    overrides: Partial<CompetitionRule> = {}
): CompetitionRule => ({
    id: `${metricId}-${crypto.randomUUID()}`,
    metricId,
    label: COMPETITION_METRICS_BY_ID[metricId].label,
    operator: COMPETITION_METRICS_BY_ID[metricId].defaultOperator,
    target,
    secondaryTarget: null,
    weight: 1,
    aggregation: COMPETITION_METRICS_BY_ID[metricId].defaultAggregation,
    capAtTarget: true,
    ...overrides,
});

export const COMPETITION_METRICS: CompetitionMetricDefinition[] = [
    {
        id: 'steps',
        label: 'Steps',
        shortLabel: 'Steps',
        description: 'Daily step total',
        category: 'activity',
        unit: 'steps',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 10000,
        defaultAggregation: 'daily',
        min: 1000,
        max: 30000,
        step: 500,
        extractDailyValue: (data, day) => findByDay(data?.activity, day)?.steps ?? null,
        formatValue: (value) => value != null ? `${Math.round(value).toLocaleString()} steps` : '--',
        formatTarget: (value) => `${Math.round(value).toLocaleString()} steps`,
    },
    {
        id: 'active_calories',
        label: 'Active Calories',
        shortLabel: 'Calories',
        description: 'Daily active calories burned',
        category: 'activity',
        unit: 'kcal',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 500,
        defaultAggregation: 'daily',
        min: 100,
        max: 2000,
        step: 25,
        extractDailyValue: (data, day) => findByDay(data?.activity, day)?.active_calories ?? null,
        formatValue: (value) => value != null ? `${Math.round(value)} kcal` : '--',
        formatTarget: (value) => `${Math.round(value)} kcal`,
    },
    {
        id: 'sleep_score',
        label: 'Sleep Score',
        shortLabel: 'Sleep',
        description: 'Daily Oura sleep score',
        category: 'sleep',
        unit: 'score',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 85,
        defaultAggregation: 'daily',
        min: 50,
        max: 100,
        step: 1,
        extractDailyValue: (data, day) => findByDay(data?.sleep, day)?.score ?? null,
        formatValue: (value) => value != null ? `${Math.round(value)}` : '--',
        formatTarget: (value) => `${Math.round(value)}`,
    },
    {
        id: 'readiness_score',
        label: 'Readiness Score',
        shortLabel: 'Readiness',
        description: 'Daily Oura readiness score',
        category: 'recovery',
        unit: 'score',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 80,
        defaultAggregation: 'daily',
        min: 50,
        max: 100,
        step: 1,
        extractDailyValue: (data, day) => findByDay(data?.readiness, day)?.score ?? null,
        formatValue: (value) => value != null ? `${Math.round(value)}` : '--',
        formatTarget: (value) => `${Math.round(value)}`,
    },
    {
        id: 'activity_score',
        label: 'Activity Score',
        shortLabel: 'Activity',
        description: 'Daily Oura activity score',
        category: 'activity',
        unit: 'score',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 80,
        defaultAggregation: 'daily',
        min: 50,
        max: 100,
        step: 1,
        extractDailyValue: (data, day) => findByDay(data?.activity, day)?.score ?? null,
        formatValue: (value) => value != null ? `${Math.round(value)}` : '--',
        formatTarget: (value) => `${Math.round(value)}`,
    },
    {
        id: 'total_sleep_duration',
        label: 'Total Sleep',
        shortLabel: 'Sleep Time',
        description: 'Best sleep session total sleep duration',
        category: 'sleep',
        unit: 'hours',
        inputMode: 'duration',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 7.5,
        defaultAggregation: 'daily',
        min: 4,
        max: 12,
        step: 0.25,
        extractDailyValue: (data, day) => {
            const session = getBestSessionForDay(data, day);
            const seconds = session?.total_sleep_duration;
            return seconds != null ? roundTo(seconds / 3600, 2) : null;
        },
        formatValue: (value) => value != null ? formatHoursTarget(value) : '--',
        formatTarget: (value) => formatHoursTarget(value),
    },
    {
        id: 'bedtime_start',
        label: 'Bedtime',
        shortLabel: 'Bedtime',
        description: 'Time you went to bed',
        category: 'sleep',
        unit: 'time',
        inputMode: 'time',
        valueDirection: 'lower',
        defaultOperator: 'lte',
        defaultTarget: 22 * 60,
        defaultAggregation: 'daily',
        min: 18 * 60,
        max: 28 * 60,
        step: 15,
        extractDailyValue: (data, day) => toAdjustedBedtimeMinutes(getBestSessionForDay(data, day)?.bedtime_start),
        formatValue: (value) => value != null ? formatBedtimeMinutes(value) : '--',
        formatTarget: (value) => formatBedtimeMinutes(value),
    },
    {
        id: 'average_hrv',
        label: 'Average HRV',
        shortLabel: 'HRV',
        description: 'Average nightly HRV in milliseconds',
        category: 'recovery',
        unit: 'ms',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 45,
        defaultAggregation: 'daily',
        min: 10,
        max: 120,
        step: 1,
        extractDailyValue: (data, day) => getBestSessionForDay(data, day)?.average_hrv ?? null,
        formatValue: (value) => value != null ? `${Math.round(value)} ms` : '--',
        formatTarget: (value) => `${Math.round(value)} ms`,
    },
    {
        id: 'lowest_heart_rate',
        label: 'Resting HR',
        shortLabel: 'Resting HR',
        description: 'Lowest nightly heart rate',
        category: 'vitals',
        unit: 'bpm',
        inputMode: 'number',
        valueDirection: 'lower',
        defaultOperator: 'lte',
        defaultTarget: 55,
        defaultAggregation: 'daily',
        min: 35,
        max: 90,
        step: 1,
        extractDailyValue: (data, day) => getBestSessionForDay(data, day)?.lowest_heart_rate ?? null,
        formatValue: (value) => value != null ? `${Math.round(value)} bpm` : '--',
        formatTarget: (value) => `${Math.round(value)} bpm`,
    },
    {
        id: 'stress_high_minutes',
        label: 'High Stress',
        shortLabel: 'Stress',
        description: 'Daily minutes spent in high stress',
        category: 'recovery',
        unit: 'min',
        inputMode: 'number',
        valueDirection: 'lower',
        defaultOperator: 'lte',
        defaultTarget: 90,
        defaultAggregation: 'daily',
        min: 15,
        max: 360,
        step: 5,
        extractDailyValue: (data, day) => {
            const seconds = findByDay(data?.stress, day)?.stress_high;
            return seconds != null ? roundTo(seconds / 60, 1) : null;
        },
        formatValue: (value) => value != null ? `${roundTo(value, 1)} min` : '--',
        formatTarget: (value) => `${roundTo(value, 1)} min`,
    },
    {
        id: 'recovery_high_minutes',
        label: 'Recovery Minutes',
        shortLabel: 'Recovery',
        description: 'Daily minutes spent in high recovery',
        category: 'recovery',
        unit: 'min',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 90,
        defaultAggregation: 'daily',
        min: 15,
        max: 360,
        step: 5,
        extractDailyValue: (data, day) => {
            const seconds = findByDay(data?.stress, day)?.recovery_high;
            return seconds != null ? roundTo(seconds / 60, 1) : null;
        },
        formatValue: (value) => value != null ? `${roundTo(value, 1)} min` : '--',
        formatTarget: (value) => `${roundTo(value, 1)} min`,
    },
    {
        id: 'spo2_average',
        label: 'SpO2',
        shortLabel: 'SpO2',
        description: 'Average nightly blood oxygen',
        category: 'vitals',
        unit: '%',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 97,
        defaultAggregation: 'daily',
        min: 90,
        max: 100,
        step: 0.1,
        extractDailyValue: (data, day) => findByDay(data?.spo2, day)?.spo2_percentage?.average ?? null,
        formatValue: (value) => value != null ? `${roundTo(value, 1)}%` : '--',
        formatTarget: (value) => `${roundTo(value, 1)}%`,
    },
    {
        id: 'resilience_score',
        label: 'Resilience',
        shortLabel: 'Resilience',
        description: 'Mapped resilience level score',
        category: 'recovery',
        unit: 'score',
        inputMode: 'number',
        valueDirection: 'higher',
        defaultOperator: 'gte',
        defaultTarget: 60,
        defaultAggregation: 'daily',
        min: 20,
        max: 100,
        step: 20,
        extractDailyValue: (data, day) => {
            const level = findByDay(data?.resilience, day)?.level;
            return level ? RESILIENCE_LEVEL_SCORE[level] ?? null : null;
        },
        formatValue: (value) => value != null ? `${Math.round(value)}` : '--',
        formatTarget: (value) => `${Math.round(value)}`,
    },
];

export const COMPETITION_METRICS_BY_ID = COMPETITION_METRICS.reduce<Record<CompetitionMetricId, CompetitionMetricDefinition>>(
    (acc, metric) => {
        acc[metric.id] = metric;
        return acc;
    },
    {} as Record<CompetitionMetricId, CompetitionMetricDefinition>
);

// Curated defaults for new challenges. Saved competitions retain their own rules.
export const COMPETITION_TEMPLATES: CompetitionTemplate[] = [
    {
        id: 'steps-week',
        title: 'Step Week',
        description: 'Most steps wins.',
        mode: 'friends',
        format: 'race',
        scoring: 'total',
        durationDays: 7,
        accentColor: '#D4B87B',
        rules: [createRule('steps', 10000, { aggregation: 'total', capAtTarget: false })],
    },
    {
        id: 'sleep-score-week',
        title: 'Sleep Week',
        description: 'Highest average sleep score wins.',
        mode: 'friends',
        format: 'race',
        scoring: 'average',
        durationDays: 7,
        accentColor: '#7BA8D4',
        rules: [createRule('sleep_score', 85, { aggregation: 'average', capAtTarget: false })],
    },
    {
        id: 'readiness-week',
        title: 'Readiness Week',
        description: 'Highest average readiness score wins.',
        mode: 'friends',
        format: 'race',
        scoring: 'average',
        durationDays: 7,
        accentColor: '#7BC4A0',
        rules: [createRule('readiness_score', 80, { aggregation: 'average', capAtTarget: false })],
    },
];

export const getSoloChallengeDescription = (template: CompetitionTemplate): string => {
    const rule = template.rules[0];
    if (rule.metricId === 'steps') return 'Reach 10,000 steps a day.';
    if (rule.metricId === 'sleep_score') return 'Reach a sleep score of 85 each day.';
    return 'Reach a readiness score of 80 each day.';
};

export const getCompetitionMetricDefinition = (metricId: CompetitionMetricId): CompetitionMetricDefinition =>
    COMPETITION_METRICS_BY_ID[metricId];

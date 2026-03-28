import { formatDuration, DailyStats, SleepSession } from '../types';
import {
    CompetitionMetricDefinition,
    CompetitionMetricId,
    CompetitionTemplate,
    CompetitionRule,
} from '../types/competitionTypes';

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
    if (!isoString) return null;
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return null;
    const minutes = date.getHours() * 60 + date.getMinutes();
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

const getSessionsForDay = (sessions: SleepSession[] | undefined, day: string): SleepSession[] => {
    if (!sessions?.length) return [];
    return sessions.filter((session) => {
        if (session.type === 'deleted') return false;
        if (session.day === day) return true;
        const bedtimeDay = session.bedtime_start?.slice(0, 10);
        const wakeDay = session.bedtime_end?.slice(0, 10);
        return bedtimeDay === day || wakeDay === day;
    });
};

const pickBestSession = (sessions: SleepSession[]): SleepSession | undefined => {
    if (!sessions.length) return undefined;
    return [...sessions].sort((left, right) => {
        const rightDuration = right.total_sleep_duration ?? right.time_in_bed ?? 0;
        const leftDuration = left.total_sleep_duration ?? left.time_in_bed ?? 0;
        if (rightDuration !== leftDuration) return rightDuration - leftDuration;
        return new Date(right.bedtime_end || 0).getTime() - new Date(left.bedtime_end || 0).getTime();
    })[0];
};

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

export const COMPETITION_TEMPLATES: CompetitionTemplate[] = [
    {
        id: 'step-sprint',
        title: 'Step Sprint',
        description: 'Seven days. Highest total step progress wins.',
        mode: 'friends',
        format: 'race',
        durationDays: 7,
        accentColor: '#D4B87B',
        rules: [
            createRule('steps', 10000, { aggregation: 'daily' }),
        ],
    },
    {
        id: 'sleep-week',
        title: 'Sleep Week',
        description: 'Hit a strong sleep score every night for a week.',
        mode: 'solo',
        format: 'goal',
        durationDays: 7,
        accentColor: '#7BA8D4',
        rules: [
            createRule('sleep_score', 85),
        ],
    },
    {
        id: 'recovery-reset',
        title: 'Recovery Reset',
        description: 'Sleep and readiness both need to land in the green.',
        mode: 'solo',
        format: 'goal',
        durationDays: 5,
        accentColor: '#7BC4A0',
        rules: [
            createRule('sleep_score', 82),
            createRule('readiness_score', 80),
        ],
    },
    {
        id: 'balanced-week',
        title: 'Balanced Week',
        description: 'A weighted blend of steps, sleep, and readiness.',
        mode: 'friends',
        format: 'combo',
        durationDays: 7,
        accentColor: '#6B9E8A',
        rules: [
            createRule('steps', 10000, { weight: 0.4 }),
            createRule('sleep_score', 85, { weight: 0.3 }),
            createRule('readiness_score', 80, { weight: 0.3 }),
        ],
    },
    {
        id: 'early-bedtime-club',
        title: 'Early Bedtime Club',
        description: 'Build a streak of earlier nights and enough sleep.',
        mode: 'solo',
        format: 'goal',
        durationDays: 7,
        accentColor: '#A78BFA',
        rules: [
            createRule('bedtime_start', 22 * 60, { operator: 'lte' }),
            createRule('total_sleep_duration', 7.5),
        ],
    },
    {
        id: 'hrv-build',
        title: 'HRV Build',
        description: 'A recovery race powered by HRV and low resting heart rate.',
        mode: 'friends',
        format: 'combo',
        durationDays: 14,
        accentColor: '#D4897B',
        rules: [
            createRule('average_hrv', 45, { weight: 0.55 }),
            createRule('lowest_heart_rate', 55, { weight: 0.45, operator: 'lte' }),
        ],
    },
];

export const getCompetitionMetricDefinition = (metricId: CompetitionMetricId): CompetitionMetricDefinition =>
    COMPETITION_METRICS_BY_ID[metricId];

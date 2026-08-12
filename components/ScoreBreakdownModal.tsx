import React, { useMemo, useState } from 'react';
import { Calculator, Calendar, TrendingUp, TrendingDown, Minus, Target, Clock, Thermometer, Heart, Moon, Zap } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DailyReadiness, DailySleep, DailyActivity, SleepSession } from '../types';
import { IOSModal, IOSListItem, IOSButton } from './ios';
import { formatISODateForDisplay } from '../utils/date';
import { CHART_TOOLTIP_STYLE, CHART_GRID_STROKE, CHART_AXIS_STYLE, CHART_ACTIVE_DOT } from '../utils/chartStyles';
import { getDataAwareChartDomain } from '../utils/chartScale';

interface ScoreHistoryPoint {
    date: string;
    value: number;
}

interface ScoreBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    scoreType: 'readiness' | 'sleep' | 'activity';
    scoreData: DailyReadiness | DailySleep | DailyActivity | null;
    sessionData?: SleepSession | null;
    historyData?: ScoreHistoryPoint[];
}

interface FactorDefinition {
    key: string;
    label: string;
    contributorScore: number | null;
    actualValue?: string;
    icon: React.ReactNode;
}

const FACTOR_DESCRIPTIONS: Record<string, string> = {
    previous_night: 'How last night’s sleep contributed to today’s readiness score.',
    sleep_balance: 'How recent sleep amount compares with your longer-term sleep needs.',
    hrv_balance: 'How recent nighttime HRV compares with your personal baseline.',
    resting_heart_rate: 'How last night’s resting heart rate compared with your personal baseline.',
    recovery_index: 'How quickly your resting heart rate settled during the night.',
    body_temperature: 'How overnight temperature deviation compared with your personal baseline.',
    activity_balance: 'How recent activity load and recovery contributed to readiness.',
    previous_day_activity: 'How yesterday’s activity contributed to today’s readiness score.',
    sleep_regularity: 'How consistent recent sleep and wake timing has been.',
    total_sleep: 'How total sleep duration contributed to the sleep score.',
    efficiency: 'The share of time in bed that was spent asleep.',
    restfulness: 'How interruptions and movement contributed to the sleep score.',
    rem_sleep: 'How REM sleep duration contributed to the sleep score.',
    deep_sleep: 'How deep sleep duration contributed to the sleep score.',
    latency: 'How the time it took to fall asleep contributed to the sleep score.',
    timing: 'How sleep timing aligned with your estimated sleep window.',
    meet_daily_targets: 'How often recent daily activity targets were met.',
    move_every_hour: 'How often you avoided long inactive periods.',
    recovery_time: 'How much recovery time followed recent activity.',
    stay_active: 'How total daily movement contributed to the activity score.',
    training_frequency: 'How often training sessions occurred in the recent period.',
    training_volume: 'How recent training load compared with your usual pattern.',
};

const ScoreBreakdownModal: React.FC<ScoreBreakdownModalProps> = ({
    isOpen,
    onClose,
    scoreType,
    scoreData,
    sessionData,
    historyData = [],
}) => {
    const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '14d' | '30d'>('14d');

    const getFactorsForScoreType = (type: string, data: any, session?: SleepSession | null): FactorDefinition[] => {
        switch (type) {
            case 'readiness': {
                const readiness = data as DailyReadiness;
                return [
                    {
                        key: 'previous_night',
                        label: 'Previous Night',
                        contributorScore: readiness.contributors.previous_night,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'sleep_balance',
                        label: 'Sleep Balance',
                        contributorScore: readiness.contributors.sleep_balance,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'hrv_balance',
                        label: 'HRV Balance',
                        contributorScore: readiness.contributors.hrv_balance,
                        actualValue: session?.average_hrv ? `${session.average_hrv} ms` : undefined,
                        icon: <Heart className="w-4 h-4" />
                    },
                    {
                        key: 'resting_heart_rate',
                        label: 'Resting Heart Rate',
                        contributorScore: readiness.contributors.resting_heart_rate,
                        actualValue: session?.lowest_heart_rate ? `${session.lowest_heart_rate} bpm` : undefined,
                        icon: <Heart className="w-4 h-4" />
                    },
                    {
                        key: 'recovery_index',
                        label: 'Recovery Index',
                        contributorScore: readiness.contributors.recovery_index,
                        icon: <TrendingUp className="w-4 h-4" />
                    },
                    {
                        key: 'body_temperature',
                        label: 'Body Temperature',
                        contributorScore: readiness.contributors.body_temperature,
                        icon: <Thermometer className="w-4 h-4" />
                    },
                    {
                        key: 'activity_balance',
                        label: 'Activity Balance',
                        contributorScore: readiness.contributors.activity_balance,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'previous_day_activity',
                        label: 'Previous Day Activity',
                        contributorScore: readiness.contributors.previous_day_activity,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'sleep_regularity',
                        label: 'Sleep Regularity',
                        contributorScore: readiness.contributors.sleep_regularity,
                        icon: <Calendar className="w-4 h-4" />
                    }
                ];
            }

            case 'sleep': {
                const sleep = data as DailySleep;
                return [
                    {
                        key: 'total_sleep',
                        label: 'Total Sleep',
                        contributorScore: sleep.contributors.total_sleep,
                        actualValue: session?.total_sleep_duration ? `${Math.round(session.total_sleep_duration / 3600)}h ${Math.round((session.total_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'efficiency',
                        label: 'Efficiency',
                        contributorScore: sleep.contributors.efficiency,
                        actualValue: session?.efficiency ? `${session.efficiency}%` : undefined,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'restfulness',
                        label: 'Restfulness',
                        contributorScore: sleep.contributors.restfulness,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'rem_sleep',
                        label: 'REM Sleep',
                        contributorScore: sleep.contributors.rem_sleep,
                        actualValue: session?.rem_sleep_duration ? `${Math.round(session.rem_sleep_duration / 3600)}h ${Math.round((session.rem_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'deep_sleep',
                        label: 'Deep Sleep',
                        contributorScore: sleep.contributors.deep_sleep,
                        actualValue: session?.deep_sleep_duration ? `${Math.round(session.deep_sleep_duration / 3600)}h ${Math.round((session.deep_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'latency',
                        label: 'Latency',
                        contributorScore: sleep.contributors.latency,
                        actualValue: session?.latency ? `${Math.round(session.latency / 60)}m` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'timing',
                        label: 'Timing',
                        contributorScore: sleep.contributors.timing,
                        icon: <Clock className="w-4 h-4" />
                    }
                ];
            }

            case 'activity': {
                const activity = data as DailyActivity;
                return [
                    {
                        key: 'meet_daily_targets',
                        label: 'Meet Daily Targets',
                        contributorScore: activity.contributors.meet_daily_targets,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'move_every_hour',
                        label: 'Move Every Hour',
                        contributorScore: activity.contributors.move_every_hour,
                        actualValue: activity.inactivity_alerts !== undefined ? `${activity.inactivity_alerts} alerts` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'recovery_time',
                        label: 'Recovery Time',
                        contributorScore: activity.contributors.recovery_time,
                        icon: <TrendingUp className="w-4 h-4" />
                    },
                    {
                        key: 'stay_active',
                        label: 'Stay Active',
                        contributorScore: activity.contributors.stay_active,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'training_frequency',
                        label: 'Training Frequency',
                        contributorScore: activity.contributors.training_frequency,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'training_volume',
                        label: 'Training Volume',
                        contributorScore: activity.contributors.training_volume,
                        icon: <TrendingUp className="w-4 h-4" />
                    }
                ];
            }

            default:
                return [];
        }
    };

    const factors = scoreData ? getFactorsForScoreType(scoreType, scoreData, sessionData) : [];
    const score = scoreData?.score ?? 0;
    const title = `${scoreType.charAt(0).toUpperCase() + scoreType.slice(1)} Score Breakdown`;
    const date = scoreData?.day ?? '';
    const scoreColor = scoreType === 'readiness' ? '#7BC4A0' : scoreType === 'sleep' ? '#7BA8D4' : '#D4B87B';
    const rangeDays = selectedTimeRange === '7d' ? 7 : selectedTimeRange === '14d' ? 14 : 30;
    const filteredHistory = useMemo(
        () => historyData.slice(0, rangeDays).reverse(),
        [historyData, rangeDays]
    );

    const chartDomain = useMemo<[number, number]>(() => {
        return getDataAwareChartDomain(
            filteredHistory.map((entry) => entry.value),
            { min: 0, max: 100 }
        );
    }, [filteredHistory]);

    const trend = useMemo(() => {
        if (filteredHistory.length < 2) return null;

        const midpoint = Math.ceil(filteredHistory.length / 2);
        const older = filteredHistory.slice(0, midpoint);
        const recent = filteredHistory.slice(midpoint);
        if (!older.length || !recent.length) return null;

        const olderAverage = older.reduce((sum, entry) => sum + entry.value, 0) / older.length;
        const recentAverage = recent.reduce((sum, entry) => sum + entry.value, 0) / recent.length;
        if (olderAverage === 0) return null;

        const change = ((recentAverage - olderAverage) / olderAverage) * 100;
        return {
            change,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
        };
    }, [filteredHistory]);

    if (!isOpen || !scoreData) return null;

    return (
        <IOSModal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="text-sm font-medium" style={{ color: scoreColor }}>
                            Score: {score}/100
                        </p>
                        <p className="text-ink-muted text-xs mt-1">
                            {formatISODateForDisplay(date, undefined, {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto ios-scroll max-h-[68vh] space-y-6">
                    <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-ink-muted text-sm mb-1">Current Score</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-bold font-mono" style={{ color: scoreColor }}>
                                        {score}
                                    </span>
                                    <span className="text-ink-muted text-sm font-medium">/100</span>
                                </div>
                            </div>
                            {trend && (
                                <div
                                    className={`flex items-center gap-1 text-sm font-medium ${
                                        trend.direction === 'stable'
                                            ? 'text-ink-muted'
                                            : trend.direction === 'up'
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
                                    <span className="text-ink-muted text-xs">vs prior window</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Score Calculation Explanation */}
                    <div className="mb-6 rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
                        <h4 className="text-sm font-medium text-ink mb-2 flex items-center gap-2">
                            <Calculator className="w-4 h-4" />
                            How Score is Calculated
                        </h4>
                        <p className="text-ink-secondary text-sm">
                            Oura calculates the {scoreType} score from the contributor scores below. Oura does not publish the exact weighting.
                        </p>
                    </div>

                    <div className="flex gap-2" role="group" aria-label="Score history time range">
                        {(['7d', '14d', '30d'] as const).map((range) => (
                            <button
                                key={range}
                                type="button"
                                aria-pressed={selectedTimeRange === range}
                                onClick={() => setSelectedTimeRange(range)}
                                className={`flex-1 min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                                    selectedTimeRange === range
                                        ? 'border-[#6B9E8A]/30 bg-accent/15 text-accent'
                                        : 'border-line bg-surface text-ink-secondary hover:border-line-strong'
                                }`}
                            >
                                {range === '7d' ? '7 Days' : range === '14d' ? '14 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>

                    <div className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
                        <h4 className="text-sm font-medium text-ink mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {title} History
                        </h4>
                        {filteredHistory.length > 0 ? (
                            <div style={{ height: 200 }}>
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    minWidth={0}
                                    minHeight={160}
                                    initialDimension={{ width: 560, height: 180 }}
                                >
                                    <AreaChart data={filteredHistory}>
                                        <defs>
                                            <linearGradient id={`score-history-${scoreType}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={scoreColor} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={scoreColor} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                                        <XAxis
                                            dataKey="date"
                                            tick={CHART_AXIS_STYLE.tick}
                                            tickFormatter={(value) => formatISODateForDisplay(value, undefined, { month: 'short', day: 'numeric' })}
                                            axisLine={CHART_AXIS_STYLE.axisLine}
                                            minTickGap={20}
                                        />
                                        <YAxis
                                            domain={chartDomain}
                                            tick={CHART_AXIS_STYLE.tick}
                                            axisLine={CHART_AXIS_STYLE.axisLine}
                                            tickCount={5}
                                        />
                                        <Tooltip
                                            contentStyle={CHART_TOOLTIP_STYLE}
                                            formatter={(value: number) => [`${value}/100`, 'Score']}
                                            labelFormatter={(label) => formatISODateForDisplay(label, undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke={scoreColor}
                                            strokeWidth={2}
                                            fill={`url(#score-history-${scoreType})`}
                                            activeDot={{ ...CHART_ACTIVE_DOT, stroke: scoreColor }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-dashed border-[rgba(0,0,0,0.1)] bg-surface-raised px-4 text-center text-sm text-ink-muted">
                                Not enough score history yet to draw a chart.
                            </div>
                        )}
                    </div>

                    {/* Factors List */}
                    <div className="space-y-2">
                        {factors.map((factor) => (
                            <IOSListItem
                                key={factor.key}
                                title={factor.label}
                                subtitle={FACTOR_DESCRIPTIONS[factor.key] ?? 'Oura contributor score.'}
                                icon={<div className="text-accent ios-touch-target">{factor.icon}</div>}
                                rightElement={
                                    <div className="text-right">
                                        <div className="text-ink font-mono font-bold">
                                            {factor.contributorScore ?? '—'}
                                        </div>
                                        {factor.actualValue != null && (
                                            <div className="text-ink-muted text-xs">
                                                {factor.actualValue}
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        ))}
                    </div>

                </div>

                <IOSButton onClick={onClose} className="w-full" variant="secondary">
                    Close
                </IOSButton>
            </div>
        </IOSModal>
    );
};

export default ScoreBreakdownModal;

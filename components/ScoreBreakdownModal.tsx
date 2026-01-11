import React from 'react';
import { X, Calculator, TrendingUp, Target, Clock, Thermometer, Heart, Moon, Zap } from 'lucide-react';
import { DailyReadiness, DailySleep, DailyActivity, SleepSession } from '../types';

interface ScoreBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    scoreType: 'readiness' | 'sleep' | 'activity';
    scoreData: DailyReadiness | DailySleep | DailyActivity | null;
    sessionData?: SleepSession | null; // For additional context like actual values
}

interface FactorDefinition {
    key: string;
    label: string;
    description: string;
    weight: number | null;
    actualValue?: string;
    icon: React.ReactNode;
}

const ScoreBreakdownModal: React.FC<ScoreBreakdownModalProps> = ({
    isOpen,
    onClose,
    scoreType,
    scoreData,
    sessionData
}) => {
    if (!isOpen || !scoreData) return null;

    const getFactorsForScoreType = (type: string, data: any, session?: SleepSession | null): FactorDefinition[] => {
        switch (type) {
            case 'readiness':
                const readiness = data as DailyReadiness;
                return [
                    {
                        key: 'previous_night',
                        label: 'Previous Night',
                        description: 'Quality of sleep from the previous night',
                        weight: readiness.contributors.previous_night,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'sleep_balance',
                        label: 'Sleep Balance',
                        description: 'Consistency of sleep patterns over time',
                        weight: readiness.contributors.sleep_balance,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'hrv_balance',
                        label: 'HRV Balance',
                        description: 'Heart rate variability balance (recovery indicator)',
                        weight: readiness.contributors.hrv_balance,
                        actualValue: session?.average_hrv ? `${session.average_hrv} ms` : undefined,
                        icon: <Heart className="w-4 h-4" />
                    },
                    {
                        key: 'resting_heart_rate',
                        label: 'Resting Heart Rate',
                        description: 'Resting heart rate (lower is better)',
                        weight: readiness.contributors.resting_heart_rate,
                        actualValue: session?.lowest_heart_rate ? `${session.lowest_heart_rate} bpm` : undefined,
                        icon: <Heart className="w-4 h-4" />
                    },
                    {
                        key: 'recovery_index',
                        label: 'Recovery Index',
                        description: 'Overall recovery status from physical activity',
                        weight: readiness.contributors.recovery_index,
                        icon: <TrendingUp className="w-4 h-4" />
                    },
                    {
                        key: 'body_temperature',
                        label: 'Body Temperature',
                        description: 'Body temperature deviation from baseline',
                        weight: readiness.contributors.body_temperature,
                        icon: <Thermometer className="w-4 h-4" />
                    },
                    {
                        key: 'activity_balance',
                        label: 'Activity Balance',
                        description: 'Balance between rest and activity periods',
                        weight: readiness.contributors.activity_balance,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'previous_day_activity',
                        label: 'Previous Day Activity',
                        description: 'Physical activity from the previous day',
                        weight: readiness.contributors.previous_day_activity,
                        icon: <Zap className="w-4 h-4" />
                    }
                ];

            case 'sleep':
                const sleep = data as DailySleep;
                return [
                    {
                        key: 'total_sleep',
                        label: 'Total Sleep',
                        description: 'Total duration of sleep',
                        weight: sleep.contributors.total_sleep,
                        actualValue: session?.total_sleep_duration ? `${Math.round(session.total_sleep_duration / 3600)}h ${Math.round((session.total_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'efficiency',
                        label: 'Efficiency',
                        description: 'Percentage of time in bed spent sleeping',
                        weight: sleep.contributors.efficiency,
                        actualValue: session?.efficiency ? `${session.efficiency}%` : undefined,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'restfulness',
                        label: 'Restfulness',
                        description: 'How restful and undisturbed the sleep was',
                        weight: sleep.contributors.restfulness,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'rem_sleep',
                        label: 'REM Sleep',
                        description: 'Duration of REM (Rapid Eye Movement) sleep',
                        weight: sleep.contributors.rem_sleep,
                        actualValue: session?.rem_sleep_duration ? `${Math.round(session.rem_sleep_duration / 60)}m` : undefined,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'deep_sleep',
                        label: 'Deep Sleep',
                        description: 'Duration of deep sleep stage',
                        weight: sleep.contributors.deep_sleep,
                        actualValue: session?.deep_sleep_duration ? `${Math.round(session.deep_sleep_duration / 60)}m` : undefined,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'latency',
                        label: 'Latency',
                        description: 'Time taken to fall asleep (lower is better)',
                        weight: sleep.contributors.latency,
                        actualValue: session?.latency ? `${Math.round(session.latency / 60)}m` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'timing',
                        label: 'Timing',
                        description: 'Alignment of sleep with circadian rhythm',
                        weight: sleep.contributors.timing,
                        icon: <Clock className="w-4 h-4" />
                    }
                ];

            case 'activity':
                const activity = data as DailyActivity;
                return [
                    {
                        key: 'meet_daily_targets',
                        label: 'Meet Daily Targets',
                        description: 'Success in meeting daily activity goals over 7 days',
                        weight: activity.contributors.meet_daily_targets,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'move_every_hour',
                        label: 'Move Every Hour',
                        description: 'Regular movement breaks preventing long sedentary periods',
                        weight: activity.contributors.move_every_hour,
                        actualValue: activity.inactivity_alerts !== undefined ? `${activity.inactivity_alerts} alerts` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'recovery_time',
                        label: 'Recovery Time',
                        description: 'Adequate recovery periods between activities over 7 days',
                        weight: activity.contributors.recovery_time,
                        icon: <TrendingUp className="w-4 h-4" />
                    },
                    {
                        key: 'stay_active',
                        label: 'Stay Active',
                        description: 'Consistent activity throughout the day',
                        weight: activity.contributors.stay_active,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'training_frequency',
                        label: 'Training Frequency',
                        description: 'Frequency of training sessions over 7 days',
                        weight: activity.contributors.training_frequency,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'training_volume',
                        label: 'Training Volume',
                        description: 'Volume/intensity of training over 7 days',
                        weight: activity.contributors.training_volume,
                        icon: <TrendingUp className="w-4 h-4" />
                    }
                ];

            default:
                return [];
        }
    };

    const factors = getFactorsForScoreType(scoreType, scoreData, sessionData);
    const score = scoreData.score || 0;
    const title = `${scoreType.charAt(0).toUpperCase() + scoreType.slice(1)} Score Breakdown`;
    const date = scoreData.day;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[var(--bg-void)]/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative card w-full max-w-4xl max-h-[85vh] flex flex-col animate-fade-in-up border border-[var(--border-default)] shadow-2xl bg-[var(--bg-elevated)]">
                {/* Header */}
                <div className="p-6 border-b border-[var(--border-subtle)]">
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Calculator className="w-5 h-5" />
                                {title}
                            </h3>
                            <p className="text-[var(--accent)] text-sm font-medium mt-1">
                                Score: {score}/100 • {new Date(date).toLocaleDateString(undefined, {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <div className="mb-6">
                        <p className="text-[var(--text-secondary)]">
                            Your {scoreType} score is calculated by weighting various health factors.
                            Each factor contributes to the overall score based on its importance and your individual metrics.
                        </p>
                    </div>

                    {/* Score Calculation Explanation */}
                    <div className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-subtle)] mb-6">
                        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
                            <Calculator className="w-4 h-4" />
                            How the Score is Calculated
                        </h4>
                        <p className="text-[var(--text-secondary)] text-sm">
                            Your {scoreType} score of <strong>{score}/100</strong> is calculated by Oura's proprietary algorithm that combines
                            multiple health factors. Each factor receives a score (1-100) based on your performance in that area.
                            These factor scores are then weighted and combined to produce your final {scoreType} score.
                            The exact weighting formula is not publicly disclosed by Oura.
                        </p>
                    </div>

                    {/* Factors Table */}
                    <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                            <h4 className="text-sm font-medium text-[var(--text-primary)]">Score Factors & Individual Scores</h4>
                        </div>

                        <div className="divide-y divide-[var(--border-subtle)]">
                            {factors.map((factor, idx) => (
                                <div key={factor.key} className="p-4 hover:bg-[var(--bg-void)]/30 transition-colors">
                                    <div className="grid grid-cols-12 gap-4 items-center">
                                        {/* Factor Icon & Name */}
                                        <div className="col-span-4 flex items-center gap-3">
                                            <div className="text-[var(--accent)]">
                                                {factor.icon}
                                            </div>
                                            <div>
                                                <h5 className="font-medium text-[var(--text-primary)] text-sm">
                                                    {factor.label}
                                                </h5>
                                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                                    {factor.description}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Factor Score */}
                                        <div className="col-span-2 text-center">
                                            <div className="bg-[var(--bg-elevated)] px-3 py-2 rounded-lg border border-[var(--border-subtle)]">
                                                <p className="text-lg font-mono font-bold text-[var(--text-primary)]">
                                                    {factor.weight || '--'}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                                                    Factor Score
                                                </p>
                                            </div>
                                        </div>

                                        {/* Actual Value (if available) */}
                                        <div className="col-span-3 text-center">
                                            {factor.actualValue ? (
                                                <div className="bg-[var(--bg-elevated)] px-3 py-2 rounded-lg border border-[var(--border-subtle)]">
                                                    <p className="text-sm font-mono text-[var(--text-primary)]">
                                                        {factor.actualValue}
                                                    </p>
                                                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                                                        Actual
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="text-[var(--text-muted)] text-xs">
                                                    --
                                                </div>
                                            )}
                                        </div>

                                        {/* Contribution Indicator */}
                                        <div className="col-span-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-[var(--bg-void)] rounded-full h-2">
                                                    <div
                                                        className={`h-2 rounded-full transition-all duration-500 ${
                                                            factor.weight && factor.weight >= 80 ? 'bg-green-500' :
                                                            factor.weight && factor.weight >= 60 ? 'bg-yellow-500' :
                                                            factor.weight && factor.weight >= 40 ? 'bg-orange-500' :
                                                            'bg-red-500'
                                                        }`}
                                                        style={{ width: `${factor.weight || 0}%` }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-medium ${
                                                    factor.weight && factor.weight >= 80 ? 'text-green-400' :
                                                    factor.weight && factor.weight >= 60 ? 'text-yellow-400' :
                                                    factor.weight && factor.weight >= 40 ? 'text-orange-400' :
                                                    'text-red-400'
                                                }`}>
                                                    {factor.weight && factor.weight >= 80 ? 'Excellent' :
                                                     factor.weight && factor.weight >= 60 ? 'Good' :
                                                     factor.weight && factor.weight >= 40 ? 'Fair' :
                                                     'Needs Work'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="mt-6 p-4 bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)]">
                        <p className="text-[var(--text-secondary)] text-sm">
                            <strong>Note:</strong> Each factor receives an individual score (1-100) based on your performance in that area.
                            These factor scores are then combined using Oura's proprietary weighting algorithm to produce your final {scoreType} score.
                            Higher factor scores indicate better performance in that specific health area.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScoreBreakdownModal;
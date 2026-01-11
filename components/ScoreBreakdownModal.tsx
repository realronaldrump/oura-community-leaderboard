import React from 'react';
import { X, Calculator, TrendingUp, Target, Clock, Thermometer, Heart, Moon, Zap } from 'lucide-react';
import { DailyReadiness, DailySleep, DailyActivity, SleepSession } from '../types';
import { IOSModal, IOSListItem, IOSButton } from './ios';

interface ScoreBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    scoreType: 'readiness' | 'sleep' | 'activity';
    scoreData: DailyReadiness | DailySleep | DailyActivity | null;
    sessionData?: SleepSession | null;
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
                        description: 'Quality and duration of sleep from the previous night. This factor evaluates how well you slept last night, including total sleep time, sleep stages, and how restful your sleep was. Good sleep quality is fundamental to feeling ready for the day.',
                        weight: readiness.contributors.previous_night,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'sleep_balance',
                        label: 'Sleep Balance',
                        description: 'Consistency and adequacy of your sleep patterns over the past 1-2 weeks. This factor tracks whether you\'re getting enough sleep consistently, going to bed and waking at regular times, and maintaining good sleep habits.',
                        weight: readiness.contributors.sleep_balance,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'hrv_balance',
                        label: 'HRV Balance',
                        description: 'Heart rate variability trends over time, which indicates your body\'s recovery status and stress levels. Higher and stable HRV suggests good recovery, while declining HRV may indicate accumulated stress or insufficient recovery.',
                        weight: readiness.contributors.hrv_balance,
                        actualValue: session?.average_hrv ? `${session.average_hrv} ms` : undefined,
                        icon: <Heart className="w-4 h-4" />
                    },
                    {
                        key: 'resting_heart_rate',
                        label: 'Resting Heart Rate',
                        description: 'Your resting heart rate compared to your baseline. A lower resting heart rate generally indicates better cardiovascular fitness and recovery, while elevated resting heart rate may suggest stress, fatigue, or incomplete recovery.',
                        weight: readiness.contributors.resting_heart_rate,
                        actualValue: session?.lowest_heart_rate ? `${session.lowest_heart_rate} bpm` : undefined,
                        icon: <Heart className="w-4 h-4" />
                    },
                    {
                        key: 'recovery_index',
                        label: 'Recovery Index',
                        description: 'Your body\'s ability to recover from physical stress and exercise. This factor analyzes how quickly your heart rate returns to normal after activity and overall recovery patterns, indicating whether you\'re adequately recovering between workouts.',
                        weight: readiness.contributors.recovery_index,
                        icon: <TrendingUp className="w-4 h-4" />
                    },
                    {
                        key: 'body_temperature',
                        label: 'Body Temperature',
                        description: 'Your body temperature patterns and deviations from your baseline. Slightly lower resting body temperature can indicate better recovery, while elevated temperature may suggest illness, stress, or accumulated fatigue.',
                        weight: readiness.contributors.body_temperature,
                        icon: <Thermometer className="w-4 h-4" />
                    },
                    {
                        key: 'activity_balance',
                        label: 'Activity Balance',
                        description: 'The balance between physical activity and rest periods. This factor ensures you\'re getting enough movement without overtraining, and adequate rest to allow for recovery and adaptation.',
                        weight: readiness.contributors.activity_balance,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'previous_day_activity',
                        label: 'Previous Day Activity',
                        description: 'The intensity and volume of physical activity from the previous day. This factor considers whether your activity level was appropriate and how it impacts your current readiness.',
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
                        description: 'The total amount of time spent asleep during your sleep period. This factor evaluates whether you\'re getting adequate sleep duration for optimal health and performance.',
                        weight: sleep.contributors.total_sleep,
                        actualValue: session?.total_sleep_duration ? `${Math.round(session.total_sleep_duration / 3600)}h ${Math.round((session.total_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'efficiency',
                        label: 'Efficiency',
                        description: 'The percentage of time in bed actually spent sleeping. This factor measures sleep quality by evaluating how quickly you fall asleep and how much of your time in bed is spent sleeping versus awake.',
                        weight: sleep.contributors.efficiency,
                        actualValue: session?.efficiency ? `${session.efficiency}%` : undefined,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'restfulness',
                        label: 'Restfulness',
                        description: 'How restful and undisturbed your sleep was, based on movement and awakenings during the night. More restful sleep with fewer interruptions contributes to higher sleep quality.',
                        weight: sleep.contributors.restfulness,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'rem_sleep',
                        label: 'REM Sleep',
                        description: 'The amount of time spent in REM (Rapid Eye Movement) sleep, which is crucial for emotional processing, creativity, memory consolidation, and cognitive function.',
                        weight: sleep.contributors.rem_sleep,
                        actualValue: session?.rem_sleep_duration ? `${Math.round(session.rem_sleep_duration / 3600)}h ${Math.round((session.rem_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'deep_sleep',
                        label: 'Deep Sleep',
                        description: 'The duration of deep sleep stages, which are essential for physical recovery, immune function, tissue repair, and hormone release.',
                        weight: sleep.contributors.deep_sleep,
                        actualValue: session?.deep_sleep_duration ? `${Math.round(session.deep_sleep_duration / 3600)}h ${Math.round((session.deep_sleep_duration % 3600) / 60)}m` : undefined,
                        icon: <Moon className="w-4 h-4" />
                    },
                    {
                        key: 'latency',
                        label: 'Latency',
                        description: 'The time it takes to fall asleep after getting into bed. Shorter latency typically indicates better sleep health and less stress before bed.',
                        weight: sleep.contributors.latency,
                        actualValue: session?.latency ? `${Math.round(session.latency / 60)}m` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'timing',
                        label: 'Timing',
                        description: 'How well your sleep timing aligns with your circadian rhythm and regular sleep schedule. Consistent sleep-wake times support better sleep quality and overall health.',
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
                        description: 'How consistently you meet your daily activity goals over the past 7 days. This factor tracks your ability to maintain regular physical activity and achieve step or calorie targets.',
                        weight: activity.contributors.meet_daily_targets,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'move_every_hour',
                        label: 'Move Every Hour',
                        description: 'Your success in taking regular movement breaks throughout the day to avoid prolonged sedentary periods. Standing up and moving each hour supports metabolism, circulation, and overall health.',
                        weight: activity.contributors.move_every_hour,
                        actualValue: activity.inactivity_alerts !== undefined ? `${activity.inactivity_alerts} alerts` : undefined,
                        icon: <Clock className="w-4 h-4" />
                    },
                    {
                        key: 'recovery_time',
                        label: 'Recovery Time',
                        description: 'The balance between activity and adequate rest periods over the past 7 days. This factor ensures you\'re not overtraining and are allowing sufficient recovery between activities.',
                        weight: activity.contributors.recovery_time,
                        icon: <TrendingUp className="w-4 h-4" />
                    },
                    {
                        key: 'stay_active',
                        label: 'Stay Active',
                        description: 'Your level of consistent physical activity spread throughout the day, rather than being sedentary for long periods with occasional bursts of activity.',
                        weight: activity.contributors.stay_active,
                        icon: <Zap className="w-4 h-4" />
                    },
                    {
                        key: 'training_frequency',
                        label: 'Training Frequency',
                        description: 'How often you engage in structured training or higher-intensity physical activity sessions over the past 7 days. Regular training supports cardiovascular fitness and strength.',
                        weight: activity.contributors.training_frequency,
                        icon: <Target className="w-4 h-4" />
                    },
                    {
                        key: 'training_volume',
                        label: 'Training Volume',
                        description: 'The overall intensity and duration of your training activities over the past 7 days. This factor tracks the total workload you\'ve put into physical activities.',
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
        <IOSModal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="text-[#00C896] text-sm font-medium">
                            Score: {score}/100
                        </p>
                        <p className="text-[#666666] text-xs mt-1">
                            {new Date(date).toLocaleDateString(undefined, {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto ios-scroll max-h-[60vh]">
                    <div className="mb-6">
                        <p className="text-[#A0A0A0] text-sm">
                            Your {scoreType} score is calculated by weighting various health factors.
                            Each factor contributes to overall score based on its importance and your individual metrics.
                        </p>
                    </div>

                    {/* Score Calculation Explanation */}
                    <div className="bg-[#0C0C0C] p-4 rounded-xl border border-[#222] mb-6">
                        <h4 className="text-sm font-medium text-[#FAFAFA] mb-2 flex items-center gap-2">
                            <Calculator className="w-4 h-4" />
                            How Score is Calculated
                        </h4>
                        <p className="text-[#A0A0A0] text-sm">
                            Your {scoreType} score of <strong>{score}/100</strong> is calculated by Oura's proprietary algorithm that combines
                            multiple health factors. Each factor receives a score (1-100) based on your performance in that area.
                            These factor scores are then weighted and combined to produce your final {scoreType} score.
                        </p>
                    </div>

                    {/* Factors List */}
                    <div className="space-y-2">
                        {factors.map((factor, idx) => (
                            <IOSListItem
                                key={factor.key}
                                title={factor.label}
                                subtitle={factor.description}
                                icon={<div className="text-[#00C896] ios-touch-target">{factor.icon}</div>}
                                rightElement={
                                    <div className="text-right">
                                        <div className="text-[#FAFAFA] font-mono font-bold">
                                            {factor.weight || '--'}
                                        </div>
                                        {factor.actualValue && (
                                            <div className="text-[#666666] text-xs">
                                                {factor.actualValue}
                                            </div>
                                        )}
                                    </div>
                                }
                            />
                        ))}
                    </div>

                    {/* Summary */}
                    <div className="mt-6 p-4 bg-[#0C0C0C] rounded-xl border border-[#222]">
                        <p className="text-[#A0A0A0] text-sm">
                            <strong>Note:</strong> Each factor receives an individual score (1-100) based on your performance in that area.
                            Higher factor scores indicate better performance in that specific health area.
                        </p>
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
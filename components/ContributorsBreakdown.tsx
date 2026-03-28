import React, { useState } from 'react';
import { Info, X } from 'lucide-react';
import { IOSModal, IOSButton } from './ios';

interface ContributorItem {
    label: string;
    value: number | null | undefined;
    color: string;
    key?: string;
    description?: string;
    tips?: string[];
}

interface Props {
    title: string;
    contributors: ContributorItem[];
    onContributorClick?: (contributor: ContributorItem) => void;
}

type ContributorDetail = {
    label: string;
    key: string;
    description: string;
    importance: string;
    tips: string[];
    relatedMetrics?: string[];
};

const CONTRIBUTOR_DETAILS: Record<string, ContributorDetail> = {
    // Readiness contributors
    previous_night: {
        label: 'Previous Night',
        key: 'previous_night',
        description: 'Quality of sleep from the previous night directly impacts your readiness. Good sleep quality sets the foundation for optimal daily performance.',
        importance: 'High - This is one of the most significant factors in your readiness score.',
        tips: [
            'Maintain consistent sleep schedule',
            'Avoid caffeine and heavy meals before bed',
            'Keep bedroom cool and dark',
            'Wind down 30-60 minutes before bedtime'
        ],
        relatedMetrics: ['Sleep Score', 'Sleep Efficiency', 'Total Sleep']
    },
    sleep_balance: {
        label: 'Sleep Balance',
        key: 'sleep_balance',
        description: 'Consistency of your sleep patterns over time. Regular sleep patterns help maintain optimal readiness.',
        importance: 'High - Sleep consistency is crucial for long-term health and recovery.',
        tips: [
            'Go to bed and wake up at similar times daily',
            'Avoid large shifts in your sleep schedule',
            'Plan ahead for time zone changes',
            'Maintain weekend sleep schedule similar to weekdays'
        ],
        relatedMetrics: ['Sleep Score', 'Total Sleep', 'Sleep Timing']
    },
    hrv_balance: {
        label: 'HRV Balance',
        key: 'hrv_balance',
        description: 'Heart rate variability balance indicates your recovery status. Higher HRV generally means better recovery and lower stress.',
        importance: 'High - HRV is a strong indicator of your autonomic nervous system state.',
        tips: [
            'Prioritize adequate sleep (7-9 hours)',
            'Manage stress through meditation or breathing exercises',
            'Stay hydrated',
            'Avoid alcohol before sleep'
        ],
        relatedMetrics: ['HRV', 'Resting Heart Rate', 'Recovery Index']
    },
    resting_heart_rate: {
        label: 'Resting Heart Rate',
        key: 'resting_heart_rate',
        description: 'Resting heart rate during sleep. A lower resting heart rate generally indicates better cardiovascular fitness and recovery.',
        importance: 'High - Resting HR is a key indicator of overall health and recovery status.',
        tips: [
            'Regular aerobic exercise can lower resting HR over time',
            'Ensure adequate sleep for recovery',
            'Manage stress levels',
            'Avoid excessive alcohol and caffeine'
        ],
        relatedMetrics: ['Average HR', 'HRV', 'Activity Score']
    },
    recovery_index: {
        label: 'Recovery Index',
        key: 'recovery_index',
        description: 'Overall recovery status from physical activity. Higher values indicate better recovery from workouts and daily stress.',
        importance: 'High - Recovery determines your ability to perform consistently.',
        tips: [
            'Allow adequate rest between intense workouts',
            'Listen to your body and take rest days when needed',
            'Prioritize sleep quality',
            'Stay properly hydrated and fed'
        ],
        relatedMetrics: ['Previous Night', 'Sleep Balance', 'Activity Balance']
    },
    body_temperature: {
        label: 'Body Temperature',
        key: 'body_temperature',
        description: 'Body temperature deviation from your baseline. Oura tracks temperature during sleep to detect illness or strain.',
        importance: 'Medium - Temperature changes can indicate illness or increased physical stress.',
        tips: [
            'Monitor for illness if temperature is elevated',
            'Reduce training intensity if temperature is high',
            'Allow more recovery time when needed',
            'Track patterns to identify your baseline'
        ],
        relatedMetrics: ['Previous Night', 'Resting Heart Rate', 'Sleep Score']
    },
    activity_balance: {
        label: 'Activity Balance',
        key: 'activity_balance',
        description: 'Balance between rest and activity periods. Finding the right balance prevents overtraining and under-recovery.',
        importance: 'High - Proper balance is essential for long-term progress and health.',
        tips: [
            'Mix intense and light activity days',
            'Include rest days in your training schedule',
            'Listen to your body\'s signals',
            'Gradually increase training volume'
        ],
        relatedMetrics: ['Activity Score', 'Training Volume', 'Recovery Time']
    },
    previous_day_activity: {
        label: 'Previous Day Activity',
        key: 'previous_day_activity',
        description: 'Physical activity from the previous day impacts your recovery state today.',
        importance: 'Medium - Yesterday\'s activity affects today\'s readiness.',
        tips: [
            'Plan intense workouts followed by recovery days',
            'Avoid intense activity too close to bedtime',
            'Consider recovery activities on rest days'
        ],
        relatedMetrics: ['Activity Score', 'Active Calories', 'Steps']
    },
    // Sleep contributors
    total_sleep: {
        label: 'Total Sleep',
        key: 'total_sleep',
        description: 'Total duration of sleep. Getting adequate sleep is essential for physical and mental recovery.',
        importance: 'High - Total sleep is a fundamental factor in sleep quality.',
        tips: [
            'Aim for 7-9 hours of sleep per night',
            'Go to bed early enough to allow full rest',
            'Avoid late-night activities that cut into sleep time',
            'Create a relaxing bedtime routine'
        ],
        relatedMetrics: ['Time in Bed', 'Sleep Efficiency', 'Sleep Score']
    },
    efficiency: {
        label: 'Efficiency',
        key: 'efficiency',
        description: 'Percentage of time in bed actually spent sleeping. Higher efficiency means less restless time.',
        importance: 'High - Good efficiency indicates quality sleep without frequent awakenings.',
        tips: [
            'Limit caffeine intake 6+ hours before bed',
            'Avoid large meals before bedtime',
            'Ensure comfortable sleep environment',
            'Minimize noise and light disturbances'
        ],
        relatedMetrics: ['Restfulness', 'Total Sleep', 'Latency']
    },
    restfulness: {
        label: 'Restfulness',
        key: 'restfulness',
        description: 'How restful and undisturbed the sleep was. Measures sleep quality beyond just duration.',
        importance: 'High - Restful sleep is crucial for recovery and cognitive function.',
        tips: [
            'Create a calm, dark sleep environment',
            'Use white noise if needed to mask disturbances',
            'Limit screen time before bed',
            'Keep bedroom temperature cool (60-67°F)'
        ],
        relatedMetrics: ['Efficiency', 'Restless Periods', 'Awake Time']
    },
    rem_sleep: {
        label: 'REM Sleep',
        key: 'rem_sleep',
        description: 'Duration of REM (Rapid Eye Movement) sleep. Important for memory consolidation, learning, and emotional regulation.',
        importance: 'High - REM sleep is essential for cognitive function and emotional health.',
        tips: [
            'Aim for 90-120 minutes of REM per night',
            'Avoid alcohol before bed (reduces REM)',
            'Manage stress through relaxation techniques',
            'Maintain consistent sleep schedule'
        ],
        relatedMetrics: ['Deep Sleep', 'Total Sleep', 'Sleep Score']
    },
    deep_sleep: {
        label: 'Deep Sleep',
        key: 'deep_sleep',
        description: 'Duration of deep sleep stage. Crucial for physical recovery, immune function, and memory consolidation.',
        importance: 'High - Deep sleep is when most physical recovery occurs.',
        tips: [
            'Aim for 1-2 hours of deep sleep per night',
            'Exercise regularly (increases deep sleep)',
            'Avoid alcohol before bed',
            'Keep bedroom cool (deep sleep occurs at lower temps)'
        ],
        relatedMetrics: ['REM Sleep', 'Total Sleep', 'HRV']
    },
    latency: {
        label: 'Latency',
        key: 'latency',
        description: 'Time taken to fall asleep. Shorter latency generally indicates better sleep quality and lower stress.',
        importance: 'Medium - Short latency suggests good sleep onset ability.',
        tips: [
            'Establish a consistent bedtime routine',
            'Avoid screens 1 hour before bed',
            'Keep bedroom cool and dark',
            'Practice relaxation techniques like deep breathing'
        ],
        relatedMetrics: ['Total Sleep', 'Efficiency', 'Restfulness']
    },
    timing: {
        label: 'Timing',
        key: 'timing',
        description: 'Alignment of your sleep with your circadian rhythm. Sleeping at consistent, optimal times improves sleep quality.',
        importance: 'Medium - Proper sleep timing supports natural body rhythms.',
        tips: [
            'Maintain consistent sleep schedule',
            'Expose yourself to morning sunlight',
            'Avoid bright screens before bed',
            'Find your natural sleep window'
        ],
        relatedMetrics: ['Total Sleep', 'Sleep Balance', 'Restfulness']
    },
    // Activity contributors
    meet_daily_targets: {
        label: 'Meet Daily Targets',
        key: 'meet_daily_targets',
        description: 'Success in meeting daily activity goals over the past 7 days.',
        importance: 'Medium - Consistency in meeting goals contributes to overall activity score.',
        tips: [
            'Set realistic, achievable goals',
            'Track progress and adjust goals as needed',
            'Build activity into your daily routine',
            'Celebrate small wins'
        ],
        relatedMetrics: ['Activity Score', 'Steps', 'Active Calories']
    },
    move_every_hour: {
        label: 'Move Every Hour',
        key: 'move_every_hour',
        description: 'Regular movement breaks preventing long sedentary periods. Prolonged sitting is linked to health risks.',
        importance: 'Medium - Regular movement supports metabolism and health.',
        tips: [
            'Set reminders to stand/move hourly',
            'Take short walking breaks',
            'Use stairs instead of elevators',
            'Park further from destinations'
        ],
        relatedMetrics: ['Activity Score', 'Steps', 'Sedentary Time']
    },
    recovery_time: {
        label: 'Recovery Time',
        key: 'recovery_time',
        description: 'Adequate recovery periods between activities over the past 7 days.',
        importance: 'High - Recovery is as important as the training itself.',
        tips: [
            'Schedule rest days between intense workouts',
            'Listen to your body\'s fatigue signals',
            'Prioritize sleep for recovery',
            'Use active recovery on light days'
        ],
        relatedMetrics: ['Activity Balance', 'Training Volume', 'Readiness Score']
    },
    stay_active: {
        label: 'Stay Active',
        key: 'stay_active',
        description: 'Consistent activity throughout the day rather than all at once.',
        importance: 'Medium - Distributed activity is better than sporadic bursts.',
        tips: [
            'Spread activity throughout the day',
            'Take walking meetings when possible',
            'Use standing desk periodically',
            'Break up long periods of sitting'
        ],
        relatedMetrics: ['Activity Score', 'Steps', 'Active Calories']
    },
    training_frequency: {
        label: 'Training Frequency',
        key: 'training_frequency',
        description: 'Frequency of training sessions over the past 7 days.',
        importance: 'Medium - Regular training frequency supports fitness goals.',
        tips: [
            'Aim for 3-5 training sessions per week',
            'Include variety in training types',
            'Allow adequate recovery between sessions',
            'Schedule workouts like appointments'
        ],
        relatedMetrics: ['Activity Score', 'Training Volume', 'Recovery Time']
    },
    training_volume: {
        label: 'Training Volume',
        key: 'training_volume',
        description: 'Volume/intensity of training over the past 7 days.',
        importance: 'High - Training volume directly impacts fitness progression.',
        tips: [
            'Gradually increase volume over time',
            'Balance intensity with recovery',
            'Track total training load',
            'Periodize training (hard/easy weeks)'
        ],
        relatedMetrics: ['Activity Score', 'Active Calories', 'Training Frequency']
    },
};

const ContributorsBreakdown: React.FC<Props> = ({ title, contributors, onContributorClick }) => {
    const [selectedContributor, setSelectedContributor] = useState<ContributorDetail | null>(null);

    const handleContributorClick = (contributor: ContributorItem) => {
        if (contributor.key && CONTRIBUTOR_DETAILS[contributor.key]) {
            setSelectedContributor(CONTRIBUTOR_DETAILS[contributor.key]);
        }
        onContributorClick?.(contributor);
    };

    return (
        <>
            <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">{title}</h3>
                <p className="text-xs text-text-muted mb-6">Click on any contributor for detailed information</p>
                <div className="space-y-4">
                    {contributors.map((item, idx) => (
                        <div
                            key={idx}
                            onClick={() => handleContributorClick(item)}
                            className="space-y-2 cursor-pointer hover:bg-black/5 p-2 rounded-lg transition-all group"
                        >
                            <div className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-text-secondary group-hover:text-text-primary transition-colors">{item.label}</span>
                                    {item.key && (
                                        <Info className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </div>
                                <span className="font-mono font-medium text-text-primary">
                                    {item.value ?? '--'}
                                </span>
                            </div>
                            <div className="h-2 bg-black/5 rounded-full overflow-hidden shadow-clay-inset">
                                <div
                                    className="h-full rounded-full transition-all duration-700 ease-out relative"
                                    style={{
                                        width: `${item.value ?? 0}%`,
                                        backgroundColor: item.color,
                                    }}
                                >
                                    {/* Subtle shine effect */}
                                    <div
                                        className="absolute inset-0 rounded-full"
                                        style={{
                                            background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, transparent 60%)',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Contributor Detail Modal */}
            {selectedContributor && (
                <IOSModal
                    isOpen={!!selectedContributor}
                    onClose={() => setSelectedContributor(null)}
                    title={selectedContributor.label}
                >
                    <div className="space-y-6 overflow-y-auto ios-scroll max-h-[70vh]">
                        {/* Description */}
                        <div className="bg-[#F2EDE8] p-4 rounded-xl border border-[rgba(0,0,0,0.06)]">
                            <p className="text-sm text-[#7A756E]">{selectedContributor.description}</p>
                        </div>

                        {/* Importance */}
                        <div>
                            <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">Importance</h4>
                            <div className="bg-[#F2EDE8] p-4 rounded-xl border border-[rgba(0,0,0,0.06)]">
                                <p className="text-sm text-[#2D2A26]">{selectedContributor.importance}</p>
                            </div>
                        </div>

                        {/* Tips */}
                        {selectedContributor.tips && selectedContributor.tips.length > 0 && (
                            <div>
                                <h4 className="text-xs text-text-muted uppercase tracking-wider mb-3">Tips to Improve</h4>
                                <div className="space-y-2">
                                    {selectedContributor.tips.map((tip, idx) => (
                                        <div key={idx} className="flex gap-3 bg-[#F2EDE8] p-3 rounded-lg border border-[rgba(0,0,0,0.06)]">
                                            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[#6B9E8A]/20 text-[#6B9E8A] flex items-center justify-center text-xs font-bold">
                                                {idx + 1}
                                            </div>
                                            <p className="text-sm text-[#7A756E]">{tip}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Related Metrics */}
                        {selectedContributor.relatedMetrics && selectedContributor.relatedMetrics.length > 0 && (
                            <div>
                                <h4 className="text-xs text-text-muted uppercase tracking-wider mb-3">Related Metrics</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedContributor.relatedMetrics.map((metric, idx) => (
                                        <span
                                            key={idx}
                                            className="px-3 py-1.5 bg-[#F2EDE8] border border-[rgba(0,0,0,0.06)] rounded-lg text-sm text-[#7A756E]"
                                        >
                                            {metric}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <IOSButton
                            onClick={() => setSelectedContributor(null)}
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

export default ContributorsBreakdown;

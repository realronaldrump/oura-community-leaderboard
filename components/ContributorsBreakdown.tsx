import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { IOSButton, IOSModal } from './ios';

interface ContributorItem {
    label: string;
    value: number | null | undefined;
    color: string;
    key?: string;
    description?: string;
}

interface Props {
    title: string;
    contributors: ContributorItem[];
    onContributorClick?: (contributor: ContributorItem) => void;
}

type ContributorDetail = {
    label: string;
    description: string;
};

const CONTRIBUTOR_DETAILS: Record<string, ContributorDetail> = {
    previous_night: {
        label: 'Previous Night',
        description: 'How last night’s sleep contributed to today’s readiness score.',
    },
    sleep_balance: {
        label: 'Sleep Balance',
        description: 'How recent sleep amount compares with your longer-term sleep needs.',
    },
    hrv_balance: {
        label: 'HRV Balance',
        description: 'How recent nighttime HRV compares with your personal baseline.',
    },
    resting_heart_rate: {
        label: 'Resting Heart Rate',
        description: 'How last night’s resting heart rate compared with your personal baseline.',
    },
    recovery_index: {
        label: 'Recovery Index',
        description: 'How quickly your resting heart rate settled during the night.',
    },
    body_temperature: {
        label: 'Body Temperature',
        description: 'How overnight temperature deviation compared with your personal baseline.',
    },
    activity_balance: {
        label: 'Activity Balance',
        description: 'How recent activity load and recovery contributed to readiness.',
    },
    previous_day_activity: {
        label: 'Previous Day Activity',
        description: 'How yesterday’s activity contributed to today’s readiness score.',
    },
    total_sleep: {
        label: 'Total Sleep',
        description: 'How total sleep duration contributed to the sleep score.',
    },
    efficiency: {
        label: 'Efficiency',
        description: 'The share of time in bed that was spent asleep.',
    },
    restfulness: {
        label: 'Restfulness',
        description: 'How interruptions and movement contributed to the sleep score.',
    },
    rem_sleep: {
        label: 'REM Sleep',
        description: 'How REM sleep duration contributed to the sleep score.',
    },
    deep_sleep: {
        label: 'Deep Sleep',
        description: 'How deep sleep duration contributed to the sleep score.',
    },
    latency: {
        label: 'Latency',
        description: 'How the time it took to fall asleep contributed to the sleep score.',
    },
    timing: {
        label: 'Timing',
        description: 'How sleep timing aligned with your estimated sleep window.',
    },
    meet_daily_targets: {
        label: 'Meet Daily Targets',
        description: 'How often recent daily activity targets were met.',
    },
    move_every_hour: {
        label: 'Move Every Hour',
        description: 'How often you avoided long inactive periods.',
    },
    recovery_time: {
        label: 'Recovery Time',
        description: 'How much recovery time followed recent activity.',
    },
    stay_active: {
        label: 'Stay Active',
        description: 'How total daily movement contributed to the activity score.',
    },
    training_frequency: {
        label: 'Training Frequency',
        description: 'How often training sessions occurred in the recent period.',
    },
    training_volume: {
        label: 'Training Volume',
        description: 'How recent training load compared with your usual pattern.',
    },
};

const ContributorsBreakdown: React.FC<Props> = ({ title, contributors, onContributorClick }) => {
    const [selectedContributor, setSelectedContributor] = useState<ContributorDetail | null>(null);

    const handleContributorClick = (contributor: ContributorItem) => {
        if (contributor.key) {
            setSelectedContributor(CONTRIBUTOR_DETAILS[contributor.key] ?? null);
        }
        onContributorClick?.(contributor);
    };

    return (
        <>
            <div className="ui-card ui-card--default p-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
                <p className="mb-6 text-xs text-text-muted">Select a contributor to see what it measures.</p>
                <div className="space-y-4">
                    {contributors.map((item, index) => {
                        const hasDetails = Boolean(item.key && CONTRIBUTOR_DETAILS[item.key]);
                        return (
                            <button
                                key={`${item.key ?? item.label}-${index}`}
                                type="button"
                                onClick={() => handleContributorClick(item)}
                                className="group block min-h-11 w-full space-y-2 rounded-lg p-2 text-left transition-colors hover:bg-black/5 disabled:cursor-default"
                                aria-label={`${item.label}: ${item.value ?? 'not available'}${hasDetails ? '. View contributor definition.' : ''}`}
                                disabled={!hasDetails && !onContributorClick}
                            >
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <span className="text-text-secondary transition-colors group-hover:text-text-primary">{item.label}</span>
                                        {hasDetails ? <Info className="h-3 w-3 text-text-muted" aria-hidden="true" /> : null}
                                    </div>
                                    <span className="font-mono font-medium text-text-primary">{item.value ?? '—'}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-black/5 shadow-pressed" aria-hidden="true">
                                    <div
                                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                                        style={{
                                            width: `${item.value ?? 0}%`,
                                            backgroundColor: item.color,
                                        }}
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <IOSModal
                isOpen={Boolean(selectedContributor)}
                onClose={() => setSelectedContributor(null)}
                title={selectedContributor?.label ?? 'Contributor'}
            >
                {selectedContributor ? (
                    <div className="space-y-5">
                        <div className="rounded-xl border border-line bg-canvas p-4">
                            <p className="text-sm leading-6 text-ink-secondary">{selectedContributor.description}</p>
                        </div>
                        <p className="text-xs leading-5 text-ink-muted">
                            This is an Oura contributor score, not a diagnosis or a universal target.
                        </p>
                        <IOSButton
                            onClick={() => setSelectedContributor(null)}
                            className="w-full"
                            variant="secondary"
                        >
                            Close
                        </IOSButton>
                    </div>
                ) : null}
            </IOSModal>
        </>
    );
};

export default ContributorsBreakdown;

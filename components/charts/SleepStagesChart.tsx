import React from 'react';
import type { SleepSession } from '../../types';

type StageKey = 'deep_sleep_duration' | 'rem_sleep_duration' | 'light_sleep_duration' | 'awake_time';

const STAGES: Array<{ key: StageKey; label: string; color: string }> = [
    { key: 'deep_sleep_duration', label: 'Deep', color: 'var(--color-stage-deep)' },
    { key: 'rem_sleep_duration', label: 'REM', color: 'var(--color-stage-rem)' },
    { key: 'light_sleep_duration', label: 'Light', color: 'var(--color-stage-light)' },
    { key: 'awake_time', label: 'Awake', color: 'var(--color-stage-awake)' },
];

const formatDuration = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

/** Time in each sleep stage for one night, as a proportional bar with a legend. */
const SleepStagesChart: React.FC<{ data: SleepSession[] }> = ({ data }) => {
    const session = data.at(-1);
    const stages = STAGES.map((stage) => ({ ...stage, seconds: Math.max(0, session?.[stage.key] ?? 0) }));
    const total = stages.reduce((sum, stage) => sum + stage.seconds, 0);
    if (!session || total === 0) return <p className="empty-note">No sleep stages recorded.</p>;

    return (
        <div className="sleep-stages">
            <div
                className="stage-bar"
                role="img"
                aria-label={`Sleep stages: ${stages.map((stage) => `${stage.label} ${formatDuration(stage.seconds)}`).join(', ')}`}
            >
                {stages.map((stage) => stage.seconds > 0 && (
                    <span key={stage.key} style={{ flexGrow: stage.seconds, background: stage.color }} />
                ))}
            </div>
            <dl className="stage-legend">
                {stages.map((stage) => (
                    <div key={stage.key}>
                        <i style={{ background: stage.color }} aria-hidden="true" />
                        <dt>{stage.label}</dt>
                        <dd>
                            {formatDuration(stage.seconds)}
                            <small>{Math.round((stage.seconds / total) * 100)}%</small>
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
};

export default SleepStagesChart;

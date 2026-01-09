import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { WhatIfScenario, WhatIfResult } from '../../types/analyticsTypes';
import { simulateWhatIf } from '../../services/analyticsService';

interface WhatIfSimulatorProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const SCENARIO_OPTIONS = [
    {
        metric: 'deep_sleep',
        label: 'Deep Sleep',
        unit: 'minutes',
        min: -60,
        max: 60,
        step: 15,
        icon: '🛏️'
    },
    {
        metric: 'steps',
        label: 'Daily Steps',
        unit: 'steps',
        min: -5000,
        max: 5000,
        step: 1000,
        icon: '🏃'
    },
    {
        metric: 'hrv',
        label: 'HRV',
        unit: 'ms',
        min: -20,
        max: 20,
        step: 5,
        icon: '💓'
    },
    {
        metric: 'sleep_duration',
        label: 'Total Sleep',
        unit: 'minutes',
        min: -90,
        max: 90,
        step: 15,
        icon: '💤'
    }
];

const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ profiles, usersData }) => {
    const [selectedMetric, setSelectedMetric] = useState(SCENARIO_OPTIONS[0]);
    const [adjustment, setAdjustment] = useState(30);

    const results = useMemo((): WhatIfResult[] => {
        const scenario: WhatIfScenario = {
            metric: selectedMetric.metric,
            currentAverage: 0, // Will be calculated per user
            adjustment,
            unit: selectedMetric.unit
        };

        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return [];

        return simulateWhatIf(scenario, usersDataFormatted);
    }, [profiles, usersData, selectedMetric, adjustment]);

    const maxImpact = Math.max(...results.map(r => Math.abs(r.projectedChange)), 1);

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="text-4xl mb-4">🔮</div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Data Available</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Sync your data to run what-if simulations.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="section-header mb-0">What-If Simulator</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Explore how changes might affect your readiness score
                </p>
            </div>

            {/* Scenario Builder */}
            <div className="card p-6">
                <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                    {/* Metric Selection */}
                    <div className="flex-shrink-0">
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            Metric to Change
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {SCENARIO_OPTIONS.map(option => (
                                <button
                                    key={option.metric}
                                    onClick={() => {
                                        setSelectedMetric(option);
                                        setAdjustment(option.step * 2);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${selectedMetric.metric === option.metric
                                            ? 'bg-[var(--accent)] text-black'
                                            : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <span>{option.icon}</span>
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Slider */}
                    <div className="flex-1 w-full lg:w-auto">
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            Adjustment
                        </label>
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-[var(--text-muted)] w-16 text-right">
                                {selectedMetric.min > 0 ? '+' : ''}{selectedMetric.min}
                            </span>
                            <input
                                type="range"
                                min={selectedMetric.min}
                                max={selectedMetric.max}
                                step={selectedMetric.step}
                                value={adjustment}
                                onChange={(e) => setAdjustment(Number(e.target.value))}
                                className="flex-1 h-2 bg-[var(--bg-elevated)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                            />
                            <span className="text-sm text-[var(--text-muted)] w-16">
                                +{selectedMetric.max}
                            </span>
                        </div>
                    </div>

                    {/* Current Value Display */}
                    <div className="flex-shrink-0 text-center">
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            Change
                        </label>
                        <div className={`text-3xl font-bold font-mono ${adjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {adjustment >= 0 ? '+' : ''}{adjustment}
                            <span className="text-sm font-normal text-[var(--text-muted)]"> {selectedMetric.unit}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Question Display */}
            <div className="card p-6 bg-[var(--accent)]/5 border-[var(--accent)]/20">
                <div className="flex items-center gap-4">
                    <span className="text-3xl">🤔</span>
                    <p className="text-lg text-[var(--text-primary)]">
                        If I {adjustment >= 0 ? 'increased' : 'decreased'} my {selectedMetric.label.toLowerCase()} by{' '}
                        <span className="font-bold text-[var(--accent)]">{Math.abs(adjustment)} {selectedMetric.unit}</span>,
                        how might my readiness change?
                    </p>
                </div>
            </div>

            {/* Results */}
            {results.length > 0 ? (
                <div className="space-y-4">
                    <h4 className="section-header">Projected Impact</h4>

                    {results.map((result, idx) => (
                        <div key={result.userId} className="card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                                        style={{
                                            backgroundColor: idx === 0 ? 'var(--accent)' : 'var(--bg-elevated)',
                                            color: idx === 0 ? 'black' : 'var(--text-primary)'
                                        }}
                                    >
                                        {result.userName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-[var(--text-primary)]">
                                            {result.userName}
                                        </h5>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            Current readiness baseline: {result.currentBaseline.toFixed(1)}
                                        </p>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className={`text-2xl font-bold font-mono ${result.projectedChange >= 0 ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                        {result.projectedChange >= 0 ? '+' : ''}{result.projectedChange.toFixed(1)}
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        ±{result.confidence.toFixed(1)} confidence
                                    </p>
                                </div>
                            </div>

                            {/* Impact Bar */}
                            <div className="relative h-8 bg-[var(--bg-base)] rounded-lg overflow-hidden">
                                <div className="absolute left-1/2 w-px h-full bg-[var(--border-default)]" />
                                <div
                                    className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full ${result.projectedChange >= 0 ? 'bg-green-500' : 'bg-red-500'
                                        }`}
                                    style={{
                                        width: `${Math.min(45, (Math.abs(result.projectedChange) / maxImpact) * 45)}%`,
                                        left: result.projectedChange >= 0 ? '50%' : 'auto',
                                        right: result.projectedChange < 0 ? '50%' : 'auto'
                                    }}
                                />

                                {/* Confidence range */}
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 h-2 bg-white/20 rounded-full"
                                    style={{
                                        width: `${Math.min(45, (result.confidence / maxImpact) * 45)}%`,
                                        left: result.projectedChange >= 0
                                            ? `${50 + Math.min(45, (Math.abs(result.projectedChange) / maxImpact) * 45)}%`
                                            : 'auto',
                                        right: result.projectedChange < 0
                                            ? `${50 + Math.min(45, (Math.abs(result.projectedChange) / maxImpact) * 45)}%`
                                            : 'auto'
                                    }}
                                />
                            </div>

                            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2">
                                <span>-{maxImpact.toFixed(0)} points</span>
                                <span>No change</span>
                                <span>+{maxImpact.toFixed(0)} points</span>
                            </div>

                            <p className="text-xs text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                Based on {result.basedOnDays} days of historical data
                            </p>
                        </div>
                    ))}

                    {/* Comparison Note */}
                    {results.length > 1 && results[0].projectedChange !== results[1].projectedChange && (
                        <div className="card p-4 bg-[var(--bg-elevated)]">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">💡</span>
                                <p className="text-sm text-[var(--text-secondary)]">
                                    {results[0].projectedChange > results[1].projectedChange
                                        ? `This change would benefit ${results[0].userName} more than ${results[1].userName}, likely due to their different baselines.`
                                        : `This change would benefit ${results[1].userName} more than ${results[0].userName}, likely due to their different baselines.`
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)]">
                        Not enough historical data to make projections. Keep tracking for at least 2 weeks!
                    </p>
                </div>
            )}

            {/* Methodology Note */}
            <div className="text-xs text-[var(--text-muted)] text-center p-4">
                <p>
                    📊 Projections are based on linear regression of your historical {selectedMetric.label.toLowerCase()} vs next-day readiness.
                    Results show correlation, not causation. Individual responses may vary.
                </p>
            </div>
        </div>
    );
};

export default WhatIfSimulator;

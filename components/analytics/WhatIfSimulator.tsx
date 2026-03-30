import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { WhatIfResult, WhatIfScenario, WhatIfTargetScore } from '../../types/analyticsTypes';
import { simulateWhatIf } from '../../services/analyticsService';
import { Sparkles, BedDouble, Footprints, Heart, Moon, Lightbulb } from 'lucide-react';
import { getProfileDisplayName } from '../../utils/profileName';

interface WhatIfSimulatorProps {
    profiles: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

type SimulatorMode = 'simple' | 'advanced';
type TimeWindowOption = 30 | 90 | 180 | 'all';

type MetricOption = {
    metric: 'deep_sleep' | 'steps' | 'hrv' | 'sleep_duration';
    label: string;
    unit: 'min' | 'steps' | 'ms';
    min: number;
    max: number;
    step: number;
    defaultAdjustment: number;
    Icon: React.ComponentType<{ className?: string }>;
    color: string;
};

const SCENARIO_OPTIONS: MetricOption[] = [
    {
        metric: 'deep_sleep',
        label: 'Deep Sleep',
        unit: 'min',
        min: -60,
        max: 60,
        step: 15,
        defaultAdjustment: 30,
        Icon: BedDouble,
        color: 'text-[#7BA8D4]'
    },
    {
        metric: 'steps',
        label: 'Daily Steps',
        unit: 'steps',
        min: -5000,
        max: 5000,
        step: 1000,
        defaultAdjustment: 2000,
        Icon: Footprints,
        color: 'text-[#7BC4A0]'
    },
    {
        metric: 'hrv',
        label: 'HRV',
        unit: 'ms',
        min: -20,
        max: 20,
        step: 5,
        defaultAdjustment: 5,
        Icon: Heart,
        color: 'text-[#D4897B]'
    },
    {
        metric: 'sleep_duration',
        label: 'Total Sleep',
        unit: 'min',
        min: -90,
        max: 90,
        step: 15,
        defaultAdjustment: 30,
        Icon: Moon,
        color: 'text-[#A08BBE]'
    }
];

const TARGET_SCORE_OPTIONS: Array<{ key: WhatIfTargetScore; label: string }> = [
    { key: 'readiness', label: 'Readiness' },
    { key: 'sleep', label: 'Sleep' },
    { key: 'activity', label: 'Activity' }
];

const LOOKBACK_OPTIONS: Array<{ key: TimeWindowOption; label: string }> = [
    { key: 30, label: '30D' },
    { key: 90, label: '90D' },
    { key: 180, label: '180D' },
    { key: 'all', label: 'All' }
];

const OUTLIER_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: 'No trim' },
    { value: 0.05, label: '5% trim' },
    { value: 0.1, label: '10% trim' }
];

const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_OUTLIER_TRIM = 0.05;

const RELIABILITY_UI: Record<'high' | 'medium' | 'low', { label: string; badge: string; hint: string }> = {
    high: {
        label: 'High confidence',
        badge: 'bg-[#7BC4A0]/20 text-[#7BC4A0] border border-[#7BC4A0]/40',
        hint: 'This model has enough consistent history to trust as a strong directional signal.'
    },
    medium: {
        label: 'Medium confidence',
        badge: 'bg-[#D4B87B]/20 text-[#D4B87B] border border-[#D4B87B]/40',
        hint: 'Useful signal, but expect normal day-to-day variation around the estimate.'
    },
    low: {
        label: 'Low confidence',
        badge: 'bg-[#D4897B]/20 text-[#D4897B] border border-[#D4897B]/40',
        hint: 'Treat as exploratory. Use this for experimentation, not firm planning.'
    }
};

const formatSigned = (value: number, decimals = 1): string =>
    `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`;

const formatAdjustment = (value: number, unit: string): string => {
    if (unit === 'steps') return `${value >= 0 ? '+' : ''}${value.toLocaleString()} ${unit}`;
    return `${value >= 0 ? '+' : ''}${value.toFixed(0)} ${unit}`;
};

const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ profiles, usersData }) => {
    const [mode, setMode] = useState<SimulatorMode>('simple');
    const [selectedMetric, setSelectedMetric] = useState<MetricOption>(SCENARIO_OPTIONS[0]);
    const [selectedTargetScore, setSelectedTargetScore] = useState<WhatIfTargetScore>('readiness');
    const [adjustment, setAdjustment] = useState(SCENARIO_OPTIONS[0].defaultAdjustment);
    const [lookbackDays, setLookbackDays] = useState<TimeWindowOption>(DEFAULT_LOOKBACK_DAYS);
    const [outlierTrimPercent, setOutlierTrimPercent] = useState(DEFAULT_OUTLIER_TRIM);
    const [hideLowReliability, setHideLowReliability] = useState(false);

    const selectedTargetLabel = TARGET_SCORE_OPTIONS.find(option => option.key === selectedTargetScore)?.label || 'Readiness';

    const results = useMemo((): WhatIfResult[] => {
        const scenario: WhatIfScenario = {
            metric: selectedMetric.metric,
            adjustment,
            unit: selectedMetric.unit,
            targetScore: selectedTargetScore,
            lookbackDays: mode === 'advanced' ? lookbackDays : DEFAULT_LOOKBACK_DAYS,
            outlierTrimPercent: mode === 'advanced' ? outlierTrimPercent : DEFAULT_OUTLIER_TRIM
        };

        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: getProfileDisplayName(profile),
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return [];
        return simulateWhatIf(scenario, usersDataFormatted);
    }, [profiles, usersData, selectedMetric, selectedTargetScore, adjustment, mode, lookbackDays, outlierTrimPercent]);

    const visibleResults = useMemo(() => {
        if (mode === 'advanced' && hideLowReliability) {
            return results.filter(result => result.reliability !== 'low');
        }
        return results;
    }, [results, mode, hideLowReliability]);

    const summary = useMemo(() => {
        if (visibleResults.length === 0) return null;
        const averageChange = visibleResults.reduce((sum, result) => sum + result.projectedChange, 0) / visibleResults.length;
        const reliableCount = visibleResults.filter(result => result.reliability !== 'low').length;
        const topResponder = visibleResults[0];
        return { averageChange, reliableCount, topResponder, total: visibleResults.length };
    }, [visibleResults]);

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <Sparkles className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Data Available</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Sync your data to run what-if simulations.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                    <h3 className="section-header mb-0">What-If Simulator</h3>
                    <div className="inline-flex rounded-xl p-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <button
                            onClick={() => setMode('simple')}
                            className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition-all ${mode === 'simple'
                                ? 'bg-[var(--accent)] text-black'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            Simple
                        </button>
                        <button
                            onClick={() => setMode('advanced')}
                            className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition-all ${mode === 'advanced'
                                ? 'bg-[var(--accent)] text-black'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            Advanced
                        </button>
                    </div>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                    {mode === 'simple'
                        ? 'Pick one behavior change and see the likely next-day impact.'
                        : 'Tune model settings while keeping the same clear forecast cards.'}
                </p>
            </div>

            <div className="card p-5 sm:p-6 space-y-5">
                <div>
                    <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                        Change This Habit
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        {SCENARIO_OPTIONS.map(option => {
                            const Icon = option.Icon;
                            const isActive = selectedMetric.metric === option.metric;
                            return (
                                <button
                                    key={option.metric}
                                    onClick={() => {
                                        setSelectedMetric(option);
                                        setAdjustment(option.defaultAdjustment);
                                    }}
                                    className={`px-4 min-h-[44px] rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${isActive
                                        ? 'bg-[var(--accent)] text-black'
                                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    <Icon className={`w-4 h-4 ${isActive ? '' : option.color}`} />
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                        Predict This Score
                    </label>
                    <div className="inline-flex rounded-xl p-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        {TARGET_SCORE_OPTIONS.map((option) => (
                            <button
                                key={option.key}
                                onClick={() => setSelectedTargetScore(option.key)}
                                className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition-all ${selectedTargetScore === option.key
                                    ? 'bg-[var(--accent)] text-black'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                            Change Amount
                        </label>
                        <p className={`text-lg font-bold font-mono ${adjustment >= 0 ? 'text-[#7BC4A0]' : 'text-[#D4897B]'}`}>
                            {formatAdjustment(adjustment, selectedMetric.unit)}
                        </p>
                    </div>
                    <input
                        type="range"
                        min={selectedMetric.min}
                        max={selectedMetric.max}
                        step={selectedMetric.step}
                        value={adjustment}
                        onChange={(e) => setAdjustment(Number(e.target.value))}
                        className="w-full h-2 bg-[var(--bg-elevated)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                    />
                    <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2">
                        <span>{selectedMetric.min}</span>
                        <span>No change</span>
                        <span>+{selectedMetric.max}</span>
                    </div>
                </div>

                {mode === 'advanced' && (
                    <div className="pt-2 border-t border-[var(--border-subtle)] space-y-4">
                        <div>
                            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                                Model Window
                            </label>
                            <div className="inline-flex rounded-xl p-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                                {LOOKBACK_OPTIONS.map((option) => (
                                    <button
                                        key={String(option.key)}
                                        onClick={() => setLookbackDays(option.key)}
                                        className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition-all ${lookbackDays === option.key
                                            ? 'bg-[var(--accent)] text-black'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                                Outlier Handling
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                {OUTLIER_OPTIONS.map((option) => (
                                    <button
                                        key={option.label}
                                        onClick={() => setOutlierTrimPercent(option.value)}
                                        className={`px-3 min-h-[44px] rounded-lg text-xs font-medium border transition-all ${outlierTrimPercent === option.value
                                            ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
                                            : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <input
                                type="checkbox"
                                checked={hideLowReliability}
                                onChange={(e) => setHideLowReliability(e.target.checked)}
                                className="rounded border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]"
                            />
                            Hide low-confidence models
                        </label>
                    </div>
                )}
            </div>

            <div className="card p-5 sm:p-6 bg-[var(--accent)]/5 border-[var(--accent)]/20">
                <p className="text-base sm:text-lg leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    If I {adjustment >= 0 ? 'increase' : 'decrease'} my{' '}
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedMetric.label.toLowerCase()}</span> by{' '}
                    <span className="font-bold text-[var(--accent)]">{formatAdjustment(Math.abs(adjustment), selectedMetric.unit)}</span>,
                    what is the likely effect on next-day {selectedTargetLabel.toLowerCase()} score?
                </p>
            </div>

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Average Impact</p>
                        <p className={`text-2xl font-mono font-bold mt-1 ${summary.averageChange >= 0 ? 'text-[#7BC4A0]' : 'text-[#D4897B]'}`}>
                            {formatSigned(summary.averageChange)}
                        </p>
                    </div>
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Top Responder</p>
                        <p className="text-lg font-semibold text-[var(--text-primary)] mt-1">{summary.topResponder.userName}</p>
                        <p className={`text-sm font-mono ${summary.topResponder.projectedChange >= 0 ? 'text-[#7BC4A0]' : 'text-[#D4897B]'}`}>
                            {formatSigned(summary.topResponder.projectedChange)}
                        </p>
                    </div>
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Usable Models</p>
                        {summary.reliableCount > 0 ? (
                            <>
                                <p className="text-2xl font-mono font-bold text-[var(--text-primary)] mt-1">
                                    {summary.reliableCount}/{summary.total}
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">medium/high confidence</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-[var(--text-muted)] mt-1 leading-relaxed">
                                    Insufficient data to build prediction models — sync more days of data to improve estimates.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {visibleResults.length > 0 ? (
                <div className="space-y-3">
                    {visibleResults.map((result) => {
                        const reliability = RELIABILITY_UI[result.reliability];
                        return (
                            <div key={result.userId} className="card p-4 sm:p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h5 className="font-semibold text-[var(--text-primary)]">{result.userName}</h5>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                            Likely range: {formatSigned(result.confidenceLow)} to {formatSigned(result.confidenceHigh)} points
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-2xl font-bold font-mono ${result.projectedChange >= 0 ? 'text-[#7BC4A0]' : 'text-[#D4897B]'}`}>
                                            {formatSigned(result.projectedChange)}
                                        </p>
                                        <span className={`inline-block mt-1 text-xs px-2 py-1 rounded-full font-medium ${reliability.badge}`}>
                                            {reliability.label}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-sm text-[var(--text-secondary)] mt-3">
                                    {reliability.hint}
                                </p>

                                {result.notes.length > 0 && (
                                    <p className="text-xs text-[var(--text-muted)] mt-2">
                                        {result.notes[0]}
                                    </p>
                                )}

                                <details className="mt-3">
                                    <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                        Show technical details
                                    </summary>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                                        <div className="bg-[var(--bg-elevated)] rounded-lg px-2.5 py-2">
                                            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Sample</p>
                                            <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{result.basedOnDays}d</p>
                                        </div>
                                        <div className="bg-[var(--bg-elevated)] rounded-lg px-2.5 py-2">
                                            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">R²</p>
                                            <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{(result.rSquared * 100).toFixed(0)}%</p>
                                        </div>
                                        <div className="bg-[var(--bg-elevated)] rounded-lg px-2.5 py-2">
                                            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Correlation</p>
                                            <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{formatSigned(result.correlation, 2)}</p>
                                        </div>
                                        <div className="bg-[var(--bg-elevated)] rounded-lg px-2.5 py-2">
                                            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Projected</p>
                                            <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{result.projectedScore.toFixed(1)}</p>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)]">
                        {results.length === 0
                            ? 'Not enough matched history to model this scenario yet. Keep tracking for at least 2 weeks.'
                            : 'No models match your current Advanced filters. Try showing low-confidence models or widening the model window.'}
                    </p>
                </div>
            )}

            {visibleResults.length > 1 && (
                <div className="card p-4 bg-[var(--bg-elevated)]">
                    <div className="flex items-start gap-3">
                        <Lightbulb className="w-5 h-5 text-[#D4B87B] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--text-secondary)]">
                            Focus on changes that are both positive and medium/high confidence, then validate over the next week.
                        </p>
                    </div>
                </div>
            )}

            <p className="text-xs text-[var(--text-muted)] text-center">
                Predictions use historical patterns in your data. They help guide experiments, not guarantee outcomes.
            </p>
        </div>
    );
};

export default WhatIfSimulator;

import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { WhatIfResult, WhatIfScenario } from '../../types/analyticsTypes';
import { simulateWhatIf } from '../../services/analyticsService';
import {
    Sparkles,
    BedDouble,
    Footprints,
    Heart,
    Moon,
    HelpCircle,
    Lightbulb,
    BarChart3,
    SlidersHorizontal,
    ShieldCheck,
    AlertTriangle
} from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface WhatIfSimulatorProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

type TimeWindowOption = 30 | 90 | 180 | 'all';

const SCENARIO_OPTIONS = [
    {
        metric: 'deep_sleep',
        label: 'Deep Sleep',
        unit: 'min',
        min: -60,
        max: 60,
        step: 15,
        defaultAdjustment: 30,
        Icon: BedDouble,
        color: 'text-blue-400'
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
        color: 'text-green-400'
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
        color: 'text-red-400'
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
        color: 'text-purple-400'
    }
] as const;

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

const reliabilityStyles = {
    high: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    medium: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
    low: 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
} as const;

const formatSigned = (value: number, decimals = 1): string =>
    `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}`;

const formatAdjustment = (value: number, unit: string): string => {
    if (unit === 'steps') return `${value >= 0 ? '+' : ''}${value.toLocaleString()} ${unit}`;
    return `${value >= 0 ? '+' : ''}${value.toFixed(0)} ${unit}`;
};

const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ profiles, usersData }) => {
    const [selectedMetric, setSelectedMetric] = useState(SCENARIO_OPTIONS[0]);
    const [adjustment, setAdjustment] = useState(SCENARIO_OPTIONS[0].defaultAdjustment);
    const [lookbackDays, setLookbackDays] = useState<TimeWindowOption>(90);
    const [outlierTrimPercent, setOutlierTrimPercent] = useState(0.05);
    const [hideLowReliability, setHideLowReliability] = useState(false);

    const results = useMemo((): WhatIfResult[] => {
        const scenario: WhatIfScenario = {
            metric: selectedMetric.metric,
            adjustment,
            unit: selectedMetric.unit,
            lookbackDays,
            outlierTrimPercent
        };

        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return [];

        return simulateWhatIf(scenario, usersDataFormatted);
    }, [profiles, usersData, selectedMetric, adjustment, lookbackDays, outlierTrimPercent]);

    const visibleResults = useMemo(() => (
        hideLowReliability
            ? results.filter(result => result.reliability !== 'low')
            : results
    ), [results, hideLowReliability]);

    const maxRange = useMemo(() => (
        Math.max(
            ...results.map((result) =>
                Math.max(
                    Math.abs(result.projectedChange),
                    Math.abs(result.confidenceLow),
                    Math.abs(result.confidenceHigh)
                )
            ),
            1
        )
    ), [results]);

    const summary = useMemo(() => {
        if (results.length === 0) return null;
        const averageChange = results.reduce((sum, result) => sum + result.projectedChange, 0) / results.length;
        const averageRSquared = results.reduce((sum, result) => sum + result.rSquared, 0) / results.length;
        const highConfidenceCount = results.filter(r => r.reliability === 'high').length;
        const topResponder = [...results].sort((a, b) => b.projectedChange - a.projectedChange)[0];

        return {
            averageChange,
            averageRSquared,
            highConfidenceCount,
            topResponder
        };
    }, [results]);

    const toScalePercent = (value: number): number => {
        const pct = 50 + ((value / maxRange) * 44);
        return Math.max(3, Math.min(97, pct));
    };

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
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="section-header mb-0">What-If Simulator</h3>
                    <InfoTooltip
                        title="What-If Simulation"
                        description="Project how changing one behavior metric could influence next-day readiness, per user."
                        calculation="Uses linear regression on matched day pairs (metric day -> next-day readiness), trims outliers, and shows a 95% confidence band for projected change."
                    />
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                    Better for directional decisions than exact predictions. Reliability badges show model trust level.
                </p>
            </div>

            <div className="card p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <SlidersHorizontal className="w-4 h-4" />
                    Scenario Builder
                </div>

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

                <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6">
                    <div>
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            Adjustment
                        </label>
                        <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4">
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-[var(--text-muted)] w-14 text-right">
                                    {selectedMetric.min}
                                </span>
                                <input
                                    type="range"
                                    min={selectedMetric.min}
                                    max={selectedMetric.max}
                                    step={selectedMetric.step}
                                    value={adjustment}
                                    onChange={(e) => setAdjustment(Number(e.target.value))}
                                    className="flex-1 h-2 bg-[var(--bg-base)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                                />
                                <span className="text-xs text-[var(--text-muted)] w-14">
                                    +{selectedMetric.max}
                                </span>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                                <p className={`text-xl font-bold font-mono ${adjustment >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatAdjustment(adjustment, selectedMetric.unit)}
                                </p>
                                <div className="flex gap-2">
                                    {[-2, -1, 1, 2].map(multiplier => (
                                        <button
                                            key={multiplier}
                                            onClick={() => setAdjustment(multiplier * selectedMetric.step)}
                                            className="px-2.5 min-h-[44px] rounded-lg text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >
                                            {multiplier > 0 ? '+' : ''}{multiplier * selectedMetric.step}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
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
                            Hide low-reliability models
                        </label>
                    </div>
                </div>
            </div>

            <div className="card p-5 sm:p-6 bg-[var(--accent)]/5 border-[var(--accent)]/20">
                <div className="flex items-start gap-4">
                    <HelpCircle className="w-7 h-7 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                    <p className="text-base sm:text-lg text-[var(--text-primary)] leading-relaxed">
                        If I {adjustment >= 0 ? 'increase' : 'decrease'} my{' '}
                        <span className="font-semibold">{selectedMetric.label.toLowerCase()}</span> by{' '}
                        <span className="font-bold text-[var(--accent)]">{formatAdjustment(Math.abs(adjustment), selectedMetric.unit)}</span>,
                        what is the likely effect on next-day readiness?
                    </p>
                </div>
            </div>

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Community Mean Impact</p>
                        <p className={`text-2xl font-mono font-bold mt-1 ${summary.averageChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatSigned(summary.averageChange)}
                        </p>
                    </div>
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Top Responder</p>
                        <p className="text-lg font-semibold text-[var(--text-primary)] mt-1">{summary.topResponder.userName}</p>
                        <p className={`text-sm font-mono ${summary.topResponder.projectedChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatSigned(summary.topResponder.projectedChange)}
                        </p>
                    </div>
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Average Model Fit</p>
                        <p className="text-2xl font-mono font-bold text-[var(--text-primary)] mt-1">
                            {(summary.averageRSquared * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">R² across users</p>
                    </div>
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">High Reliability</p>
                        <p className="text-2xl font-mono font-bold text-emerald-300 mt-1">
                            {summary.highConfidenceCount}/{results.length}
                        </p>
                    </div>
                </div>
            )}

            {visibleResults.length > 0 ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <h4 className="section-header mb-0">Projected Impact</h4>
                        <InfoTooltip
                            title="Interpreting Impact"
                            description="Each card shows projected readiness change, uncertainty range, and model reliability."
                            calculation="Solid marker = expected change. Translucent band = 95% confidence interval. Reliability is based on sample size, fit quality (R²), and interval width."
                        />
                    </div>

                    {visibleResults.map((result, idx) => {
                        const ciStart = toScalePercent(result.confidenceLow);
                        const ciEnd = toScalePercent(result.confidenceHigh);
                        const ciLeft = Math.min(ciStart, ciEnd);
                        const ciWidth = Math.max(Math.abs(ciEnd - ciStart), 1.5);
                        const markerPos = toScalePercent(result.projectedChange);

                        return (
                            <div key={result.userId} className="card p-4 sm:p-5">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold"
                                            style={{
                                                backgroundColor: idx === 0 ? 'var(--accent)' : 'var(--bg-elevated)',
                                                color: idx === 0 ? 'black' : 'var(--text-primary)'
                                            }}
                                        >
                                            {result.userName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h5 className="font-semibold text-[var(--text-primary)]">{result.userName}</h5>
                                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                                Baseline {result.currentBaseline.toFixed(1)} {'->'} Projected {result.projectedReadiness.toFixed(1)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 sm:justify-end">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${reliabilityStyles[result.reliability]}`}>
                                            {result.reliability.toUpperCase()} reliability
                                        </span>
                                        <div className={`text-2xl font-bold font-mono ${result.projectedChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {formatSigned(result.projectedChange)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <div className="relative h-10 rounded-lg bg-[var(--bg-base)] overflow-hidden">
                                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--border-default)]" />

                                        <div
                                            className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full bg-white/20"
                                            style={{ left: `${ciLeft}%`, width: `${ciWidth}%` }}
                                        />

                                        <div
                                            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white ${result.projectedChange >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                            style={{ left: `calc(${markerPos}% - 8px)` }}
                                        />
                                    </div>

                                    <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2">
                                        <span>-{maxRange.toFixed(1)}</span>
                                        <span>0</span>
                                        <span>+{maxRange.toFixed(1)}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                                    <div className="bg-[var(--bg-elevated)] rounded-lg p-2.5">
                                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Sample</p>
                                        <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{result.basedOnDays} days</p>
                                    </div>
                                    <div className="bg-[var(--bg-elevated)] rounded-lg p-2.5">
                                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">R²</p>
                                        <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{(result.rSquared * 100).toFixed(0)}%</p>
                                    </div>
                                    <div className="bg-[var(--bg-elevated)] rounded-lg p-2.5">
                                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Correlation</p>
                                        <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{formatSigned(result.correlation, 2)}</p>
                                    </div>
                                    <div className="bg-[var(--bg-elevated)] rounded-lg p-2.5">
                                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">95% CI</p>
                                        <p className="text-sm font-mono text-[var(--text-primary)] mt-1">
                                            [{formatSigned(result.confidenceLow)}, {formatSigned(result.confidenceHigh)}]
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-2">
                                    {result.notes.length > 0 && (
                                        <div className="space-y-1.5">
                                            {result.notes.map((note, noteIdx) => (
                                                <p key={noteIdx} className="text-xs text-[var(--text-muted)] flex items-start gap-1.5">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                                    {note}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    {result.notes.length === 0 && (
                                        <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            Strong signal with tight uncertainty for this scenario.
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)]">
                        {results.length === 0
                            ? 'Not enough matched history to model this scenario yet. Keep tracking for at least 2 weeks.'
                            : 'No models match the current reliability filter. Try disabling "Hide low-reliability models."'}
                    </p>
                </div>
            )}

            {results.length > 1 && (
                <div className="card p-4 bg-[var(--bg-elevated)]">
                    <div className="flex items-start gap-3">
                        <Lightbulb className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--text-secondary)]">
                            Individual response differs across users. Prioritize strategies where projected change is positive
                            and reliability is at least medium.
                        </p>
                    </div>
                </div>
            )}

            <div className="text-xs text-[var(--text-muted)] text-center p-4 flex items-center justify-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <p>
                    Projections are based on historical associations, not guaranteed causation. Use this to guide experiments, then validate with real outcomes.
                </p>
            </div>
        </div>
    );
};

export default WhatIfSimulator;

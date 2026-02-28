import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { CorrelationResult, MetricOption } from '../../types/analyticsTypes';
import { calculateCorrelation } from '../../services/analyticsService';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import html2canvas from 'html2canvas';
import { BarChart3, Image, Lightbulb } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface CorrelationExplorerProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const METRIC_OPTIONS = [
    { key: 'sleep_score', label: 'Sleep Score' },
    { key: 'readiness_score', label: 'Readiness Score' },
    { key: 'activity_score', label: 'Activity Score' },
    { key: 'steps', label: 'Steps' },
    { key: 'hrv', label: 'HRV' },
    { key: 'resting_hr', label: 'Resting HR' },
    { key: 'deep_sleep', label: 'Deep Sleep (min)' }
];

const CorrelationExplorer: React.FC<CorrelationExplorerProps> = ({ profiles, usersData }) => {
    const [xUser, setXUser] = useState(0);
    const [yUser, setYUser] = useState(profiles.length > 1 ? 1 : 0);
    const [xMetric, setXMetric] = useState('hrv');
    const [yMetric, setYMetric] = useState('readiness_score');
    const [isExporting, setIsExporting] = useState(false);

    const userOptions = profiles.map((p, idx) => ({
        idx,
        name: (p.email || 'User').split('@')[0]
    }));

    const correlation = useMemo((): CorrelationResult | null => {
        const xData = usersData[xUser]?.data;
        const yData = usersData[yUser]?.data;

        if (!xData || !yData) return null;

        const xMetricOption: MetricOption = {
            userId: profiles[xUser].id,
            userName: userOptions[xUser].name,
            metric: xMetric,
            label: METRIC_OPTIONS.find(m => m.key === xMetric)?.label || xMetric
        };

        const yMetricOption: MetricOption = {
            userId: profiles[yUser].id,
            userName: userOptions[yUser].name,
            metric: yMetric,
            label: METRIC_OPTIONS.find(m => m.key === yMetric)?.label || yMetric
        };

        return calculateCorrelation(xMetricOption, yMetricOption, xData, yData);
    }, [profiles, usersData, xUser, yUser, xMetric, yMetric, userOptions]);

    const handleExport = async () => {
        const element = document.getElementById('correlation-chart');
        if (!element) return;

        setIsExporting(true);
        try {
            const canvas = await html2canvas(element, {
                backgroundColor: '#0C0C0C',
                scale: 2
            });

            const link = document.createElement('a');
            link.download = `correlation-${xMetric}-vs-${yMetric}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };

    const getStrengthColor = (strength: string) => {
        switch (strength) {
            case 'strong': return 'text-green-400';
            case 'moderate': return 'text-yellow-400';
            case 'weak': return 'text-gray-400';
            default: return 'text-gray-500';
        }
    };

    const getCorrelationBadge = (coef: number) => {
        const absCoef = Math.abs(coef);
        if (absCoef >= 0.6) return { text: 'Strong', class: 'bg-green-500/20 text-green-400' };
        if (absCoef >= 0.3) return { text: 'Moderate', class: 'bg-yellow-500/20 text-yellow-400' };
        if (absCoef >= 0.1) return { text: 'Weak', class: 'bg-gray-500/20 text-gray-400' };
        return { text: 'None', class: 'bg-gray-700/20 text-gray-500' };
    };

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <BarChart3 className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Data Available</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Sync your data to explore correlations between metrics.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="section-header mb-0">Trend Correlation Explorer</h3>
                    <InfoTooltip
                        title="Correlation Analysis"
                        description="Explore statistical relationships between any two metrics. Find out which behaviors most impact your scores."
                        calculation="Uses Pearson correlation coefficient (r) ranging from -1 to +1. Positive values mean metrics move together; negative means they move opposite. Strength: |r| > 0.6 = strong, 0.3-0.6 = moderate, < 0.3 = weak."
                    />
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Discover how different metrics relate to each other
                </p>

                <button
                    onClick={handleExport}
                    disabled={isExporting || !correlation}
                    className="btn-secondary px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
                >
                    {isExporting ? (
                        <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Exporting...
                        </>
                    ) : (
                        <>
                            <Image className="w-4 h-4" />
                            Export PNG
                        </>
                    )}
                </button>
            </div>

            {/* Metric Selectors */}
            <div className="card p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* X-Axis */}
                    <div>
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            X-Axis
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={xUser}
                                onChange={(e) => setXUser(Number(e.target.value))}
                                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                            >
                                {userOptions.map(u => (
                                    <option key={u.idx} value={u.idx}>{u.name}</option>
                                ))}
                            </select>
                            <select
                                value={xMetric}
                                onChange={(e) => setXMetric(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                            >
                                {METRIC_OPTIONS.map(m => (
                                    <option key={m.key} value={m.key}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Y-Axis */}
                    <div>
                        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 block">
                            Y-Axis
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={yUser}
                                onChange={(e) => setYUser(Number(e.target.value))}
                                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                            >
                                {userOptions.map(u => (
                                    <option key={u.idx} value={u.idx}>{u.name}</option>
                                ))}
                            </select>
                            <select
                                value={yMetric}
                                onChange={(e) => setYMetric(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                            >
                                {METRIC_OPTIONS.map(m => (
                                    <option key={m.key} value={m.key}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart and Stats */}
            {correlation && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Chart */}
                    <div id="correlation-chart" className="lg:col-span-2 card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-medium text-[var(--text-primary)]">
                                {correlation.metricX.userName}'s {correlation.metricX.label} vs {correlation.metricY.userName}'s {correlation.metricY.label}
                            </h4>
                            <span className={`text-xs px-2 py-1 rounded-full ${getCorrelationBadge(correlation.coefficient).class}`}>
                                {getCorrelationBadge(correlation.coefficient).text} Correlation
                            </span>
                        </div>

                        <div style={{ height: 350 }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                                    <XAxis
                                        type="number"
                                        dataKey="x"
                                        name={correlation.metricX.label}
                                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                        axisLine={{ stroke: 'var(--border-default)' }}
                                        tickLine={{ stroke: 'var(--border-default)' }}
                                        label={{
                                            value: `${correlation.metricX.userName}'s ${correlation.metricX.label}`,
                                            position: 'bottom',
                                            fill: 'var(--text-muted)',
                                            fontSize: 12,
                                            offset: 0
                                        }}
                                    />
                                    <YAxis
                                        type="number"
                                        dataKey="y"
                                        name={correlation.metricY.label}
                                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                        axisLine={{ stroke: 'var(--border-default)' }}
                                        tickLine={{ stroke: 'var(--border-default)' }}
                                        label={{
                                            value: `${correlation.metricY.userName}'s ${correlation.metricY.label}`,
                                            angle: -90,
                                            position: 'insideLeft',
                                            fill: 'var(--text-muted)',
                                            fontSize: 12,
                                            offset: 10
                                        }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'var(--bg-base)',
                                            border: '1px solid var(--border-default)',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value: number, name: string) => [value.toFixed(1), name]}
                                        labelFormatter={(label) => `Date: ${correlation.dataPoints[label as number]?.date || ''}`}
                                    />
                                    <Scatter
                                        data={correlation.dataPoints}
                                        fill="var(--accent)"
                                        fillOpacity={0.7}
                                    />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Stats Panel */}
                    <div className="space-y-4">
                        {/* Correlation Coefficient */}
                        <div className="card p-4">
                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                                Pearson Correlation (r)
                            </p>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-4xl font-bold font-mono ${getStrengthColor(correlation.strength)}`}>
                                    {correlation.coefficient >= 0 ? '+' : ''}{correlation.coefficient.toFixed(3)}
                                </span>
                            </div>
                            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${correlation.direction === 'positive' ? 'bg-green-400' :
                                        correlation.direction === 'negative' ? 'bg-red-400' : 'bg-gray-400'
                                        }`} />
                                    <span className="text-sm text-[var(--text-secondary)]">
                                        {correlation.direction === 'positive' ? 'Positive' :
                                            correlation.direction === 'negative' ? 'Negative' : 'No'} relationship
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Insight */}
                        <div className="card p-4">
                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> Insight
                            </p>
                            <p className="text-sm text-[var(--text-secondary)]">
                                {correlation.insight}
                            </p>
                        </div>

                        {/* Sample Size */}
                        <div className="card p-4">
                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                                Sample Size
                            </p>
                            <p className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                                {correlation.sampleSize} <span className="text-sm font-normal text-[var(--text-muted)]">days</span>
                            </p>
                        </div>

                        {/* Interpretation Guide */}
                        <div className="card p-4">
                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">
                                How to read
                            </p>
                            <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-400" />
                                    <span className="text-[var(--text-secondary)]">±0.6 to ±1.0 = Strong</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                                    <span className="text-[var(--text-secondary)]">±0.3 to ±0.6 = Moderate</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                                    <span className="text-[var(--text-secondary)]">±0.1 to ±0.3 = Weak</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-gray-600" />
                                    <span className="text-[var(--text-secondary)]">0 to ±0.1 = None</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!correlation && (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)]">
                        Select metrics to explore correlations
                    </p>
                </div>
            )}
        </div>
    );
};

export default CorrelationExplorer;

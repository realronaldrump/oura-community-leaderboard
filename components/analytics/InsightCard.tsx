import React, { useId, useMemo, useState } from 'react';
import { AutomatedInsight } from '../../types/analyticsTypes';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Lightbulb, Activity, Moon, Heart } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { CHART_TOOLTIP_STYLE } from '../../utils/chartStyles';
import { getDataAwareChartDomain } from '../../utils/chartScale';
import type { DataAwareDomainOptions } from '../../utils/chartScale';

interface InsightCardProps {
    insight: AutomatedInsight;
}

const getCorrelationScaleOptions = (metricKey: string): DataAwareDomainOptions => ({
    min: metricKey === 'body_temp' ? undefined : 0,
    max: metricKey.endsWith('_score') ? 100 : undefined,
    includeZero: metricKey === 'body_temp',
});

const InsightCard: React.FC<InsightCardProps> = ({ insight }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const evidenceId = useId();
    const xDomain = useMemo(
        () => getDataAwareChartDomain(
            insight.correlationData.dataPoints.map((point) => point.x),
            getCorrelationScaleOptions(insight.metricXKey)
        ),
        [insight.correlationData.dataPoints, insight.metricXKey]
    );
    const yDomain = useMemo(
        () => getDataAwareChartDomain(
            insight.correlationData.dataPoints.map((point) => point.y),
            getCorrelationScaleOptions(insight.metricYKey)
        ),
        [insight.correlationData.dataPoints, insight.metricYKey]
    );

    // Use a solid semantic tint for strong relationships; the coefficient and
    // sample size carry the meaning, so decorative gradients are unnecessary.
    let surfaceClass = 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]';
    let iconColor = 'text-[var(--text-muted)]';
    let BadgeIcon = Lightbulb;

    if (insight.strength === 'strong') {
        if (insight.type === 'positive_habit') {
            surfaceClass = 'border-success/30 bg-success-soft';
            iconColor = 'text-success';
            BadgeIcon = TrendingUp;
        } else if (insight.type === 'negative_habit') {
            surfaceClass = 'border-error/30 bg-error-soft';
            iconColor = 'text-error';
            BadgeIcon = TrendingDown;
        } else {
            surfaceClass = 'border-info/30 bg-info-soft';
            iconColor = 'text-metric-sleep';
        }
    } else {
        // Moderate strength
        if (insight.type === 'positive_habit') {
            iconColor = 'text-success';
            BadgeIcon = TrendingUp;
        } else if (insight.type === 'negative_habit') {
            iconColor = 'text-error';
            BadgeIcon = TrendingDown;
        }
    }

    // Determine an icon to represent the primary metric
    const getMetricIcon = (metricKey: string) => {
        if (metricKey.includes('sleep') || metricKey.includes('bedtime')) return <Moon className="w-5 h-5 text-metric-sleep mb-2" />;
        if (metricKey.includes('hr') || metricKey.includes('temp')) return <Heart className="w-5 h-5 text-error mb-2" />;
        return <Activity className="w-5 h-5 text-warning mb-2" />;
    };

    return (
        <div className={`overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 ${surfaceClass}`}>
            {/* Clickable Header Area */}
            <button
                type="button"
                className="block min-h-11 w-full p-5 text-left transition-colors hover:bg-black/5"
                onClick={() => setIsExpanded((expanded) => !expanded)}
                aria-expanded={isExpanded}
                aria-controls={evidenceId}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="flex items-center gap-1 text-xs font-semibold tracking-wider uppercase bg-black/5 px-2.5 py-1 rounded-full text-[var(--text-secondary)]">
                                <BadgeIcon className={`w-3.5 h-3.5 ${iconColor}`} />
                                {insight.strength === 'strong' ? 'Strong Signal' : 'Notable Trend'}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">
                                Based on {insight.sampleSize} days
                            </span>
                        </div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)] leading-tight mb-2">
                            {insight.title}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            {insight.description}
                        </p>
                    </div>

                    <div className="flex flex-col items-end justify-between h-full pt-1">
                        <div className="flex gap-2 mb-4 opacity-70" aria-hidden="true">
                            {getMetricIcon(insight.metricXKey)}
                            {getMetricIcon(insight.metricYKey)}
                        </div>
                        <span className="grid min-h-11 min-w-11 place-items-center rounded-full bg-canvas text-[var(--text-muted)]" aria-hidden="true">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </span>
                    </div>
                </div>
            </button>

            {/* Expandable Chart Area */}
            {isExpanded && (
                <div
                    id={evidenceId}
                    className="p-5 pt-0 border-t border-black/5 bg-canvas"
                    role="region"
                    aria-label={`Data evidence for ${insight.title}`}
                >
                    <div className="mt-5 mb-2 flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                            Data Evidence
                        </h4>
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                            r = {insight.coefficient.toFixed(2)}
                        </span>
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            minWidth={0}
                            minHeight={256}
                            initialDimension={{ width: 480, height: 256 }}
                        >
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.10)" />
                                <XAxis
                                    type="number"
                                    dataKey="x"
                                    name={insight.metricXLabel}
                                    tick={{ fill: '#A8A29E', fontSize: 11 }}
                                    axisLine={{ stroke: 'rgba(0,0,0,0.15)' }}
                                    tickLine={false}
                                    domain={xDomain}
                                    tickCount={5}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name={insight.metricYLabel}
                                    tick={{ fill: '#A8A29E', fontSize: 11 }}
                                    axisLine={{ stroke: 'rgba(0,0,0,0.15)' }}
                                    tickLine={false}
                                    domain={yDomain}
                                    tickCount={5}
                                />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    contentStyle={CHART_TOOLTIP_STYLE}
                                    formatter={(value: number) => value.toFixed(1)}
                                    labelFormatter={() => ''}
                                />
                                <Scatter
                                    data={insight.correlationData.dataPoints}
                                    fill={insight.direction === 'positive' ? '#7BC4A0' : '#D4897B'}
                                    fillOpacity={0.6}
                                />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InsightCard;

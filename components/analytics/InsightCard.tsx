import React, { useState } from 'react';
import { AutomatedInsight } from '../../types/analyticsTypes';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Lightbulb, Activity, Moon, Heart } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface InsightCardProps {
    insight: AutomatedInsight;
}

const InsightCard: React.FC<InsightCardProps> = ({ insight }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Determine color scheme based on insight type
    let gradientClass = 'from-[var(--bg-elevated)] to-[var(--bg-elevated)] border-[var(--border-subtle)]';
    let iconColor = 'text-[var(--text-muted)]';
    let BadgeIcon = Lightbulb;

    if (insight.strength === 'strong') {
        if (insight.type === 'positive_habit') {
            gradientClass = 'from-emerald-900/20 to-[var(--bg-elevated)] border-emerald-500/30';
            iconColor = 'text-emerald-400';
            BadgeIcon = TrendingUp;
        } else if (insight.type === 'negative_habit') {
            gradientClass = 'from-rose-900/20 to-[var(--bg-elevated)] border-rose-500/30';
            iconColor = 'text-rose-400';
            BadgeIcon = TrendingDown;
        } else {
            gradientClass = 'from-indigo-900/20 to-[var(--bg-elevated)] border-indigo-500/30';
            iconColor = 'text-indigo-400';
        }
    } else {
        // Moderate strength
        if (insight.type === 'positive_habit') {
            iconColor = 'text-emerald-500';
            BadgeIcon = TrendingUp;
        } else if (insight.type === 'negative_habit') {
            iconColor = 'text-rose-500';
            BadgeIcon = TrendingDown;
        }
    }

    // Determine an icon to represent the primary metric
    const getMetricIcon = (metricKey: string) => {
        if (metricKey.includes('sleep') || metricKey.includes('bedtime')) return <Moon className="w-5 h-5 text-indigo-400 mb-2" />;
        if (metricKey.includes('hr') || metricKey.includes('temp')) return <Heart className="w-5 h-5 text-rose-400 mb-2" />;
        return <Activity className="w-5 h-5 text-amber-400 mb-2" />;
    };

    return (
        <div className={`rounded-xl border bg-gradient-to-br ${gradientClass} transition-all duration-300 overflow-hidden`}>
            {/* Clickable Header Area */}
            <div
                className="p-5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="flex items-center gap-1 text-xs font-semibold tracking-wider uppercase bg-white/10 px-2.5 py-1 rounded-full text-[var(--text-secondary)]">
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
                        <div className="flex gap-2 mb-4 opacity-70">
                            {getMetricIcon(insight.metricXKey)}
                            {getMetricIcon(insight.metricYKey)}
                        </div>
                        <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 bg-black/20 rounded-full">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expandable Chart Area */}
            {isExpanded && (
                <div className="p-5 pt-0 border-t border-white/5 bg-black/20">
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis
                                    type="number"
                                    dataKey="x"
                                    name={insight.metricXLabel}
                                    tick={{ fill: '#666', fontSize: 11 }}
                                    axisLine={{ stroke: '#444' }}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name={insight.metricYLabel}
                                    tick={{ fill: '#666', fontSize: 11 }}
                                    axisLine={{ stroke: '#444' }}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    contentStyle={{
                                        backgroundColor: '#1C1C1C',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        fontSize: '12px'
                                    }}
                                    formatter={(value: number) => value.toFixed(1)}
                                    labelFormatter={() => ''}
                                />
                                <Scatter
                                    data={insight.correlationData.dataPoints}
                                    fill={insight.direction === 'positive' ? '#10b981' : '#f43f5e'}
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

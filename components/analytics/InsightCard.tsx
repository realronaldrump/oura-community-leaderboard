import React, { useState } from 'react';
import { AutomatedInsight } from '../../types/analyticsTypes';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Lightbulb, Activity, Moon, Heart } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { CLAY_TOOLTIP_STYLE } from '../../utils/chartStyles';

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
            gradientClass = 'from-[#7BC4A0]/10 to-[var(--bg-elevated)] border-[#7BC4A0]/30';
            iconColor = 'text-[#7BC4A0]';
            BadgeIcon = TrendingUp;
        } else if (insight.type === 'negative_habit') {
            gradientClass = 'from-[#D4897B]/10 to-[var(--bg-elevated)] border-[#D4897B]/30';
            iconColor = 'text-[#D4897B]';
            BadgeIcon = TrendingDown;
        } else {
            gradientClass = 'from-[#7BA8D4]/10 to-[var(--bg-elevated)] border-[#7BA8D4]/30';
            iconColor = 'text-[#7BA8D4]';
        }
    } else {
        // Moderate strength
        if (insight.type === 'positive_habit') {
            iconColor = 'text-[#7BC4A0]';
            BadgeIcon = TrendingUp;
        } else if (insight.type === 'negative_habit') {
            iconColor = 'text-[#D4897B]';
            BadgeIcon = TrendingDown;
        }
    }

    // Determine an icon to represent the primary metric
    const getMetricIcon = (metricKey: string) => {
        if (metricKey.includes('sleep') || metricKey.includes('bedtime')) return <Moon className="w-5 h-5 text-[#7BA8D4] mb-2" />;
        if (metricKey.includes('hr') || metricKey.includes('temp')) return <Heart className="w-5 h-5 text-[#D4897B] mb-2" />;
        return <Activity className="w-5 h-5 text-[#D4B87B] mb-2" />;
    };

    return (
        <div className={`rounded-2xl border bg-gradient-to-br ${gradientClass} shadow-clay-sm transition-all duration-300 overflow-hidden`}>
            {/* Clickable Header Area */}
            <div
                className="p-5 cursor-pointer hover:bg-black/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
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
                        <div className="flex gap-2 mb-4 opacity-70">
                            {getMetricIcon(insight.metricXKey)}
                            {getMetricIcon(insight.metricYKey)}
                        </div>
                        <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 bg-[#F2EDE8] rounded-full">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expandable Chart Area */}
            {isExpanded && (
                <div className="p-5 pt-0 border-t border-black/5 bg-[#F2EDE8]">
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
                                    domain={['auto', 'auto']}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name={insight.metricYLabel}
                                    tick={{ fill: '#A8A29E', fontSize: 11 }}
                                    axisLine={{ stroke: 'rgba(0,0,0,0.15)' }}
                                    tickLine={false}
                                    domain={['auto', 'auto']}
                                />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    contentStyle={CLAY_TOOLTIP_STYLE}
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

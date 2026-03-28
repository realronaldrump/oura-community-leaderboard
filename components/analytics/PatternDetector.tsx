import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { Pattern, PatternType } from '../../types/analyticsTypes';
import { detectPatterns } from '../../services/analyticsService';
import { Calendar, Activity, Heart, Users, Sun, PartyPopper, Search, ChevronDown, Lightbulb, Info } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface PatternDetectorProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const getPatternIcon = (type: PatternType) => {
    switch (type) {
        case 'day_of_week': return <Calendar className="w-5 h-5 text-[#7BA8D4]" />;
        case 'activity_sleep': return <Activity className="w-5 h-5 text-[#7BC4A0]" />;
        case 'hrv_readiness': return <Heart className="w-5 h-5 text-[#A08BBE]" />;
        case 'cross_user': return <Users className="w-5 h-5 text-[#7BA8D4]" />;
        case 'seasonal': return <Sun className="w-5 h-5 text-[#D4897B]" />;
        case 'weekend_effect': return <PartyPopper className="w-5 h-5 text-[#D4897B]" />;
        default: return <Info className="w-5 h-5 text-[#C8C2BB]" />;
    }
};

const patternColors: Record<PatternType, string> = {
    day_of_week: 'border-l-[#7BA8D4]',
    activity_sleep: 'border-l-[#7BC4A0]',
    hrv_readiness: 'border-l-[#A08BBE]',
    cross_user: 'border-l-[#7BA8D4]',
    seasonal: 'border-l-[#D4897B]',
    weekend_effect: 'border-l-[#D4897B]'
};

type FilterType = 'all' | PatternType;
type SortType = 'confidence' | 'impact' | 'recent';

const PatternDetector: React.FC<PatternDetectorProps> = ({ profiles, usersData }) => {
    const [filter, setFilter] = useState<FilterType>('all');
    const [sortBy, setSortBy] = useState<SortType>('confidence');
    const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set());

    const patterns = useMemo(() => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return [];

        return detectPatterns(usersDataFormatted);
    }, [profiles, usersData]);

    const filteredPatterns = useMemo(() => {
        let result = filter === 'all'
            ? patterns
            : patterns.filter(p => p.type === filter);

        switch (sortBy) {
            case 'confidence':
                result = [...result].sort((a, b) => b.confidence - a.confidence);
                break;
            case 'impact':
                result = [...result].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
                break;
            case 'recent':
                result = [...result].sort((a, b) =>
                    new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime()
                );
                break;
        }

        return result;
    }, [patterns, filter, sortBy]);

    const toggleExpanded = (id: string) => {
        const newExpanded = new Set(expandedPatterns);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedPatterns(newExpanded);
    };

    const patternTypes = [...new Set(patterns.map(p => p.type))];

    if (patterns.length === 0) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <Search className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Analyzing Patterns</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    We need more data to detect patterns. Keep tracking for at least 2 weeks!
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="section-header mb-0">Pattern Feed</h3>
                    <InfoTooltip
                        title="Pattern Detection"
                        description="Automatically detected trends and correlations in your health data across multiple dimensions."
                        calculation="Patterns are found by analyzing your data for recurring relationships (e.g., high activity days → poor sleep). Confidence indicates how consistent the pattern is. Impact shows the effect size."
                    />
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    {patterns.length} patterns detected from your data
                </p>

                <div className="flex gap-2">
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as FilterType)}
                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                        <option value="all">All Types</option>
                        {patternTypes.map(type => (
                            <option key={type} value={type}>
                                {type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </option>
                        ))}
                    </select>

                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortType)}
                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                        <option value="confidence">By Confidence</option>
                        <option value="impact">By Impact</option>
                        <option value="recent">Most Recent</option>
                    </select>
                </div>
            </div>

            {/* Pattern Cards */}
            <div className="space-y-4">
                {filteredPatterns.map(pattern => (
                    <div
                        key={pattern.id}
                        className={`card border-l-4 ${patternColors[pattern.type]} overflow-hidden transition-all duration-200`}
                    >
                        <div
                            className="p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                            onClick={() => toggleExpanded(pattern.id)}
                        >
                            <div className="flex items-start gap-4">
                                {getPatternIcon(pattern.type)}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-semibold text-[var(--text-primary)]">
                                            {pattern.title}
                                        </h4>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${pattern.confidence >= 0.8 ? 'bg-[#7BC4A0]/20 text-[#7BC4A0]' :
                                            pattern.confidence >= 0.6 ? 'bg-[#D4B87B]/20 text-[#D4B87B]' :
                                                'bg-[#C8C2BB]/20 text-[#C8C2BB]'
                                            }`}>
                                            {(pattern.confidence * 100).toFixed(0)}% confident
                                        </span>
                                    </div>

                                    <p className="text-[var(--text-secondary)] text-sm">
                                        {pattern.description}
                                    </p>

                                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
                                        <span className={`font-mono ${pattern.impact > 0 ? 'text-[#7BC4A0]' : 'text-[#D4897B]'}`}>
                                            {pattern.impact > 0 ? '+' : ''}{pattern.impact.toFixed(1)}% impact
                                        </span>
                                        <span>•</span>
                                        <span>{pattern.dataPoints} data points</span>
                                        <span>•</span>
                                        <span>{pattern.metric}</span>
                                    </div>
                                </div>

                                <button className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                                    <ChevronDown
                                        className={`w-5 h-5 transition-transform ${expandedPatterns.has(pattern.id) ? 'rotate-180' : ''}`}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Expanded content */}
                        {expandedPatterns.has(pattern.id) && (
                            <div className="px-4 pb-4 pt-0 border-t border-[var(--border-subtle)]">
                                <div className="pt-4 space-y-4">
                                    {/* Actionable Tip */}
                                    {pattern.tip && (
                                        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                                            <Lightbulb className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-[var(--accent)]">Tip</p>
                                                <p className="text-sm text-[var(--text-secondary)]">{pattern.tip}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Pattern Details */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Type</p>
                                            <p className="text-sm text-[var(--text-primary)]">
                                                {pattern.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Affected Users</p>
                                            <p className="text-sm text-[var(--text-primary)]">
                                                {pattern.affectedUsers.length} user{pattern.affectedUsers.length > 1 ? 's' : ''}
                                            </p>
                                        </div>
                                        {pattern.dayOfWeek !== undefined && (
                                            <div>
                                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Day</p>
                                                <p className="text-sm text-[var(--text-primary)]">
                                                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][pattern.dayOfWeek]}
                                                </p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">Discovered</p>
                                            <p className="text-sm text-[var(--text-primary)]">
                                                {new Date(pattern.discoveredAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Impact Visualization */}
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Impact</p>
                                        <div className="h-8 bg-[var(--bg-base)] rounded-lg overflow-hidden relative flex items-center">
                                            <div className="absolute left-1/2 w-px h-full bg-[var(--border-default)]" />
                                            <div
                                                className={`h-4 rounded-full ${pattern.impact > 0 ? 'bg-[#7BC4A0]' : 'bg-[#D4897B]'}`}
                                                style={{
                                                    width: `${Math.min(50, Math.abs(pattern.impact) * 2)}%`,
                                                    marginLeft: pattern.impact > 0 ? '50%' : `${50 - Math.min(50, Math.abs(pattern.impact) * 2)}%`
                                                }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                                            <span>-25%</span>
                                            <span>0%</span>
                                            <span>+25%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {filteredPatterns.length === 0 && (
                <div className="card p-8 text-center">
                    <p className="text-[var(--text-muted)]">
                        No patterns match the current filter.
                    </p>
                </div>
            )}
        </div>
    );
};

export default PatternDetector;

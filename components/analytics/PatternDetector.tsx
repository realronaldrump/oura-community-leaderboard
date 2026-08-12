import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { PatternType } from '../../types/analyticsTypes';
import { detectPatterns } from '../../services/analyticsService';
import { Calendar, Activity, Heart, Users, Sun, PartyPopper, Search, ChevronDown, Info } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import { getProfileDisplayName } from '../../utils/profileName';

interface PatternDetectorProps {
    profiles: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const getPatternIcon = (type: PatternType) => {
    switch (type) {
        case 'day_of_week': return <Calendar className="w-5 h-5 text-metric-sleep" />;
        case 'activity_sleep': return <Activity className="w-5 h-5 text-success" />;
        case 'hrv_readiness': return <Heart className="w-5 h-5 text-metric-insight" />;
        case 'cross_user': return <Users className="w-5 h-5 text-metric-sleep" />;
        case 'seasonal': return <Sun className="w-5 h-5 text-error" />;
        case 'weekend_effect': return <PartyPopper className="w-5 h-5 text-error" />;
        default: return <Info className="w-5 h-5 text-ink-faint" />;
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
            userName: getProfileDisplayName(profile),
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
                result = [...result].sort((a, b) => b.dataPoints - a.dataPoints);
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
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Not enough history yet</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Pattern comparisons need at least two weeks of matched data.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="section-header mb-0">Pattern summary</h3>
                    <InfoTooltip
                        title="Pattern Detection"
                        description="Compares recurring differences across days, weekends, and matched metrics in Oura history."
                        calculation="Sample size is the number of values used. Difference is the percentage gap between the compared groups; it does not establish cause."
                    />
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    {patterns.length} patterns detected from your data
                </p>

                <div className="flex gap-2">
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as FilterType)}
                        aria-label="Filter patterns by type"
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
                        aria-label="Sort patterns"
                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                        <option value="confidence">By sample size</option>
                        <option value="impact">By difference</option>
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
                        <button
                            type="button"
                            className="block min-h-11 w-full p-4 text-left transition-colors hover:bg-[var(--bg-hover)]"
                            onClick={() => toggleExpanded(pattern.id)}
                            aria-expanded={expandedPatterns.has(pattern.id)}
                            aria-controls={`pattern-details-${pattern.id}`}
                        >
                            <div className="flex items-start gap-4">
                                {getPatternIcon(pattern.type)}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-semibold text-[var(--text-primary)]">
                                            {pattern.title}
                                        </h4>
                                        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs text-ink-secondary">
                                            {pattern.dataPoints} points
                                        </span>
                                    </div>

                                    <p className="text-[var(--text-secondary)] text-sm">
                                        {pattern.description}
                                    </p>

                                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)]">
                                        <span className={`font-mono ${pattern.impact > 0 ? 'text-success' : 'text-error'}`}>
                                            {pattern.impact > 0 ? '+' : ''}{pattern.impact.toFixed(1)}% difference
                                        </span>
                                        <span>•</span>
                                        <span>{pattern.metric}</span>
                                    </div>
                                </div>

                                <span className="grid min-h-11 min-w-11 place-items-center text-[var(--text-muted)]" aria-hidden="true">
                                    <ChevronDown
                                        className={`w-5 h-5 transition-transform ${expandedPatterns.has(pattern.id) ? 'rotate-180' : ''}`}
                                    />
                                </span>
                            </div>
                        </button>

                        {/* Expanded content */}
                        {expandedPatterns.has(pattern.id) && (
                            <div
                                id={`pattern-details-${pattern.id}`}
                                className="px-4 pb-4 pt-0 border-t border-[var(--border-subtle)]"
                            >
                                <div className="pt-4 space-y-4">
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

                                    {/* Difference visualization */}
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">Difference</p>
                                        <div className="h-8 bg-[var(--bg-base)] rounded-lg overflow-hidden relative flex items-center">
                                            <div className="absolute left-1/2 w-px h-full bg-[var(--border-default)]" />
                                            <div
                                                className={`h-4 rounded-full ${pattern.impact > 0 ? 'bg-[#7BC4A0]' : 'bg-error'}`}
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

            {filteredPatterns.length > 0 && filteredPatterns.length < 4 && (
                <div className="card p-6 text-center border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <Search className="w-8 h-8 text-[var(--text-muted)] opacity-40 mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-secondary)] font-medium mb-1">More history may reveal more comparisons</p>
                    <p className="text-xs text-[var(--text-muted)]">More patterns will appear automatically as Oura days arrive.</p>
                </div>
            )}
        </div>
    );
};

export default PatternDetector;

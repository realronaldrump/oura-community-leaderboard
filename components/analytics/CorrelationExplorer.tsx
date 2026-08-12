import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { BarChart3, Filter } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import InsightCard from './InsightCard';
import { generateAutomatedInsights } from '../../services/analyticsService';
import { useUser } from '../../contexts/UserContext';
import PrimaryProfileSwitcher from '../PrimaryProfileSwitcher';
import { getProfileDisplayName } from '../../utils/profileName';

interface CorrelationExplorerProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const CorrelationExplorer: React.FC<CorrelationExplorerProps> = ({ profiles, usersData }) => {
    const { activeProfileId } = useUser();
    const [filterType, setFilterType] = useState<'all' | 'positive_habit' | 'negative_habit'>('all');

    // Use the globally-selected primary profile; fall back to the first profile.
    const selectedUserIdx = useMemo(() => {
        if (profiles.length === 0) return -1;
        const idx = profiles.findIndex((profile) => profile.id === activeProfileId);
        return idx >= 0 ? idx : 0;
    }, [profiles, activeProfileId]);

    const activeProfile = selectedUserIdx >= 0 ? profiles[selectedUserIdx] : null;
    const activeUserId = activeProfile?.id;
    const activeUserName = activeProfile ? getProfileDisplayName(activeProfile) : 'User';
    const activeData = selectedUserIdx >= 0 ? usersData[selectedUserIdx]?.data : undefined;

    const insights = useMemo(() => {
        if (!activeData || !activeUserId) return [];
        return generateAutomatedInsights(activeData, activeUserId, activeUserName);
    }, [activeData, activeUserId, activeUserName]);

    const filteredInsights = useMemo(() => {
        if (filterType === 'all') return insights;
        return insights.filter(i => i.type === filterType);
    }, [insights, filterType]);

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <BarChart3 className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No data yet</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    More Oura history will appear here automatically.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#7BA8D4]/20 text-metric-sleep rounded-xl">
                        <BarChart3 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                            Metric relationships
                            <InfoTooltip
                                title="How relationships are calculated"
                                description="This view compares pairs of Oura metrics recorded for the selected profile on the same date."
                                calculation="Pearson correlations with at least seven paired days and |r| ≥ 0.30 are shown. Correlation does not show that one metric caused the other."
                            />
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                            See which metrics tended to move together on matched days.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {profiles.length > 1 && (
                        <PrimaryProfileSwitcher
                            selectClassName="pl-3 pr-8 py-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] hover:bg-black/5 cursor-pointer max-w-[170px] truncate"
                        />
                    )}
                </div>
            </div>

            {/* Filters */}
            {insights.length > 0 && (
                <div className="flex items-center gap-2 pb-2 overflow-x-auto hide-scrollbar" role="group" aria-label="Filter insights">
                    <Filter className="w-4 h-4 text-[var(--text-muted)] mr-1" aria-hidden="true" />
                    <button
                        type="button"
                        onClick={() => setFilterType('all')}
                        aria-pressed={filterType === 'all'}
                        className={`min-h-11 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterType === 'all' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-black/5'}`}
                    >
                        All relationships
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterType('positive_habit')}
                        aria-pressed={filterType === 'positive_habit'}
                        className={`min-h-11 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterType === 'positive_habit' ? 'bg-[#7BC4A0]/20 text-success border border-[#7BC4A0]/30' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-black/5'}`}
                    >
                        Positive patterns
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterType('negative_habit')}
                        aria-pressed={filterType === 'negative_habit'}
                        className={`min-h-11 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterType === 'negative_habit' ? 'bg-error/20 text-error border border-[#D4897B]/30' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-black/5'}`}
                    >
                        Negative patterns
                    </button>
                </div>
            )}

            {/* Insights Feed */}
            {filteredInsights.length > 0 ? (
                <div id="insights-feed" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredInsights.map(insight => (
                        <InsightCard key={insight.id} insight={insight} />
                    ))}
                </div>
            ) : (
                <div className="card p-12 text-center bg-[var(--bg-elevated)] border border-dashed border-[var(--border-subtle)]">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-black/5 rounded-full">
                            <BarChart3 className="w-8 h-8 text-[var(--text-muted)] opacity-50" />
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                        {filterType !== 'all' ? 'No relationships match this filter' : 'No moderate relationships yet'}
                    </h3>
                    <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto leading-relaxed">
                        {filterType !== 'all'
                            ? 'Choose another filter to see the remaining relationships.'
                            : 'At least seven matched days are required. This view only shows metric pairs with |r| ≥ 0.30.'}
                    </p>
                    {filterType !== 'all' && (
                        <button
                            type="button"
                            onClick={() => setFilterType('all')}
                            className="mt-6 min-h-11 px-3 text-sm text-[var(--accent)] hover:opacity-80 transition-opacity"
                        >
                            View all relationships
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default CorrelationExplorer;

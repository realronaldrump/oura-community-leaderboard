import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { CorrelationResult, MetricOption } from '../../types/analyticsTypes';
import { calculateCorrelation } from '../../services/analyticsService';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BarChart3, Image, Lightbulb, Sparkles, Filter } from 'lucide-react';
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

    // Export functionality (simplified to just take a screenshot of the feed)
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        const element = document.getElementById('insights-feed');
        if (!element) return;

        setIsExporting(true);
        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(element, {
                backgroundColor: '#F2EDE8',
                scale: 2
            });

            const link = document.createElement('a');
            link.download = `my-oura-insights.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
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
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#7BA8D4]/20 text-[#7BA8D4] rounded-xl">
                        <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                            Personalized Insights
                            <InfoTooltip
                                title="Correlation AI Engine"
                                description="Our engine continuously scans thousands of data points across your Oura history. It identifies hidden habits, both positive and negative, by discovering statistically significant correlations."
                                calculation="Only medium-to-strong relationships (|r| > 0.3) are displayed. Trivial or obvious combinations are filtered out automatically."
                            />
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                            Discover the hidden habits driving your health
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
                <div className="flex items-center gap-2 pb-2 overflow-x-auto hide-scrollbar">
                    <Filter className="w-4 h-4 text-[var(--text-muted)] mr-1" />
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterType === 'all' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-black/5'}`}
                    >
                        All Insights
                    </button>
                    <button
                        onClick={() => setFilterType('positive_habit')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterType === 'positive_habit' ? 'bg-[#7BC4A0]/20 text-[#7BC4A0] border border-[#7BC4A0]/30' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-black/5'}`}
                    >
                        Positive Habits
                    </button>
                    <button
                        onClick={() => setFilterType('negative_habit')}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${filterType === 'negative_habit' ? 'bg-[#D4897B]/20 text-[#D4897B] border border-[#D4897B]/30' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-black/5'}`}
                    >
                        Negative Habits
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
                            <Sparkles className="w-8 h-8 text-[var(--text-muted)] opacity-50" />
                        </div>
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                        {filterType !== 'all' ? `No ${filterType.replace('_', ' ')}s found` : 'Need More Data'}
                    </h3>
                    <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto leading-relaxed">
                        {filterType !== 'all'
                            ? "Try changing your filter to see other statistically significant patterns we've discovered."
                            : "We haven't found any strong correlations in your data yet. Keep wearing your ring and check back in a few days!"}
                    </p>
                    {filterType !== 'all' && (
                        <button
                            onClick={() => setFilterType('all')}
                            className="mt-6 text-sm text-[var(--accent)] hover:opacity-80 transition-opacity"
                        >
                            View All Insights
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default CorrelationExplorer;

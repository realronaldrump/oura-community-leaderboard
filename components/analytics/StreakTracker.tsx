import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { Streak, Badge, BadgeTier, StreakType } from '../../types/analyticsTypes';
import { calculateStreaks, generateBadges, BADGE_TIERS, STREAK_DEFINITIONS } from '../../services/analyticsService';
import {
    Flame,
    Trophy,
    TrendingUp,
    TrendingDown,
    Star,
    Crown,
    Zap,
    Footprints,
    Moon,
    Award,
    HeartPulse,
    Info,
    ChevronRight,
    ListChecks,
    BookOpen
} from 'lucide-react';
import DetailsModal from './DetailsModal';
import { formatISODateForDisplay } from '../../utils/date';
import { getProfileDisplayName } from '../../utils/profileName';

interface StreakTrackerProps {
    profiles: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

type DetailContext = 'active' | 'record' | 'badge';
type StreakTab = 'active' | 'all' | 'badges' | 'rules';

const tierBackgroundColors: Record<BadgeTier, string> = {
    bronze: 'bg-[#B78343]',
    silver: 'bg-[#8A837B]',
    gold: 'bg-[#C08A28]',
    platinum: 'bg-metric-insight'
};

const tierSoftBackgroundColors: Record<BadgeTier, string> = {
    bronze: 'bg-[#B78343]/10',
    silver: 'bg-[#8A837B]/10',
    gold: 'bg-[#C08A28]/10',
    platinum: 'bg-metric-insight/10'
};

const tierBorderColors: Record<BadgeTier, string> = {
    bronze: 'border-[#D4B87B]/50',
    silver: 'border-[#C8C2BB]/50',
    gold: 'border-[#D4B87B]/50',
    platinum: 'border-[#A08BBE]/50'
};

const tierTextColors: Record<BadgeTier, string> = {
    bronze: 'text-warning',
    silver: 'text-ink-faint',
    gold: 'text-warning',
    platinum: 'text-metric-insight'
};

const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum'];

const getStreakIcon = (type: StreakType, iconId?: string) => {
    if (iconId) {
        switch (iconId) {
            case 'crown': return <Crown className="w-5 h-5 text-warning" />;
            case 'zap': return <Zap className="w-5 h-5 text-success" />;
            case 'footprints': return <Footprints className="w-5 h-5 text-metric-sleep" />;
            case 'moon': return <Moon className="w-5 h-5 text-metric-insight" />;
            case 'heart': return <HeartPulse className="w-5 h-5 text-error" />;
        }
    }

    switch (type) {
        case 'sleep_consistency': return <Crown className="w-5 h-5 text-warning" />;
        case 'readiness_streak': return <Zap className="w-5 h-5 text-success" />;
        case 'step_goal': return <Footprints className="w-5 h-5 text-metric-sleep" />;
        case 'early_bedtime': return <Moon className="w-5 h-5 text-metric-insight" />;
        default: return <HeartPulse className="w-5 h-5 text-error" />;
    }
};

const getStreakLabel = (type: StreakType): string => {
    switch (type) {
        case 'sleep_consistency': return 'Sleep Consistency';
        case 'readiness_streak': return 'Readiness Streak';
        case 'step_goal': return 'Step Goal Streak';
        case 'early_bedtime': return 'Early Bedtime';
        case 'hrv_improvement': return 'HRV Improvement';
        case 'activity_sync': return 'Activity Sync';
        default: {
            const fallback = String(type);
            return fallback.split('_').map(w => `${w[0].toUpperCase()}${w.slice(1)}`).join(' ');
        }
    }
};

const formatDate = (value?: string): string => {
    if (!value) return '—';
    return formatISODateForDisplay(value, undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatBedtimeThreshold = (hour: number): string => {
    const normalizedHour = hour >= 24 ? hour - 24 : hour;
    const displayHour = normalizedHour % 12 || 12;
    const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
    return `${displayHour}:00 ${suffix}`;
};

const formatRule = (type: StreakType, threshold?: number): string => {
    switch (type) {
        case 'sleep_consistency':
            return `Sleep score at or above ${Math.round(threshold ?? 80)}`;
        case 'readiness_streak':
            return `Readiness score at or above ${Math.round(threshold ?? 75)}`;
        case 'step_goal':
            return `At least ${(threshold ?? 10000).toLocaleString()} steps`;
        case 'early_bedtime':
            return `Bedtime before ${formatBedtimeThreshold(threshold ?? 23)}`;
        case 'hrv_improvement':
            return threshold
                ? `HRV at or above personal average (${threshold.toFixed(1)} ms)`
                : 'HRV at or above your personal average';
        default:
            return 'Consecutive days meeting this habit rule';
    }
};

const getNextBadgeTarget = (currentRecord: number) => {
    for (const tier of TIER_ORDER) {
        const requirement = BADGE_TIERS[tier].days;
        if (currentRecord < requirement) {
            return {
                tier,
                requirement,
                remaining: requirement - currentRecord
            };
        }
    }
    return null;
};

const StreakTracker: React.FC<StreakTrackerProps> = ({ profiles, usersData }) => {
    const [selectedItem, setSelectedItem] = React.useState<{
        type: 'streak' | 'badge';
        context: DetailContext;
        data: Streak | Badge;
        streakData?: Streak;
    } | null>(null);

    const analytics = useMemo(() => {
        const allStreaks: Streak[] = [];
        const allBadges: Badge[] = [];

        profiles.forEach((profile, idx) => {
            const data = usersData[idx]?.data;
            if (!data) return;

            const userName = getProfileDisplayName(profile);
            const streaks = calculateStreaks(data, profile.id, userName);
            const badges = generateBadges(streaks);

            allStreaks.push(...streaks);
            allBadges.push(...badges);
        });

        return { streaks: allStreaks, badges: allBadges };
    }, [profiles, usersData]);

    const activeStreaks = useMemo(
        () => analytics.streaks
            .filter(s => s.isActive && s.currentLength > 0)
            .sort((a, b) => b.currentLength - a.currentLength || b.longestLength - a.longestLength),
        [analytics.streaks]
    );

    const unlockedBadges = useMemo(
        () => analytics.badges.filter(b => b.isUnlocked),
        [analytics.badges]
    );

    const upcomingBadges = useMemo(
        () => analytics.badges
            .filter(b => !b.isUnlocked)
            .sort((a, b) => b.progress - a.progress)
            .slice(0, 8),
        [analytics.badges]
    );

    const streakRows = useMemo(
        () => [...analytics.streaks].sort((a, b) =>
            b.currentLength - a.currentLength ||
            b.longestLength - a.longestLength ||
            a.userName.localeCompare(b.userName)
        ),
        [analytics.streaks]
    );

    const bestRecord = useMemo(
        () => streakRows[0],
        [streakRows]
    );

    const bestActive = useMemo(
        () => activeStreaks[0],
        [activeStreaks]
    );

    const closestBadge = useMemo(
        () => upcomingBadges[0],
        [upcomingBadges]
    );

    const handleStreakClick = (streak: Streak, context: DetailContext = 'record') => {
        setSelectedItem({
            type: 'streak',
            context,
            data: streak,
            streakData: streak
        });
    };

    const handleBadgeClick = (badge: Badge) => {
        const streak = analytics.streaks.find(s =>
            s.userId === badge.userId && s.type === badge.streakType
        );

        setSelectedItem({
            type: 'badge',
            context: 'badge',
            data: badge,
            streakData: streak
        });
    };

    const selectedStreak = selectedItem?.streakData;
    const selectedBadge = selectedItem?.type === 'badge' ? selectedItem.data as Badge : null;
    const selectedRule = selectedStreak ? formatRule(selectedStreak.type, selectedStreak.threshold) : '—';
    const selectedDates = selectedItem?.context === 'active'
        ? (selectedStreak?.currentDates?.length ? selectedStreak.currentDates : selectedStreak?.dates)
        : (selectedStreak?.longestDates?.length ? selectedStreak.longestDates : selectedStreak?.dates);

    const [activeTab, setActiveTab] = useState<StreakTab>(() =>
        activeStreaks.length > 0 ? 'active' : 'all'
    );

    return (
        <div className="space-y-6">
            <DetailsModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                title={selectedItem?.type === 'badge'
                    ? selectedBadge?.name || 'Badge'
                    : `${selectedStreak?.userName || 'User'} · ${selectedStreak ? getStreakLabel(selectedStreak.type) : 'Streak'}`}
                subtitle={selectedItem?.type === 'badge'
                    ? 'Badge progression is based on record streak length'
                    : selectedItem?.context === 'active'
                        ? 'Active run details'
                        : 'Record run details'}
                description={selectedItem?.type === 'badge'
                    ? `${selectedBadge?.description || ''} Badges unlock from your all-time best streak length for this habit.`
                    : selectedItem?.context === 'active'
                        ? `Current streak is ${selectedStreak?.currentLength || 0} days. Rule: ${selectedRule}.`
                        : `Record streak is ${selectedStreak?.longestLength || 0} days. Rule: ${selectedRule}.`}
                stats={[
                    ...(selectedItem?.type === 'badge' ? [
                        {
                            label: 'Requirement',
                            value: `${selectedBadge?.requirement || 0} days`
                        },
                        {
                            label: 'Record Length',
                            value: `${selectedStreak?.longestLength || 0} days`
                        }
                    ] : []),
                    ...(selectedItem?.type === 'streak' ? [
                        {
                            label: 'Rule',
                            value: selectedRule
                        },
                        {
                            label: 'Current',
                            value: `${selectedStreak?.currentLength || 0} days`
                        },
                        {
                            label: 'Record',
                            value: `${selectedStreak?.longestLength || 0} days`
                        },
                        {
                            label: 'Current Window',
                            value: selectedStreak?.currentStartDate
                                ? `${formatDate(selectedStreak.currentStartDate)} → ${formatDate(selectedStreak.currentEndDate)}`
                                : 'No active run'
                        },
                        {
                            label: 'Record Window',
                            value: selectedStreak?.longestStartDate
                                ? `${formatDate(selectedStreak.longestStartDate)} → ${formatDate(selectedStreak.longestEndDate)}`
                                : '—'
                        }
                    ] : []),
                    ...(selectedStreak?.impactOnTrend ? [{
                        label: 'Readiness Delta',
                        value: `${selectedStreak.impactOnTrend > 0 ? '+' : ''}${selectedStreak.impactOnTrend.toFixed(1)}%`
                    }] : [])
                ]}
                datesTitle={selectedItem?.context === 'active' ? 'Current Run Days' : 'Record Run Days'}
                dates={selectedDates}
            />

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => setActiveTab('active')}
                    aria-pressed={activeTab === 'active'}
                    className={`card p-4 text-left transition-colors ${activeTab === 'active' ? 'ring-2 ring-[var(--accent)]/40' : 'hover:bg-[var(--bg-hover)]'}`}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <Flame className="w-4 h-4 text-error" />
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Active</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-[var(--accent)]">{activeStreaks.length}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">live streaks</p>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('active')}
                    className={`card p-4 text-left transition-colors hover:bg-[var(--bg-hover)]`}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-success" />
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Best Run</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">{bestActive?.currentLength ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                        {bestActive ? `${bestActive.userName} · ${getStreakLabel(bestActive.type)}` : 'No active run'}
                    </p>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    aria-pressed={activeTab === 'all'}
                    className={`card p-4 text-left transition-colors ${activeTab === 'all' ? 'ring-2 ring-[var(--accent)]/40' : 'hover:bg-[var(--bg-hover)]'}`}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <Trophy className="w-4 h-4 text-warning" />
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Record</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">{bestRecord?.longestLength ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                        {bestRecord ? `${bestRecord.userName} · ${getStreakLabel(bestRecord.type)}` : 'None yet'}
                    </p>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('badges')}
                    aria-pressed={activeTab === 'badges'}
                    className={`card p-4 text-left transition-colors ${activeTab === 'badges' ? 'ring-2 ring-[var(--accent)]/40' : 'hover:bg-[var(--bg-hover)]'}`}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <Award className="w-4 h-4 text-metric-insight" />
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Closest Badge</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-[var(--text-primary)]">{closestBadge ? `${closestBadge.progress.toFixed(0)}%` : '—'}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                        {closestBadge ? closestBadge.name : 'No badge progress'}
                    </p>
                </button>
            </div>

            {/* ── Section Tabs ── */}
            <div className="flex gap-1 border-b border-[var(--border-subtle)] overflow-x-auto hide-scrollbar" role="group" aria-label="Streak sections">
                {([
                    { key: 'active' as const, label: 'Active Now', icon: <Flame className="w-3.5 h-3.5" />, count: activeStreaks.length },
                    { key: 'all' as const, label: 'All Streaks', icon: <ListChecks className="w-3.5 h-3.5" />, count: streakRows.length },
                    { key: 'badges' as const, label: 'Badges', icon: <Award className="w-3.5 h-3.5" />, count: unlockedBadges.length },
                    { key: 'rules' as const, label: 'How It Works', icon: <BookOpen className="w-3.5 h-3.5" /> },
                ]).map(t => (
                    <button
                        key={t.key}
                        type="button"
                        aria-pressed={activeTab === t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`flex min-h-11 items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                            activeTab === t.key
                                ? 'border-[var(--accent)] text-[var(--accent)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-subtle)]'
                        }`}
                    >
                        {t.icon}
                        <span>{t.label}</span>
                        {'count' in t && typeof t.count === 'number' && (
                            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                                activeTab === t.key ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                            }`}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Active Now Tab ── */}
            {activeTab === 'active' && (
                <div className="space-y-4">
                    {activeStreaks.length === 0 ? (
                        <div className="card p-8 text-center">
                            <Flame className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                            <p className="text-sm font-medium text-[var(--text-secondary)]">No active streaks right now</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">Your record streaks and badge progress are tracked in the other tabs.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {activeStreaks.map(streak => {
                                const nextBadge = getNextBadgeTarget(streak.longestLength);
                                return (
                                    <button
                                        key={streak.id}
                                        type="button"
                                        onClick={() => handleStreakClick(streak, 'active')}
                                        className="card p-4 text-left border-l-4 border-l-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                {getStreakIcon(streak.type, streak.icon)}
                                                <div>
                                                    <p className="font-semibold text-[var(--text-primary)]">{streak.userName}</p>
                                                    <p className="text-xs text-[var(--text-muted)]">{getStreakLabel(streak.type)}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-3xl leading-none font-mono font-bold text-[var(--accent)]">
                                                    {streak.currentLength}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)] mt-1">days</p>
                                            </div>
                                        </div>

                                        <p className="text-sm text-[var(--text-secondary)] mt-3">
                                            {formatRule(streak.type, streak.threshold)}
                                        </p>

                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                            <div>
                                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Window</p>
                                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                                    {formatDate(streak.currentStartDate)} → {formatDate(streak.currentEndDate)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Record</p>
                                                <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{streak.longestLength} days</p>
                                            </div>
                                        </div>

                                        {nextBadge && (
                                            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-[var(--text-muted)]">Next: {nextBadge.tier} badge</span>
                                                    <span className="text-[var(--text-secondary)] font-mono">{nextBadge.remaining}d left</span>
                                                </div>
                                                <div className="progress-bar mt-1.5">
                                                    <div
                                                        className={`progress-fill ${tierBackgroundColors[nextBadge.tier]}`}
                                                        style={{ width: `${Math.min(100, ((nextBadge.requirement - nextBadge.remaining) / nextBadge.requirement) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {streak.impactOnTrend != null && streak.impactOnTrend !== 0 && (
                                            <p className={`text-xs mt-2 flex items-center gap-1 ${streak.impactOnTrend > 0 ? 'text-success' : 'text-error'}`}>
                                                {streak.impactOnTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                {Math.abs(streak.impactOnTrend).toFixed(1)}% readiness delta
                                            </p>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── All Streaks Tab ── */}
            {activeTab === 'all' && (
                <div>
                    {streakRows.length === 0 ? (
                        <div className="card p-8 text-center">
                            <ListChecks className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                            <p className="text-sm font-medium text-[var(--text-secondary)]">No qualifying streaks yet</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">You need at least one 3-day run to appear here.</p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile cards */}
                            <div className="space-y-3 md:hidden">
                                {streakRows.map(streak => {
                                    const nextBadge = getNextBadgeTarget(streak.longestLength);
                                    return (
                                        <button
                                            key={streak.id}
                                            type="button"
                                            onClick={() => handleStreakClick(streak, 'record')}
                                            className="w-full card p-4 text-left hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {getStreakIcon(streak.type, streak.icon)}
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-[var(--text-primary)] truncate">{streak.userName}</p>
                                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{getStreakLabel(streak.type)}</p>
                                                    </div>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${streak.isActive ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
                                                    {streak.isActive ? 'active' : 'idle'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                                                <div>
                                                    <p className="text-[var(--text-muted)] uppercase tracking-wider">Current</p>
                                                    <p className={`font-mono mt-1 ${streak.isActive ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-secondary)]'}`}>
                                                        {streak.currentLength}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[var(--text-muted)] uppercase tracking-wider">Record</p>
                                                    <p className="font-mono mt-1 font-bold text-[var(--text-primary)]">{streak.longestLength}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[var(--text-muted)] uppercase tracking-wider">Next Badge</p>
                                                    <p className="mt-1 text-[var(--text-secondary)]">
                                                        {nextBadge ? `${nextBadge.remaining}d` : 'Done'}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Desktop table */}
                            <div className="hidden md:block card overflow-x-auto">
                                <div className="min-w-[760px]">
                                    <div className="grid grid-cols-[1fr_1.4fr_1.5fr_0.7fr_0.7fr_0.8fr] text-xs text-[var(--text-muted)] uppercase tracking-wider p-3 border-b border-[var(--border-subtle)] font-medium">
                                        <div>User</div>
                                        <div>Streak Type</div>
                                        <div>Rule</div>
                                        <div className="text-center">Current</div>
                                        <div className="text-center">Record</div>
                                        <div className="text-right">Next Badge</div>
                                    </div>
                                    {streakRows.map(streak => {
                                        const nextBadge = getNextBadgeTarget(streak.longestLength);
                                        return (
                                            <button
                                                key={streak.id}
                                                type="button"
                                                onClick={() => handleStreakClick(streak, 'record')}
                                                className="grid grid-cols-[1fr_1.4fr_1.5fr_0.7fr_0.7fr_0.8fr] w-full p-3 items-center hover:bg-[var(--bg-hover)] transition-colors text-left min-h-[44px]"
                                            >
                                                <div className="font-medium text-[var(--text-primary)]">
                                                    {streak.userName}
                                                </div>
                                                <div className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                                                    {getStreakIcon(streak.type, streak.icon)}
                                                    {getStreakLabel(streak.type)}
                                                </div>
                                                <div className="text-sm text-[var(--text-secondary)]">
                                                    {formatRule(streak.type, streak.threshold)}
                                                </div>
                                                <div className={`text-center font-mono ${streak.isActive ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>
                                                    {streak.currentLength}
                                                </div>
                                                <div className="text-center font-mono font-bold text-[var(--text-primary)]">
                                                    {streak.longestLength}
                                                </div>
                                                <div className="text-right text-sm text-[var(--text-secondary)]">
                                                    {nextBadge ? `${nextBadge.remaining}d to ${nextBadge.tier}` : 'Complete'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Badges Tab ── */}
            {activeTab === 'badges' && (
                <div className="space-y-6">
                    {/* Unlocked Badges */}
                    <div>
                        <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3 flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-warning" />
                            Unlocked Badges
                        </h3>
                        {unlockedBadges.length === 0 ? (
                            <div className="card p-6 text-center">
                                <Award className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                                <p className="text-sm text-[var(--text-secondary)]">No badges unlocked yet.</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Keep your streaks going — Bronze unlocks at 7 days!</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                                {unlockedBadges.map(badge => (
                                    <button
                                        key={badge.id}
                                        type="button"
                                        onClick={() => handleBadgeClick(badge)}
                                        className={`relative p-3 rounded-xl border ${tierBorderColors[badge.tier]} bg-[var(--bg-elevated)] text-left hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]`}
                                    >
                                        <div className={`absolute inset-0 rounded-xl ${tierSoftBackgroundColors[badge.tier]}`} />
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Award className={`w-4 h-4 ${tierTextColors[badge.tier]}`} />
                                                <span className={`text-[10px] uppercase tracking-wider font-semibold ${tierTextColors[badge.tier]}`}>
                                                    {badge.tier}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-[var(--text-primary)]">
                                                {badge.name.split('(')[0].trim()}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                                {getProfileDisplayName(profiles.find(p => p.id === badge.userId) || { email: 'User' })}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Upcoming Badges */}
                    {upcomingBadges.length > 0 && (
                        <div>
                            <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3 flex items-center gap-2">
                                <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                                Next Targets
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {upcomingBadges.map(badge => {
                                    const streak = analytics.streaks.find(s =>
                                        s.userId === badge.userId && s.type === badge.streakType
                                    );
                                    return (
                                        <button
                                            key={badge.id}
                                            type="button"
                                            onClick={() => handleBadgeClick(badge)}
                                            className="w-full card p-3 text-left hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{badge.name}</p>
                                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                                        Record {streak?.longestLength || 0} / {badge.requirement} days
                                                    </p>
                                                </div>
                                                <span className="font-mono text-sm text-[var(--text-secondary)] shrink-0">
                                                    {badge.progress.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="progress-bar mt-2">
                                                <div
                                                    className={`progress-fill ${tierBackgroundColors[badge.tier]}`}
                                                    style={{ width: `${badge.progress}%` }}
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tier legend */}
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">Badge Tiers</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {TIER_ORDER.map(tier => (
                                <div key={tier} className="flex items-center gap-2">
                                    <div className={`h-3 w-3 rounded-full ${tierBackgroundColors[tier]}`} />
                                    <span className="text-xs text-[var(--text-secondary)] capitalize">{tier}</span>
                                    <span className="text-xs text-[var(--text-muted)] font-mono">{BADGE_TIERS[tier].days}d</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Rules Tab ── */}
            {activeTab === 'rules' && (
                <div className="space-y-6">
                    <div className="card p-5 border-[var(--accent)]/40 bg-[var(--accent)]/[0.04]">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                                <Info className="w-5 h-5 text-[var(--accent)]" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                                    How Streaks Are Calculated
                                </h3>
                                <ol className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                                    <li>1. Each streak type has a daily rule shown in the grid below.</li>
                                    <li>2. A day counts only if data exists for that metric and meets the rule.</li>
                                    <li>3. A failed day or missing calendar day resets the current run.</li>
                                    <li>4. <strong>Current</strong> is your live run, <strong>Record</strong> is your all-time best, and badges are based on Record.</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3 flex items-center gap-2">
                            <Star className="w-4 h-4 text-warning" />
                            Streak Rules
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {STREAK_DEFINITIONS.map(def => (
                                <div key={def.type} className="card p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        {getStreakIcon(def.type, def.icon)}
                                        <p className="font-medium text-[var(--text-primary)]">{getStreakLabel(def.type)}</p>
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {formatRule(def.type, def.threshold)}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] mt-2">
                                        Minimum qualifying streak: {def.minDays} days
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">Badge Tiers</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {TIER_ORDER.map(tier => (
                                <div key={tier} className="flex items-center gap-2">
                                    <div className={`h-3 w-3 rounded-full ${tierBackgroundColors[tier]}`} />
                                    <span className="text-sm text-[var(--text-secondary)] capitalize">{tier}</span>
                                    <span className="text-sm text-[var(--text-muted)] font-mono">{BADGE_TIERS[tier].days} days</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StreakTracker;

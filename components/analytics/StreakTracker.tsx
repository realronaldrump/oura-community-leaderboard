import React, { useMemo } from 'react';
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
    Info
} from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import DetailsModal from './DetailsModal';

interface StreakTrackerProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

type DetailContext = 'active' | 'record' | 'badge';

const tierColors: Record<BadgeTier, string> = {
    bronze: 'from-amber-600 to-amber-800',
    silver: 'from-gray-300 to-gray-500',
    gold: 'from-yellow-400 to-yellow-600',
    platinum: 'from-purple-300 to-purple-500'
};

const tierBorderColors: Record<BadgeTier, string> = {
    bronze: 'border-amber-600/50',
    silver: 'border-gray-400/50',
    gold: 'border-yellow-500/50',
    platinum: 'border-purple-400/50'
};

const tierTextColors: Record<BadgeTier, string> = {
    bronze: 'text-amber-500',
    silver: 'text-gray-300',
    gold: 'text-yellow-400',
    platinum: 'text-purple-400'
};

const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum'];

const getStreakIcon = (type: StreakType, iconId?: string) => {
    if (iconId) {
        switch (iconId) {
            case 'crown': return <Crown className="w-5 h-5 text-yellow-400" />;
            case 'zap': return <Zap className="w-5 h-5 text-green-400" />;
            case 'footprints': return <Footprints className="w-5 h-5 text-blue-400" />;
            case 'moon': return <Moon className="w-5 h-5 text-purple-400" />;
            case 'heart': return <HeartPulse className="w-5 h-5 text-red-500" />;
        }
    }

    switch (type) {
        case 'sleep_consistency': return <Crown className="w-5 h-5 text-yellow-400" />;
        case 'readiness_streak': return <Zap className="w-5 h-5 text-green-400" />;
        case 'step_goal': return <Footprints className="w-5 h-5 text-blue-400" />;
        case 'early_bedtime': return <Moon className="w-5 h-5 text-purple-400" />;
        default: return <HeartPulse className="w-5 h-5 text-red-500" />;
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
    return new Date(value).toLocaleDateString(undefined, {
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

            const userName = (profile.email || 'User').split('@')[0];
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

            <div className="card p-5 border-[var(--accent)]/40 bg-[var(--accent)]/[0.04]">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                        <Info className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                            How Streaks Are Calculated
                        </h3>
                        <ol className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                            <li>1. Each streak type has a daily rule shown in the grid below.</li>
                            <li>2. A day counts only if data exists for that metric and meets the rule.</li>
                            <li>3. A failed day or missing calendar day resets the current run.</li>
                            <li>4. `Current` is your live run, `Record` is your all-time best run, and badges are based on `Record`.</li>
                        </ol>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400" />
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="card p-4">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Active Streaks</p>
                    <p className="text-2xl font-mono font-bold text-[var(--accent)] mt-1">{activeStreaks.length}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Runs ending on latest tracked day</p>
                </div>
                <div className="card p-4">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Best Live Run</p>
                    <p className="text-2xl font-mono font-bold text-[var(--text-primary)] mt-1">{bestActive?.currentLength ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {bestActive ? `${bestActive.userName} · ${getStreakLabel(bestActive.type)}` : 'No active run'}
                    </p>
                </div>
                <div className="card p-4">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Top Record</p>
                    <p className="text-2xl font-mono font-bold text-[var(--text-primary)] mt-1">{bestRecord?.longestLength ?? 0}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {bestRecord ? `${bestRecord.userName} · ${getStreakLabel(bestRecord.type)}` : 'No qualifying records yet'}
                    </p>
                </div>
                <div className="card p-4">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Closest Badge</p>
                    <p className="text-2xl font-mono font-bold text-[var(--text-primary)] mt-1">{closestBadge ? `${closestBadge.progress.toFixed(0)}%` : '—'}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {closestBadge ? closestBadge.name : 'No badge progress yet'}
                    </p>
                </div>
            </div>

            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-400" />
                    Active Now
                    <InfoTooltip
                        title="Active Streaks"
                        description="These streaks currently continue through your latest tracked day."
                        calculation="Current streak resets when a day fails the rule or when a calendar day is skipped in the source metric."
                    />
                </h3>
                {activeStreaks.length === 0 ? (
                    <div className="card p-5 text-sm text-[var(--text-secondary)]">
                        No active streaks right now. Your record streaks and badge progress are still tracked below.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {activeStreaks.map(streak => {
                            const nextBadge = getNextBadgeTarget(streak.longestLength);
                            return (
                                <button
                                    key={streak.id}
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
                                            <p className="text-xs text-[var(--text-muted)] mt-1">current days</p>
                                        </div>
                                    </div>

                                    <p className="text-sm text-[var(--text-secondary)] mt-3">
                                        {formatRule(streak.type, streak.threshold)}
                                    </p>

                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Current Window</p>
                                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                                                {formatDate(streak.currentStartDate)} → {formatDate(streak.currentEndDate)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Record</p>
                                            <p className="text-sm font-mono text-[var(--text-primary)] mt-1">{streak.longestLength} days</p>
                                        </div>
                                    </div>

                                    {nextBadge ? (
                                        <p className="text-xs text-[var(--text-muted)] mt-3">
                                            {nextBadge.remaining} days to {nextBadge.tier} ({nextBadge.requirement}-day) badge
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-400 mt-3">
                                            All badge tiers unlocked for this streak
                                        </p>
                                    )}

                                    {streak.impactOnTrend != null && streak.impactOnTrend !== 0 && (
                                        <p className={`text-xs mt-2 flex items-center gap-1 ${streak.impactOnTrend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {streak.impactOnTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {Math.abs(streak.impactOnTrend).toFixed(1)}% readiness delta during this run
                                        </p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    Badge Progression
                    <InfoTooltip
                        title="Badge Progress"
                        description="Badges are tied to your record streak length for each habit."
                        calculation="Bronze: 7 days, Silver: 14 days, Gold: 30 days, Platinum: 60 days."
                    />
                </h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Unlocked Badges</p>
                        {unlockedBadges.length === 0 ? (
                            <p className="text-sm text-[var(--text-secondary)]">No unlocked badges yet.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {unlockedBadges.map(badge => (
                                    <button
                                        key={badge.id}
                                        onClick={() => handleBadgeClick(badge)}
                                        className={`relative p-3 rounded-lg border ${tierBorderColors[badge.tier]} bg-[var(--bg-elevated)] text-left hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]`}
                                    >
                                        <div className={`absolute inset-0 bg-gradient-to-br ${tierColors[badge.tier]} opacity-10 rounded-lg`} />
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Award className={`w-4 h-4 ${tierTextColors[badge.tier]}`} />
                                                <span className={`text-[10px] uppercase tracking-wider ${tierTextColors[badge.tier]}`}>
                                                    {badge.tier}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-[var(--text-primary)]">
                                                {badge.name.split('(')[0].trim()}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                                {(profiles.find(p => p.id === badge.userId)?.email || 'User').split('@')[0]}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="card p-4">
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Next Badge Targets</p>
                        {upcomingBadges.length === 0 ? (
                            <p className="text-sm text-[var(--text-secondary)]">All current streak badges are unlocked.</p>
                        ) : (
                            <div className="space-y-3">
                                {upcomingBadges.map(badge => {
                                    const streak = analytics.streaks.find(s =>
                                        s.userId === badge.userId && s.type === badge.streakType
                                    );
                                    return (
                                        <button
                                            key={badge.id}
                                            onClick={() => handleBadgeClick(badge)}
                                            className="w-full card p-3 text-left hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-[var(--text-primary)]">{badge.name}</p>
                                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                                        Record {streak?.longestLength || 0} / {badge.requirement} days
                                                    </p>
                                                </div>
                                                <span className="font-mono text-sm text-[var(--text-secondary)]">
                                                    {badge.progress.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="progress-bar mt-2">
                                                <div
                                                    className={`progress-fill bg-gradient-to-r ${tierColors[badge.tier]}`}
                                                    style={{ width: `${badge.progress}%` }}
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400" />
                    All Streaks
                    <InfoTooltip
                        title="Current vs Record"
                        description="Current is your active run. Record is your all-time best run for the same streak type."
                        calculation="Rows include only streak types where you have at least one 3-day qualifying run."
                    />
                </h3>

                {streakRows.length === 0 ? (
                    <div className="card p-5 text-sm text-[var(--text-secondary)]">
                        No qualifying streaks yet. You need at least one 3-day run to appear here.
                    </div>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {streakRows.map(streak => {
                                const nextBadge = getNextBadgeTarget(streak.longestLength);
                                return (
                                    <button
                                        key={streak.id}
                                        onClick={() => handleStreakClick(streak, 'record')}
                                        className="w-full card p-4 text-left hover:bg-[var(--bg-hover)] transition-colors min-h-[44px]"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium text-[var(--text-primary)]">{streak.userName}</p>
                                                <p className="text-xs text-[var(--text-muted)] mt-0.5">{getStreakLabel(streak.type)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {getStreakIcon(streak.type, streak.icon)}
                                                <span className={`text-xs px-2 py-1 rounded-full ${streak.isActive ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
                                                    {streak.isActive ? 'active' : 'idle'}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-[var(--text-secondary)] mt-2">
                                            {formatRule(streak.type, streak.threshold)}
                                        </p>
                                        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                                            <div>
                                                <p className="text-[var(--text-muted)] uppercase tracking-wider">Current</p>
                                                <p className={`font-mono mt-1 ${streak.isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                                                    {streak.currentLength}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[var(--text-muted)] uppercase tracking-wider">Record</p>
                                                <p className="font-mono mt-1 text-[var(--text-primary)]">{streak.longestLength}</p>
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
        </div>
    );
};

export default StreakTracker;

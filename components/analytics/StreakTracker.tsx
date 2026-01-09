import React, { useMemo } from 'react';
import { DailyStats } from '../../types';
import { Streak, Badge, BadgeTier } from '../../types/analyticsTypes';
import { calculateStreaks, generateBadges, BADGE_TIERS } from '../../services/analyticsService';
import { Flame, Trophy, TrendingUp, TrendingDown, Star, Crown, Zap, Footprints, Moon, Heart, Award, HeartPulse, Activity } from 'lucide-react';
import InfoTooltip from './InfoTooltip';

interface StreakTrackerProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

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

const getStreakIcon = (type: string, iconId?: string) => {
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
        default: return <Heart className="w-5 h-5 text-red-400" />;
    }
};

const StreakTracker: React.FC<StreakTrackerProps> = ({ profiles, usersData }) => {
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

    const activeStreaks = analytics.streaks.filter(s => s.isActive && s.currentLength >= 3);
    const unlockedBadges = analytics.badges.filter(b => b.isUnlocked);
    const progressBadges = analytics.badges
        .filter(b => !b.isUnlocked && b.progress >= 30)
        .sort((a, b) => b.progress - a.progress)
        .slice(0, 6);

    if (!analytics.streaks.length) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <Trophy className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Streaks Yet</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Keep tracking your health to start building streaks and earning badges!
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Active Streaks */}
            {activeStreaks.length > 0 && (
                <div>
                    <h3 className="section-header flex items-center gap-2">
                        <Flame className="w-5 h-5 text-orange-400" />
                        Active Streaks
                        <InfoTooltip
                            title="Active Streaks"
                            description="Consecutive days you've maintained healthy habits. Streaks of 3+ days are shown here."
                            calculation="A streak counts each consecutive day where you meet the criteria (e.g., 7+ hours sleep, 10k steps). The impact percentage shows how your readiness changes during streaks."
                        />
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeStreaks.map(streak => (
                            <div
                                key={streak.id}
                                className="card p-4 border-l-4 border-l-[var(--accent)]"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    {getStreakIcon(streak.type, streak.icon)}
                                    <span className="text-3xl font-bold text-[var(--accent)] font-mono">
                                        {streak.currentLength}
                                    </span>
                                </div>
                                <h4 className="font-semibold text-[var(--text-primary)]">
                                    {streak.userName}
                                </h4>
                                <p className="text-sm text-[var(--text-muted)]">
                                    {streak.type === 'sleep_consistency' ? 'Sleep Consistency' :
                                        streak.type === 'readiness_streak' ? 'Readiness Streak' :
                                            streak.type === 'step_goal' ? 'Step Goal Streak' :
                                                streak.type === 'early_bedtime' ? 'Early Bedtime' : 'HRV Hero'}
                                </p>
                                {streak.impactOnTrend != null && streak.impactOnTrend !== 0 && (
                                    <p className={`text-xs mt-2 flex items-center gap-1 ${streak.impactOnTrend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {streak.impactOnTrend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        {Math.abs(streak.impactOnTrend).toFixed(1)}% readiness during streak
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Trophy Case */}
            {unlockedBadges.length > 0 && (
                <div>
                    <h3 className="section-header flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                        Trophy Case
                        <InfoTooltip
                            title="Trophy Case"
                            description="Badges you've earned by maintaining streaks. Higher tiers require longer consecutive streaks."
                            calculation="Bronze: 7 days, Silver: 14 days, Gold: 30 days, Platinum: 60+ days of consistent behavior."
                        />
                    </h3>
                    <div className="card p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {unlockedBadges.map(badge => (
                                <div
                                    key={badge.id}
                                    className={`relative p-4 rounded-lg border ${tierBorderColors[badge.tier]} bg-[var(--bg-elevated)] flex flex-col items-center text-center group hover:scale-105 transition-transform`}
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-br ${tierColors[badge.tier]} opacity-10 rounded-lg`} />
                                    <Award className={`w-8 h-8 mb-2 relative z-10 ${badge.tier === 'platinum' ? 'text-purple-400' :
                                        badge.tier === 'gold' ? 'text-yellow-400' :
                                            badge.tier === 'silver' ? 'text-gray-300' : 'text-amber-500'
                                        }`} />
                                    <span className="text-xs font-medium text-[var(--text-primary)] relative z-10">
                                        {badge.name.split('(')[0].trim()}
                                    </span>
                                    <span className={`text-[10px] uppercase tracking-wider mt-1 relative z-10 ${badge.tier === 'platinum' ? 'text-purple-400' :
                                        badge.tier === 'gold' ? 'text-yellow-400' :
                                            badge.tier === 'silver' ? 'text-gray-300' : 'text-amber-500'
                                        }`}>
                                        {badge.tier}
                                    </span>

                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-default)] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                                        <p className="text-xs text-[var(--text-secondary)]">{badge.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Progress Towards Next Badges */}
            {progressBadges.length > 0 && (
                <div>
                    <h3 className="section-header flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-400" />
                        Almost There
                        <InfoTooltip
                            title="Upcoming Badges"
                            description="Badges you're close to earning. Keep up your streaks to unlock these!"
                            calculation="Shows badges where you've completed at least 30% of the required days. Progress resets if you break the streak."
                        />
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {progressBadges.map(badge => (
                            <div key={badge.id} className="card p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <Award className={`w-6 h-6 opacity-50 ${badge.tier === 'platinum' ? 'text-purple-400' :
                                        badge.tier === 'gold' ? 'text-yellow-400' :
                                            badge.tier === 'silver' ? 'text-gray-300' : 'text-amber-500'
                                        }`} />
                                    <div className="flex-1">
                                        <h4 className="font-medium text-[var(--text-primary)] text-sm">
                                            {badge.name}
                                        </h4>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {badge.requirement} days needed
                                        </p>
                                    </div>
                                    <span className="text-sm font-mono text-[var(--text-muted)]">
                                        {badge.progress.toFixed(0)}%
                                    </span>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className={`progress-fill bg-gradient-to-r ${tierColors[badge.tier]}`}
                                        style={{ width: `${badge.progress}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* All-Time Records */}
            <div>
                <h3 className="section-header flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400" />
                    Personal Records
                    <InfoTooltip
                        title="Personal Records"
                        description="Your best and current streak lengths across all categories."
                        calculation="'Current' shows your active streak (if any). 'Best' is your all-time longest streak for each category."
                    />
                </h3>
                <div className="card overflow-hidden">
                    <div className="grid grid-cols-4 text-xs text-[var(--text-muted)] uppercase tracking-wider p-3 border-b border-[var(--border-subtle)] font-medium">
                        <div>User</div>
                        <div>Streak Type</div>
                        <div className="text-center">Current</div>
                        <div className="text-center">Best</div>
                    </div>
                    {analytics.streaks.map(streak => (
                        <div
                            key={streak.id}
                            className="grid grid-cols-4 p-3 items-center hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <div className="font-medium text-[var(--text-primary)]">
                                {streak.userName}
                            </div>
                            <div className="text-[var(--text-secondary)] text-sm flex items-center gap-2">
                                {getStreakIcon(streak.type, streak.icon)}
                                {streak.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </div>
                            <div className={`text-center font-mono ${streak.isActive ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>
                                {streak.currentLength || '-'}
                            </div>
                            <div className="text-center font-mono text-[var(--text-primary)] font-bold">
                                {streak.longestLength}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StreakTracker;

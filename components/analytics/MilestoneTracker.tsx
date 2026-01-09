import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { Milestone, CalendarHeatmapDay } from '../../types/analyticsTypes';
import { calculateMilestones, generateCalendarHeatmap } from '../../services/analyticsService';
import { Trophy, Target, Calendar, Users, User, BedDouble, Footprints, Flame, TrendingUp, Check } from 'lucide-react';

interface MilestoneTrackerProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const getMilestoneIcon = (type: string) => {
    switch (type) {
        case 'days_tracked': return <Calendar className="w-6 h-6 text-blue-400" />;
        case 'total_sleep_hours': return <BedDouble className="w-6 h-6 text-purple-400" />;
        case 'total_steps': return <Footprints className="w-6 h-6 text-green-400" />;
        case 'streak_achievement': return <Flame className="w-6 h-6 text-orange-400" />;
        case 'score_improvement': return <TrendingUp className="w-6 h-6 text-cyan-400" />;
        default: return <Target className="w-6 h-6 text-gray-400" />;
    }
};

type HeatmapMetric = 'sleep' | 'readiness' | 'activity' | 'average';

const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({ profiles, usersData }) => {
    const [selectedUser, setSelectedUser] = useState(0);
    const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('average');

    const milestones = useMemo(() => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return [];

        return calculateMilestones(usersDataFormatted);
    }, [profiles, usersData]);

    const heatmapData = useMemo(() => {
        const data = usersData[selectedUser]?.data;
        if (!data) return [];

        return generateCalendarHeatmap(data, heatmapMetric);
    }, [usersData, selectedUser, heatmapMetric]);

    const userMilestones = milestones.filter(m =>
        m.userId === profiles[selectedUser]?.id || !m.userId
    );

    const achievedMilestones = userMilestones.filter(m => m.isAchieved);
    const upcomingMilestones = userMilestones
        .filter(m => !m.isAchieved)
        .sort((a, b) => (b.value / b.target) - (a.value / a.target))
        .slice(0, 6);

    const groupMilestones = milestones.filter(m => !m.userId);

    // Generate calendar grid (last 365 days)
    const calendarGrid = useMemo(() => {
        const grid: Array<{ date: string; value: number; weekday: number; month: number }> = [];
        const today = new Date();
        const heatmapMap = new Map(heatmapData.map(d => [d.date, d.value]));

        for (let i = 364; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            grid.push({
                date: dateStr,
                value: heatmapMap.get(dateStr) || 0,
                weekday: date.getDay(),
                month: date.getMonth()
            });
        }

        return grid;
    }, [heatmapData]);

    // Group by week for display
    const weeks = useMemo(() => {
        const result: Array<Array<typeof calendarGrid[0] | null>> = [];
        let currentWeek: Array<typeof calendarGrid[0] | null> = [];

        // Pad first week
        if (calendarGrid.length > 0) {
            const firstDay = calendarGrid[0].weekday;
            for (let i = 0; i < firstDay; i++) {
                currentWeek.push(null);
            }
        }

        for (const day of calendarGrid) {
            currentWeek.push(day);
            if (day.weekday === 6) {
                result.push(currentWeek);
                currentWeek = [];
            }
        }

        if (currentWeek.length > 0) {
            result.push(currentWeek);
        }

        return result;
    }, [calendarGrid]);

    const getHeatmapColor = (value: number) => {
        if (value === 0) return 'bg-[var(--bg-elevated)]';
        if (value < 50) return 'bg-red-900/50';
        if (value < 65) return 'bg-orange-800/50';
        if (value < 75) return 'bg-yellow-700/50';
        if (value < 85) return 'bg-green-700/50';
        return 'bg-green-500/70';
    };

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <Trophy className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Milestones Yet</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Sync your data to start tracking milestones.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with User Selector */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h3 className="section-header mb-0">Long-Term Milestones</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Track your journey and celebrate achievements
                    </p>
                </div>

                <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                >
                    {profiles.map((p, idx) => (
                        <option key={p.id} value={idx}>
                            {(p.email || 'User').split('@')[0]}
                        </option>
                    ))}
                </select>
            </div>

            {/* Achieved Milestones */}
            {achievedMilestones.length > 0 && (
                <div>
                    <h4 className="section-header flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" /> Achieved
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {achievedMilestones.slice(0, 12).map(milestone => (
                            <div
                                key={milestone.id}
                                className="card p-4 text-center border-[var(--accent)]/30 bg-[var(--accent)]/5"
                            >
                                <div className="flex justify-center mb-2">
                                    {getMilestoneIcon(milestone.type)}
                                </div>
                                <h5 className="font-medium text-[var(--text-primary)] text-sm">
                                    {milestone.name}
                                </h5>
                                <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center justify-center gap-1">
                                    {milestone.userId ? <User className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                                    {milestone.userId ? 'Personal' : 'Group'}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Next Milestones */}
            {upcomingMilestones.length > 0 && (
                <div>
                    <h4 className="section-header flex items-center gap-2">
                        <Target className="w-5 h-5 text-blue-400" /> Next Goals
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {upcomingMilestones.map(milestone => {
                            const progress = (milestone.value / milestone.target) * 100;
                            return (
                                <div key={milestone.id} className="card p-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        {getMilestoneIcon(milestone.type)}
                                        <div className="flex-1 min-w-0">
                                            <h5 className="font-medium text-[var(--text-primary)] truncate">
                                                {milestone.name}
                                            </h5>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {milestone.description}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex-1 progress-bar">
                                            <div
                                                className="progress-fill bg-[var(--accent)]"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-mono text-[var(--text-muted)]">
                                            {progress.toFixed(0)}%
                                        </span>
                                    </div>

                                    <p className="text-xs text-[var(--text-secondary)]">
                                        <span className="font-mono font-medium">{milestone.value.toLocaleString()}</span>
                                        {' / '}
                                        <span className="font-mono">{milestone.target.toLocaleString()}</span>
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Calendar Heatmap */}
            <div>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
                    <h4 className="section-header mb-0 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-400" /> Score History
                    </h4>

                    <div className="flex gap-2">
                        {(['average', 'sleep', 'readiness', 'activity'] as HeatmapMetric[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setHeatmapMetric(m)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${heatmapMetric === m
                                    ? 'bg-[var(--accent)] text-black'
                                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="card p-4 overflow-x-auto">
                    {/* Month labels */}
                    <div className="flex mb-2 ml-8">
                        {(() => {
                            const monthLabels: Array<{ month: number; position: number }> = [];
                            let lastMonth = -1;

                            weeks.forEach((week, weekIdx) => {
                                const validDay = week.find(d => d !== null);
                                if (validDay && validDay.month !== lastMonth) {
                                    monthLabels.push({ month: validDay.month, position: weekIdx });
                                    lastMonth = validDay.month;
                                }
                            });

                            return monthLabels.map((m, idx) => (
                                <span
                                    key={idx}
                                    className="text-xs text-[var(--text-muted)] absolute"
                                    style={{ marginLeft: m.position * 14 }}
                                >
                                    {months[m.month]}
                                </span>
                            ));
                        })()}
                    </div>

                    <div className="flex gap-1 mt-6">
                        {/* Day labels */}
                        <div className="flex flex-col gap-1 mr-1">
                            {['', 'M', '', 'W', '', 'F', ''].map((d, i) => (
                                <span key={i} className="text-[10px] text-[var(--text-muted)] h-3 leading-3">
                                    {d}
                                </span>
                            ))}
                        </div>

                        {/* Weeks */}
                        {weeks.map((week, weekIdx) => (
                            <div key={weekIdx} className="flex flex-col gap-1">
                                {week.map((day, dayIdx) => (
                                    <div
                                        key={dayIdx}
                                        className={`w-3 h-3 rounded-sm ${day ? getHeatmapColor(day.value) : 'invisible'} group relative cursor-pointer`}
                                        title={day ? `${day.date}: ${day.value.toFixed(0)}` : ''}
                                    >
                                        {day && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                                                <p className="font-medium text-[var(--text-primary)]">
                                                    {new Date(day.date).toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </p>
                                                <p className="text-[var(--text-muted)]">
                                                    {heatmapMetric.charAt(0).toUpperCase() + heatmapMetric.slice(1)}: {day.value.toFixed(0)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center justify-end gap-2 mt-4">
                        <span className="text-xs text-[var(--text-muted)]">Less</span>
                        <div className="flex gap-1">
                            <div className="w-3 h-3 rounded-sm bg-[var(--bg-elevated)]" />
                            <div className="w-3 h-3 rounded-sm bg-red-900/50" />
                            <div className="w-3 h-3 rounded-sm bg-orange-800/50" />
                            <div className="w-3 h-3 rounded-sm bg-yellow-700/50" />
                            <div className="w-3 h-3 rounded-sm bg-green-700/50" />
                            <div className="w-3 h-3 rounded-sm bg-green-500/70" />
                        </div>
                        <span className="text-xs text-[var(--text-muted)]">More</span>
                    </div>
                </div>
            </div>

            {/* Group Milestones */}
            {groupMilestones.length > 0 && (
                <div>
                    <h4 className="section-header flex items-center gap-2">
                        <Users className="w-5 h-5 text-cyan-400" /> Group Achievements
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupMilestones.slice(0, 4).map(milestone => {
                            const progress = Math.min(100, (milestone.value / milestone.target) * 100);
                            return (
                                <div
                                    key={milestone.id}
                                    className={`card p-4 ${milestone.isAchieved ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {milestone.isAchieved
                                                ? <Check className="w-5 h-5 text-green-400" />
                                                : <Target className="w-5 h-5 text-[var(--text-muted)]" />
                                            }
                                            <h5 className="font-medium text-[var(--text-primary)]">
                                                {milestone.name}
                                            </h5>
                                        </div>
                                        {milestone.isAchieved && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">
                                                Achieved!
                                            </span>
                                        )}
                                    </div>

                                    {!milestone.isAchieved && (
                                        <>
                                            <div className="progress-bar mb-2">
                                                <div
                                                    className="progress-fill bg-[var(--accent)]"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {milestone.value.toLocaleString()} / {milestone.target.toLocaleString()}
                                            </p>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MilestoneTracker;

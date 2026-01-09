import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { TimelineDataPoint, TimelineInsight } from '../../types/analyticsTypes';
import { generateTimelineData } from '../../services/analyticsService';
import { Clock, BedDouble, Activity, Heart, ChevronLeft, ChevronRight } from 'lucide-react';

interface TimelineViewProps {
    profiles: Array<{ id: string; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const userColors = ['#00C896', '#A855F7', '#F59E0B', '#3B82F6'];

const TimelineView: React.FC<TimelineViewProps> = ({ profiles, usersData }) => {
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const today = new Date();
        today.setDate(today.getDate() - 1);
        return today.toISOString().split('T')[0];
    });
    const [zoomedHour, setZoomedHour] = useState<number | null>(null);

    const availableDates = useMemo(() => {
        const dates = new Set<string>();
        usersData.forEach(({ data }) => {
            data?.session?.forEach(s => dates.add(s.day));
        });
        return [...dates].sort().reverse().slice(0, 30);
    }, [usersData]);

    const { dataPoints, insights } = useMemo(() => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: (profile.email || 'User').split('@')[0],
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) {
            return { dataPoints: [], insights: [] };
        }

        return generateTimelineData(selectedDate, usersDataFormatted);
    }, [profiles, usersData, selectedDate]);

    // Get session data for detailed timeline
    const sessionData = useMemo(() => {
        return profiles.map((profile, idx) => {
            const data = usersData[idx]?.data;
            const session = data?.session?.find(s => s.day === selectedDate);
            const userName = (profile.email || 'User').split('@')[0];

            return {
                userId: profile.id,
                userName,
                session,
                color: userColors[idx % userColors.length]
            };
        }).filter(u => u.session);
    }, [profiles, usersData, selectedDate]);

    const formatHour = (hour: number) => {
        if (hour === 0) return '12AM';
        if (hour === 12) return '12PM';
        if (hour < 12) return `${hour}AM`;
        return `${hour - 12}PM`;
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const getInsightIcon = (type: string) => {
        switch (type) {
            case 'sleep_timing': return <BedDouble className="w-4 h-4 text-blue-400" />;
            case 'activity': return <Activity className="w-4 h-4 text-green-400" />;
            default: return <Heart className="w-4 h-4 text-red-400" />;
        }
    };

    if (usersData.every(u => !u.data)) {
        return (
            <div className="card p-8 text-center">
                <div className="flex justify-center mb-4">
                    <Clock className="w-12 h-12 text-[var(--text-muted)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Timeline Data</h3>
                <p className="text-[var(--text-muted)] text-sm">
                    Sync your data to see the daily timeline view.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Date Selector */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                    <h3 className="section-header mb-0">24-Hour Timeline</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Compare daily patterns across users
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const idx = availableDates.indexOf(selectedDate);
                            if (idx < availableDates.length - 1) {
                                setSelectedDate(availableDates[idx + 1]);
                            }
                        }}
                        disabled={availableDates.indexOf(selectedDate) >= availableDates.length - 1}
                        className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    >
                        {availableDates.map(date => (
                            <option key={date} value={date}>
                                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                })}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            const idx = availableDates.indexOf(selectedDate);
                            if (idx > 0) {
                                setSelectedDate(availableDates[idx - 1]);
                            }
                        }}
                        disabled={availableDates.indexOf(selectedDate) <= 0}
                        className="p-2 rounded-lg hover:bg-[var(--bg-hover)] disabled:opacity-30 transition-all"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Insights */}
            {insights.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    {insights.map((insight, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20"
                        >
                            {getInsightIcon(insight.type)}
                            <span className="text-sm text-[var(--text-secondary)]">
                                {insight.description}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Timeline Visualization */}
            <div className="card overflow-hidden">
                {/* Hour labels */}
                <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <div className="w-24 flex-shrink-0 p-2 text-xs text-[var(--text-muted)] font-medium">
                        User
                    </div>
                    <div className="flex-1 flex">
                        {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => (
                            <div
                                key={hour}
                                className="flex-1 p-2 text-xs text-[var(--text-muted)] text-center border-l border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--bg-hover)]"
                                onClick={() => setZoomedHour(zoomedHour === hour ? null : hour)}
                            >
                                {formatHour(hour)}
                            </div>
                        ))}
                    </div>
                </div>

                {/* User rows */}
                {sessionData.map((userData, userIdx) => {
                    const { session, userName, color } = userData;
                    if (!session) return null;

                    const sleepStart = session.bedtime_start ? new Date(session.bedtime_start) : null;
                    const sleepEnd = session.bedtime_end ? new Date(session.bedtime_end) : null;

                    // Calculate sleep bar position (handle overnight sleep)
                    let sleepBarStyle = {};
                    if (sleepStart && sleepEnd) {
                        const startHour = sleepStart.getHours() + sleepStart.getMinutes() / 60;
                        const endHour = sleepEnd.getHours() + sleepEnd.getMinutes() / 60;

                        let leftPercent, widthPercent;
                        if (startHour > endHour) {
                            leftPercent = (startHour / 24) * 100;
                            widthPercent = ((24 - startHour + endHour) / 24) * 100;
                        } else {
                            leftPercent = (startHour / 24) * 100;
                            widthPercent = ((endHour - startHour) / 24) * 100;
                        }

                        sleepBarStyle = {
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`
                        };
                    }

                    return (
                        <div
                            key={userData.userId}
                            className="flex items-center border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <div className="w-24 flex-shrink-0 p-3 font-medium text-[var(--text-primary)] text-sm flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                {userName}
                            </div>
                            <div className="flex-1 relative h-16">
                                {/* Grid lines */}
                                {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => (
                                    <div
                                        key={hour}
                                        className="absolute top-0 bottom-0 border-l border-[var(--border-subtle)]"
                                        style={{ left: `${(hour / 24) * 100}%` }}
                                    />
                                ))}

                                {/* Sleep bar */}
                                {sleepStart && sleepEnd && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 h-8 rounded-full opacity-60 flex items-center justify-center"
                                        style={{
                                            ...sleepBarStyle,
                                            backgroundColor: color
                                        }}
                                    >
                                        <span className="text-xs font-medium text-white px-2 truncate flex items-center gap-1">
                                            <BedDouble className="w-3 h-3" /> Sleep
                                        </span>
                                    </div>
                                )}

                                {/* Sleep start marker */}
                                {sleepStart && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group cursor-pointer z-10"
                                        style={{ left: `${((sleepStart.getHours() + sleepStart.getMinutes() / 60) / 24) * 100}%` }}
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full border-2 border-white"
                                            style={{ backgroundColor: color }}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                            Fell asleep: {formatTime(sleepStart)}
                                        </div>
                                    </div>
                                )}

                                {/* Sleep end marker */}
                                {sleepEnd && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group cursor-pointer z-10"
                                        style={{ left: `${((sleepEnd.getHours() + sleepEnd.getMinutes() / 60) / 24) * 100}%` }}
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full border-2 border-white"
                                            style={{ backgroundColor: color }}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                            Woke up: {formatTime(sleepEnd)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {sessionData.length === 0 && (
                    <div className="p-8 text-center text-[var(--text-muted)]">
                        No sleep data available for {selectedDate}
                    </div>
                )}
            </div>

            {/* Sleep Details Table */}
            {sessionData.length > 0 && (
                <div className="card overflow-hidden">
                    <div className="grid grid-cols-5 text-xs text-[var(--text-muted)] uppercase tracking-wider p-3 border-b border-[var(--border-subtle)] font-medium bg-[var(--bg-elevated)]">
                        <div>User</div>
                        <div className="text-center">Bedtime</div>
                        <div className="text-center">Wake Time</div>
                        <div className="text-center">Total Sleep</div>
                        <div className="text-center">Efficiency</div>
                    </div>
                    {sessionData.map(({ userId, userName, session, color }) => {
                        if (!session) return null;

                        const sleepHours = session.total_sleep_duration
                            ? Math.floor(session.total_sleep_duration / 3600)
                            : 0;
                        const sleepMins = session.total_sleep_duration
                            ? Math.floor((session.total_sleep_duration % 3600) / 60)
                            : 0;

                        return (
                            <div
                                key={userId}
                                className="grid grid-cols-5 p-3 items-center hover:bg-[var(--bg-hover)] transition-colors"
                            >
                                <div className="font-medium text-[var(--text-primary)] flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: color }}
                                    />
                                    {userName}
                                </div>
                                <div className="text-center text-[var(--text-secondary)] font-mono text-sm">
                                    {session.bedtime_start
                                        ? formatTime(new Date(session.bedtime_start))
                                        : '--'}
                                </div>
                                <div className="text-center text-[var(--text-secondary)] font-mono text-sm">
                                    {session.bedtime_end
                                        ? formatTime(new Date(session.bedtime_end))
                                        : '--'}
                                </div>
                                <div className="text-center text-[var(--text-primary)] font-mono font-medium">
                                    {sleepHours}h {sleepMins}m
                                </div>
                                <div className="text-center text-[var(--text-secondary)] font-mono">
                                    {session.efficiency ?? '--'}%
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-sm text-[var(--text-muted)]">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[var(--accent)]" />
                    <span>Sleep Period</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-white bg-[var(--accent)]" />
                    <span>Sleep Start/End</span>
                </div>
            </div>
        </div>
    );
};

export default TimelineView;

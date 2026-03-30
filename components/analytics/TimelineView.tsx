import React, { useEffect, useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { generateTimelineData } from '../../services/analyticsService';
import { Clock, BedDouble, Activity, Heart } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import DateRangePicker from '../DateRangePicker';
import { getRelativeLocalISODate } from '../../utils/date';
import { getProfileDisplayName } from '../../utils/profileName';

interface TimelineViewProps {
    profiles: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const userColors = ['#6B9E8A', '#A08BBE', '#D4A574', '#7BA8D4'];

const TimelineView: React.FC<TimelineViewProps> = ({ profiles, usersData }) => {
    const [selectedDate, setSelectedDate] = useState<string>(() => getRelativeLocalISODate(-1));

    const availableDates = useMemo(() => {
        const dates = new Set<string>();
        usersData.forEach(({ data }) => {
            data?.session?.forEach(s => dates.add(s.day));
        });
        return [...dates].sort().reverse().slice(0, 30);
    }, [usersData]);

    useEffect(() => {
        if (!availableDates.length) return;
        if (!availableDates.includes(selectedDate)) {
            setSelectedDate(availableDates[0]);
        }
    }, [availableDates, selectedDate]);

    const { insights } = useMemo(() => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: getProfileDisplayName(profile),
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
            const userName = getProfileDisplayName(profile);

            return {
                userId: profile.id,
                userName,
                session,
                color: userColors[idx % userColors.length]
            };
        }).filter(u => u.session);
    }, [profiles, usersData, selectedDate]);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    const getInsightIcon = (type: string) => {
        switch (type) {
            case 'sleep_timing': return <BedDouble className="w-4 h-4 text-[#7BA8D4]" />;
            case 'activity': return <Activity className="w-4 h-4 text-[#7BC4A0]" />;
            default: return <Heart className="w-4 h-4 text-[#D4897B]" />;
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h3 className="section-header mb-0">24-Hour Timeline</h3>
                        <InfoTooltip
                            title="24-Hour Timeline"
                            description="Visualize when each user slept during the day. Compare sleep timing patterns side-by-side."
                            calculation="Sleep periods are shown on a Noon-to-Noon axis (12 PM previous day to 12 PM selected day) to display sessions continuously."
                        />
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                        Compare daily patterns across users
                    </p>
                </div>
                <DateRangePicker
                    mode="date"
                    dates={availableDates}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    showStepper
                    className="w-full lg:w-auto lg:shrink-0"
                />
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
                {/* Hour labels (Noon to Noon) */}
                <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <div className="w-24 flex-shrink-0 p-2 text-xs text-[var(--text-muted)] font-medium">
                        User
                    </div>
                    <div className="flex-1 flex relative h-8">
                        {/* 0 = 12PM prev day, 12 = 12AM, 24 = 12PM current day */}
                        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(offsetHours => {
                            const isMidnight = offsetHours === 12;
                            let label = '';
                            if (offsetHours % 12 === 0) {
                                label = isMidnight ? '12AM' : '12PM';
                            } else {
                                const h = offsetHours % 12; // 3, 6, 9
                                const isAm = offsetHours > 12 && offsetHours < 24;
                                label = `${h}${isAm ? 'AM' : 'PM'}`;
                            }

                            return (
                                <div
                                    key={offsetHours}
                                    className="absolute top-0 bottom-0 flex items-center justify-center transform -translate-x-1/2"
                                    style={{ left: `${(offsetHours / 24) * 100}%` }}
                                >
                                    <span className={`text-xs ${isMidnight ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* User rows */}
                {sessionData.map((userData, userIdx) => {
                    const { session, userName, color } = userData;
                    if (!session) return null;

                    const sleepStart = session.bedtime_start ? new Date(session.bedtime_start) : null;
                    const sleepEnd = session.bedtime_end ? new Date(session.bedtime_end) : null;

                    // Calculate window relative to Selected Date
                    // "Day" for sleep is usually the wake-up day.
                    // Window: 12PM (Day - 1) to 12PM (Day)
                    const dateObj = new Date(selectedDate + 'T12:00:00'); // Valid ISO for noon
                    const windowEnd = dateObj.getTime();
                    const windowStart = windowEnd - 24 * 60 * 60 * 1000;
                    const totalDuration = windowEnd - windowStart;

                    const getLeftPercent = (date: Date) => {
                        const t = date.getTime();
                        if (t < windowStart) return 0;
                        if (t > windowEnd) return 100;
                        return ((t - windowStart) / totalDuration) * 100;
                    };

                    let sleepBarStyle: React.CSSProperties = { display: 'none' };
                    let startLeft = 0;
                    let endLeft = 0;

                    if (sleepStart && sleepEnd) {
                        startLeft = getLeftPercent(sleepStart);
                        endLeft = getLeftPercent(sleepEnd);
                        const width = Math.max(endLeft - startLeft, 1); // Min 1% width to show *something*

                        sleepBarStyle = {
                            left: `${startLeft}%`,
                            width: `${width}%`,
                            display: 'flex'
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
                                        className={`absolute top-0 bottom-0 border-l ${hour === 12 ? 'border-[var(--text-muted)] opacity-50' : 'border-[var(--border-subtle)]'}`}
                                        style={{ left: `${(hour / 24) * 100}%` }}
                                    />
                                ))}

                                {/* Sleep bar */}
                                {sleepStart && sleepEnd && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 h-8 rounded-full opacity-60 flex items-center justify-center overflow-hidden"
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
                                        style={{ left: `${startLeft}%` }}
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full border-2 border-white"
                                            style={{ backgroundColor: color }}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-lg">
                                            Fell asleep: {formatTime(sleepStart)}
                                        </div>
                                    </div>
                                )}

                                {/* Sleep end marker */}
                                {sleepEnd && (
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group cursor-pointer z-10"
                                        style={{ left: `${endLeft}%` }}
                                    >
                                        <div
                                            className="w-4 h-4 rounded-full border-2 border-white"
                                            style={{ backgroundColor: color }}
                                        />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-lg">
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

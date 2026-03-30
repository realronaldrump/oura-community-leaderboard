import React, { useMemo, useState } from 'react';
import { DailyStats } from '../../types';
import { Milestone } from '../../types/analyticsTypes';
import { calculateMilestones, generateCalendarHeatmap } from '../../services/analyticsService';
import { Trophy, Target, Calendar, Users, User, BedDouble, Footprints, Flame, TrendingUp, Check } from 'lucide-react';
import InfoTooltip from './InfoTooltip';
import DetailsModal from './DetailsModal';
import { useUser } from '../../contexts/UserContext';
import PrimaryProfileSwitcher from '../PrimaryProfileSwitcher';
import { getProfileDisplayName } from '../../utils/profileName';

interface MilestoneTrackerProps {
    profiles: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
    usersData: Array<{ data: DailyStats | undefined }>;
}

const getMilestoneIcon = (type: string, iconId?: string) => {
    // If an explicit icon identifier is provided from the service, use it
    if (iconId) {
        switch (iconId) {
            case 'trophy': return <Trophy className="w-6 h-6 text-[#D4B87B]" />;
            case 'target': return <Target className="w-6 h-6 text-[#D4897B]" />;
            case 'calendar': return <Calendar className="w-6 h-6 text-[#7BA8D4]" />;
            case 'sleep': return <BedDouble className="w-6 h-6 text-[#A08BBE]" />;
            case 'bed': return <BedDouble className="w-6 h-6 text-[#7BA8D4]" />;
            case 'users': return <Users className="w-6 h-6 text-[#7BA8D4]" />;
        }
    }

    switch (type) {
        case 'days_tracked': return <Calendar className="w-6 h-6 text-[#7BA8D4]" />;
        case 'total_sleep_hours': return <BedDouble className="w-6 h-6 text-[#A08BBE]" />;
        case 'total_steps': return <Footprints className="w-6 h-6 text-[#7BC4A0]" />;
        case 'streak_achievement': return <Flame className="w-6 h-6 text-[#D4897B]" />;
        case 'score_improvement': return <TrendingUp className="w-6 h-6 text-[#7BA8D4]" />;
        default: return <Target className="w-6 h-6 text-[#C8C2BB]" />;
    }
};

type HeatmapMetric = 'sleep' | 'readiness' | 'activity' | 'average';
type HeatmapRange = '1y' | '2y' | 'all';

type CalendarGridDay = {
    date: string;
    value: number;
    weekday: number;
    month: number;
    year: number;
    hasAnyData: boolean;
    hasMetricData: boolean;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MS_PER_DAY = 86_400_000;

const toUtcDate = (isoDate: string): Date => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};

const toIsoDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const addUtcDays = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY);

const diffDaysInclusive = (start: Date, end: Date): number =>
    Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

const getTodayUtc = (): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

const formatDateForDisplay = (date: Date, options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat('en-US', options).format(
        new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );

const formatHistorySpan = (days: number): string => {
    if (days >= 365) {
        const years = days / 365;
        return `${years >= 10 ? years.toFixed(0) : years.toFixed(1)}y`;
    }

    if (days >= 30) {
        const months = days / 30.44;
        return `${months >= 10 ? months.toFixed(0) : months.toFixed(1)}mo`;
    }

    return `${days}d`;
};

const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({ profiles, usersData }) => {
    const { activeProfileId } = useUser();
    const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('average');
    const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>('1y');
    const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);

    const selectedUserIdx = useMemo(() => {
        if (profiles.length === 0) return -1;
        const idx = profiles.findIndex((profile) => profile.id === activeProfileId);
        return idx >= 0 ? idx : 0;
    }, [profiles, activeProfileId]);

    const selectedProfileId = selectedUserIdx >= 0 ? profiles[selectedUserIdx]?.id : null;

    const milestones = useMemo(() => {
        const usersDataFormatted = profiles.map((profile, idx) => ({
            userId: profile.id,
            userName: getProfileDisplayName(profile),
            data: usersData[idx]?.data as DailyStats
        })).filter(u => u.data);

        if (usersDataFormatted.length === 0) return [];

        return calculateMilestones(usersDataFormatted);
    }, [profiles, usersData]);

    const heatmapData = useMemo(() => {
        const data = selectedUserIdx >= 0 ? usersData[selectedUserIdx]?.data : undefined;
        if (!data) return [];

        return generateCalendarHeatmap(data, heatmapMetric);
    }, [usersData, selectedUserIdx, heatmapMetric]);

    const userMilestones = milestones.filter(m =>
        m.userId === selectedProfileId || !m.userId
    );

    const achievedMilestones = userMilestones.filter(m => m.isAchieved);
    const upcomingMilestones = userMilestones
        .filter(m => !m.isAchieved)
        .sort((a, b) => (b.value / b.target) - (a.value / a.target))
        .slice(0, 6);

    const groupMilestones = milestones.filter(m => !m.userId);

    const calendarView = useMemo(() => {
        const heatmapMap = new Map(heatmapData.map(day => [day.date, day.value]));
        const today = getTodayUtc();
        const firstDataDate = heatmapData.length > 0 ? toUtcDate(heatmapData[0].date) : null;
        const lastDataDate = heatmapData.length > 0 ? toUtcDate(heatmapData[heatmapData.length - 1].date) : null;
        const endDate = lastDataDate && lastDataDate > today ? lastDataDate : today;

        let startDate: Date;
        if (!firstDataDate) {
            startDate = addUtcDays(endDate, -364);
        } else if (heatmapRange === 'all') {
            startDate = firstDataDate;
        } else {
            const requestedDays = heatmapRange === '2y' ? 730 : 365;
            startDate = addUtcDays(endDate, -(requestedDays - 1));
            if (startDate < firstDataDate) startDate = firstDataDate;
        }

        const visibleDays = diffDaysInclusive(startDate, endDate);
        const grid: CalendarGridDay[] = [];

        for (let offset = 0; offset < visibleDays; offset++) {
            const date = addUtcDays(startDate, offset);
            const dateStr = toIsoDate(date);
            const value = heatmapMap.get(dateStr) ?? 0;
            const hasAnyData = heatmapMap.has(dateStr);

            grid.push({
                date: dateStr,
                value,
                weekday: date.getUTCDay(),
                month: date.getUTCMonth(),
                year: date.getUTCFullYear(),
                hasAnyData,
                hasMetricData: value > 0
            });
        }

        const totalTrackedDays = heatmapData.filter(day => day.value > 0).length;
        const visibleTrackedDays = grid.filter(day => day.hasMetricData).length;
        const totalSpanDays = firstDataDate ? diffDaysInclusive(firstDataDate, endDate) : visibleDays;

        return {
            grid,
            firstDataDate,
            startDate,
            endDate,
            visibleDays,
            visibleTrackedDays,
            totalTrackedDays,
            totalSpanDays
        };
    }, [heatmapData, heatmapRange]);

    // Group by week for display
    const weeks = useMemo(() => {
        const result: Array<Array<CalendarGridDay | null>> = [];
        let currentWeek: Array<CalendarGridDay | null> = [];
        const { grid } = calendarView;

        // Pad first week
        if (grid.length > 0) {
            const firstDay = grid[0].weekday;
            for (let i = 0; i < firstDay; i++) {
                currentWeek.push(null);
            }
        }

        for (const day of grid) {
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
    }, [calendarView]);

    const heatmapDensity = useMemo(() => {
        if (calendarView.visibleDays > 1800) return { cellSize: 7, gap: 2, monthStride: 6 };
        if (calendarView.visibleDays > 1200) return { cellSize: 8, gap: 2, monthStride: 3 };
        if (calendarView.visibleDays > 730) return { cellSize: 9, gap: 2, monthStride: 2 };
        return { cellSize: 12, gap: 3, monthStride: 1 };
    }, [calendarView.visibleDays]);

    const heatmapLabels = useMemo(() => {
        const monthLabels: Array<{ month: number; position: number }> = [];
        const yearLabels: Array<{ year: number; position: number }> = [];
        const seenYears = new Set<number>();
        let lastMonth = -1;

        weeks.forEach((week, weekIdx) => {
            const validDay = week.find((day): day is CalendarGridDay => day !== null);
            if (!validDay) return;

            if (validDay.month !== lastMonth) {
                if (validDay.month % heatmapDensity.monthStride === 0) {
                    monthLabels.push({ month: validDay.month, position: weekIdx });
                }
                lastMonth = validDay.month;
            }

            if ((weekIdx === 0 || validDay.month === 0) && !seenYears.has(validDay.year)) {
                yearLabels.push({ year: validDay.year, position: weekIdx });
                seenYears.add(validDay.year);
            }
        });

        return { monthLabels, yearLabels };
    }, [weeks, heatmapDensity.monthStride]);

    const metricLabel = heatmapMetric.charAt(0).toUpperCase() + heatmapMetric.slice(1);
    const metricScoreLabel = heatmapMetric === 'average' ? 'score' : `${heatmapMetric} score`;

    const rangeLabel = useMemo(() => {
        if (!calendarView.firstDataDate) return 'All';
        return `All (${formatHistorySpan(calendarView.totalSpanDays)})`;
    }, [calendarView.firstDataDate, calendarView.totalSpanDays]);

    const coverageSummary = useMemo(() => {
        const startLabel = formatDateForDisplay(calendarView.startDate, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const endLabel = formatDateForDisplay(calendarView.endDate, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        if (calendarView.visibleTrackedDays === 0) {
            return `${startLabel} - ${endLabel} • No ${metricScoreLabel} values yet`;
        }

        return `${startLabel} - ${endLabel} • ${calendarView.visibleTrackedDays.toLocaleString()} ${metricScoreLabel} days`;
    }, [calendarView.startDate, calendarView.endDate, calendarView.visibleTrackedDays, metricScoreLabel]);

    const availabilitySummary = useMemo(() => {
        if (!calendarView.firstDataDate) return 'No synced history is available for this user yet.';

        const firstLabel = formatDateForDisplay(calendarView.firstDataDate, {
            month: 'short',
            year: 'numeric'
        });

        return `Available since ${firstLabel} • ${calendarView.totalTrackedDays.toLocaleString()} ${metricScoreLabel} days total`;
    }, [calendarView.firstDataDate, calendarView.totalTrackedDays, metricScoreLabel]);

    const columnPitch = heatmapDensity.cellSize + heatmapDensity.gap;
    const dayLabelGutter = 28;
    const showYearLabels = calendarView.visibleDays > 365;
    const hasTwoYearWindow = calendarView.totalSpanDays > 365;

    const getHeatmapColor = (day: CalendarGridDay) => {
        if (!day.hasAnyData) return 'bg-[var(--bg-elevated)]';
        if (!day.hasMetricData) return 'bg-[var(--bg-elevated)]/70 border border-[var(--border-subtle)]';
        if (day.value < 50) return 'bg-[#D4897B]/50';
        if (day.value < 65) return 'bg-[#D4897B]/35';
        if (day.value < 75) return 'bg-[#D4B87B]/50';
        if (day.value < 85) return 'bg-[#7BC4A0]/40';
        return 'bg-[#7BC4A0]/70';
    };

    const getMilestoneHistory = (milestone: Milestone) => {
        // Find user data
        const userId = milestone.userId || selectedProfileId;
        const userIdx = profiles.findIndex(p => p.id === userId);
        const data = usersData[userIdx]?.data;

        if (!data) return [];

        if (milestone.type === 'days_tracked') {
            const dates = new Set([
                ...(data.sleep || []).map(s => s.day),
                ...(data.readiness || []).map(r => r.day),
                ...(data.activity || []).map(a => a.day)
            ]);
            return Array.from(dates).sort().reverse();
        } else if (milestone.type === 'total_sleep_hours') {
            return (data.session || [])
                .filter(s => s.total_sleep_duration != null)
                .map(s => s.day)
                .sort()
                .reverse();
        }

        return [];
    };

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
            <DetailsModal
                isOpen={!!selectedMilestone}
                onClose={() => setSelectedMilestone(null)}
                title={selectedMilestone?.name || ''}
                subtitle={selectedMilestone?.type === 'total_sleep_hours' ? 'Cumulative Sleep' : 'Consistency Tracker'}
                description={selectedMilestone?.description || ''}
                stats={[
                    {
                        label: 'Current Progress',
                        value: selectedMilestone?.value.toLocaleString() || 0,
                        subValue: selectedMilestone?.type === 'total_sleep_hours' ? 'Hours' : 'Days'
                    },
                    {
                        label: 'Target',
                        value: selectedMilestone?.target.toLocaleString() || 0
                    },
                    {
                        label: 'Completion',
                        value: `${selectedMilestone ? Math.min(100, (selectedMilestone.value / selectedMilestone.target) * 100).toFixed(1) : 0}%`
                    }
                ]}
                dates={selectedMilestone ? getMilestoneHistory(selectedMilestone) : undefined}
            />

            {/* Header with User Selector */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="section-header mb-0">Long-Term Milestones</h3>
                    <InfoTooltip
                        title="Milestone Tracking"
                        description="Track cumulative achievements across your health journey. Includes personal and group milestones."
                        calculation="Milestones track total progress like days tracked, total steps, and sleep hours. The score history heatmap supports 1-year, 2-year, or all available data windows per selected user."
                    />
                </div>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Track your journey and celebrate achievements
                </p>

                <PrimaryProfileSwitcher
                    selectClassName="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                />
            </div>

            {/* Achieved Milestones */}
            {achievedMilestones.length > 0 && (
                <div>
                    <h4 className="section-header flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-[#D4B87B]" /> Achieved
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {achievedMilestones.slice(0, 12).map(milestone => (
                            <div
                                key={milestone.id}
                                onClick={() => setSelectedMilestone(milestone)}
                                className="card p-4 text-center border-[var(--accent)]/30 bg-[var(--accent)]/5 cursor-pointer hover:bg-[var(--accent)]/10 transition-colors"
                            >
                                <div className="flex justify-center mb-2">
                                    {getMilestoneIcon(milestone.type, milestone.icon)}
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
                        <Target className="w-5 h-5 text-[#7BA8D4]" /> Next Goals
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {upcomingMilestones.map(milestone => {
                            const progress = (milestone.value / milestone.target) * 100;
                            return (
                                <div
                                    key={milestone.id}
                                    onClick={() => setSelectedMilestone(milestone)}
                                    className="card p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        {getMilestoneIcon(milestone.type, milestone.icon)}
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
                <div className="flex flex-col gap-3 mb-4">
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                        <h4 className="section-header mb-0 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-[#7BA8D4]" /> Score History
                        </h4>

                        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            <div className="inline-flex rounded-xl p-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                                {(['average', 'sleep', 'readiness', 'activity'] as HeatmapMetric[]).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setHeatmapMetric(m)}
                                        className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition-all whitespace-nowrap ${heatmapMetric === m
                                            ? 'bg-[var(--accent)] text-black'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                            }`}
                                    >
                                        {m.charAt(0).toUpperCase() + m.slice(1)}
                                    </button>
                                ))}
                            </div>

                            <div className="inline-flex rounded-xl p-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                                {([
                                    { id: '1y', label: '1Y' },
                                    { id: '2y', label: '2Y', disabled: !hasTwoYearWindow },
                                    { id: 'all', label: rangeLabel }
                                ] as Array<{ id: HeatmapRange; label: string; disabled?: boolean }>).map(option => (
                                    <button
                                        key={option.id}
                                        onClick={() => setHeatmapRange(option.id)}
                                        disabled={option.disabled}
                                        className={`px-3 min-h-[44px] rounded-lg text-xs font-medium transition-all whitespace-nowrap ${heatmapRange === option.id
                                            ? 'bg-[var(--accent)] text-black'
                                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                            } ${option.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <p className="text-xs text-[var(--text-secondary)]">{coverageSummary}</p>
                        <p className="text-xs text-[var(--text-muted)]">{availabilitySummary}</p>
                    </div>
                </div>

                <div className="card p-4 overflow-x-auto">
                    {/* Month + year labels */}
                    <div className="relative mb-2 h-9" style={{ marginLeft: dayLabelGutter }}>
                        {heatmapLabels.monthLabels.map((m, idx) => (
                            <span
                                key={`month-${idx}`}
                                className="absolute text-xs text-[var(--text-muted)]"
                                style={{ left: m.position * columnPitch, top: 0 }}
                            >
                                {MONTH_LABELS[m.month]}
                            </span>
                        ))}
                        {showYearLabels && heatmapLabels.yearLabels.map((y, idx) => (
                            <span
                                key={`year-${idx}`}
                                className="absolute text-[10px] uppercase tracking-wide text-[var(--text-muted)]/80"
                                style={{ left: y.position * columnPitch, top: 16 }}
                            >
                                {y.year}
                            </span>
                        ))}
                    </div>

                    <div className="flex mt-1" style={{ columnGap: `${heatmapDensity.gap}px` }}>
                        {/* Day labels */}
                        <div
                            className="flex flex-col shrink-0"
                            style={{
                                rowGap: `${heatmapDensity.gap}px`,
                                width: `${dayLabelGutter - 4}px`
                            }}
                        >
                            {['', 'M', '', 'W', '', 'F', ''].map((d, i) => (
                                <span
                                    key={i}
                                    className="text-[10px] text-[var(--text-muted)]"
                                    style={{
                                        height: `${heatmapDensity.cellSize}px`,
                                        lineHeight: `${heatmapDensity.cellSize}px`
                                    }}
                                >
                                    {d}
                                </span>
                            ))}
                        </div>

                        {/* Weeks */}
                        {weeks.map((week, weekIdx) => (
                            <div
                                key={weekIdx}
                                className="flex flex-col"
                                style={{ rowGap: `${heatmapDensity.gap}px` }}
                            >
                                {week.map((day, dayIdx) => (
                                    <div
                                        key={dayIdx}
                                        className={`${day ? getHeatmapColor(day) : 'invisible'} group relative cursor-pointer rounded-sm`}
                                        style={{
                                            width: `${heatmapDensity.cellSize}px`,
                                            height: `${heatmapDensity.cellSize}px`
                                        }}
                                        title={day
                                            ? day.hasMetricData
                                                ? `${day.date}: ${day.value.toFixed(0)}`
                                                : day.hasAnyData
                                                    ? `${day.date}: No ${metricScoreLabel}`
                                                    : `${day.date}: No synced data`
                                            : ''}
                                    >
                                        {day && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                                                <p className="font-medium text-[var(--text-primary)]">
                                                    {formatDateForDisplay(toUtcDate(day.date), {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </p>
                                                <p className="text-[var(--text-muted)]">
                                                    {day.hasMetricData
                                                        ? `${metricLabel}: ${day.value.toFixed(0)}`
                                                        : day.hasAnyData
                                                            ? `No ${metricScoreLabel}`
                                                            : 'No synced data'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-[var(--bg-elevated)]" />
                            <span className="text-xs text-[var(--text-muted)]">No synced day</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-[var(--bg-elevated)]/70 border border-[var(--border-subtle)]" />
                            <span className="text-xs text-[var(--text-muted)]">Synced day, no {metricScoreLabel}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-muted)]">Less</span>
                            <div className="flex gap-1">
                                <div className="w-3 h-3 rounded-sm bg-[#D4897B]/50" />
                                <div className="w-3 h-3 rounded-sm bg-[#D4897B]/35" />
                                <div className="w-3 h-3 rounded-sm bg-[#D4B87B]/50" />
                                <div className="w-3 h-3 rounded-sm bg-[#7BC4A0]/40" />
                                <div className="w-3 h-3 rounded-sm bg-[#7BC4A0]/70" />
                            </div>
                            <span className="text-xs text-[var(--text-muted)]">More</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Group Milestones */}
            {groupMilestones.length > 0 && (
                <div>
                    <h4 className="section-header flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#7BA8D4]" /> Group Achievements
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupMilestones.slice(0, 4).map(milestone => {
                            const progress = Math.min(100, (milestone.value / milestone.target) * 100);
                            return (
                                <div
                                    key={milestone.id}
                                    onClick={() => setSelectedMilestone(milestone)}
                                    className={`card p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors ${milestone.isAchieved ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {milestone.isAchieved
                                                ? <Check className="w-5 h-5 text-[#7BC4A0]" />
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

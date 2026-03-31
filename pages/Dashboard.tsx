import React, { useEffect, useMemo, useState } from 'react';
import {
    DailyActivity, DailyReadiness, DailySleep, SleepSession, HeartRate,
    DailySpO2, DailyStress, DailyResilience, LeaderboardEntry, UserProfile, formatDuration, formatTime, DailyStats
} from '../types';
import { useUser } from '../contexts/UserContext';
import MetricCard from '../components/MetricCard';
import SleepStagesChart from '../components/charts/SleepStagesChart';
import HeartRateChart from '../components/charts/HeartRateChart';
import ContributorsBreakdown from '../components/ContributorsBreakdown';
import ScoreBreakdownModal from '../components/ScoreBreakdownModal';
import MetricDetailModal, { MetricDetailType } from '../components/MetricDetailModal';
import LeaderboardUserDetailModal from '../components/LeaderboardUserDetailModal';
import AppDialog from '../components/AppDialog';
import DataExport from './DataExport';
import { CLAY_TOOLTIP_STYLE } from '../utils/chartStyles';
import {
    LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchDailyStats, FULL_HISTORY_START_DATE, syncDailyStats } from '../hooks/useOuraData';
import ComparisonHeartRateChart from '../components/charts/ComparisonHeartRateChart';
import AllTimeHistory from '../components/AllTimeHistory';
import SyncModal from '../components/SyncModal';
import PrimaryProfileSwitcher from '../components/PrimaryProfileSwitcher';
import DateRangePicker from '../components/DateRangePicker';
import InviteLinkCard from '../components/InviteLinkCard';
import InviteLinkModal from '../components/InviteLinkModal';
import MultiProfileComparisonTable, { ComparisonRow } from '../components/MultiProfileComparisonTable';
import CompeteView from '../components/compete/CompeteView';
import { smartSync, SyncProgress } from '../services/syncService';
import { ouraService } from '../services/ouraService';
import {
    StreakTracker,
    PatternDetector,
    TimelineView,
    CorrelationExplorer,
    WhatIfSimulator,
    MilestoneTracker,
    DailySnapshot,
    ChallengeManager
} from '../components/analytics';
import { useAutoSync, formatLastSync } from '../hooks/useAutoSync';
import { useWebhookRefresh } from '../hooks/useWebhookRefresh';
import { useCompetitionInvitePreview } from '../hooks/useCompetitions';
import { X, RefreshCw, Settings, Plus, Moon, Heart, Flame, Brain, Users, Trophy, TrendingUp, TrendingDown, Minus, BarChart3, Swords, Download, CalendarDays, Sparkles, GitCompareArrows, ArrowRight } from 'lucide-react';
import { getProfileDisplayName } from '../utils/profileName';
import { getCompetitionInviteToken, isInviteLocation } from '../utils/inviteLink';
import {
    formatLocalISODate,
    formatISODateForDisplay,
    isISODateString,
    shiftLocalISODate,
} from '../utils/date';
import {
    extractIsoDayFromTimestamp,
    formatRelativeDayLabel,
    getLocalMinutesOfDayFromIso,
} from '../utils/temporal';
import {
    getMillisecondsUntilNextProfileMidnight,
    getProfileCurrentHour,
    getProfileLocalISODate,
} from '../utils/profileTemporal';

const METERS_TO_MILES = 0.000621371;
const CELSIUS_DELTA_TO_FAHRENHEIT_DELTA = 9 / 5;
const DEFAULT_DAILY_STATS_STALE_MS = 1000 * 60 * 60;
const LIVE_DAILY_STATS_STALE_MS = 1000 * 60 * 5;
const LIVE_DAILY_STATS_REFETCH_MS = 1000 * 60 * 5;
type DayRange = { start: string; end: string };
type ScoreType = 'readiness' | 'sleep' | 'activity';
type ScoreHistoryPoint = { date: string; value: number };
type MetricHistoryPoint = { date: string; value: number; label?: string };
const COMPARE_PALETTE = ['#6B9E8A', '#7BA8D4', '#A08BBE', '#D4B87B', '#D4897B', '#7BC4A0', '#7BA8D4', '#D4897B'];

const filterByDayRange = <T extends { day?: string }>(items: T[] | undefined, range: DayRange | null): T[] => {
    if (!items || items.length === 0) return [];
    if (!range) return items;
    return items.filter((item) => Boolean(item.day && item.day >= range.start && item.day <= range.end));
};

const filterHeartRateByDayRange = (items: HeartRate[] | undefined, range: DayRange | null): HeartRate[] => {
    if (!items || items.length === 0) return [];
    if (!range) return items;
    return items.filter((item) => {
        const day = item.timestamp?.slice(0, 10);
        return Boolean(day && day >= range.start && day <= range.end);
    });
};

const filterDailyStatsByDayRange = (data: DailyStats | undefined, range: DayRange | null): DailyStats | undefined => {
    if (!data) return undefined;
    if (!range) return data;
    return {
        ...data,
        sleep: filterByDayRange(data.sleep, range),
        readiness: filterByDayRange(data.readiness, range),
        activity: filterByDayRange(data.activity, range),
        session: filterByDayRange(data.session, range),
        spo2: filterByDayRange(data.spo2, range),
        stress: filterByDayRange(data.stress, range),
        resilience: filterByDayRange(data.resilience, range),
        heartrate: filterHeartRateByDayRange(data.heartrate, range),
        workout: filterByDayRange(data.workout, range),
    };
};

const toTimestampMs = (value?: string | null): number => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const ts = new Date(value).getTime();
    return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
};

const isIsoDay = (value: unknown): value is string => isISODateString(value);

const toIsoDayFromTimestamp = (value?: string | null): string | null => {
    return extractIsoDayFromTimestamp(value);
};

const isScoreReady = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const findLatestByDay = <T extends { day?: string; timestamp?: string }>(items: T[] | undefined, day?: string): T | undefined => {
    if (!items?.length || !day) return undefined;
    return items
        .filter((item) => item.day === day)
        .sort((a, b) => toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp))[0];
};

const getScoredDays = <T extends { day?: string; score?: number | null }>(items: T[] | undefined): Set<string> =>
    new Set(
        (items || [])
            .filter((item) => isIsoDay(item.day) && isScoreReady(item.score))
            .map((item) => item.day as string)
    );

const getSessionCandidateDays = (session: SleepSession): Set<string> => {
    const days = new Set<string>();

    if (isIsoDay(session.day)) {
        days.add(session.day);
        return days;
    }

    const bedtimeStartDay = toIsoDayFromTimestamp(session.bedtime_start);
    if (bedtimeStartDay) {
        days.add(bedtimeStartDay);
    }

    const bedtimeEndDay = toIsoDayFromTimestamp(session.bedtime_end);
    if (bedtimeEndDay) {
        days.add(bedtimeEndDay);
    }

    return days;
};

const sessionBelongsToDay = (session: SleepSession, day: string): boolean => {
    return getSessionCandidateDays(session).has(day);
};

const getSessionsForDay = (sessions: SleepSession[] | undefined, day?: string): SleepSession[] => {
    if (!sessions?.length || !day) return [];
    return sessions.filter((session) => sessionBelongsToDay(session, day));
};

const pickBestSession = (sessions: SleepSession[]): SleepSession | undefined => {
    if (sessions.length === 0) return undefined;
    return [...sessions]
        .filter((session) => session.type !== 'deleted')
        .sort((a, b) => {
            const bDuration = b.total_sleep_duration ?? b.time_in_bed ?? 0;
            const aDuration = a.total_sleep_duration ?? a.time_in_bed ?? 0;
            if (bDuration !== aDuration) return bDuration - aDuration;
            return new Date(b.bedtime_end || 0).getTime() - new Date(a.bedtime_end || 0).getTime();
        })[0];
};

const getMostRecentComparableDay = (data?: DailyStats): string | undefined => {
    if (!data) return undefined;

    const sleepDays = getScoredDays(data.sleep);
    const readinessDays = getScoredDays(data.readiness);
    const activityDays = getScoredDays(data.activity);

    const allDays = new Set<string>([
        ...sleepDays,
        ...readinessDays,
        ...activityDays,
    ]);

    const orderedDays = Array.from(allDays).sort((a, b) => b.localeCompare(a));
    return orderedDays.find((day) =>
        sleepDays.has(day) && readinessDays.has(day) && activityDays.has(day)
    ) ?? orderedDays[0];
};

const getSessionHistoryDay = (session: SleepSession): string | undefined => {
    if (isIsoDay(session.day)) return session.day;
    return toIsoDayFromTimestamp(session.bedtime_end) || toIsoDayFromTimestamp(session.bedtime_start) || undefined;
};

const getPrimarySessionsByDay = (sessions: SleepSession[] | undefined): Array<{ day: string; session: SleepSession }> => {
    if (!sessions?.length) return [];

    const sessionsByDay = new Map<string, SleepSession[]>();
    sessions.forEach((session) => {
        const day = getSessionHistoryDay(session);
        if (!day) return;
        const existing = sessionsByDay.get(day) || [];
        existing.push(session);
        sessionsByDay.set(day, existing);
    });

    return Array.from(sessionsByDay.entries())
        .map(([day, daySessions]) => {
            const session = pickBestSession(daySessions);
            return session ? { day, session } : null;
        })
        .filter((entry): entry is { day: string; session: SleepSession } => entry !== null)
        .sort((left, right) => right.day.localeCompare(left.day));
};

const getLatestDailyEntries = <T extends { day?: string; timestamp?: string }>(items: T[] | undefined): Array<{ day: string; item: T }> => {
    if (!items?.length) return [];

    const sorted = [...items]
        .filter((item): item is T & { day: string } => isIsoDay(item.day))
        .sort((left, right) => {
            const byDay = right.day.localeCompare(left.day);
            if (byDay !== 0) return byDay;
            return toTimestampMs(right.timestamp) - toTimestampMs(left.timestamp);
        });

    const seenDays = new Set<string>();
    const latestEntries: Array<{ day: string; item: T }> = [];

    sorted.forEach((item) => {
        if (seenDays.has(item.day)) return;
        seenDays.add(item.day);
        latestEntries.push({ day: item.day, item });
    });

    return latestEntries;
};

const getMinutesOfDay = (value?: string | null): number | null => {
    return getLocalMinutesOfDayFromIso(value);
};

const getNormalizedBedtimeMinutes = (value?: string | null): number | null => {
    const minutes = getMinutesOfDay(value);
    if (minutes == null) return null;
    return minutes < 12 * 60 ? minutes + (24 * 60) : minutes;
};

const getStressSummaryLabel = (summary: DailyStress['day_summary'] | null | undefined): string => {
    switch (summary) {
        case 'restored':
            return 'Restored';
        case 'normal':
            return 'Normal';
        case 'stressful':
            return 'Stressful';
        default:
            return '--';
    }
};

const getResilienceLevelLabel = (level: DailyResilience['level'] | null | undefined): string => {
    if (!level) return '--';
    return level.charAt(0).toUpperCase() + level.slice(1);
};

const getResilienceScore = (resilience?: DailyResilience): number | null => {
    if (!resilience) return null;

    const sleepRecovery = resilience.contributors?.sleep_recovery;
    const daytimeRecovery = resilience.contributors?.daytime_recovery;
    const stress = resilience.contributors?.stress;

    if (
        sleepRecovery != null &&
        daytimeRecovery != null &&
        stress != null
    ) {
        return (sleepRecovery + daytimeRecovery + (100 - stress)) / 3;
    }

    switch (resilience.level) {
        case 'exceptional':
            return 95;
        case 'strong':
            return 82;
        case 'solid':
            return 65;
        case 'adequate':
            return 45;
        case 'limited':
            return 25;
        default:
            return null;
    }
};

type CompareParticipant = {
    id: string;
    entry: LeaderboardEntry;
    profile: UserProfile;
    data: DailyStats;
};

type CompareSnapshot = CompareParticipant & {
    name: string;
    color: string;
    sleep?: DailySleep;
    readiness?: DailyReadiness;
    activity?: DailyActivity;
    session?: SleepSession;
    compareAverage: number | null;
    availableScoreCount: number;
    hrWindow: HeartRate[];
};

const arraysEqual = (left: string[], right: string[]): boolean =>
    left.length === right.length && left.every((value, index) => value === right[index]);

const intersectDaySets = (sets: Set<string>[]): string[] => {
    if (sets.length === 0) return [];
    const [first, ...rest] = sets;
    return Array.from(first).filter((day) => rest.every((set) => set.has(day)));
};

const getAnyScoredDaysFromStats = (data?: DailyStats): Set<string> => {
    if (!data) return new Set<string>();
    return new Set<string>([
        ...getScoredDays(data.sleep),
        ...getScoredDays(data.readiness),
        ...getScoredDays(data.activity),
    ]);
};

const formatContributionCaption = (label: string, value?: number | null): string =>
    value != null ? `${label} ${Math.round(value)}` : 'No score';


// ============================================
// PERSONAL RECORDS STRIP – Best scores with dates and top-10 expansion
// ============================================

type RecordEntry = { day: string; value: number; displayValue: string };
type RecordCategory = { id: string; label: string; color: string; bg: string; entries: RecordEntry[] };

const formatRecordDate = (isoDay: string): string =>
    formatISODateForDisplay(isoDay, undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const buildCategoryEntries = (
    items: { day: string; raw: number; display: string }[],
    order: 'desc' | 'asc',
    limit = 10
): RecordEntry[] => {
    const bestByDay = new Map<string, { raw: number; display: string }>();
    for (const item of items) {
        if (!item.day) continue;
        const current = bestByDay.get(item.day);
        const isBetter = order === 'desc'
            ? !current || item.raw > current.raw
            : !current || item.raw < current.raw;
        if (isBetter) bestByDay.set(item.day, { raw: item.raw, display: item.display });
    }
    return Array.from(bestByDay.entries())
        .map(([day, { raw, display }]) => ({ day, value: raw, displayValue: display }))
        .sort((a, b) => order === 'desc' ? b.value - a.value : a.value - b.value)
        .slice(0, limit);
};

const PersonalRecordsStrip: React.FC<{
    sessionHistory: SleepSession[];
    activityHistory: DailyActivity[];
    readinessHistory: DailyReadiness[];
    sleepHistory: DailySleep[];
    onNavigateToDay: (day: string) => void;
}> = ({ sessionHistory, activityHistory, readinessHistory, sleepHistory, onNavigateToDay }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const categories = useMemo((): RecordCategory[] => {
        const result: RecordCategory[] = [];

        // Best Readiness Score
        const readinessItems = readinessHistory
            .filter(r => r.score != null && r.score > 0)
            .map(r => ({ day: r.day, raw: r.score!, display: String(Math.round(r.score!)) }));
        const readinessEntries = buildCategoryEntries(readinessItems, 'desc');
        if (readinessEntries.length > 0) result.push({ id: 'readiness', label: 'Best Readiness', color: '#7BC4A0', bg: 'rgba(123,196,160,0.12)', entries: readinessEntries });

        // Best Sleep Score
        const sleepScoreItems = sleepHistory
            .filter(s => s.score != null && s.score > 0)
            .map(s => ({ day: s.day, raw: s.score!, display: String(Math.round(s.score!)) }));
        const sleepScoreEntries = buildCategoryEntries(sleepScoreItems, 'desc');
        if (sleepScoreEntries.length > 0) result.push({ id: 'sleep_score', label: 'Best Sleep', color: '#7BA8D4', bg: 'rgba(123,168,212,0.12)', entries: sleepScoreEntries });

        // Best Activity Score
        const activityScoreItems = activityHistory
            .filter(a => a.score != null && a.score > 0)
            .map(a => ({ day: a.day, raw: a.score!, display: String(Math.round(a.score!)) }));
        const activityScoreEntries = buildCategoryEntries(activityScoreItems, 'desc');
        if (activityScoreEntries.length > 0) result.push({ id: 'activity_score', label: 'Best Activity', color: '#D4B87B', bg: 'rgba(212,184,123,0.12)', entries: activityScoreEntries });

        // Best HRV
        const hrvItems = sessionHistory
            .filter(s => s.average_hrv != null && s.average_hrv > 0)
            .map(s => ({ day: s.day, raw: s.average_hrv!, display: `${Math.round(s.average_hrv!)} ms` }));
        const hrvEntries = buildCategoryEntries(hrvItems, 'desc');
        if (hrvEntries.length > 0) result.push({ id: 'hrv', label: 'Best HRV', color: '#A08BBE', bg: 'rgba(160,139,190,0.12)', entries: hrvEntries });

        // Most Steps
        const stepsItems = activityHistory
            .filter(a => a.steps != null && a.steps > 0)
            .map(a => ({ day: a.day, raw: a.steps!, display: a.steps!.toLocaleString() }));
        const stepsEntries = buildCategoryEntries(stepsItems, 'desc');
        if (stepsEntries.length > 0) result.push({ id: 'steps', label: 'Most Steps', color: '#D4B87B', bg: 'rgba(212,184,123,0.12)', entries: stepsEntries });

        // Best Deep Sleep
        const deepSleepItems = sessionHistory
            .filter(s => s.deep_sleep_duration != null && s.deep_sleep_duration > 0)
            .map(s => {
                const h = Math.floor(s.deep_sleep_duration! / 3600);
                const m = Math.floor((s.deep_sleep_duration! % 3600) / 60);
                return { day: s.day, raw: s.deep_sleep_duration!, display: h > 0 ? `${h}h ${m}m` : `${m}m` };
            });
        const deepSleepEntries = buildCategoryEntries(deepSleepItems, 'desc');
        if (deepSleepEntries.length > 0) result.push({ id: 'deep_sleep', label: 'Best Deep Sleep', color: '#7BA8D4', bg: 'rgba(123,168,212,0.12)', entries: deepSleepEntries });

        // Lowest Resting HR
        const lowestHrItems = sessionHistory
            .filter(s => s.lowest_heart_rate != null && s.lowest_heart_rate > 0)
            .map(s => ({ day: s.day, raw: s.lowest_heart_rate!, display: `${Math.round(s.lowest_heart_rate!)} bpm` }));
        const lowestHrEntries = buildCategoryEntries(lowestHrItems, 'asc');
        if (lowestHrEntries.length > 0) result.push({ id: 'lowest_hr', label: 'Lowest HR', color: '#D4897B', bg: 'rgba(212,137,123,0.12)', entries: lowestHrEntries });

        // Most Calories
        const caloriesItems = activityHistory
            .filter(a => a.active_calories != null && a.active_calories > 0)
            .map(a => ({ day: a.day, raw: a.active_calories!, display: `${a.active_calories!.toLocaleString()} kcal` }));
        const caloriesEntries = buildCategoryEntries(caloriesItems, 'desc');
        if (caloriesEntries.length > 0) result.push({ id: 'calories', label: 'Most Calories', color: '#D4A574', bg: 'rgba(212,165,116,0.12)', entries: caloriesEntries });

        return result;
    }, [sessionHistory, activityHistory, readinessHistory, sleepHistory]);

    const expandedCategory = categories.find(c => c.id === expandedId) ?? null;
    if (categories.length === 0) return null;

    return (
        <section className="mb-10 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#D4B87B' }} />
                <h3 className="text-sm font-bold text-[#2D2A26]">Personal Records</h3>
                <span className="text-[10px] text-[#A8A29E] bg-[#FAF7F4] px-2 py-0.5 rounded-full border border-[rgba(0,0,0,0.06)]">All time</span>
            </div>
            <div className="relative">
            <div className="records-strip mb-3">
                {categories.map((cat, idx) => {
                    const record = cat.entries[0];
                    const isExpanded = expandedId === cat.id;
                    return (
                        <button
                            key={cat.id}
                            className={`record-chip stagger-${Math.min(idx + 1, 6)} animate-fade-in-up`}
                            style={{ animationFillMode: 'both', outline: isExpanded ? `2px solid ${cat.color}` : undefined, outlineOffset: isExpanded ? '1px' : undefined }}
                            onClick={() => setExpandedId(isExpanded ? null : cat.id)}
                        >
                            <div className="record-icon" style={{ backgroundColor: cat.bg }}>
                                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                            </div>
                            <div className="record-info">
                                <div className="record-label">{cat.label}</div>
                                <div className="record-value" style={{ color: cat.color }}>{record.displayValue}</div>
                                <div className="record-date">{formatRecordDate(record.day)}</div>
                            </div>
                            <svg className="flex-shrink-0 ml-1 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', color: cat.color, opacity: 0.6 }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    );
                })}
            </div>
                <div className="pointer-events-none absolute right-0 top-0 bottom-3 w-10 bg-gradient-to-l from-[var(--bg-base)] to-transparent rounded-r" />
            </div>
            {expandedCategory && (
                <div className="records-top10-drawer animate-fade-in-up" style={{ animationFillMode: 'both' }}>
                    <div className="records-top10-header">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: expandedCategory.color }} />
                        <span style={{ color: expandedCategory.color }}>Top {expandedCategory.entries.length} — {expandedCategory.label}</span>
                    </div>
                    <ol className="records-top10-list">
                        {expandedCategory.entries.map((entry, rank) => (
                            <li key={entry.day}>
                                <button className="records-top10-row" onClick={() => onNavigateToDay(entry.day)}>
                                    <span className="records-top10-rank" style={{ color: rank === 0 ? expandedCategory.color : undefined }}>{rank + 1}</span>
                                    <span className="records-top10-value font-mono" style={{ color: expandedCategory.color }}>{entry.displayValue}</span>
                                    <span className="records-top10-date">{formatRecordDate(entry.day)}</span>
                                    <svg className="records-top10-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none">
                                        <path d="M2 5h6M5.5 2.5L8 5l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
};

// ============================================
// FRIEND TRENDS STRIP – See how your group is doing
// ============================================

type CategoryTrend = {
    label: string;
    icon: 'sleep' | 'readiness' | 'activity';
    color: string;
    recentAvg: number;
    olderAvg: number | null;
    delta: number | null;
    direction: 'up' | 'down' | 'stable';
};

type FriendTrendData = {
    id: string;
    name: string;
    average: number;
    trend: number | null;
    trendDirection: 'up' | 'down' | 'stable';
    recentAvg: number;
    categories: CategoryTrend[];
    sparkline: number[];
    summary: string;
};

const CATEGORY_COLORS = {
    sleep: '#7BA8D4',
    readiness: '#7BC4A0',
    activity: '#D4B87B',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    sleep: <Moon className="w-2.5 h-2.5" />,
    readiness: <Brain className="w-2.5 h-2.5" />,
    activity: <Flame className="w-2.5 h-2.5" />,
};

const MiniSparkline: React.FC<{ data: number[]; color: string; width?: number; height?: number }> = ({
    data, color, width = 56, height = 20,
}) => {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 1;
    const points = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (width - pad * 2);
        const y = pad + (1 - (v - min) / range) * (height - pad * 2);
        return `${x},${y}`;
    });
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" style={{ display: 'block' }}>
            <defs>
                <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path
                d={`M${points[0]} ${points.slice(1).map(p => `L${p}`).join(' ')} L${width - pad},${height - pad} L${pad},${height - pad} Z`}
                fill={`url(#spark-${color.replace('#', '')})`}
            />
            <polyline
                points={points.join(' ')}
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
            {/* Last point dot */}
            {points.length > 0 && (() => {
                const lastPt = points[points.length - 1].split(',');
                return <circle cx={lastPt[0]} cy={lastPt[1]} r="2" fill={color} />;
            })()}
        </svg>
    );
};

const FriendTrendsStrip: React.FC<{
    leaderboardData: LeaderboardEntry[];
    profiles: UserProfile[];
    userQueries: any[];
    onViewCompare: () => void;
    onViewTrends: () => void;
}> = ({ leaderboardData, profiles, userQueries, onViewCompare, onViewTrends }) => {
    const friendTrends = useMemo((): FriendTrendData[] => {
        return leaderboardData.map((entry, idx) => {
            const data = userQueries[idx]?.data as DailyStats | undefined;
            const base: FriendTrendData = {
                id: entry.id ?? entry.name,
                name: entry.name,
                average: entry.average,
                trend: null,
                trendDirection: 'stable',
                recentAvg: entry.average,
                categories: [],
                sparkline: [],
                summary: '',
            };
            if (!data) return base;

            const sortedSleep = [...(data.sleep || [])].sort((a, b) => (b.day || '').localeCompare(a.day || ''));
            const sortedReadiness = [...(data.readiness || [])].sort((a, b) => (b.day || '').localeCompare(a.day || ''));
            const sortedActivity = [...(data.activity || [])].sort((a, b) => (b.day || '').localeCompare(a.day || ''));

            // Per-category averages for recent 7 vs older 7
            const calcCat = (sorted: { score?: number | null }[], label: string, icon: 'sleep' | 'readiness' | 'activity', color: string): CategoryTrend => {
                const recent: number[] = [];
                const older: number[] = [];
                for (let i = 0; i < Math.min(7, sorted.length); i++) {
                    const val = Number(sorted[i]?.score) || 0;
                    if (val > 0) recent.push(val);
                }
                for (let i = 7; i < Math.min(14, sorted.length); i++) {
                    const val = Number(sorted[i]?.score) || 0;
                    if (val > 0) older.push(val);
                }
                const recentAvg = recent.length > 0 ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 0;
                const olderAvg = older.length > 0 ? Math.round(older.reduce((a, b) => a + b, 0) / older.length) : null;
                const delta = olderAvg !== null ? recentAvg - olderAvg : null;
                const direction: 'up' | 'down' | 'stable' = delta === null ? 'stable' : delta > 2 ? 'up' : delta < -2 ? 'down' : 'stable';
                return { label, icon, color, recentAvg, olderAvg, delta, direction };
            };

            const sleepCat = calcCat(sortedSleep, 'Sleep', 'sleep', CATEGORY_COLORS.sleep);
            const readinessCat = calcCat(sortedReadiness, 'Readiness', 'readiness', CATEGORY_COLORS.readiness);
            const activityCat = calcCat(sortedActivity, 'Activity', 'activity', CATEGORY_COLORS.activity);
            const categories = [sleepCat, readinessCat, activityCat].filter(c => c.recentAvg > 0);

            // Overall recent avg & trend
            const recentOverall: number[] = [];
            const olderOverall: number[] = [];
            for (let i = 0; i < Math.min(7, sortedSleep.length); i++) {
                const s = Number(sortedSleep[i]?.score) || 0;
                const r = Number(sortedReadiness[i]?.score) || 0;
                const a = Number(sortedActivity[i]?.score) || 0;
                if (s > 0 || r > 0 || a > 0) {
                    const count = (s > 0 ? 1 : 0) + (r > 0 ? 1 : 0) + (a > 0 ? 1 : 0);
                    recentOverall.push(Math.round((s + r + a) / count));
                }
            }
            for (let i = 7; i < Math.min(14, sortedSleep.length); i++) {
                const s = Number(sortedSleep[i]?.score) || 0;
                const r = Number(sortedReadiness[i]?.score) || 0;
                const a = Number(sortedActivity[i]?.score) || 0;
                if (s > 0 || r > 0 || a > 0) {
                    const count = (s > 0 ? 1 : 0) + (r > 0 ? 1 : 0) + (a > 0 ? 1 : 0);
                    olderOverall.push(Math.round((s + r + a) / count));
                }
            }

            const recentAvg = recentOverall.length > 0 ? Math.round(recentOverall.reduce((a, b) => a + b, 0) / recentOverall.length) : entry.average;
            const olderAvg = olderOverall.length > 0 ? Math.round(olderOverall.reduce((a, b) => a + b, 0) / olderOverall.length) : null;
            const trend = olderAvg !== null ? recentAvg - olderAvg : null;
            const trendDirection: 'up' | 'down' | 'stable' = trend === null ? 'stable' : trend > 2 ? 'up' : trend < -2 ? 'down' : 'stable';

            // Build sparkline from last 7 days (reversed so oldest first)
            const sparkline = [...recentOverall].reverse();

            // Build specific summary
            const dipping = categories.filter(c => c.direction === 'down');
            const rising = categories.filter(c => c.direction === 'up');
            const strongest = [...categories].sort((a, b) => b.recentAvg - a.recentAvg)[0];
            const weakest = [...categories].sort((a, b) => a.recentAvg - b.recentAvg)[0];

            let summary = '';
            if (trendDirection === 'down') {
                if (dipping.length > 0) {
                    summary = `${dipping.map(c => c.label).join(' & ')} ${dipping.length > 1 ? 'are' : 'is'} dipping`;
                    if (strongest && strongest.direction !== 'down') summary += `, ${strongest.label} holds at ${strongest.recentAvg}`;
                } else {
                    summary = `Overall dipping, ${strongest?.label || 'scores'} strongest at ${strongest?.recentAvg || '--'}`;
                }
            } else if (trendDirection === 'up') {
                if (rising.length > 0) {
                    summary = `${rising.map(c => c.label).join(' & ')} ${rising.length > 1 ? 'are' : 'is'} climbing`;
                    if (rising.length < categories.length && weakest && weakest.direction !== 'up') {
                        summary += `, ${weakest.label} at ${weakest.recentAvg}`;
                    }
                } else {
                    summary = `Trending up overall, led by ${strongest?.label || 'scores'}`;
                }
            } else {
                if (dipping.length > 0 && rising.length > 0) {
                    summary = `${rising[0].label} ↑${rising[0].delta !== null ? `+${rising[0].delta}` : ''}, ${dipping[0].label} ↓${dipping[0].delta !== null ? dipping[0].delta : ''}`;
                } else {
                    summary = `Holding steady, ${strongest?.label || 'scores'} leads at ${strongest?.recentAvg || '--'}`;
                }
            }

            return {
                ...base,
                trend,
                trendDirection,
                recentAvg,
                categories,
                sparkline,
                summary,
            };
        });
    }, [leaderboardData, userQueries]);

    const FRIEND_COLORS = ['#6B9E8A', '#7BA8D4', '#A08BBE', '#D4B87B', '#D4897B', '#7BC4A0'];

    return (
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#6B9E8A' }} />
                    <h3 className="text-sm font-bold text-[#2D2A26]">Group Trends</h3>
                    <span className="text-[10px] text-[#A8A29E] bg-[#FAF7F4] px-2 py-0.5 rounded-full border border-[rgba(0,0,0,0.06)]">7-day avg</span>
                </div>
                <button onClick={onViewCompare} className="flex items-center gap-1 text-xs text-[#6B9E8A] font-medium hover:text-[#5A8D79] transition-colors">
                    Full compare <ArrowRight className="w-3 h-3" />
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {friendTrends.slice(0, 6).map((friend, idx) => {
                    const color = FRIEND_COLORS[idx % FRIEND_COLORS.length];
                    const overallTrendColor = friend.trendDirection === 'up' ? '#7BC4A0' :
                        friend.trendDirection === 'down' ? '#D4897B' : '#A8A29E';
                    return (
                        <div
                            key={friend.id || friend.name}
                            className={`friend-trend-card-v2 stagger-${idx + 1} animate-fade-in-up`}
                            style={{ animationFillMode: 'both' }}
                            onClick={onViewTrends}
                        >
                            {/* Header row: avatar + name + overall score + sparkline */}
                            <div className="ftc-header">
                                <div
                                    className="ftc-avatar"
                                    style={{ backgroundColor: `${color}18`, color }}
                                >
                                    {friend.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ftc-name-block">
                                    <p className="ftc-name">{friend.name}</p>
                                    <span className="ftc-overall-label">Overall avg</span>
                                    <div className="ftc-overall-score">
                                        <span className="ftc-score-num">{friend.recentAvg}</span>
                                        {friend.trend !== null && (
                                            <span className="ftc-overall-delta" style={{ color: overallTrendColor }}>
                                                {friend.trendDirection === 'up' ? <TrendingUp className="w-3 h-3" /> :
                                                    friend.trendDirection === 'down' ? <TrendingDown className="w-3 h-3" /> :
                                                        <Minus className="w-3 h-3" />}
                                                {friend.trend > 0 ? '+' : ''}{friend.trend}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {friend.sparkline.length >= 2 && (
                                    <div className="ftc-sparkline">
                                        <MiniSparkline data={friend.sparkline} color={overallTrendColor} width={56} height={22} />
                                    </div>
                                )}
                            </div>

                            {/* Category breakdown bars */}
                            {friend.categories.length > 0 && (
                                <div className="ftc-categories">
                                    {friend.categories.map(cat => {
                                        const deltaColor = cat.direction === 'up' ? '#7BC4A0' :
                                            cat.direction === 'down' ? '#D4897B' : '#A8A29E';
                                        return (
                                            <div key={cat.icon} className="ftc-cat-row">
                                                <span className="ftc-cat-icon" style={{ color: cat.color }}>
                                                    {CATEGORY_ICONS[cat.icon]}
                                                </span>
                                                <span className="ftc-cat-label">{cat.label}</span>
                                                <div className="ftc-cat-bar-track">
                                                    <div
                                                        className="ftc-cat-bar-fill"
                                                        style={{
                                                            width: `${Math.min(100, cat.recentAvg)}%`,
                                                            backgroundColor: cat.color,
                                                        }}
                                                    />
                                                </div>
                                                <span className="ftc-cat-score">{cat.recentAvg}</span>
                                                {cat.delta !== null && (
                                                    <span className="ftc-cat-delta" style={{ color: deltaColor }}>
                                                        {cat.delta > 0 ? '+' : ''}{cat.delta}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Summary */}
                            {friend.summary && (
                                <p className="ftc-summary">{friend.summary}</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

// ============================================
// TREND INSIGHTS PANEL – Plain-English analysis for the Trends page
// ============================================
type TrendInsight = { color: string; title: string; body: string; detail?: string };

const TrendInsightsPanel: React.FC<{
    profiles: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }[];
    userQueries: { data: DailyStats | undefined }[];
}> = ({ profiles, userQueries }) => {
    const insights = useMemo<TrendInsight[]>(() => {
        const result: TrendInsight[] = [];

        // Gather all entries per user
        const allEntries: { userId: string; name: string; day: string; sleep: number; readiness: number; activity: number; avg: number }[] = [];
        profiles.forEach((profile, idx) => {
            const data = userQueries[idx]?.data;
            if (!data) return;
            const name = getProfileDisplayName(profile);
            const readinessByDay = new Map<string, number>();
            const activityByDay = new Map<string, number>();
            data.readiness?.forEach(r => readinessByDay.set(r.day, Number(r.score) || 0));
            data.activity?.forEach(a => activityByDay.set(a.day, Number(a.score) || 0));
            data.sleep?.forEach(s => {
                if (!s.day) return;
                const sl = Number(s.score) || 0;
                const rd = readinessByDay.get(s.day) || 0;
                const ac = activityByDay.get(s.day) || 0;
                if (sl === 0 && rd === 0 && ac === 0) return;
                const count = (sl > 0 ? 1 : 0) + (rd > 0 ? 1 : 0) + (ac > 0 ? 1 : 0);
                allEntries.push({ userId: profile.id, name, day: s.day, sleep: sl, readiness: rd, activity: ac, avg: Math.round((sl + rd + ac) / count) });
            });
        });

        if (allEntries.length === 0) return result;

        // Sort by day descending
        allEntries.sort((a, b) => b.day.localeCompare(a.day));

        // Per-user stats
        const userMap = new Map<string, typeof allEntries>();
        allEntries.forEach(e => {
            if (!userMap.has(e.userId)) userMap.set(e.userId, []);
            userMap.get(e.userId)!.push(e);
        });

        // Overall trend: recent 7 days vs previous 7 days
        const first = profiles[0];
        const firstEntries = first ? userMap.get(first.id) : undefined;
        if (firstEntries && firstEntries.length >= 7) {
            const recent7 = firstEntries.slice(0, 7);
            const older7 = firstEntries.slice(7, 14);
            const recentAvg = Math.round(recent7.reduce((s, e) => s + e.avg, 0) / recent7.length);
            const olderAvg = older7.length > 0 ? Math.round(older7.reduce((s, e) => s + e.avg, 0) / older7.length) : null;

            // Determine which category improved/declined the most
            const recentSleep = Math.round(recent7.filter(e => e.sleep > 0).reduce((s, e) => s + e.sleep, 0) / Math.max(1, recent7.filter(e => e.sleep > 0).length));
            const recentReadiness = Math.round(recent7.filter(e => e.readiness > 0).reduce((s, e) => s + e.readiness, 0) / Math.max(1, recent7.filter(e => e.readiness > 0).length));
            const recentActivity = Math.round(recent7.filter(e => e.activity > 0).reduce((s, e) => s + e.activity, 0) / Math.max(1, recent7.filter(e => e.activity > 0).length));
            const olderSleep = older7.length > 0 ? Math.round(older7.filter(e => e.sleep > 0).reduce((s, e) => s + e.sleep, 0) / Math.max(1, older7.filter(e => e.sleep > 0).length)) : null;
            const olderReadiness = older7.length > 0 ? Math.round(older7.filter(e => e.readiness > 0).reduce((s, e) => s + e.readiness, 0) / Math.max(1, older7.filter(e => e.readiness > 0).length)) : null;
            const olderActivity = older7.length > 0 ? Math.round(older7.filter(e => e.activity > 0).reduce((s, e) => s + e.activity, 0) / Math.max(1, older7.filter(e => e.activity > 0).length)) : null;

            if (olderAvg !== null) {
                const diff = recentAvg - olderAvg;
                // Build category-specific detail
                const catChanges: string[] = [];
                if (olderSleep !== null) {
                    const sd = recentSleep - olderSleep;
                    if (Math.abs(sd) > 1) catChanges.push(`Sleep ${sd > 0 ? '+' : ''}${sd}`);
                }
                if (olderReadiness !== null) {
                    const rd = recentReadiness - olderReadiness;
                    if (Math.abs(rd) > 1) catChanges.push(`Readiness ${rd > 0 ? '+' : ''}${rd}`);
                }
                if (olderActivity !== null) {
                    const ad = recentActivity - olderActivity;
                    if (Math.abs(ad) > 1) catChanges.push(`Activity ${ad > 0 ? '+' : ''}${ad}`);
                }
                const catDetail = catChanges.length > 0 ? catChanges.join(' / ') : undefined;

                if (diff > 3) {
                    result.push({
                        color: '#7BC4A0', title: 'You\'re improving',
                        body: `Your overall average went from ${olderAvg} to ${recentAvg} this week. ${recentSleep > recentActivity && recentSleep > recentReadiness ? 'Sleep is leading the charge.' : recentActivity > recentSleep ? 'Your activity has been driving the improvement.' : 'Readiness is particularly strong.'}`,
                        detail: catDetail || `+${diff} points vs prior week`,
                    });
                } else if (diff < -3) {
                    // Find the biggest category decline
                    const sleepDiff = olderSleep !== null ? recentSleep - olderSleep : 0;
                    const readinessDiff = olderReadiness !== null ? recentReadiness - olderReadiness : 0;
                    const activityDiff = olderActivity !== null ? recentActivity - olderActivity : 0;
                    const biggestDrop = Math.min(sleepDiff, readinessDiff, activityDiff);
                    const tipText = biggestDrop === sleepDiff ? 'Try going to bed 30 minutes earlier tonight.' : biggestDrop === activityDiff ? 'Even a short walk could help turn things around.' : 'Give yourself some recovery time if you can.';
                    result.push({
                        color: '#D4897B', title: 'Slight dip this week',
                        body: `Your average dropped from ${olderAvg} to ${recentAvg}. ${tipText}`,
                        detail: catDetail || `${diff} points vs prior week`,
                    });
                } else {
                    result.push({
                        color: '#A8A29E', title: 'Holding steady',
                        body: `Your average is around ${recentAvg}, about the same as last week. Consistency like this is great for long-term health.`,
                        detail: catDetail,
                    });
                }
            }

            // Best and worst recent day
            const bestRecent = recent7.reduce((a, b) => a.avg > b.avg ? a : b);
            const worstRecent = recent7.reduce((a, b) => a.avg < b.avg ? a : b);
            if (bestRecent.avg !== worstRecent.avg) {
                const bestDate = formatISODateForDisplay(bestRecent.day, 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const worstDate = formatISODateForDisplay(worstRecent.day, 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const bestCategory = bestRecent.sleep >= bestRecent.readiness && bestRecent.sleep >= bestRecent.activity ? 'sleep' : bestRecent.activity >= bestRecent.readiness ? 'activity' : 'readiness';
                result.push({
                    color: '#7BA8D4', title: 'This week\'s best and toughest',
                    body: `Your peak was ${bestDate} (avg ${bestRecent.avg}), driven mostly by strong ${bestCategory}. The toughest day was ${worstDate} (avg ${worstRecent.avg}).`,
                    detail: `${bestRecent.avg - worstRecent.avg} point spread across the week`,
                });
            }

            // Sleep vs activity balance
            if (recentSleep > 0 && recentActivity > 0) {
                const gap = recentSleep - recentActivity;
                if (gap > 10) {
                    result.push({
                        color: '#7BA8D4', title: 'Sleep is outpacing activity',
                        body: `Your sleep score (${recentSleep}) is well above your activity (${recentActivity}). You're resting great — even a short daily walk could help balance things out.`,
                        detail: `Sleep ${recentSleep} vs Activity ${recentActivity}`,
                    });
                } else if (gap < -10) {
                    result.push({
                        color: '#D4B87B', title: 'Active but under-recovered',
                        body: `Your activity (${recentActivity}) is outpacing sleep (${recentSleep}). Your body is putting in the work — prioritize an earlier bedtime to keep things sustainable.`,
                        detail: `Activity ${recentActivity} vs Sleep ${recentSleep}`,
                    });
                }
            }
        }

        // Multi-user comparison insight
        if (profiles.length > 1) {
            const userAvgs = Array.from(userMap.entries())
                .map(([userId, entries]) => {
                    const recent = entries.slice(0, 14);
                    const avg = recent.length > 0 ? Math.round(recent.reduce((s, e) => s + e.avg, 0) / recent.length) : 0;
                    const name = entries[0]?.name || 'Unknown';
                    return { userId, name, avg };
                })
                .filter(u => u.avg > 0)
                .sort((a, b) => b.avg - a.avg);

            if (userAvgs.length >= 2) {
                const leader = userAvgs[0];
                const runner = userAvgs[1];
                const gap = leader.avg - userAvgs[userAvgs.length - 1].avg;
                const closeBattle = userAvgs.length >= 2 && leader.avg - runner.avg <= 3;
                result.push({
                    color: '#6B9E8A', title: closeBattle ? `${leader.name} and ${runner.name} are neck and neck` : `${leader.name} leads the group`,
                    body: closeBattle
                        ? `${leader.name} (${leader.avg}) and ${runner.name} (${runner.avg}) are within a few points of each other over the past 2 weeks. A couple of good nights could change the lead.`
                        : `With a 14-day average of ${leader.avg}, ${leader.name} is ${gap > 5 ? 'solidly' : 'slightly'} ahead. The group spread is ${gap} points — ${gap > 10 ? 'there\'s room for everyone to close the gap' : 'everyone is pretty close'}.`,
                    detail: `${userAvgs.map(u => `${u.name}: ${u.avg}`).join(' / ')}`,
                });
            }
        }

        return result;
    }, [profiles, userQueries]);

    if (insights.length === 0) return null;

    return (
        <div className="grid gap-3 sm:grid-cols-2 mb-6 animate-fade-in">
            {insights.map((insight, idx) => (
                <div key={idx} className="trend-insight-card">
                    <div className="flex items-start gap-3">
                        <span className="insight-dot" style={{ backgroundColor: insight.color }} />
                        <div className="min-w-0">
                            <p className="insight-title">{insight.title}</p>
                            <p className="insight-body">{insight.body}</p>
                            {insight.detail && <p className="insight-detail">{insight.detail}</p>}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const Dashboard: React.FC = () => {
    const {
        activeProfile,
        profiles,
        setActiveProfileId,
        login,
        removeProfile,
        firebaseError,
        isLoadingProfiles,
        retryFirebaseConnection,
        getAccessTokenForProfile,
        markProfileSyncSuccess,
        markProfileSyncError,
    } = useUser();
    const [competitionInviteToken, setCompetitionInviteToken] = useState<string | null>(() => (
        typeof window !== 'undefined' ? getCompetitionInviteToken(window.location.search) : null
    ));
    const [viewMode, setViewMode] = useState<'today' | 'compare' | 'compete' | 'trends' | 'insights' | 'export'>(() => (
        typeof window !== 'undefined' && getCompetitionInviteToken(window.location.search) ? 'compete' : 'today'
    ));
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle', currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '',
    });

    const [scoreBreakdownModal, setScoreBreakdownModal] = useState<{
        isOpen: boolean;
        scoreType: ScoreType | null;
    }>({ isOpen: false, scoreType: null });

    const [metricDetailModal, setMetricDetailModal] = useState<{
        isOpen: boolean;
        metricType: MetricDetailType | null;
        currentValue: number | null;
        currentTimestamp?: string;
        historyData: MetricHistoryPoint[];
        unit?: string;
        color?: string;
        date?: string;
    }>({ isOpen: false, metricType: null, currentValue: null, historyData: [] });

    const [leaderboardUserDetail, setLeaderboardUserDetail] = useState<{
        isOpen: boolean;
        user: LeaderboardEntry | null;
    }>({ isOpen: false, user: null });
    const [profilePendingRemoval, setProfilePendingRemoval] = useState<{ id: string; name: string } | null>(null);
    const [isRemovingProfile, setIsRemovingProfile] = useState(false);
    const [removeProfileError, setRemoveProfileError] = useState<string | null>(null);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

    const { preview: competitionInvitePreview, isLoading: competitionInvitePreviewLoading } = useCompetitionInvitePreview(competitionInviteToken);

    const queryClient = useQueryClient();

    const getDashboardErrorState = (error: unknown): { title: string; message: string } => {
        const raw = error instanceof Error ? error.message : String(error || '');
        const message = raw.toLowerCase();

        if (
            message.includes('unauthorized') ||
            message.includes('401') ||
            message.includes('missing_refresh_token') ||
            message.includes('refresh_failed')
        ) {
            return {
                title: 'Session Expired',
                message: 'Your Oura connection has expired. Please securely reconnect your ring to continue syncing your data.',
            };
        }

        if (message.includes('missing required oura consent') || message.includes('missing oura consent scopes')) {
            return {
                title: 'Reconnect Required',
                message: 'Your Oura connection is active, but required permissions were not granted. Reconnect your ring and approve the requested access to continue syncing.',
            };
        }

        return {
            title: 'Could Not Load Data',
            message: 'There was a problem loading your Oura data. Try again, and reconnect your ring if the problem persists.',
        };
    };

    const runWithAutoTokenRefresh = async <T,>(profileId: string, operation: (token: string) => Promise<T>): Promise<T> => {
        const firstToken = await getAccessTokenForProfile(profileId);
        try {
            return await operation(firstToken);
        } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : '';
            const shouldRetry = message.includes('unauthorized') || message.includes('401');
            if (!shouldRetry) throw error;
            const refreshedToken = await getAccessTokenForProfile(profileId, { forceRefresh: true });
            return operation(refreshedToken);
        }
    };

    // Auto-sync every hour
    const profileIds = useMemo(() => profiles.map(p => p.id), [profiles]);
    const { lastSyncTime } = useAutoSync(profileIds, !!activeProfile);
    useWebhookRefresh(activeProfile, viewMode === 'today');

    useEffect(() => {
        const syncInviteToken = () => {
            const nextToken = getCompetitionInviteToken(window.location.search);
            setCompetitionInviteToken(nextToken);
            if (nextToken) {
                setViewMode('compete');
            }
        };

        window.addEventListener('popstate', syncInviteToken);
        return () => window.removeEventListener('popstate', syncInviteToken);
    }, []);

    // Manual sync
    const handleSyncAllData = async () => {
        if (!activeProfile) return;
        setIsSyncing(true);
        setShowSyncModal(true);
        try {
            const existingData = queryClient.getQueryData(['dailyStats', activeProfile.id]) as DailyStats | undefined;
            const syncedData = await runWithAutoTokenRefresh(activeProfile.id, (token) =>
                smartSync(token, existingData, (progress) => {
                    setSyncProgress(progress);
                }, {
                    grantedScopes: activeProfile.grantedScopes,
                    availabilityKey: activeProfile.id,
                    profileId: activeProfile.id,
                    profileOffsetMinutes: activeProfile.lastKnownUtcOffsetMinutes,
                })
            );
            queryClient.setQueryData(['dailyStats', activeProfile.id], syncedData);
            await markProfileSyncSuccess(activeProfile.id);
        } catch (err) {
            console.error('Sync failed:', err);
            const message = err instanceof Error ? err.message.toLowerCase() : '';
            const errorMessage = (message.includes('missing required oura consent') || message.includes('missing oura consent scopes'))
                ? 'Reconnect your Oura account to grant the required scopes.'
                : 'Something went wrong. Please try again.';
            setSyncProgress(prev => ({ ...prev, status: 'error', error: errorMessage }));
            await markProfileSyncError(activeProfile.id, err);
        } finally {
            setIsSyncing(false);
        }
    };

    // Data queries
    const userQueries = useQueries({
        queries: profiles.map(p => {
            const isLiveProfile = viewMode === 'today' && p.id === activeProfile?.id;
            return ({
                queryKey: ['dailyStats', p.id],
                queryFn: async () => {
                    try {
                        const cached = queryClient.getQueryData(['dailyStats', p.id]) as DailyStats | undefined;
                        const synced = await runWithAutoTokenRefresh(p.id, (token) =>
                            syncDailyStats(token, cached, {
                                mode: 'incremental',
                                grantedScopes: p.grantedScopes,
                                availabilityKey: p.id,
                                profileId: p.id,
                                profileOffsetMinutes: p.lastKnownUtcOffsetMinutes,
                            })
                        );
                        await markProfileSyncSuccess(p.id);
                        return synced;
                    } catch (error) {
                        await markProfileSyncError(p.id, error);
                        throw error;
                    }
                },
                staleTime: viewMode === 'today' && p.id === activeProfile?.id
                    ? LIVE_DAILY_STATS_STALE_MS
                    : DEFAULT_DAILY_STATS_STALE_MS,
                refetchInterval: isLiveProfile
                    ? LIVE_DAILY_STATS_REFETCH_MS
                    : (false as const),
                refetchIntervalInBackground: false,
                refetchOnWindowFocus: isLiveProfile ? ('always' as const) : true,
            });
        })
    });

    const allTimeQueries = useQueries({
        queries: profiles.map(p => ({
            queryKey: ['allTimeStats', p.id],
            queryFn: async () => {
                const fullHistory = await runWithAutoTokenRefresh(p.id, (token) =>
                    syncDailyStats(token, undefined, {
                        mode: 'full',
                        grantedScopes: p.grantedScopes,
                        availabilityKey: p.id,
                        profileId: p.id,
                        profileOffsetMinutes: p.lastKnownUtcOffsetMinutes,
                    })
                );
                await markProfileSyncSuccess(p.id);
                return fullHistory;
            },
            initialData: () => {
                const existingAllTime = queryClient.getQueryData(['allTimeStats', p.id]) as DailyStats | undefined;
                if (existingAllTime) return existingAllTime;
                return queryClient.getQueryData(['dailyStats', p.id]) as DailyStats | undefined;
            },
            initialDataUpdatedAt: () => {
                const allTimeState = queryClient.getQueryState<DailyStats>(['allTimeStats', p.id]);
                if (allTimeState?.data) return allTimeState.dataUpdatedAt;
                return 0;
            },
            placeholderData: (previousData) => previousData,
            staleTime: DEFAULT_DAILY_STATS_STALE_MS,
            refetchOnWindowFocus: true,
            enabled: true,
        }))
    });

    const activeUserQuery = userQueries.find((_, idx) => profiles[idx].id === activeProfile?.id);
    const activeData = activeUserQuery?.data as DailyStats | undefined;
    const activeAllTimeQuery = allTimeQueries.find((_, idx) => profiles[idx]?.id === activeProfile?.id);
    const activeAllTimeData = activeAllTimeQuery?.data as DailyStats | undefined;
    const competitionProfileData = useMemo(() => (
        profiles.map((profile, index) => ({
            profile,
            data: userQueries[index]?.data as DailyStats | undefined,
            isLoading: Boolean(userQueries[index]?.isLoading),
            isError: Boolean(userQueries[index]?.isError),
        }))
    ), [profiles, userQueries]);

    const profileHealthById = useMemo(() => {
        const staleThresholdMs = 18 * 60 * 60 * 1000;
        const now = Date.now();
        const map = new Map<string, { level: 'ok' | 'warning' | 'error'; label: string }>();

        profiles.forEach((profile, idx) => {
            const query = userQueries[idx];
            const lastSuccessfulSyncMs = profile.lastSuccessfulSyncAt ? new Date(profile.lastSuccessfulSyncAt).getTime() : 0;
            const tokenExpiryMs = profile.tokenExpiresAt ? new Date(profile.tokenExpiresAt).getTime() : 0;
            const missingRefresh = !profile.refreshToken;

            if (query?.isError || profile.lastSyncError) {
                map.set(profile.id, { level: 'error', label: 'Needs reconnect' });
                return;
            }

            if (!lastSuccessfulSyncMs) {
                map.set(profile.id, { level: 'warning', label: 'Initial sync pending' });
                return;
            }

            if (now - lastSuccessfulSyncMs > staleThresholdMs) {
                map.set(profile.id, { level: 'warning', label: 'Sync is stale' });
                return;
            }

            if (tokenExpiryMs && tokenExpiryMs <= (now + (10 * 60 * 1000)) && missingRefresh) {
                map.set(profile.id, { level: 'warning', label: 'Will require reconnect soon' });
                return;
            }

            map.set(profile.id, { level: 'ok', label: 'Up to date' });
        });

        return map;
    }, [profiles, userQueries]);

    const profilesNeedingAttention = useMemo(() => {
        return profiles.filter((profile) => (profileHealthById.get(profile.id)?.level || 'ok') !== 'ok');
    }, [profiles, profileHealthById]);

    const [dateIndex, setDateIndex] = useState(0);
    const [todayOverrideDay, setTodayOverrideDay] = useState<string | null>(null);
    const [trendsRange, setTrendsRange] = useState<DayRange | null>(null);

    const sleepHistory = activeData?.sleep || [];
    const readinessHistory = activeData?.readiness || [];
    const activityHistory = activeData?.activity || [];
    const sessionHistory = activeData?.session || [];

    // All-time histories for personal records (falls back to recent data)
    const allTimeSleepHistory = activeAllTimeData?.sleep || sleepHistory;
    const allTimeReadinessHistory = activeAllTimeData?.readiness || readinessHistory;
    const allTimeActivityHistory = activeAllTimeData?.activity || activityHistory;
    const allTimeSessionHistory = activeAllTimeData?.session || sessionHistory;
    const spo2History = activeData?.spo2 || [];
    const stressHistory = activeData?.stress || [];
    const resilienceHistory = activeData?.resilience || [];
    const hrData = activeData?.heartrate || [];

    const availableDays = useMemo(() => {
        const daySet = new Set<string>();
        sleepHistory.forEach((item) => item.day && daySet.add(item.day));
        readinessHistory.forEach((item) => item.day && daySet.add(item.day));
        activityHistory.forEach((item) => item.day && daySet.add(item.day));
        return Array.from(daySet).sort((a, b) => b.localeCompare(a));
    }, [activityHistory, readinessHistory, sleepHistory]);
    const todayIsoDay = useMemo(() => getProfileLocalISODate(activeProfile), [activeProfile]);

    const sleepScoreDays = useMemo(() => getScoredDays(sleepHistory), [sleepHistory]);
    const readinessScoreDays = useMemo(() => getScoredDays(readinessHistory), [readinessHistory]);
    const activityScoreDays = useMemo(() => getScoredDays(activityHistory), [activityHistory]);

    const sleepSessionDays = useMemo(() => {
        const daySet = new Set<string>();
        sessionHistory.forEach((session) => {
            if (session.type === 'deleted') return;
            getSessionCandidateDays(session).forEach((day) => daySet.add(day));
        });
        return daySet;
    }, [sessionHistory]);

    const todayReferenceDays = useMemo(() => {
        const completeDays = availableDays.filter((day) =>
            sleepScoreDays.has(day) &&
            readinessScoreDays.has(day) &&
            activityScoreDays.has(day) &&
            sleepSessionDays.has(day)
        );

        // Oura exposes different data types on different timelines.
        // For the Today view, only offer days with complete score + sleep detail coverage.
        return completeDays.length > 0 ? completeDays : availableDays;
    }, [activityScoreDays, availableDays, readinessScoreDays, sleepScoreDays, sleepSessionDays]);

    const todayPickerDays = useMemo(() => {
        if (todayReferenceDays.includes(todayIsoDay)) return todayReferenceDays;
        return [todayIsoDay, ...todayReferenceDays];
    }, [todayIsoDay, todayReferenceDays]);

    const hasIncompleteTodayCoverage = useMemo(() => {
        return !todayReferenceDays.includes(todayIsoDay);
    }, [todayIsoDay, todayReferenceDays]);

    // All days across all profiles from full-history queries, falling back to incremental data
    const trendsAvailableDays = useMemo(() => {
        const daySet = new Set<string>();
        allTimeQueries.forEach((query, idx) => {
            const data = (query.data as DailyStats | undefined) ?? (userQueries[idx]?.data as DailyStats | undefined);
            if (!data) return;
            data.sleep?.forEach((item) => item.day && daySet.add(item.day));
            data.readiness?.forEach((item) => item.day && daySet.add(item.day));
            data.activity?.forEach((item) => item.day && daySet.add(item.day));
        });
        return Array.from(daySet).sort((a, b) => b.localeCompare(a));
    }, [allTimeQueries, userQueries]);

    const effectiveTrendsRange = useMemo<DayRange | null>(() => {
        if (!trendsAvailableDays.length) return null;
        const newest = trendsAvailableDays[0];
        const oldest = trendsAvailableDays[trendsAvailableDays.length - 1];

        if (!trendsRange) {
            return { start: oldest, end: newest };
        }

        let start = trendsRange.start;
        let end = trendsRange.end;
        if (start < oldest) start = oldest;
        if (start > newest) start = newest;
        if (end < oldest) end = oldest;
        if (end > newest) end = newest;
        if (start > end) [start, end] = [end, start];
        return { start, end };
    }, [trendsAvailableDays, trendsRange]);

    useEffect(() => {
        setDateIndex(0);
        setTodayOverrideDay(null);
    }, [activeProfile?.id]);

    useEffect(() => {
        if (viewMode !== 'today') return;
        setTodayOverrideDay((current) => (current === todayIsoDay ? current : todayIsoDay));
    }, [todayIsoDay, viewMode]);

    useEffect(() => {
        const lastIndex = Math.max(availableDays.length - 1, 0);
        if (dateIndex > lastIndex) {
            setDateIndex(lastIndex);
        }
    }, [availableDays.length, dateIndex]);

    const findSessionForDay = (day?: string) => {
        const exact = getSessionsForDay(sessionHistory, day);
        return pickBestSession(exact);
    };

    useEffect(() => {
        if (viewMode !== 'today') return;
        if (!todayPickerDays.length) return;

        const selectedDay = todayOverrideDay || availableDays[dateIndex];
        if (selectedDay && todayPickerDays.includes(selectedDay)) return;

        const nextDay = todayPickerDays[0];
        const fallbackIndex = availableDays.indexOf(nextDay);
        if (fallbackIndex >= 0) {
            if (fallbackIndex !== dateIndex) setDateIndex(fallbackIndex);
            if (todayOverrideDay) setTodayOverrideDay(null);
            return;
        }

        setTodayOverrideDay(nextDay);
    }, [availableDays, dateIndex, todayOverrideDay, todayPickerDays, viewMode]);

    useEffect(() => {
        if (!todayOverrideDay) return;
        const resolvedIndex = availableDays.indexOf(todayOverrideDay);
        if (resolvedIndex >= 0) {
            setDateIndex(resolvedIndex);
            setTodayOverrideDay(null);
        }
    }, [availableDays, todayOverrideDay]);

    const scoreAnchorDay = availableDays[dateIndex] || todayPickerDays[0];
    const referenceDay = viewMode === 'today'
        ? (todayOverrideDay || scoreAnchorDay)
        : scoreAnchorDay;

    const handleSelectReferenceDay = (day: string) => {
        const nextIndex = availableDays.indexOf(day);
        if (nextIndex >= 0) {
            setDateIndex(nextIndex);
            if (todayOverrideDay) setTodayOverrideDay(null);
            return;
        }
        if (viewMode === 'today') {
            setTodayOverrideDay(day);
        }
    };

    const currentSleep = findLatestByDay(sleepHistory, referenceDay);
    const currentReadiness = findLatestByDay(readinessHistory, referenceDay);
    const currentActivity = findLatestByDay(activityHistory, referenceDay);
    const currentSession = findSessionForDay(referenceDay);
    const currentSpo2 = findLatestByDay(spo2History, referenceDay);
    const currentStress = findLatestByDay(stressHistory, referenceDay);
    const currentResilience = findLatestByDay(resilienceHistory, referenceDay);
    const currentSpo2DisplayValue = currentSpo2?.spo2_percentage?.average != null
        ? currentSpo2.spo2_percentage.average.toFixed(1)
        : null;
    const currentResilienceDisplayValue = currentResilience?.level
        ? getResilienceLevelLabel(currentResilience.level)
        : null;
    const currentResilienceScore = getResilienceScore(currentResilience);
    const bodyTempDeviationF = (currentReadiness?.temperature_deviation ?? currentReadiness?.temperature_trend_deviation) != null
        ? (currentReadiness!.temperature_deviation ?? currentReadiness!.temperature_trend_deviation!) * CELSIUS_DELTA_TO_FAHRENHEIT_DELTA
        : null;
    const currentBedtimeMinutes = getNormalizedBedtimeMinutes(currentSession?.bedtime_start);
    const currentWakeTimeMinutes = getMinutesOfDay(currentSession?.bedtime_end);
    const distanceMilesValue = currentActivity?.equivalent_walking_distance != null
        ? Number((currentActivity.equivalent_walking_distance * METERS_TO_MILES).toFixed(1))
        : null;
    const distanceMiles = distanceMilesValue != null ? distanceMilesValue.toFixed(1) : '--';

    const readinessContributors = currentReadiness?.contributors ? [
        { label: 'Previous Night', value: currentReadiness.contributors.previous_night, color: '#7BA8D4', key: 'previous_night' },
        { label: 'Sleep Balance', value: currentReadiness.contributors.sleep_balance, color: '#7BA8D4', key: 'sleep_balance' },
        { label: 'HRV Balance', value: currentReadiness.contributors.hrv_balance, color: '#A08BBE', key: 'hrv_balance' },
        { label: 'Resting HR', value: currentReadiness.contributors.resting_heart_rate, color: '#D4897B', key: 'resting_heart_rate' },
        { label: 'Recovery Index', value: currentReadiness.contributors.recovery_index, color: '#7BC4A0', key: 'recovery_index' },
        { label: 'Body Temperature', value: currentReadiness.contributors.body_temperature, color: '#D4A574', key: 'body_temperature' },
        { label: 'Activity Balance', value: currentReadiness.contributors.activity_balance, color: '#D4A574', key: 'activity_balance' },
        { label: 'Previous Day Activity', value: currentReadiness.contributors.previous_day_activity, color: '#D4A574', key: 'previous_day_activity' },
    ] : [];

    const sleepContributors = currentSleep?.contributors ? [
        { label: 'Total Sleep', value: currentSleep.contributors.total_sleep, color: '#7BA8D4', key: 'total_sleep' },
        { label: 'Efficiency', value: currentSleep.contributors.efficiency, color: '#7BA8D4', key: 'efficiency' },
        { label: 'Restfulness', value: currentSleep.contributors.restfulness, color: '#A08BBE', key: 'restfulness' },
        { label: 'REM Sleep', value: currentSleep.contributors.rem_sleep, color: '#A08BBE', key: 'rem_sleep' },
        { label: 'Deep Sleep', value: currentSleep.contributors.deep_sleep, color: '#7BA8D4', key: 'deep_sleep' },
        { label: 'Latency', value: currentSleep.contributors.latency, color: '#7BC4A0', key: 'latency' },
        { label: 'Timing', value: currentSleep.contributors.timing, color: '#7BC4A0', key: 'timing' },
    ] : [];

    const activityContributors = currentActivity?.contributors ? [
        { label: 'Meet Daily Targets', value: currentActivity.contributors.meet_daily_targets, color: '#7BC4A0', key: 'meet_daily_targets' },
        { label: 'Move Every Hour', value: currentActivity.contributors.move_every_hour, color: '#7BC4A0', key: 'move_every_hour' },
        { label: 'Recovery Time', value: currentActivity.contributors.recovery_time, color: '#7BA8D4', key: 'recovery_time' },
        { label: 'Stay Active', value: currentActivity.contributors.stay_active, color: '#D4A574', key: 'stay_active' },
        { label: 'Training Frequency', value: currentActivity.contributors.training_frequency, color: '#A08BBE', key: 'training_frequency' },
        { label: 'Training Volume', value: currentActivity.contributors.training_volume, color: '#D4A574', key: 'training_volume' },
    ] : [];

    const getScoreHistoryData = (scoreType: ScoreType, data?: DailyStats): ScoreHistoryPoint[] => {
        if (!data) return [];

        const scoreEntries = scoreType === 'readiness'
            ? data.readiness
            : scoreType === 'sleep'
                ? data.sleep
                : data.activity;

        const sortedEntries = [...(scoreEntries || [])]
            .filter((entry): entry is typeof entry & { day: string; score: number } => Boolean(entry?.day) && isScoreReady(entry.score))
            .sort((a, b) => {
                const byDay = b.day.localeCompare(a.day);
                if (byDay !== 0) return byDay;
                return toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp);
            });

        const seenDays = new Set<string>();
        const history: ScoreHistoryPoint[] = [];

        sortedEntries.forEach((entry) => {
            if (seenDays.has(entry.day)) return;
            seenDays.add(entry.day);
            history.push({ date: entry.day, value: entry.score });
        });

        return history;
    };

    const getMetricHistoryData = (metricType: MetricDetailType, data?: DailyStats): MetricHistoryPoint[] => {
        const dataSource = data || activeData;
        if (!dataSource) return [];

        const latestSessions = getPrimarySessionsByDay(dataSource.session);
        const latestActivity = getLatestDailyEntries(dataSource.activity);
        const latestReadiness = getLatestDailyEntries(dataSource.readiness);
        const latestSpo2 = getLatestDailyEntries(dataSource.spo2);
        const latestStress = getLatestDailyEntries(dataSource.stress);
        const latestResilience = getLatestDailyEntries(dataSource.resilience);

        switch (metricType) {
            case 'hrv':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.average_hrv ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null && point.value > 0);
            case 'heart_rate':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.average_heart_rate ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null && point.value > 0);
            case 'lowest_hr':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.lowest_heart_rate ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null && point.value > 0);
            case 'sleep_duration':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.total_sleep_duration ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'deep_sleep':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.deep_sleep_duration ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'rem_sleep':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.rem_sleep_duration ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'light_sleep':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.light_sleep_duration ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'efficiency':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.efficiency ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'bedtime':
                return latestSessions
                    .map(({ day, session }) => ({
                        date: day,
                        value: getNormalizedBedtimeMinutes(session.bedtime_start),
                    }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'wake_time':
                return latestSessions
                    .map(({ day, session }) => ({
                        date: day,
                        value: getMinutesOfDay(session.bedtime_end),
                    }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'latency':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.latency ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'awake_time':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.awake_time ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'breathing_rate':
                return latestSessions
                    .map(({ day, session }) => ({ date: day, value: session.average_breath ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null && point.value > 0);
            case 'spo2':
                return latestSpo2
                    .map(({ day, item }) => ({ date: day, value: item.spo2_percentage?.average ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'stress':
                return latestStress
                    .map(({ day, item }) => ({
                        date: day,
                        value: item.stress_high ?? null,
                        label: getStressSummaryLabel(item.day_summary),
                    }))
                    .filter((point): point is { date: string; value: number; label: string } => point.value != null);
            case 'resilience':
                return latestResilience
                    .map(({ day, item }) => ({
                        date: day,
                        value: getResilienceScore(item),
                        label: getResilienceLevelLabel(item.level),
                    }))
                    .filter((point): point is { date: string; value: number; label: string } => point.value != null);
            case 'body_temperature':
                return latestReadiness
                    .map(({ day, item }) => ({
                        date: day,
                        value: item.temperature_deviation != null
                            ? item.temperature_deviation * CELSIUS_DELTA_TO_FAHRENHEIT_DELTA
                            : null,
                    }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'steps':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.steps ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'calories':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.active_calories ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'total_calories':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.total_calories ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'distance':
                return latestActivity
                    .map(({ day, item }) => ({
                        date: day,
                        value: item.equivalent_walking_distance != null
                            ? Number((item.equivalent_walking_distance * METERS_TO_MILES).toFixed(1))
                            : null,
                    }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'high_activity_time':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.high_activity_time ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'medium_activity_time':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.medium_activity_time ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'low_activity_time':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.low_activity_time ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            case 'sedentary_time':
                return latestActivity
                    .map(({ day, item }) => ({ date: day, value: item.sedentary_time ?? null }))
                    .filter((point): point is MetricHistoryPoint => point.value != null);
            default:
                return [];
        }
    };

    const prefetchAllTimeStats = () => {
        if (!activeProfile?.id) return;

        const allTimeQueryKey = ['allTimeStats', activeProfile.id] as const;
        const cachedAllTime = queryClient.getQueryData(allTimeQueryKey) as DailyStats | undefined;
        if (cachedAllTime) return;

        queryClient.prefetchQuery({
            queryKey: allTimeQueryKey,
            queryFn: () => runWithAutoTokenRefresh(activeProfile.id, (token) =>
                fetchDailyStats(token, { start: FULL_HISTORY_START_DATE }, {
                    grantedScopes: activeProfile.grantedScopes,
                    availabilityKey: activeProfile.id,
                    profileId: activeProfile.id,
                    profileOffsetMinutes: activeProfile.lastKnownUtcOffsetMinutes,
                })
            ),
            staleTime: 1000 * 60 * 60 * 24,
        });
    };

    const handleScoreCardClick = (scoreType: ScoreType) => {
        setScoreBreakdownModal({ isOpen: true, scoreType });
        prefetchAllTimeStats();
    };

    const handleMetricCardClick = (
        metricType: MetricDetailType,
        currentValue: number | null,
        unit?: string,
        color?: string,
        currentTimestamp?: string
    ) => {
        if (!activeProfile?.id) return;

        // Show modal immediately with currently available data
        const allTimeQueryKey = ['allTimeStats', activeProfile.id] as const;
        const cachedAllTime = queryClient.getQueryData(allTimeQueryKey) as DailyStats | undefined;
        const bestAvailable = cachedAllTime || activeData;
        const historyData = bestAvailable
            ? getMetricHistoryData(metricType, bestAvailable)
            : [];
        setMetricDetailModal({ isOpen: true, metricType, currentValue, currentTimestamp, historyData, unit, color, date: referenceDay });

        if (!cachedAllTime) {
            void queryClient.fetchQuery({
                queryKey: allTimeQueryKey,
                queryFn: () => runWithAutoTokenRefresh(activeProfile.id, (token) =>
                    fetchDailyStats(token, { start: FULL_HISTORY_START_DATE }, {
                        grantedScopes: activeProfile.grantedScopes,
                        availabilityKey: activeProfile.id,
                        profileId: activeProfile.id,
                        profileOffsetMinutes: activeProfile.lastKnownUtcOffsetMinutes,
                    })
                ),
                staleTime: 1000 * 60 * 60 * 24,
            }).then((fullHistory) => {
                setMetricDetailModal((previous) => (
                    previous.isOpen && previous.metricType === metricType
                        ? {
                            ...previous,
                            historyData: getMetricHistoryData(metricType, fullHistory),
                        }
                        : previous
                ));
            }).catch((error) => {
                console.error('Failed to load full metric history:', error);
            });
            return;
        }

        prefetchAllTimeStats();
    };

    const scoreHistorySource = activeProfile?.id
        ? ((queryClient.getQueryData(['allTimeStats', activeProfile.id]) as DailyStats | undefined) || activeData)
        : activeData;

    const scoreHistoryData = useMemo(() => {
        if (!scoreBreakdownModal.scoreType) return [];
        return getScoreHistoryData(scoreBreakdownModal.scoreType, scoreHistorySource);
    }, [scoreBreakdownModal.scoreType, scoreHistorySource]);

    const scopedAllTimeData = useMemo(
        () => allTimeQueries.map((query) => filterDailyStatsByDayRange(query.data as DailyStats | undefined, effectiveTrendsRange)),
        [allTimeQueries, effectiveTrendsRange]
    );

    const scopedAllTimeQueriesForHistory = useMemo(
        () => allTimeQueries.map((query, idx) => ({
            data: scopedAllTimeData[idx],
            isFetching: query.isFetching,
            isPending: query.isPending,
        })),
        [allTimeQueries, scopedAllTimeData]
    );

    const leaderboardData = useMemo(() => {
        return profiles.map((p, idx) => {
            const query = userQueries[idx];
            const data = query.data;
            if (!data) return null;
            const { sleep, readiness, activity, session } = data;
            const snapshotDay = getMostRecentComparableDay(data);
            const lastSleep = findLatestByDay(sleep, snapshotDay);
            const lastReadiness = findLatestByDay(readiness, snapshotDay);
            const lastActivity = findLatestByDay(activity, snapshotDay);
            const lastSession = pickBestSession(getSessionsForDay(session, snapshotDay));
            const sScore = Number(lastSleep?.score) || 0;
            const rScore = Number(lastReadiness?.score) || 0;
            const aScore = Number(lastActivity?.score) || 0;
            return {
                id: p.id,
                name: getProfileDisplayName(p),
                readiness: rScore, sleep: sScore, activity: aScore,
                steps: lastActivity?.steps,
                activeCalories: lastActivity?.active_calories,
                sleepDuration: lastSession?.total_sleep_duration ?? lastSession?.time_in_bed ?? null,
                averageHrv: lastSession?.average_hrv ?? null,
                restingHeartRate: lastSession?.lowest_heart_rate ?? null,
                average: Math.round((sScore + rScore + aScore) / 3),
                isCurrentUser: p.id === activeProfile?.id
            } as LeaderboardEntry;
        }).filter((e): e is LeaderboardEntry => e !== null).sort((a, b) => b.average - a.average);
    }, [profiles, userQueries, activeProfile?.id]);

    const completeDaySetFromStats = (data?: DailyStats): Set<string> => {
        if (!data) return new Set<string>();

        const sleepDays = getScoredDays(data.sleep);
        const readinessDays = getScoredDays(data.readiness);
        const activityDays = getScoredDays(data.activity);

        return new Set(
            Array.from(sleepDays).filter((day) => readinessDays.has(day) && activityDays.has(day))
        );
    };

    const compareParticipantPool = useMemo<CompareParticipant[]>(() => {
        return leaderboardData
            .map((entry) => {
                const profile = profiles.find((candidate) => candidate.id === entry.id);
                const profileIndex = profiles.findIndex((candidate) => candidate.id === entry.id);
                const data = profileIndex >= 0 ? (userQueries[profileIndex]?.data as DailyStats | undefined) : undefined;

                if (!profile || !data) return null;

                return {
                    id: entry.id,
                    entry,
                    profile,
                    data,
                } satisfies CompareParticipant;
            })
            .filter((participant): participant is CompareParticipant => participant !== null);
    }, [leaderboardData, profiles, userQueries]);

    const availableCompareIds = useMemo(
        () => compareParticipantPool.map((participant) => participant.id),
        [compareParticipantPool]
    );
    const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);

    useEffect(() => {
        setSelectedCompareIds((current) => {
            const stillAvailable = availableCompareIds.filter((id) => current.includes(id));
            const next = stillAvailable.length >= 2 ? stillAvailable : availableCompareIds;
            return arraysEqual(current, next) ? current : next;
        });
    }, [availableCompareIds]);

    const selectedCompareParticipants = useMemo(
        () => compareParticipantPool.filter((participant) => selectedCompareIds.includes(participant.id)),
        [compareParticipantPool, selectedCompareIds]
    );

    const toggleCompareParticipant = (id: string) => {
        setSelectedCompareIds((current) => {
            const isSelected = current.includes(id);
            if (isSelected && current.length <= 2) return current;

            const next = isSelected
                ? current.filter((currentId) => currentId !== id)
                : [...current, id];
            const ordered = availableCompareIds.filter((currentId) => next.includes(currentId));
            return arraysEqual(current, ordered) ? current : ordered;
        });
    };

    const compareAvailableDays = useMemo(() => {
        if (selectedCompareParticipants.length < 2) return [];

        const completeOverlap = intersectDaySets(
            selectedCompareParticipants.map((participant) => completeDaySetFromStats(participant.data))
        ).sort((a, b) => b.localeCompare(a));
        if (completeOverlap.length > 0) {
            return completeOverlap;
        }

        return intersectDaySets(
            selectedCompareParticipants.map((participant) => getAnyScoredDaysFromStats(participant.data))
        ).sort((a, b) => b.localeCompare(a));
    }, [selectedCompareParticipants]);

    const [compareDay, setCompareDay] = useState<string>('');

    useEffect(() => {
        if (!compareAvailableDays.length) {
            if (compareDay) setCompareDay('');
            return;
        }
        if (!compareDay || !compareAvailableDays.includes(compareDay)) {
            setCompareDay(compareAvailableDays[0]);
        }
    }, [compareAvailableDays, compareDay]);

    const previousCompareDay = useMemo(() => {
        if (!compareDay) return '';
        return shiftLocalISODate(compareDay, -1);
    }, [compareDay]);

    const isInCompareWindow = (timestamp: string): boolean => {
        if (!compareDay) return false;
        const day = timestamp.slice(0, 10);
        return day === compareDay || day === previousCompareDay;
    };

    const compareSnapshots = useMemo<CompareSnapshot[]>(() => {
        return selectedCompareParticipants
            .map((participant) => {
                const sleep = compareDay ? findLatestByDay(participant.data.sleep, compareDay) : undefined;
                const readiness = compareDay ? findLatestByDay(participant.data.readiness, compareDay) : undefined;
                const activity = compareDay ? findLatestByDay(participant.data.activity, compareDay) : undefined;
                const session = compareDay
                    ? pickBestSession(getSessionsForDay(participant.data.session, compareDay))
                    : undefined;
                const scoreValues = [sleep?.score, readiness?.score, activity?.score].filter(isScoreReady);

                return {
                    ...participant,
                    name: getProfileDisplayName(participant.profile),
                    color: '#6B9E8A',
                    sleep,
                    readiness,
                    activity,
                    session,
                    compareAverage: scoreValues.length > 0
                        ? Math.round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length)
                        : participant.entry.average,
                    availableScoreCount: scoreValues.length,
                    hrWindow: (participant.data.heartrate || []).filter((point) => isInCompareWindow(point.timestamp)),
                };
            })
            .sort((left, right) => {
                const leftScore = left.compareAverage ?? Number.NEGATIVE_INFINITY;
                const rightScore = right.compareAverage ?? Number.NEGATIVE_INFINITY;
                if (rightScore !== leftScore) return rightScore - leftScore;
                return left.name.localeCompare(right.name);
            })
            .map((participant, index) => ({
                ...participant,
                color: COMPARE_PALETTE[index % COMPARE_PALETTE.length],
            }));
    }, [compareDay, selectedCompareParticipants]);

    const compareColumns = useMemo(
        () => compareSnapshots.map((snapshot) => ({
            id: snapshot.id,
            name: snapshot.name,
            color: snapshot.color,
            score: snapshot.compareAverage,
        })),
        [compareSnapshots]
    );

    const compareHeartRateSeries = useMemo(
        () => compareSnapshots.map((snapshot) => ({
            id: snapshot.id,
            name: snapshot.name,
            color: snapshot.color,
            data: snapshot.hrWindow,
        })),
        [compareSnapshots]
    );

    const hasCompareHeartRateData = compareHeartRateSeries.some((series) => series.data.length > 0);

    const buildCompareCells = (selector: (snapshot: CompareSnapshot) => { value?: number | string | null; display?: string | number | null; caption?: string | null; }) =>
        Object.fromEntries(compareSnapshots.map((snapshot) => [snapshot.id, selector(snapshot)]));

    const readinessCompareRows = useMemo<ComparisonRow[]>(() => ([
        {
            label: 'Resting HR',
            inverse: true,
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.session?.lowest_heart_rate,
                display: snapshot.session?.lowest_heart_rate != null ? `${Math.round(snapshot.session.lowest_heart_rate)} bpm` : '--',
                caption: formatContributionCaption('Recovery', snapshot.readiness?.contributors.resting_heart_rate),
            })),
        },
        {
            label: 'HRV',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.session?.average_hrv,
                display: snapshot.session?.average_hrv != null ? `${Math.round(snapshot.session.average_hrv)} ms` : '--',
                caption: formatContributionCaption('Balance', snapshot.readiness?.contributors.hrv_balance),
            })),
        },
        {
            label: 'Sleep Balance',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.readiness?.contributors.sleep_balance,
                display: snapshot.readiness?.contributors.sleep_balance != null ? Math.round(snapshot.readiness.contributors.sleep_balance) : '--',
                caption: 'Contribution score',
            })),
        },
        {
            label: 'Recovery Index',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.readiness?.contributors.recovery_index,
                display: snapshot.readiness?.contributors.recovery_index != null ? Math.round(snapshot.readiness.contributors.recovery_index) : '--',
                caption: 'Contribution score',
            })),
        },
    ]), [compareSnapshots]);

    const sleepCompareRows = useMemo<ComparisonRow[]>(() => ([
        {
            label: 'Total Sleep',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.session?.total_sleep_duration,
                display: formatDuration(snapshot.session?.total_sleep_duration),
                caption: formatContributionCaption('Sleep', snapshot.sleep?.contributors.total_sleep),
            })),
        },
        {
            label: 'Efficiency',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.session?.efficiency,
                display: snapshot.session?.efficiency != null ? `${Math.round(snapshot.session.efficiency)}%` : '--',
                caption: formatContributionCaption('Sleep', snapshot.sleep?.contributors.efficiency),
            })),
        },
        {
            label: 'Deep Sleep',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.session?.deep_sleep_duration,
                display: formatDuration(snapshot.session?.deep_sleep_duration),
                caption: formatContributionCaption('Sleep', snapshot.sleep?.contributors.deep_sleep),
            })),
        },
        {
            label: 'REM Sleep',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.session?.rem_sleep_duration,
                display: formatDuration(snapshot.session?.rem_sleep_duration),
                caption: formatContributionCaption('Sleep', snapshot.sleep?.contributors.rem_sleep),
            })),
        },
    ]), [compareSnapshots]);

    const activityCompareRows = useMemo<ComparisonRow[]>(() => ([
        {
            label: 'Steps',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.activity?.steps,
                display: snapshot.activity?.steps?.toLocaleString() || '--',
                caption: formatContributionCaption('Stay active', snapshot.activity?.contributors.stay_active),
            })),
        },
        {
            label: 'Active Calories',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.activity?.active_calories,
                display: snapshot.activity?.active_calories != null ? `${snapshot.activity.active_calories.toLocaleString()} kcal` : '--',
                caption: formatContributionCaption('Training volume', snapshot.activity?.contributors.training_volume),
            })),
        },
        {
            label: 'Move Every Hour',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.activity?.contributors.move_every_hour,
                display: snapshot.activity?.inactivity_alerts != null ? `${snapshot.activity.inactivity_alerts} alerts` : 'No data',
                caption: formatContributionCaption('Score', snapshot.activity?.contributors.move_every_hour),
            })),
        },
        {
            label: 'High Activity Time',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.activity?.high_activity_time,
                display: formatDuration(snapshot.activity?.high_activity_time),
                caption: formatContributionCaption('Training frequency', snapshot.activity?.contributors.training_frequency),
            })),
        },
        {
            label: 'Meet Daily Targets',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.activity?.contributors.meet_daily_targets,
                display: snapshot.activity?.contributors.meet_daily_targets != null ? Math.round(snapshot.activity.contributors.meet_daily_targets) : '--',
                caption: 'Contribution score',
            })),
        },
        {
            label: 'Recovery Time',
            cells: buildCompareCells((snapshot) => ({
                value: snapshot.activity?.contributors.recovery_time,
                display: snapshot.activity?.contributors.recovery_time != null ? Math.round(snapshot.activity.contributors.recovery_time) : '--',
                caption: 'Contribution score',
            })),
        },
    ]), [compareSnapshots]);

    useEffect(() => {
        if (!activeProfile?.id || viewMode !== 'today') return;
        if (referenceDay !== todayIsoDay) return;
        queryClient.invalidateQueries({ queryKey: ['dailyStats', activeProfile.id], exact: true });
        queryClient.invalidateQueries({ queryKey: ['allTimeStats', activeProfile.id], exact: true });
    }, [activeProfile?.id, queryClient, referenceDay, todayIsoDay, viewMode]);

    useEffect(() => {
        if (!profiles.length) return;
        let timer: number | null = null;

        const scheduleMidnightInvalidation = () => {
            const now = new Date();
            const delayMs = getMillisecondsUntilNextProfileMidnight(activeProfile, now);

            timer = window.setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['dailyStats'] });
                queryClient.invalidateQueries({ queryKey: ['allTimeStats'] });
                scheduleMidnightInvalidation();
            }, delayMs);
        };

        scheduleMidnightInvalidation();
        return () => {
            if (timer !== null) window.clearTimeout(timer);
        };
    }, [activeProfile, profiles.length, queryClient]);

    const userName = activeProfile ? getProfileDisplayName(activeProfile) : 'there';

    const getTimeGreeting = () => {
        const hour = getProfileCurrentHour(activeProfile);
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };
    const inviteLanding = isInviteLocation(window.location.pathname, window.location.search);
    const clearCompetitionInviteToken = () => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        url.searchParams.delete('competitionInvite');
        const nextPath = `${url.pathname}${url.search}`;
        window.history.replaceState({}, '', nextPath);
        setCompetitionInviteToken(null);
    };

    const formatDayLabel = (day: string | undefined) => {
        return formatRelativeDayLabel(day, todayIsoDay);
    };
    const formatRangeLabel = (range: DayRange | null): string => {
        if (!range) return 'All available dates';
        const start = formatISODateForDisplay(range.start, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const end = formatISODateForDisplay(range.end, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${start} - ${end}`;
    };

    const getStressLabel = (summary: string | null | undefined) => getStressSummaryLabel(summary as DailyStress['day_summary']);
    const getStressColor = (summary: string | null | undefined) => {
        switch (summary) { case 'restored': return '#7BC4A0'; case 'normal': return '#D4B87B'; case 'stressful': return '#D4897B'; default: return '#A8A29E'; }
    };
    const getResilienceColor = (level: string | null | undefined) => {
        switch (level) { case 'exceptional': return '#7BC4A0'; case 'strong': return '#7BC4A0'; case 'solid': return '#7BA8D4'; case 'adequate': return '#D4B87B'; case 'limited': return '#D4897B'; default: return '#A8A29E'; }
    };

    const getScoreQuality = (score: number | null | undefined): string => {
        if (!score) return '';
        if (score >= 85) return 'Optimal';
        if (score >= 70) return 'Good';
        if (score >= 60) return 'Fair';
        return 'Pay attention';
    };

    const getDailyInsight = (): string => {
        const parts: string[] = [];
        const rScore = currentReadiness?.score;
        const sScore = currentSleep?.score;
        const aScore = currentActivity?.score;
        const hrv = currentSession?.average_hrv;

        if (rScore && rScore >= 85) parts.push('Body well recovered');
        else if (rScore && rScore < 60) parts.push('Recovery needs attention');

        if (currentSession?.total_sleep_duration) {
            const hours = currentSession.total_sleep_duration / 3600;
            if (hours >= 7.5) parts.push(`${hours.toFixed(1)}h of solid sleep`);
            else if (hours < 6) parts.push(`Only ${hours.toFixed(1)}h of sleep`);
        }

        if (hrv && hrv > 0) {
            const recentHrvs = sessionHistory.slice(0, 7)
                .map(s => s.average_hrv)
                .filter((v): v is number => v != null && v > 0);
            if (recentHrvs.length > 1) {
                const avg = recentHrvs.reduce((a, b) => a + b, 0) / recentHrvs.length;
                if (hrv > avg * 1.1) parts.push('HRV above your weekly average');
            }
        }

        if (parts.length === 0) {
            if (rScore && sScore && aScore) {
                const avg = Math.round((rScore + sScore + aScore) / 3);
                return avg >= 75 ? 'Looking like a good day ahead.' : 'Listen to your body today.';
            }
            return 'Your daily health overview.';
        }
        return parts.join(' · ');
    };

    const handleOpenRemoveProfileDialog = (profile: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null; }) => {
        setProfilePendingRemoval({ id: profile.id, name: getProfileDisplayName(profile) });
    };

    const handleConfirmRemoveProfile = async () => {
        if (!profilePendingRemoval || isRemovingProfile) return;
        setIsRemovingProfile(true);
        try {
            await removeProfile(profilePendingRemoval.id);
        } catch (error) {
            console.error('Failed to remove profile:', error);
            const message = error instanceof Error ? error.message : 'Failed to remove profile.';
            setRemoveProfileError(message);
        } finally {
            setIsRemovingProfile(false);
            setProfilePendingRemoval(null);
        }
    };

    // ============================================
    // LOGIN / PROFILE SELECTION
    // ============================================
    if (!activeProfile) {
        return (
            <div className="min-h-screen bg-[#F2EDE8] px-4 py-8 sm:px-6">
                <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
                    <section className="relative overflow-hidden rounded-[2rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-6 sm:p-8">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(107,158,138,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(123,168,212,0.10),transparent_36%)]" />
                        <div className="relative">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(107,158,138,0.25)] bg-[rgba(107,158,138,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#6B9E8A]">
                                <Heart className="h-3.5 w-3.5" />
                                {competitionInviteToken ? 'Competition invite' : inviteLanding ? 'Invite link' : 'Davis Watches You Sleep'}
                            </div>

                            <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-[#2D2A26] sm:text-4xl">
                                {competitionInviteToken
                                    ? "Join the leaderboard and lock in tomorrow's competition."
                                    : inviteLanding
                                        ? 'Join this Oura leaderboard in one step.'
                                        : profiles.length > 0
                                            ? 'Add a new friend without touching the existing setup.'
                                            : 'Start your shared Oura leaderboard.'}
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#3D3A36] sm:text-base">
                                {competitionInviteToken
                                    ? 'Connect your Oura account once. You will join the shared leaderboard and the invited competition in the same flow.'
                                    : inviteLanding
                                        ? 'Connect your Oura account and you will appear alongside the rest of the group automatically.'
                                        : profiles.length > 0
                                            ? 'The shared board is already live. A new friend just needs the invite link and one Oura sign-in to add themselves.'
                                            : 'Connect the first Oura account to create the board, then invite others from the dashboard or settings.'}
                            </p>

                            <div className="mt-6 flex flex-wrap gap-3">
                                <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white/70 px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Members</p>
                                    <p className="mt-1 text-2xl font-semibold text-[#2D2A26]">{profiles.length}</p>
                                </div>
                                <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white/70 px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Joining</p>
                                    <p className="mt-1 text-sm font-medium text-[#2D2A26]">Oura OAuth</p>
                                    <p className="text-xs text-[#A8A29E]">No manual profile entry</p>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <button
                                    onClick={login}
                                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#6B9E8A] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                                >
                                    {competitionInviteToken
                                        ? 'Join Competition'
                                        : profiles.length > 0
                                            ? 'Join This Leaderboard'
                                            : 'Connect Oura Ring'}
                                </button>
                                {profiles.length > 0 ? (
                                    <div className="inline-flex min-h-12 items-center rounded-xl border border-[rgba(0,0,0,0.06)] px-4 py-3 text-sm text-[#7A756E]">
                                        Already on this device? Choose your profile on the right.
                                    </div>
                                ) : null}
                            </div>

                            {competitionInviteToken ? (
                                <div className="mt-6 rounded-[1.35rem] border border-[rgba(107,158,138,0.25)] bg-[rgba(107,158,138,0.06)] p-4">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#6B9E8A]">Competition Preview</p>
                                    <h3 className="mt-2 text-lg font-semibold text-[#2D2A26]">
                                        {competitionInvitePreviewLoading
                                            ? 'Loading competition...'
                                            : competitionInvitePreview?.competition.title || 'Competition invite'}
                                    </h3>
                                    <p className="mt-2 text-sm leading-relaxed text-[#7A756E]">
                                        {competitionInvitePreview?.competition.description || 'This invite will be applied after your Oura account connects.'}
                                    </p>
                                    {competitionInvitePreview ? (
                                        <p className="mt-3 text-xs text-[#6B9E8A]">
                                            Starts {formatISODateForDisplay(competitionInvitePreview.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })} and runs through {formatISODateForDisplay(competitionInvitePreview.competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}.
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            <p className="mt-6 max-w-xl text-xs leading-relaxed text-[#A8A29E]">
                                Connecting adds your data to this shared leaderboard. Selecting an existing profile only changes the local view on this browser.
                            </p>
                        </div>
                    </section>

                    <div className="space-y-4">
                        {firebaseError && (
                            <button
                                onClick={retryFirebaseConnection}
                                className="w-full rounded-[1.25rem] border border-[rgba(212,137,123,0.25)] bg-[rgba(212,137,123,0.06)] p-4 text-left"
                            >
                                <p className="text-sm font-medium text-[#D4897B]">Connection issue</p>
                                <p className="mt-1 text-xs text-[#B8897E]">{firebaseError}</p>
                            </button>
                        )}

                        <section className="rounded-[1.5rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Returning members</p>
                                    <h2 className="mt-2 text-lg font-semibold text-[#2D2A26]">Choose a profile</h2>
                                </div>
                                <div className="rounded-full border border-[rgba(0,0,0,0.06)] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[#7A756E]">
                                    {profiles.length} total
                                </div>
                            </div>

                            {isLoadingProfiles && !firebaseError ? (
                                <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-6">
                                    <div className="h-4 w-4 rounded-full border-2 border-[rgba(0,0,0,0.10)] border-t-[#6B9E8A] animate-spin" />
                                    <span className="text-sm text-[#7A756E]">Loading profiles...</span>
                                </div>
                            ) : profiles.length > 0 ? (
                                <div className="mt-5 space-y-3">
                                    {profiles.map((profile) => (
                                        <div key={profile.id} className="flex gap-2">
                                            <button
                                                onClick={() => setActiveProfileId(profile.id)}
                                                className="flex min-h-12 flex-1 items-center justify-between rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F2EDE8] px-4 py-3 text-left transition-colors hover:border-[rgba(0,0,0,0.10)] hover:bg-[#FAF7F4]"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-[#2D2A26]">
                                                        {getProfileDisplayName(profile)}
                                                    </p>
                                                    <p
                                                        className={`mt-1 text-[11px] ${profileHealthById.get(profile.id)?.level === 'error'
                                                                ? 'text-[#D4897B]'
                                                                : profileHealthById.get(profile.id)?.level === 'warning'
                                                                    ? 'text-[#D4B87B]'
                                                                    : 'text-[#6B9E8A]'
                                                            }`}
                                                    >
                                                        {profileHealthById.get(profile.id)?.label || 'Up to date'}
                                                    </p>
                                                </div>
                                                <span className="ml-3 text-xs font-mono text-[#C8C2BB]">
                                                    {profile.lastSuccessfulSyncAt
                                                        ? new Date(profile.lastSuccessfulSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                        : ''}
                                                </span>
                                            </button>
                                            <button
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleOpenRemoveProfileDialog(profile);
                                                }}
                                                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#F2EDE8] text-[#A8A29E] transition-colors hover:border-[#D4897B]/30 hover:text-[#D4897B]"
                                                title={`Remove ${getProfileDisplayName(profile)}`}
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-5 rounded-2xl border border-dashed border-[rgba(0,0,0,0.1)] bg-[#FAF7F4] p-5 text-sm text-[#A8A29E]">
                                    No profiles yet. Connect the first Oura account to create the board.
                                </div>
                            )}
                        </section>

                        {profiles.length > 0 && !inviteLanding ? (
                            <InviteLinkCard
                                title="Invite the next friend"
                                description="Send this link to anyone new. They land on the join screen and can add themselves with a single Oura sign-in."
                                memberCount={profiles.length}
                            />
                        ) : null}
                    </div>
                </div>

                <AppDialog
                    isOpen={Boolean(profilePendingRemoval)}
                    title="Remove Profile"
                    message={profilePendingRemoval ? `Remove ${profilePendingRemoval.name} for everyone using this shared leaderboard? This cannot be undone.` : ''}
                    intent="destructive"
                    confirmText={isRemovingProfile ? 'Removing...' : 'Remove'}
                    cancelText="Keep Profile"
                    confirmDisabled={isRemovingProfile}
                    onConfirm={handleConfirmRemoveProfile}
                    onCancel={() => !isRemovingProfile && setProfilePendingRemoval(null)}
                />

                <AppDialog
                    isOpen={Boolean(removeProfileError)}
                    title="Could Not Remove Profile"
                    message={removeProfileError || ''}
                    confirmText="Dismiss"
                    onConfirm={() => setRemoveProfileError(null)}
                />
            </div>
        );
    }

    // ============================================
    // LOADING STATE
    // ============================================
    const activeQueryError = userQueries.find((q, idx) => profiles[idx].id === activeProfile?.id && q.isError);

    if (activeQueryError) {
        const errorState = getDashboardErrorState(activeQueryError.error);
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F2EDE8]">
                <div className="w-full max-w-sm text-center">
                    <div className="w-16 h-16 bg-white border border-[rgba(0,0,0,0.06)] rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Settings className="w-8 h-8 text-[#D4897B]" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-[#2D2A26] mb-2">{errorState.title}</h2>
                    <p className="text-[#A8A29E] text-sm mb-8">
                        {errorState.message}
                    </p>
                    <button onClick={login} className="w-full py-3.5 bg-[#6B9E8A] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm mb-4">
                        Reconnect Oura Ring
                    </button>
                    <button
                        onClick={() => {
                            if (!activeProfile) return;
                            removeProfile(activeProfile.id).catch((error) => {
                                const message = error instanceof Error ? error.message : 'Failed to remove profile.';
                                setRemoveProfileError(message);
                            });
                        }}
                        className="text-[#A8A29E] hover:text-[#2D2A26] text-sm transition-colors"
                    >
                        Remove Profile
                    </button>
                </div>
            </div>
        );
    }

    if (!activeData && userQueries.some(q => q.isLoading)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#F2EDE8] animate-fade-in">
                <div className="relative w-10 h-10 mb-5">
                    <svg viewBox="0 0 40 40" className="w-full h-full transform -rotate-90">
                        <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="2.5" />
                        <circle cx="20" cy="20" r="17" fill="none" stroke="#6B9E8A" strokeWidth="2.5" strokeDasharray="107" strokeDashoffset="80" strokeLinecap="round" className="animate-spin origin-center" style={{ animationDuration: '1.2s' }} />
                    </svg>
                </div>
                <p className="text-[#C8C2BB] text-sm">Loading your data</p>
            </div>
        );
    }

    // ============================================
    // MAIN DASHBOARD
    // ============================================
    return (
        <div className="min-h-screen text-[#2D2A26]">
            <SyncModal isOpen={showSyncModal} progress={syncProgress} onClose={() => setShowSyncModal(false)} />
            <InviteLinkModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} />
            <ScoreBreakdownModal
                isOpen={scoreBreakdownModal.isOpen}
                onClose={() => setScoreBreakdownModal({ isOpen: false, scoreType: null })}
                scoreType={scoreBreakdownModal.scoreType || 'readiness'}
                scoreData={scoreBreakdownModal.scoreType === 'readiness' ? currentReadiness : scoreBreakdownModal.scoreType === 'sleep' ? currentSleep : scoreBreakdownModal.scoreType === 'activity' ? currentActivity : null}
                sessionData={currentSession}
                historyData={scoreHistoryData}
            />
            <MetricDetailModal
                isOpen={metricDetailModal.isOpen}
                onClose={() => setMetricDetailModal({ isOpen: false, metricType: null, currentValue: null, currentTimestamp: undefined, historyData: [] })}
                metricType={metricDetailModal.metricType || 'hrv'}
                currentValue={metricDetailModal.currentValue}
                currentTimestamp={metricDetailModal.currentTimestamp}
                historyData={metricDetailModal.historyData}
                unit={metricDetailModal.unit} color={metricDetailModal.color} date={metricDetailModal.date}
            />
            <LeaderboardUserDetailModal
                isOpen={leaderboardUserDetail.isOpen}
                user={leaderboardUserDetail.user}
                onClose={() => setLeaderboardUserDetail({ isOpen: false, user: null })}
            />

            {/* Top Bar */}
            <nav className="sticky top-0 z-40 bg-[#F2EDE8]/90 backdrop-blur-md border-b border-[rgba(0,0,0,0.06)]">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-sm font-medium tracking-tight text-[#7A756E]">
                            {getTimeGreeting()}, <span className="font-semibold text-[#6B9E8A]">{userName}</span>
                        </h1>
                        <span className="text-[#A8A29E] text-[11px] font-mono hidden sm:inline">{formatLastSync(lastSyncTime)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <PrimaryProfileSwitcher
                            className="hidden sm:block"
                            selectClassName="h-8 text-xs min-w-[9.5rem]"
                        />
                        <button
                            onClick={() => setIsInviteModalOpen(true)}
                            className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.06)] px-3 text-xs font-medium text-[#6B9E8A] transition-colors hover:bg-[rgba(107,158,138,0.1)]"
                            title="Invite a friend"
                        >
                            <Users className="h-4 w-4" />
                            <span className="hidden md:inline">Invite</span>
                        </button>
                        <button onClick={handleSyncAllData} disabled={isSyncing} className="p-2 rounded-xl hover:bg-[#FAF7F4] text-[#A8A29E] hover:text-[#2D2A26] transition-colors disabled:opacity-40" title="Refresh data">
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={login} className="p-2 rounded-xl hover:bg-[#FAF7F4] text-[#A8A29E] hover:text-[#2D2A26] transition-colors" title="Add profile">
                            <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="p-2 rounded-xl hover:bg-[#FAF7F4] text-[#A8A29E] hover:text-[#2D2A26] transition-colors" title="Settings">
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="max-w-5xl mx-auto px-4 pb-2 sm:hidden">
                    <PrimaryProfileSwitcher selectClassName="w-full h-9 text-xs" />
                </div>
                {/* Desktop/tablet tab bar — hidden on mobile */}
                <div className="max-w-5xl mx-auto px-4 gap-1 -mb-px overflow-x-auto pb-1 hidden sm:flex">
                    {[
                        { key: 'today', label: 'Today', icon: <CalendarDays className="w-4 h-4" /> },
                        ...(profiles.length > 1 ? [{ key: 'compare', label: 'Compare', icon: <GitCompareArrows className="w-4 h-4" /> }] : []),
                        { key: 'compete', label: 'Compete', icon: <Swords className="w-4 h-4" /> },
                        { key: 'trends', label: 'Trends', icon: <BarChart3 className="w-4 h-4" /> },
                        { key: 'insights', label: 'Insights', icon: <Sparkles className="w-4 h-4" /> },
                        { key: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setViewMode(tab.key as any)}
                            className={`nav-tab-v2 ${viewMode === tab.key ? 'active' : ''}`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            {/* Mobile bottom tab bar */}
            <nav className="mobile-bottom-nav sm:hidden">
                {[
                    { key: 'today', label: 'Today', icon: <CalendarDays className="w-5 h-5" /> },
                    { key: 'compete', label: 'Compete', icon: <Swords className="w-5 h-5" /> },
                    { key: 'trends', label: 'Trends', icon: <BarChart3 className="w-5 h-5" /> },
                    { key: 'insights', label: 'Insights', icon: <Sparkles className="w-5 h-5" /> },
                    { key: 'export', label: 'Export', icon: <Download className="w-5 h-5" /> },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setViewMode(tab.key as any)}
                        className={`mobile-bottom-tab ${viewMode === tab.key ? 'active' : ''}`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>

            <main className="max-w-5xl mx-auto px-4 pb-24 sm:pb-8">
                {profilesNeedingAttention.length > 0 && (
                    <div className="mt-6 p-4 bg-[#FAF7F4] border border-[rgba(0,0,0,0.08)] rounded-2xl shadow-clay-sm">
                        <p className="text-[#2D2A26] text-sm font-medium mb-2">Sync attention needed</p>
                        <div className="space-y-1">
                            {profilesNeedingAttention.map((profile) => {
                                const status = profileHealthById.get(profile.id);
                                const name = getProfileDisplayName(profile);
                                const isReconnect = status?.level === 'error';
                                return (
                                    <p key={profile.id} className={`text-xs ${isReconnect ? 'text-[#D4897B]' : 'text-[#D4B87B]'}`}>
                                        {name}: {status?.label || 'Needs attention'}
                                    </p>
                                );
                            })}
                        </div>
                        <button
                            onClick={login}
                            className="mt-3 inline-flex min-h-9 items-center rounded-md bg-[#6B9E8A] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                        >
                            Reconnect Oura Ring
                        </button>
                    </div>
                )}

                {/* ======== TODAY VIEW ======== */}
                {viewMode === 'today' && (
                    <div className="pt-8 animate-fade-in">
                        {/* ── Greeting & Date Navigation ── */}
                        <div className="mb-10">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1.5">
                                        {formatDayLabel(referenceDay)}
                                    </h2>
                                    <p className="text-[#7A756E] text-sm leading-relaxed">
                                        {getDailyInsight()}
                                    </p>
                                    {hasIncompleteTodayCoverage && (
                                        <p className="mt-2 text-xs text-[#7A756E]">
                                            {referenceDay === todayIsoDay
                                                ? 'This Oura day is still syncing. Some metrics may not be available yet.'
                                                : 'The latest Oura day is still syncing. Showing your latest complete day.'}
                                        </p>
                                    )}
                                </div>
                                <div className="w-full sm:w-auto shrink-0 mt-1 space-y-2">
                                    <DateRangePicker
                                        mode="date"
                                        dates={todayPickerDays}
                                        selectedDate={referenceDay}
                                        onSelectDate={handleSelectReferenceDay}
                                        showStepper
                                        todayIsoDay={todayIsoDay}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ── Scores ── */}
                        <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-10">
                            {([
                                { type: 'readiness' as const, label: 'Readiness', score: currentReadiness?.score, color: '#7BC4A0' },
                                { type: 'sleep' as const, label: 'Sleep', score: currentSleep?.score, color: '#7BA8D4' },
                                { type: 'activity' as const, label: 'Activity', score: currentActivity?.score, color: '#D4B87B' },
                            ]).map(({ type, label, score, color }) => {
                                const s = score ?? 0;
                                const radius = 34;
                                const circumference = 2 * Math.PI * radius;
                                const progress = (s / 100) * circumference;
                                const quality = getScoreQuality(score);
                                return (
                                    <button
                                        key={type}
                                        onClick={() => handleScoreCardClick(type)}
                                        className="score-card-v2 group"
                                    >
                                        <div className="relative w-[60px] h-[60px] sm:w-[88px] sm:h-[88px] mx-auto mb-1 sm:mb-3">
                                            <svg viewBox="0 0 76 76" className="w-full h-full transform -rotate-90">
                                                <circle cx="38" cy="38" r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
                                                <circle cx="38" cy="38" r={radius} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" className="transition-all duration-1000 ease-out" style={{ filter: `drop-shadow(0 0 4px ${color}22)` }} />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl font-bold font-mono tabular-nums" style={{ color }}>
                                                {score ?? '—'}
                                            </span>
                                        </div>
                                        <span className="text-xs text-[#888] font-medium tracking-wide">{label}</span>
                                        {quality && <span className="text-[10px] text-[#C8C2BB] mt-0.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">{quality}</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Personal Records (Quick Access) ── */}
                        <PersonalRecordsStrip
                            sessionHistory={allTimeSessionHistory}
                            activityHistory={allTimeActivityHistory}
                            readinessHistory={allTimeReadinessHistory}
                            sleepHistory={allTimeSleepHistory}
                            onNavigateToDay={handleSelectReferenceDay}
                        />

                        {/* ── Friend Trends (Quick Access) ── */}
                        {leaderboardData.length > 1 && (
                            <FriendTrendsStrip
                                leaderboardData={leaderboardData}
                                profiles={profiles}
                                userQueries={userQueries}
                                onViewCompare={() => setViewMode('compare')}
                                onViewTrends={() => setViewMode('trends')}
                            />
                        )}

                        {/* ── Sleep ── */}
                        <section className="mb-14">
                            <div className="section-header-v2">
                                <Moon className="w-4 h-4 text-[#7BA8D4]" />
                                <h3>Sleep</h3>
                            </div>
                            {/* Featured */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <MetricCard title="Total Sleep" value={formatDuration(currentSession?.total_sleep_duration)} color="#7BA8D4" showDrillDownIndicator onClick={() => handleMetricCardClick('sleep_duration', currentSession?.total_sleep_duration ?? null, 'hours', '#7BA8D4')} />
                                <MetricCard title="Efficiency" value={currentSession?.efficiency} unit="%" color="#7BC4A0" showDrillDownIndicator onClick={() => handleMetricCardClick('efficiency', currentSession?.efficiency ?? null, '%', '#7BC4A0')} />
                            </div>
                            {/* Sleep stages */}
                            <div className="grid grid-cols-3 gap-3 mb-3">
                                <MetricCard title="Deep Sleep" value={formatDuration(currentSession?.deep_sleep_duration)} color="#7BA8D4" showDrillDownIndicator onClick={() => handleMetricCardClick('deep_sleep', currentSession?.deep_sleep_duration ?? null, 'hours', '#7BA8D4')} />
                                <MetricCard title="REM Sleep" value={formatDuration(currentSession?.rem_sleep_duration)} color="#A08BBE" showDrillDownIndicator onClick={() => handleMetricCardClick('rem_sleep', currentSession?.rem_sleep_duration ?? null, 'hours', '#A08BBE')} />
                                <MetricCard title="Light Sleep" value={formatDuration(currentSession?.light_sleep_duration)} color="#7BA8D4" showDrillDownIndicator onClick={() => handleMetricCardClick('light_sleep', currentSession?.light_sleep_duration ?? null, 'hours', '#7BA8D4')} />
                            </div>
                            {/* Timing & details */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                <MetricCard title="Bedtime" value={formatTime(currentSession?.bedtime_start)} subtext="Fell asleep" showDrillDownIndicator onClick={() => handleMetricCardClick('bedtime', currentBedtimeMinutes, undefined, '#A08BBE', currentSession?.bedtime_start)} />
                                <MetricCard title="Wake Time" value={formatTime(currentSession?.bedtime_end)} subtext="Woke up" showDrillDownIndicator onClick={() => handleMetricCardClick('wake_time', currentWakeTimeMinutes, undefined, '#D4B87B', currentSession?.bedtime_end)} />
                                <MetricCard title="Latency" value={currentSession?.latency ? `${Math.round(currentSession.latency / 60)}` : null} unit="min" subtext="Time to fall asleep" showDrillDownIndicator onClick={() => handleMetricCardClick('latency', currentSession?.latency ?? null, 'min', '#7BC4A0')} />
                                <MetricCard title="Awake Time" value={formatDuration(currentSession?.awake_time)} subtext="During sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('awake_time', currentSession?.awake_time ?? null, 'hours', '#D4897B')} />
                            </div>
                            {sessionHistory.length > 0 && (
                                <div className="chart-container" style={{ height: 260 }}>
                                    <h4 className="chart-label">Sleep Architecture · 14 Days</h4>
                                    <SleepStagesChart data={(() => {
                                        const seen = new Set<string>();
                                        return sessionHistory
                                            .filter(s => { if (seen.has(s.day)) return false; seen.add(s.day); return true; })
                                            .slice(0, 14)
                                            .reverse();
                                    })()} />
                                </div>
                            )}
                        </section>

                        {/* ── Heart & Body ── */}
                        <section className="mb-14">
                            <div className="section-header-v2">
                                <Heart className="w-4 h-4 text-[#D4897B]" />
                                <h3>Heart & Body</h3>
                            </div>
                            {/* Hero vitals */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <MetricCard title="HRV" value={currentSession?.average_hrv} unit="ms" color="#A08BBE" subtext="Heart rate variability" showDrillDownIndicator onClick={() => handleMetricCardClick('hrv', currentSession?.average_hrv ?? null, 'ms', '#A08BBE')} />
                                <MetricCard title="Resting HR" value={currentSession?.lowest_heart_rate} unit="bpm" color="#D4897B" subtext="Lowest during sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('lowest_hr', currentSession?.lowest_heart_rate ?? null, 'bpm', '#D4897B')} />
                            </div>
                            {/* Supporting vitals */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                <MetricCard title="Avg HR" value={currentSession?.average_heart_rate?.toFixed(0)} unit="bpm" color="#D4897B" showDrillDownIndicator onClick={() => handleMetricCardClick('heart_rate', currentSession?.average_heart_rate ?? null, 'bpm', '#D4897B')} />
                                <MetricCard title="SpO2" value={currentSpo2DisplayValue} unit="%" color="#7BA8D4" showDrillDownIndicator onClick={() => handleMetricCardClick('spo2', currentSpo2?.spo2_percentage?.average ?? null, '%', '#7BA8D4')} />
                                <MetricCard title="Stress" value={getStressLabel(currentStress?.day_summary)} color={getStressColor(currentStress?.day_summary)} showDrillDownIndicator onClick={() => handleMetricCardClick('stress', currentStress?.stress_high ?? null, undefined, getStressColor(currentStress?.day_summary))} />
                                <MetricCard title="Resilience" value={currentResilienceDisplayValue} color={getResilienceColor(currentResilience?.level)} showDrillDownIndicator onClick={() => handleMetricCardClick('resilience', currentResilienceScore, 'score', getResilienceColor(currentResilience?.level))} />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <MetricCard title="Breathing" value={currentSession?.average_breath?.toFixed(1)} unit="br/min" subtext="Average during sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('breathing_rate', currentSession?.average_breath ?? null, 'br/min', '#7BC4A0')} />
                                <MetricCard
                                    title="Body Temp"
                                    value={bodyTempDeviationF != null ? `${bodyTempDeviationF > 0 ? '+' : ''}${bodyTempDeviationF.toFixed(1)}` : null}
                                    unit="°F" subtext="From baseline"
                                    color={bodyTempDeviationF != null ? (Math.abs(bodyTempDeviationF) > 0.9 ? '#D4897B' : '#7BC4A0') : undefined}
                                    showDrillDownIndicator
                                    onClick={() => handleMetricCardClick('body_temperature', bodyTempDeviationF, '°F', bodyTempDeviationF != null ? (Math.abs(bodyTempDeviationF) > 0.9 ? '#D4897B' : '#7BC4A0') : '#D4897B')}
                                />
                            </div>

                            {hrData && hrData.length > 0 && (
                                <div className="chart-container mb-4" style={{ height: 200 }}>
                                    <HeartRateChart data={hrData} showLabels />
                                </div>
                            )}
                            {sessionHistory.length > 0 && (
                                <div className="chart-container" style={{ height: 180 }}>
                                    <h4 className="chart-label">HRV Trend · 30 Days</h4>
                                    <ResponsiveContainer
                                        width="100%"
                                        height="100%"
                                        minWidth={0}
                                        minHeight={100}
                                        initialDimension={{ width: 480, height: 100 }}
                                    >
                                        <LineChart data={sessionHistory.slice(0, 30).reverse()}>
                                            <XAxis dataKey="day" tick={{ fill: '#A8A29E', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => val.slice(5)} />
                                            <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: '#A8A29E', fontSize: 10 }} axisLine={false} tickLine={false} unit=" ms" />
                                            <Tooltip contentStyle={CLAY_TOOLTIP_STYLE} formatter={(value: number) => [`${value} ms`, 'HRV']} />
                                            <Line type="monotone" dataKey="average_hrv" stroke="#A08BBE" dot={false} strokeWidth={1.5} connectNulls />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </section>

                        {/* ── Activity ── */}
                        <section className="mb-14">
                            <div className="section-header-v2">
                                <Flame className="w-4 h-4 text-[#D4B87B]" />
                                <h3>Activity</h3>
                            </div>
                            {/* Featured */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <MetricCard title="Steps" value={currentActivity?.steps?.toLocaleString()} color="#D4B87B" showDrillDownIndicator onClick={() => handleMetricCardClick('steps', currentActivity?.steps ?? null, 'steps', '#D4B87B')} />
                                <MetricCard title="Active Calories" value={currentActivity?.active_calories?.toLocaleString()} unit="kcal" color="#D4B87B" showDrillDownIndicator onClick={() => handleMetricCardClick('calories', currentActivity?.active_calories ?? null, 'kcal', '#D4B87B')} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                <MetricCard title="Total Calories" value={currentActivity?.total_calories?.toLocaleString()} unit="kcal" showDrillDownIndicator onClick={() => handleMetricCardClick('total_calories', currentActivity?.total_calories ?? null, 'kcal', '#D4897B')} />
                                <MetricCard title="Distance" value={distanceMiles} unit="mi" showDrillDownIndicator onClick={() => handleMetricCardClick('distance', distanceMilesValue, 'mi', '#7BA8D4')} />
                                <MetricCard title="High Activity" value={formatDuration(currentActivity?.high_activity_time)} color="#D4897B" showDrillDownIndicator onClick={() => handleMetricCardClick('high_activity_time', currentActivity?.high_activity_time ?? null, 'hours', '#D4897B')} />
                                <MetricCard title="Medium Activity" value={formatDuration(currentActivity?.medium_activity_time)} color="#D4A574" showDrillDownIndicator onClick={() => handleMetricCardClick('medium_activity_time', currentActivity?.medium_activity_time ?? null, 'hours', '#D4A574')} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <MetricCard title="Low Activity" value={formatDuration(currentActivity?.low_activity_time)} color="#7BC4A0" showDrillDownIndicator onClick={() => handleMetricCardClick('low_activity_time', currentActivity?.low_activity_time ?? null, 'hours', '#7BC4A0')} />
                                <MetricCard title="Sedentary" value={formatDuration(currentActivity?.sedentary_time)} color="#64748B" showDrillDownIndicator onClick={() => handleMetricCardClick('sedentary_time', currentActivity?.sedentary_time ?? null, 'hours', '#64748B')} />
                            </div>
                        </section>

                        {/* ── Score Contributors ── */}
                        <section className="mb-8">
                            <div className="section-header-v2">
                                <Brain className="w-4 h-4 text-[#777]" />
                                <h3>Score Contributors</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                <ContributorsBreakdown title="Readiness" contributors={readinessContributors} />
                                <ContributorsBreakdown title="Sleep" contributors={sleepContributors} />
                                <ContributorsBreakdown title="Activity" contributors={activityContributors} />
                            </div>
                        </section>
                    </div>
                )}

                {/* ======== COMPARE VIEW ======== */}
                {viewMode === 'compare' && compareParticipantPool.length >= 2 && (
                    <div className="space-y-6 pt-6">
                        <section className="rounded-[1.5rem] border border-[rgba(0,0,0,0.06)] bg-white p-5">
                            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                                <div className="min-w-0">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Compare together</p>
                                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#2D2A26]">
                                        {compareDay
                                            ? formatISODateForDisplay(compareDay, 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                                            : 'Choose a shared date'}
                                    </h2>
                                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#7A756E]">
                                        Compare any two or more people on the same Oura day. If the selected group has no shared day yet, remove one person or sync more recent data.
                                    </p>
                                </div>
                                {compareAvailableDays.length > 0 ? (
                                    <DateRangePicker
                                        mode="date"
                                        dates={compareAvailableDays}
                                        selectedDate={compareDay}
                                        onSelectDate={setCompareDay}
                                        todayIsoDay={todayIsoDay}
                                    />
                                ) : (
                                    <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] px-4 py-3 text-sm text-[#777]">
                                        No shared compare dates yet
                                    </div>
                                )}
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                {compareParticipantPool.map((participant) => {
                                    const isSelected = selectedCompareIds.includes(participant.id);
                                    const isLocked = isSelected && selectedCompareIds.length <= 2;

                                    return (
                                        <button
                                            key={participant.id}
                                            type="button"
                                            onClick={() => toggleCompareParticipant(participant.id)}
                                            disabled={isLocked}
                                            className={`rounded-full border px-3 py-2 text-sm transition-colors ${isSelected
                                                    ? 'border-[rgba(107,158,138,0.25)] bg-[rgba(107,158,138,0.08)] text-[#6B9E8A]'
                                                    : 'border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] text-[#7A756E] hover:border-[rgba(0,0,0,0.12)] hover:text-[#2D2A26]'
                                                } ${isLocked ? 'cursor-not-allowed opacity-80' : ''}`}
                                        >
                                            {getProfileDisplayName(participant.profile)}
                                        </button>
                                    );
                                })}
                                {selectedCompareIds.length < availableCompareIds.length ? (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCompareIds(availableCompareIds)}
                                        className="rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3 py-2 text-sm text-[#7A756E] transition-colors hover:border-[rgba(0,0,0,0.12)] hover:text-[#2D2A26]"
                                    >
                                        Select everyone
                                    </button>
                                ) : null}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#777]">
                                <span>{selectedCompareIds.length} selected</span>
                                <span>{compareAvailableDays.length} shared dates</span>
                                <span>Minimum selection: 2 people</span>
                            </div>
                        </section>

                        {compareDay ? (
                            <>
                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                                    {compareSnapshots.map((snapshot, index) => {
                                        const scores = [
                                            { label: 'Readiness', value: snapshot.readiness?.score, color: '#7BC4A0' },
                                            { label: 'Sleep', value: snapshot.sleep?.score, color: '#7BA8D4' },
                                            { label: 'Activity', value: snapshot.activity?.score, color: '#D4B87B' },
                                        ];
                                        return (
                                            <article
                                                key={snapshot.id}
                                                className="rounded-[1.25rem] border bg-white p-5 shadow-clay-sm transition-shadow hover:shadow-clay"
                                                style={{ borderColor: `${snapshot.color}30` }}
                                            >
                                                {/* Rank & name */}
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div
                                                        className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
                                                        style={{ backgroundColor: `${snapshot.color}15`, color: snapshot.color }}
                                                    >
                                                        {index === 0 ? (
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" /><rect x="4" y="18" width="16" height="2" rx="1" /></svg>
                                                        ) : (
                                                            `#${index + 1}`
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h3 className="text-base font-semibold text-[#2D2A26] leading-tight" style={{ wordBreak: 'break-word' }}>{snapshot.name}</h3>
                                                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#C8C2BB] mt-0.5">{snapshot.availableScoreCount}/3 scores</p>
                                                    </div>
                                                </div>

                                                {/* Daily average - large */}
                                                <div className="flex items-baseline gap-1.5 mb-4">
                                                    <span className="font-mono text-3xl font-bold text-[#2D2A26]">{snapshot.compareAverage ?? '--'}</span>
                                                    <span className="text-xs text-[#C8C2BB] font-medium">avg</span>
                                                    <span className="ml-auto w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: snapshot.color }} />
                                                </div>

                                                {/* Score pills - colored with score-dependent opacity */}
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {scores.map(s => {
                                                        const val = s.value ?? 0;
                                                        const opacity = val >= 85 ? 0.18 : val >= 70 ? 0.12 : 0.07;
                                                        return (
                                                            <div key={s.label} className="rounded-xl px-2 py-2 text-center" style={{ backgroundColor: `${s.color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` }}>
                                                                <p className="text-[10px] font-medium" style={{ color: s.color }}>{s.label}</p>
                                                                <p className="font-mono text-sm font-semibold text-[#2D2A26] mt-0.5">{s.value ?? '--'}</p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Bottom stats */}
                                                <div className="mt-3 flex items-center justify-between text-[11px] text-[#A8A29E]">
                                                    <span>{formatDuration(snapshot.session?.total_sleep_duration)} sleep</span>
                                                    <span>{snapshot.activity?.steps?.toLocaleString() || '--'} steps</span>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>

                                <div className="space-y-4">
                                    <MultiProfileComparisonTable
                                        title="Readiness"
                                        subtitle="Daily readiness scores plus the supporting recovery metrics behind them."
                                        columns={compareColumns.map((column, index) => ({
                                            ...column,
                                            score: compareSnapshots[index]?.readiness?.score ?? null,
                                        }))}
                                        rows={readinessCompareRows}
                                    />
                                    <MultiProfileComparisonTable
                                        title="Sleep"
                                        subtitle="Sleep score context for everyone on the selected day."
                                        columns={compareColumns.map((column, index) => ({
                                            ...column,
                                            score: compareSnapshots[index]?.sleep?.score ?? null,
                                        }))}
                                        rows={sleepCompareRows}
                                    />
                                    <MultiProfileComparisonTable
                                        title="Activity"
                                        subtitle="Activity totals and contribution scores across the selected group."
                                        columns={compareColumns.map((column, index) => ({
                                            ...column,
                                            score: compareSnapshots[index]?.activity?.score ?? null,
                                        }))}
                                        rows={activityCompareRows}
                                    />
                                </div>

                                {hasCompareHeartRateData ? (
                                    <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white p-4">
                                        <h4 className="text-xs uppercase tracking-[0.14em] text-[#A8A29E]">Heart Rate (48h)</h4>
                                        <div className="mt-3 h-64">
                                            <ComparisonHeartRateChart series={compareHeartRateSeries} />
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white p-5 text-sm text-[#7A756E]">
                                The current selection does not share a comparable Oura day yet. Remove one person from the selection or sync more recent data to unlock the multi-user comparison tables.
                            </div>
                        )}
                    </div>
                )}
                {viewMode === 'compare' && profiles.length < 2 && (
                    <div className="pt-16 text-center">
                        <p className="text-[#A8A29E] mb-4">Add a second profile to compare metrics</p>
                        <button onClick={login} className="px-4 py-2 bg-[#6B9E8A] text-white font-medium rounded-md text-sm hover:opacity-90 transition-opacity">Add Profile</button>
                    </div>
                )}
                {viewMode === 'compare' && profiles.length >= 2 && compareParticipantPool.length < 2 && (
                    <div className="pt-16 text-center">
                        <p className="text-[#A8A29E]">Waiting for enough synced data to compare everyone.</p>
                    </div>
                )}

                {/* ======== COMPETE VIEW ======== */}
                {viewMode === 'compete' && (
                    <CompeteView
                        activeProfile={activeProfile}
                        profiles={profiles}
                        profileData={competitionProfileData}
                        competitionInviteToken={competitionInviteToken}
                        onClearCompetitionInviteToken={clearCompetitionInviteToken}
                    />
                )}

                {/* ======== TRENDS VIEW ======== */}
                {viewMode === 'trends' && (
                    <div className="pt-6 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[#A8A29E]">Date Scope</p>
                                <p className="text-sm text-[#7A756E]">{formatRangeLabel(effectiveTrendsRange)}</p>
                            </div>
                            <DateRangePicker
                                mode="range"
                                dates={trendsAvailableDays}
                                selectedDate={referenceDay}
                                onSelectDate={handleSelectReferenceDay}
                                range={effectiveTrendsRange || undefined}
                                onRangeChange={(nextRange) => setTrendsRange(nextRange)}
                                todayIsoDay={todayIsoDay}
                            />
                        </div>
                        <TrendInsightsPanel profiles={profiles} userQueries={scopedAllTimeQueriesForHistory} />
                        <AllTimeHistory profiles={profiles} userQueries={scopedAllTimeQueriesForHistory} />
                    </div>
                )}

                {/* ======== INSIGHTS VIEW ======== */}
                {viewMode === 'insights' && <InsightsView profiles={profiles} userQueries={userQueries} allTimeQueries={allTimeQueries} />}

                {/* ======== EXPORT VIEW ======== */}
                {viewMode === 'export' && <div className="pt-6"><DataExport /></div>}
            </main>
        </div>
    );
};

// Insights sub-view
const InsightsView: React.FC<{ profiles: any[]; userQueries: any[]; allTimeQueries: any[] }> = ({ profiles, userQueries, allTimeQueries }) => {
    const [tab, setTab] = useState<'timeline' | 'correlation' | 'whatif' | 'streaks' | 'patterns' | 'milestones' | 'snapshot'>('timeline');
    const recentUsersData = userQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }));
    const historicalUsersData = profiles.map((_: any, idx: number) => ({
        data: (allTimeQueries[idx]?.data as DailyStats | undefined) ?? (userQueries[idx]?.data as DailyStats | undefined)
    }));

    return (
        <div className="pt-6 space-y-6">
            <div className="relative">
                <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
                    {([
                        { key: 'timeline', label: '24h Timeline' }, { key: 'correlation', label: 'Correlations' },
                        { key: 'whatif', label: 'What-If' },
                        { key: 'streaks', label: 'Streaks' }, { key: 'patterns', label: 'Patterns' },
                        { key: 'milestones', label: 'Milestones' }, { key: 'snapshot', label: 'Snapshot' },
                    ] as const).map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${tab === t.key ? 'bg-[#6B9E8A]/15 text-[#6B9E8A]' : 'text-[#A8A29E] hover:text-[#7A756E] hover:bg-[#FAF7F4]'}`}>{t.label}</button>
                    ))}
                </div>
                <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[var(--bg-base)] to-transparent rounded-r" />
            </div>
            {tab === 'timeline' && <TimelineView profiles={profiles} usersData={recentUsersData} />}
            {tab === 'correlation' && <CorrelationExplorer profiles={profiles} usersData={recentUsersData} />}
            {tab === 'whatif' && <WhatIfSimulator profiles={profiles} usersData={historicalUsersData} />}
            {tab === 'streaks' && <StreakTracker profiles={profiles} usersData={recentUsersData} />}
            {tab === 'patterns' && <PatternDetector profiles={profiles} usersData={recentUsersData} />}
            {tab === 'milestones' && <MilestoneTracker profiles={profiles} usersData={historicalUsersData} />}
            {tab === 'snapshot' && <DailySnapshot profiles={profiles} usersData={recentUsersData} />}
        </div>
    );
};

export default Dashboard;

import React, { useEffect, useMemo, useState } from 'react';
import {
    DailyActivity, DailyReadiness, DailySleep, SleepSession, HeartRate,
    DailySpO2, DailyStress, DailyResilience, LeaderboardEntry, formatDuration, formatTime, DailyStats
} from '../types';
import { useUser } from '../contexts/UserContext';
import MetricCard from '../components/MetricCard';
import SleepStagesChart from '../components/charts/SleepStagesChart';
import HeartRateChart from '../components/charts/HeartRateChart';
import ContributorsBreakdown from '../components/ContributorsBreakdown';
import ScoreBreakdownModal from '../components/ScoreBreakdownModal';
import MetricDetailModal from '../components/MetricDetailModal';
import LeaderboardUserDetailModal from '../components/LeaderboardUserDetailModal';
import AppDialog from '../components/AppDialog';
import DataExport from './DataExport';
import {
    LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchDailyStats, FULL_HISTORY_START_DATE, syncDailyStats } from '../hooks/useOuraData';
import MetricComparisonGroup from '../components/MetricComparisonGroup';
import ComparisonHeartRateChart from '../components/charts/ComparisonHeartRateChart';
import AllTimeHistory from '../components/AllTimeHistory';
import SyncModal from '../components/SyncModal';
import PrimaryProfileSwitcher from '../components/PrimaryProfileSwitcher';
import DateRangePicker from '../components/DateRangePicker';
import { smartSync, SyncProgress } from '../services/syncService';
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
import { ChevronLeft, ChevronRight, X, RefreshCw, Settings, Plus, Moon, Heart, Flame, Brain } from 'lucide-react';
import { getProfileDisplayName } from '../utils/profileName';
import { formatLocalISODate } from '../utils/date';

const METERS_TO_MILES = 0.000621371;
const CELSIUS_DELTA_TO_FAHRENHEIT_DELTA = 9 / 5;
const DEFAULT_DAILY_STATS_STALE_MS = 1000 * 60 * 60;
const LIVE_DAILY_STATS_STALE_MS = 1000 * 60 * 5;
const LIVE_DAILY_STATS_REFETCH_MS = 1000 * 60 * 5;
type DayRange = { start: string; end: string };

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

const findLatestByDay = <T extends { day?: string; timestamp?: string }>(items: T[] | undefined, day?: string): T | undefined => {
    if (!items?.length || !day) return undefined;
    return items
        .filter((item) => item.day === day)
        .sort((a, b) => toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp))[0];
};

const sessionBelongsToDay = (session: SleepSession, day: string): boolean => {
    if (session.day === day) return true;
    if (!session.bedtime_end) return false;
    return formatLocalISODate(new Date(session.bedtime_end)) === day;
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

    const sleepDays = new Set((data.sleep || []).map((item) => item.day).filter(Boolean));
    const readinessDays = new Set((data.readiness || []).map((item) => item.day).filter(Boolean));
    const activityDays = new Set((data.activity || []).map((item) => item.day).filter(Boolean));

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
    const [viewMode, setViewMode] = useState<'today' | 'compare' | 'trends' | 'insights' | 'export'>('today');
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle', currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '',
    });

    const [scoreBreakdownModal, setScoreBreakdownModal] = useState<{
        isOpen: boolean;
        scoreType: 'readiness' | 'sleep' | 'activity' | null;
    }>({ isOpen: false, scoreType: null });

    const [metricDetailModal, setMetricDetailModal] = useState<{
        isOpen: boolean;
        metricType: 'hrv' | 'heart_rate' | 'lowest_hr' | 'spo2' | 'stress' | 'resilience' | 'steps' | 'calories' | 'sleep_duration' | 'deep_sleep' | 'rem_sleep' | 'efficiency' | null;
        currentValue: number | null;
        historyData: { date: string; value: number }[];
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

    const queryClient = useQueryClient();

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
                })
            );
            queryClient.setQueryData(['dailyStats', activeProfile.id], syncedData);
            await markProfileSyncSuccess(activeProfile.id);
        } catch (err) {
            console.error('Sync failed:', err);
            setSyncProgress(prev => ({ ...prev, status: 'error', error: 'Something went wrong. Please try again.' }));
            await markProfileSyncError(activeProfile.id, err);
        } finally {
            setIsSyncing(false);
        }
    };

    // Data queries
    const userQueries = useQueries({
        queries: profiles.map(p => ({
            queryKey: ['dailyStats', p.id],
            queryFn: async () => {
                try {
                    const cached = queryClient.getQueryData(['dailyStats', p.id]) as DailyStats | undefined;
                    const synced = await runWithAutoTokenRefresh(p.id, (token) =>
                        syncDailyStats(token, cached, { mode: 'incremental' })
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
            refetchInterval: viewMode === 'today' && p.id === activeProfile?.id
                ? LIVE_DAILY_STATS_REFETCH_MS
                : false,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: viewMode === 'today' && p.id === activeProfile?.id ? 'always' : true,
        }))
    });

    const allTimeQueries = useQueries({
        queries: profiles.map(p => ({
            queryKey: ['allTimeStats', p.id],
            queryFn: async () => {
                const fullHistory = await runWithAutoTokenRefresh(p.id, (token) =>
                    fetchDailyStats(token, { start: FULL_HISTORY_START_DATE })
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
            staleTime: 1000 * 60 * 60 * 24,
            refetchOnWindowFocus: false,
            enabled: viewMode === 'trends' || viewMode === 'insights',
        }))
    });

    const activeUserQuery = userQueries.find((_, idx) => profiles[idx].id === activeProfile?.id);
    const activeData = activeUserQuery?.data as DailyStats | undefined;

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
    const [trendsRange, setTrendsRange] = useState<DayRange | null>(null);

    const sleepHistory = activeData?.sleep || [];
    const readinessHistory = activeData?.readiness || [];
    const activityHistory = activeData?.activity || [];
    const sessionHistory = activeData?.session || [];
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

    const effectiveTrendsRange = useMemo<DayRange | null>(() => {
        if (!availableDays.length) return null;
        const newest = availableDays[0];
        const oldest = availableDays[availableDays.length - 1];

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
    }, [availableDays, trendsRange]);

    useEffect(() => {
        setDateIndex(0);
    }, [activeProfile?.id]);

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

    const scoreAnchorDay = availableDays[dateIndex];
    const referenceDay = scoreAnchorDay;

    const handleSelectReferenceDay = (day: string) => {
        const nextIndex = availableDays.indexOf(day);
        if (nextIndex >= 0) setDateIndex(nextIndex);
    };

    const currentSleep = findLatestByDay(sleepHistory, referenceDay);
    const currentReadiness = findLatestByDay(readinessHistory, referenceDay);
    const currentActivity = findLatestByDay(activityHistory, referenceDay);
    const currentSession = findSessionForDay(referenceDay);
    const currentSpo2 = findLatestByDay(spo2History, referenceDay);
    const currentStress = findLatestByDay(stressHistory, referenceDay);
    const currentResilience = findLatestByDay(resilienceHistory, referenceDay);
    const bodyTempDeviationF = currentReadiness?.temperature_deviation != null
        ? currentReadiness.temperature_deviation * CELSIUS_DELTA_TO_FAHRENHEIT_DELTA
        : null;
    const distanceMiles = ((currentActivity?.equivalent_walking_distance || 0) * METERS_TO_MILES).toFixed(1);

    const readinessContributors = currentReadiness?.contributors ? [
        { label: 'Previous Night', value: currentReadiness.contributors.previous_night, color: '#3b82f6', key: 'previous_night' },
        { label: 'Sleep Balance', value: currentReadiness.contributors.sleep_balance, color: '#3b82f6', key: 'sleep_balance' },
        { label: 'HRV Balance', value: currentReadiness.contributors.hrv_balance, color: '#8b5cf6', key: 'hrv_balance' },
        { label: 'Resting HR', value: currentReadiness.contributors.resting_heart_rate, color: '#ef4444', key: 'resting_heart_rate' },
        { label: 'Recovery Index', value: currentReadiness.contributors.recovery_index, color: '#10b981', key: 'recovery_index' },
        { label: 'Body Temperature', value: currentReadiness.contributors.body_temperature, color: '#f97316', key: 'body_temperature' },
        { label: 'Activity Balance', value: currentReadiness.contributors.activity_balance, color: '#f59e0b', key: 'activity_balance' },
        { label: 'Previous Day Activity', value: currentReadiness.contributors.previous_day_activity, color: '#f59e0b', key: 'previous_day_activity' },
    ] : [];

    const sleepContributors = currentSleep?.contributors ? [
        { label: 'Total Sleep', value: currentSleep.contributors.total_sleep, color: '#3b82f6', key: 'total_sleep' },
        { label: 'Efficiency', value: currentSleep.contributors.efficiency, color: '#3b82f6', key: 'efficiency' },
        { label: 'Restfulness', value: currentSleep.contributors.restfulness, color: '#8b5cf6', key: 'restfulness' },
        { label: 'REM Sleep', value: currentSleep.contributors.rem_sleep, color: '#8b5cf6', key: 'rem_sleep' },
        { label: 'Deep Sleep', value: currentSleep.contributors.deep_sleep, color: '#1e40af', key: 'deep_sleep' },
        { label: 'Latency', value: currentSleep.contributors.latency, color: '#10b981', key: 'latency' },
        { label: 'Timing', value: currentSleep.contributors.timing, color: '#10b981', key: 'timing' },
    ] : [];

    const getMetricHistoryData = (metricType: string, days: number = 30, data?: DailyStats) => {
        const dataSource = data || activeData;
        if (!dataSource) return [];
        const { session: sh, activity: ah, spo2: sp, stress: st, resilience: rl } = dataSource;

        // Build day-keyed lookup maps so we match by date, not array index
        const activityByDay = new Map((ah || []).map(a => [a.day, a]));
        const spo2ByDay = new Map((sp || []).map(s => [s.day, s]));
        const stressByDay = new Map((st || []).map(s => [s.day, s]));
        const resilienceByDay = new Map((rl || []).map(r => [r.day, r]));

        const dataPoints: { date: string; value: number }[] = [];
        const limit = Math.min(days, sh?.length || 0);
        for (let i = 0; i < limit; i++) {
            const session = sh?.[i];
            if (!session?.day) continue;
            const day = session.day;
            const activity = activityByDay.get(day);
            const spo2 = spo2ByDay.get(day);
            const stress = stressByDay.get(day);
            const resilience = resilienceByDay.get(day);

            let value: number | null = null;
            switch (metricType) {
                case 'hrv': value = session.average_hrv ?? null; break;
                case 'heart_rate': value = session.average_heart_rate ?? null; break;
                case 'lowest_hr': value = session.lowest_heart_rate ?? null; break;
                case 'spo2': value = spo2?.spo2_percentage?.average ?? null; break;
                case 'stress': value = stress?.stress_high ?? null; break;
                case 'resilience':
                    if (resilience?.contributors) {
                        const { sleep_recovery, daytime_recovery, stress: s } = resilience.contributors;
                        value = sleep_recovery !== undefined && daytime_recovery !== undefined && s !== undefined
                            ? (sleep_recovery + daytime_recovery - s) / 3 : null;
                    } break;
                case 'steps': value = activity?.steps ?? null; break;
                case 'calories': value = activity?.active_calories ?? null; break;
                case 'sleep_duration': value = session.total_sleep_duration ?? null; break;
                case 'deep_sleep': value = session.deep_sleep_duration ?? null; break;
                case 'rem_sleep': value = session.rem_sleep_duration ?? null; break;
                case 'efficiency': value = session.efficiency ?? null; break;
            }
            const isHR = metricType === 'hrv' || metricType === 'heart_rate' || metricType === 'lowest_hr';
            if (value !== null && (!isHR || value > 0)) dataPoints.push({ date: day, value });
        }
        return dataPoints;
    };

    const handleMetricCardClick = (
        metricType: 'hrv' | 'heart_rate' | 'lowest_hr' | 'spo2' | 'stress' | 'resilience' | 'steps' | 'calories' | 'sleep_duration' | 'deep_sleep' | 'rem_sleep' | 'efficiency',
        currentValue: number | null,
        unit?: string,
        color?: string
    ) => {
        if (!activeProfile?.id) return;

        // Show modal immediately with currently available data
        const allTimeQueryKey = ['allTimeStats', activeProfile.id] as const;
        const cachedAllTime = queryClient.getQueryData(allTimeQueryKey) as DailyStats | undefined;
        const bestAvailable = cachedAllTime || activeData;
        const historyData = bestAvailable
            ? getMetricHistoryData(metricType, bestAvailable.session?.length || 0, bestAvailable)
            : [];
        setMetricDetailModal({ isOpen: true, metricType, currentValue, historyData, unit, color, date: currentSleep?.day });

        // Prefetch full history in background if not cached
        if (!cachedAllTime) {
            queryClient.prefetchQuery({
                queryKey: allTimeQueryKey,
                queryFn: () => runWithAutoTokenRefresh(activeProfile.id, (token) =>
                    fetchDailyStats(token, { start: FULL_HISTORY_START_DATE })
                ),
                staleTime: 1000 * 60 * 60 * 24,
            });
        }
    };

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
                name: p.firstName || (p.email || 'User').split('@')[0],
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

        const sleepDays = new Set((data.sleep || []).map((item) => item.day).filter(Boolean));
        const readinessDays = new Set((data.readiness || []).map((item) => item.day).filter(Boolean));
        const activityDays = new Set((data.activity || []).map((item) => item.day).filter(Boolean));

        return new Set(
            Array.from(sleepDays).filter((day) => readinessDays.has(day) && activityDays.has(day))
        );
    };

    // Versus data
    const compareEntries = leaderboardData.slice(0, 2);
    const p1Index = profiles.findIndex((p) => p.id === compareEntries[0]?.id);
    const p2Index = profiles.findIndex((p) => p.id === compareEntries[1]?.id);
    const p1Data = p1Index >= 0 ? (userQueries[p1Index]?.data as DailyStats | undefined) : undefined;
    const p2Data = p2Index >= 0 ? (userQueries[p2Index]?.data as DailyStats | undefined) : undefined;
    const compareProfileA = profiles.find((p) => p.id === compareEntries[0]?.id);
    const compareProfileB = profiles.find((p) => p.id === compareEntries[1]?.id);
    const compareAvailableDays = useMemo(() => {
        if (!p1Data || !p2Data) return [];
        const p1Days = completeDaySetFromStats(p1Data);
        const p2Days = completeDaySetFromStats(p2Data);
        const completeOverlap = Array.from(p1Days).filter((day) => p2Days.has(day)).sort((a, b) => b.localeCompare(a));
        if (completeOverlap.length > 0) {
            return completeOverlap;
        }

        const p1AnyDays = new Set<string>([
            ...(p1Data.sleep || []).map((item) => item.day),
            ...(p1Data.readiness || []).map((item) => item.day),
            ...(p1Data.activity || []).map((item) => item.day),
        ].filter(Boolean));
        const p2AnyDays = new Set<string>([
            ...(p2Data.sleep || []).map((item) => item.day),
            ...(p2Data.readiness || []).map((item) => item.day),
            ...(p2Data.activity || []).map((item) => item.day),
        ].filter(Boolean));

        return Array.from(p1AnyDays).filter((day) => p2AnyDays.has(day)).sort((a, b) => b.localeCompare(a));
    }, [p1Data, p2Data]);
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
        const previous = new Date(`${compareDay}T12:00:00`);
        previous.setDate(previous.getDate() - 1);
        return formatLocalISODate(previous);
    }, [compareDay]);

    const isInCompareWindow = (timestamp: string): boolean => {
        if (!compareDay) return false;
        const day = timestamp.slice(0, 10);
        return day === compareDay || day === previousCompareDay;
    };

    const p1Hr = useMemo(
        () => (p1Data?.heartrate || []).filter((point) => isInCompareWindow(point.timestamp)),
        [p1Data?.heartrate, compareDay, previousCompareDay]
    );
    const p2Hr = useMemo(
        () => (p2Data?.heartrate || []).filter((point) => isInCompareWindow(point.timestamp)),
        [p2Data?.heartrate, compareDay, previousCompareDay]
    );
    const p1Sleep = findLatestByDay(p1Data?.sleep || [], compareDay);
    const p1Readiness = findLatestByDay(p1Data?.readiness || [], compareDay);
    const p2Sleep = findLatestByDay(p2Data?.sleep || [], compareDay);
    const p2Readiness = findLatestByDay(p2Data?.readiness || [], compareDay);
    const p1Session = pickBestSession(getSessionsForDay(p1Data?.session, compareDay));
    const p2Session = pickBestSession(getSessionsForDay(p2Data?.session, compareDay));

    useEffect(() => {
        if (!activeProfile?.id || viewMode !== 'today') return;
        if (referenceDay !== formatLocalISODate()) return;
        queryClient.invalidateQueries({ queryKey: ['dailyStats', activeProfile.id], exact: true });
    }, [activeProfile?.id, queryClient, referenceDay, viewMode]);

    useEffect(() => {
        if (!profiles.length) return;
        let timer: ReturnType<typeof window.setTimeout> | null = null;

        const scheduleMidnightInvalidation = () => {
            const now = new Date();
            const nextMidnight = new Date(now);
            nextMidnight.setHours(24, 0, 5, 0);
            const delayMs = Math.max(nextMidnight.getTime() - now.getTime(), 1000);

            timer = window.setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['dailyStats'] });
                scheduleMidnightInvalidation();
            }, delayMs);
        };

        scheduleMidnightInvalidation();
        return () => {
            if (timer !== null) window.clearTimeout(timer);
        };
    }, [profiles.length, queryClient]);

    const userName = activeProfile?.firstName || activeProfile?.email?.split('@')[0] || 'there';

    const formatDayLabel = (day: string | undefined) => {
        if (!day) return 'Today';
        const d = new Date(day + 'T12:00:00');
        const today = new Date(); today.setHours(12, 0, 0, 0);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return 'Today';
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };
    const formatRangeLabel = (range: DayRange | null): string => {
        if (!range) return 'All available dates';
        const start = new Date(`${range.start}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const end = new Date(`${range.end}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${start} - ${end}`;
    };

    const getStressLabel = (summary: string | null | undefined) => {
        switch (summary) { case 'restored': return 'Restored'; case 'normal': return 'Normal'; case 'stressful': return 'Stressful'; default: return '--'; }
    };
    const getStressColor = (summary: string | null | undefined) => {
        switch (summary) { case 'restored': return '#34D399'; case 'normal': return '#FBBF24'; case 'stressful': return '#F87171'; default: return '#666'; }
    };
    const getResilienceColor = (level: string | null | undefined) => {
        switch (level) { case 'exceptional': return '#34D399'; case 'strong': return '#6EE7B7'; case 'solid': return '#60A5FA'; case 'adequate': return '#FBBF24'; case 'limited': return '#F87171'; default: return '#666'; }
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
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-sm animate-fade-in">
                    <div className="text-center mb-12">
                        <div className="w-12 h-12 rounded-full bg-[#141414] border border-[#1E1E1E] flex items-center justify-center mx-auto mb-5">
                            <Heart className="w-5 h-5 text-[#00C896]" />
                        </div>
                        <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA] mb-2">Davis Watches You Sleep!</h1>
                        <p className="text-[#666] text-sm">Your Oura data, clearly presented</p>
                    </div>

                    {firebaseError && (
                        <button onClick={retryFirebaseConnection} className="w-full mb-6 p-4 bg-[#1C1C1C] border border-[#333] rounded-lg text-left">
                            <p className="text-[#F87171] text-sm font-medium">Connection issue</p>
                            <p className="text-[#666] text-xs mt-1">{firebaseError}</p>
                        </button>
                    )}

                    {isLoadingProfiles && !firebaseError && (
                        <div className="flex items-center justify-center gap-3 p-6 mb-6">
                            <div className="w-4 h-4 border-2 border-[#333] border-t-[#00C896] rounded-full animate-spin" />
                            <span className="text-[#666] text-sm">Loading profiles...</span>
                        </div>
                    )}

                    {!isLoadingProfiles && profiles.length > 0 && (
                        <div className="mb-8">
                            <p className="text-[#555] text-xs font-medium tracking-wider mb-3 px-1">Choose profile</p>
                            <div className="space-y-2">
                                {profiles.map(p => (
                                    <div key={p.id} className="flex gap-2">
                                        <button
                                            onClick={() => setActiveProfileId(p.id)}
                                            className="flex-1 bg-[#141414] border border-[#1E1E1E] rounded-xl p-4 text-left hover:border-[#333] hover:bg-[#161616] transition-all duration-200 flex items-center justify-between"
                                        >
                                            <div>
                                                <span className="text-[#FAFAFA] font-medium text-sm block">
                                                    {getProfileDisplayName(p)}
                                                </span>
                                                <span className={`text-[11px] ${profileHealthById.get(p.id)?.level === 'error'
                                                        ? 'text-[#F87171]'
                                                        : profileHealthById.get(p.id)?.level === 'warning'
                                                            ? 'text-[#FBBF24]'
                                                            : 'text-[#00C896]'
                                                    }`}>
                                                    {profileHealthById.get(p.id)?.label || 'Up to date'}
                                                </span>
                                            </div>
                                            <span className="text-[#444] text-xs font-mono">
                                                {p.lastSuccessfulSyncAt ? new Date(p.lastSuccessfulSyncAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                            </span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleOpenRemoveProfileDialog(p); }}
                                            className="px-3 bg-[#141414] border border-[#222] rounded-lg text-[#666] hover:text-[#F87171] hover:border-[#F87171]/30 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={login} className="w-full py-3.5 bg-[#00C896] text-[#0C0C0C] font-semibold rounded-xl hover:bg-[#00B589] transition-colors text-sm">
                        {profiles.length > 0 ? 'Add Another Profile' : 'Connect Oura Ring'}
                    </button>
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
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#0C0C0C]">
                <div className="w-full max-w-sm text-center">
                    <div className="w-16 h-16 bg-[#141414] border border-[#222] rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Settings className="w-8 h-8 text-[#F87171]" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-[#FAFAFA] mb-2">Session Expired</h2>
                    <p className="text-[#666] text-sm mb-8">
                        Your Oura connection has expired. Please securely reconnect your ring to continue syncing your data.
                    </p>
                    <button onClick={login} className="w-full py-3.5 bg-[#00C896] text-[#0C0C0C] font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm mb-4">
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
                        className="text-[#666] hover:text-[#FAFAFA] text-sm transition-colors"
                    >
                        Remove Profile
                    </button>
                </div>
            </div>
        );
    }

    if (!activeData && userQueries.some(q => q.isLoading)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C0C0C] animate-fade-in">
                <div className="relative w-10 h-10 mb-5">
                    <svg viewBox="0 0 40 40" className="w-full h-full transform -rotate-90">
                        <circle cx="20" cy="20" r="17" fill="none" stroke="#1C1C1C" strokeWidth="2.5" />
                        <circle cx="20" cy="20" r="17" fill="none" stroke="#00C896" strokeWidth="2.5" strokeDasharray="107" strokeDashoffset="80" strokeLinecap="round" className="animate-spin origin-center" style={{ animationDuration: '1.2s' }} />
                    </svg>
                </div>
                <p className="text-[#555] text-sm">Loading your data</p>
            </div>
        );
    }

    // ============================================
    // MAIN DASHBOARD
    // ============================================
    return (
        <div className="min-h-screen text-[#FAFAFA]">
            <SyncModal isOpen={showSyncModal} progress={syncProgress} onClose={() => setShowSyncModal(false)} />
            <ScoreBreakdownModal
                isOpen={scoreBreakdownModal.isOpen}
                onClose={() => setScoreBreakdownModal({ isOpen: false, scoreType: null })}
                scoreType={scoreBreakdownModal.scoreType || 'readiness'}
                scoreData={scoreBreakdownModal.scoreType === 'readiness' ? currentReadiness : scoreBreakdownModal.scoreType === 'sleep' ? currentSleep : scoreBreakdownModal.scoreType === 'activity' ? currentActivity : null}
                sessionData={currentSession}
            />
            <MetricDetailModal
                isOpen={metricDetailModal.isOpen}
                onClose={() => setMetricDetailModal({ isOpen: false, metricType: null, currentValue: null, historyData: [] })}
                metricType={metricDetailModal.metricType || 'hrv'}
                currentValue={metricDetailModal.currentValue}
                historyData={metricDetailModal.historyData}
                unit={metricDetailModal.unit} color={metricDetailModal.color} date={metricDetailModal.date}
            />
            <LeaderboardUserDetailModal
                isOpen={leaderboardUserDetail.isOpen}
                user={leaderboardUserDetail.user}
                onClose={() => setLeaderboardUserDetail({ isOpen: false, user: null })}
            />

            {/* Top Bar */}
            <nav className="sticky top-0 z-40 bg-[#0C0C0C]/90 backdrop-blur-md border-b border-[#1C1C1C]">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-semibold tracking-tight">{userName}</h1>
                        <span className="text-[#444] text-xs font-mono hidden sm:inline">{formatLastSync(lastSyncTime)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <PrimaryProfileSwitcher
                            className="hidden sm:block"
                            selectClassName="h-8 text-xs min-w-[9.5rem]"
                        />
                        <button onClick={handleSyncAllData} disabled={isSyncing} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors disabled:opacity-40" title="Refresh data">
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={login} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors" title="Add profile">
                            <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors" title="Settings">
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="max-w-5xl mx-auto px-4 pb-2 sm:hidden">
                    <PrimaryProfileSwitcher selectClassName="w-full h-9 text-xs" />
                </div>
                <div className="max-w-5xl mx-auto px-4 flex gap-0.5 -mb-px overflow-x-auto">
                    {[
                        { key: 'today', label: 'Today' },
                        ...(profiles.length > 1 ? [{ key: 'compare', label: 'Compare' }] : []),
                        { key: 'trends', label: 'Trends' },
                        { key: 'insights', label: 'Insights' },
                        { key: 'export', label: 'Export' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setViewMode(tab.key as any)}
                            className={`px-4 py-2.5 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${viewMode === tab.key ? 'border-[#00C896] text-[#FAFAFA]' : 'border-transparent text-[#555] hover:text-[#999]'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-4 pb-16">
                {profilesNeedingAttention.length > 0 && (
                    <div className="mt-6 p-4 bg-[#1C1C1C] border border-[#333] rounded-lg">
                        <p className="text-[#FAFAFA] text-sm font-medium mb-2">Sync attention needed</p>
                        <div className="space-y-1">
                            {profilesNeedingAttention.map((profile) => {
                                const status = profileHealthById.get(profile.id);
                                const name = profile.firstName || (profile.email || 'User').split('@')[0];
                                const isReconnect = status?.level === 'error';
                                return (
                                    <p key={profile.id} className={`text-xs ${isReconnect ? 'text-[#F87171]' : 'text-[#FBBF24]'}`}>
                                        {name}: {status?.label || 'Needs attention'}
                                    </p>
                                );
                            })}
                        </div>
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
                                    <p className="text-[#777] text-sm leading-relaxed">
                                        {getDailyInsight()}
                                    </p>
                                </div>
                                <div className="w-full sm:w-auto shrink-0 mt-1 space-y-2">
                                    <DateRangePicker
                                        mode="date"
                                        dates={availableDays}
                                        selectedDate={referenceDay}
                                        onSelectDate={handleSelectReferenceDay}
                                    />
                                    <div className="flex items-center justify-end gap-0.5">
                                        <button
                                            disabled={dateIndex >= availableDays.length - 1 || availableDays.length === 0}
                                            onClick={() => {
                                                if (!availableDays.length) return;
                                                setDateIndex((current) => Math.min(current + 1, availableDays.length - 1));
                                            }}
                                            className="p-2.5 rounded-lg hover:bg-[#1C1C1C] disabled:opacity-20 transition-colors text-[#555]"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-xs text-[#555] font-mono min-w-[88px] text-center tabular-nums">{referenceDay || '--'}</span>
                                        <button
                                            disabled={dateIndex === 0 || availableDays.length === 0}
                                            onClick={() => {
                                                if (!availableDays.length) return;
                                                setDateIndex((current) => Math.max(current - 1, 0));
                                            }}
                                            className="p-2.5 rounded-lg hover:bg-[#1C1C1C] disabled:opacity-20 transition-colors text-[#555]"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Scores ── */}
                        <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-14">
                            {([
                                { type: 'readiness' as const, label: 'Readiness', score: currentReadiness?.score, color: '#34D399' },
                                { type: 'sleep' as const, label: 'Sleep', score: currentSleep?.score, color: '#60A5FA' },
                                { type: 'activity' as const, label: 'Activity', score: currentActivity?.score, color: '#FBBF24' },
                            ]).map(({ type, label, score, color }) => {
                                const s = score ?? 0;
                                const radius = 34;
                                const circumference = 2 * Math.PI * radius;
                                const progress = (s / 100) * circumference;
                                const quality = getScoreQuality(score);
                                return (
                                    <button
                                        key={type}
                                        onClick={() => setScoreBreakdownModal({ isOpen: true, scoreType: type })}
                                        className="score-card-v2 group"
                                    >
                                        <div className="relative w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] mx-auto mb-3">
                                            <svg viewBox="0 0 76 76" className="w-full h-full transform -rotate-90">
                                                <circle cx="38" cy="38" r={radius} fill="none" stroke="#1C1C1C" strokeWidth="3" />
                                                <circle cx="38" cy="38" r={radius} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" className="transition-all duration-1000 ease-out" style={{ filter: `drop-shadow(0 0 4px ${color}22)` }} />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl font-bold font-mono tabular-nums" style={{ color }}>
                                                {score ?? '—'}
                                            </span>
                                        </div>
                                        <span className="text-xs text-[#888] font-medium tracking-wide">{label}</span>
                                        {quality && <span className="text-[10px] text-[#555] mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{quality}</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Sleep ── */}
                        <section className="mb-14">
                            <div className="section-header-v2">
                                <Moon className="w-4 h-4 text-[#60A5FA]" />
                                <h3>Sleep</h3>
                            </div>
                            {/* Featured */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <MetricCard title="Total Sleep" value={formatDuration(currentSession?.total_sleep_duration)} color="#60A5FA" showDrillDownIndicator onClick={() => handleMetricCardClick('sleep_duration', currentSession?.total_sleep_duration ?? null, 'hours', '#60A5FA')} />
                                <MetricCard title="Efficiency" value={currentSession?.efficiency} unit="%" color="#34D399" showDrillDownIndicator onClick={() => handleMetricCardClick('efficiency', currentSession?.efficiency ?? null, '%', '#34D399')} />
                            </div>
                            {/* Sleep stages */}
                            <div className="grid grid-cols-3 gap-3 mb-3">
                                <MetricCard title="Deep Sleep" value={formatDuration(currentSession?.deep_sleep_duration)} color="#1E40AF" showDrillDownIndicator onClick={() => handleMetricCardClick('deep_sleep', currentSession?.deep_sleep_duration ?? null, 'hours', '#1E40AF')} />
                                <MetricCard title="REM Sleep" value={formatDuration(currentSession?.rem_sleep_duration)} color="#8B5CF6" showDrillDownIndicator onClick={() => handleMetricCardClick('rem_sleep', currentSession?.rem_sleep_duration ?? null, 'hours', '#8B5CF6')} />
                                <MetricCard title="Light Sleep" value={formatDuration(currentSession?.light_sleep_duration)} color="#93C5FD" />
                            </div>
                            {/* Timing & details */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                <MetricCard title="Bedtime" value={formatTime(currentSession?.bedtime_start)} subtext="Fell asleep" />
                                <MetricCard title="Wake Time" value={formatTime(currentSession?.bedtime_end)} subtext="Woke up" />
                                <MetricCard title="Latency" value={currentSession?.latency ? `${Math.round(currentSession.latency / 60)}` : null} unit="min" subtext="Time to fall asleep" />
                                <MetricCard title="Awake Time" value={formatDuration(currentSession?.awake_time)} subtext="During sleep" />
                            </div>
                            {sessionHistory.length > 0 && (
                                <div className="chart-container" style={{ height: 260 }}>
                                    <h4 className="chart-label">Sleep Architecture · 14 Days</h4>
                                    <SleepStagesChart data={sessionHistory.slice(0, 14).reverse()} />
                                </div>
                            )}
                        </section>

                        {/* ── Heart & Body ── */}
                        <section className="mb-14">
                            <div className="section-header-v2">
                                <Heart className="w-4 h-4 text-[#F87171]" />
                                <h3>Heart & Body</h3>
                            </div>
                            {/* Hero vitals */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <MetricCard title="HRV" value={currentSession?.average_hrv} unit="ms" color="#A855F7" subtext="Heart rate variability" showDrillDownIndicator onClick={() => handleMetricCardClick('hrv', currentSession?.average_hrv ?? null, 'ms', '#A855F7')} />
                                <MetricCard title="Resting HR" value={currentSession?.lowest_heart_rate} unit="bpm" color="#F87171" subtext="Lowest during sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('lowest_hr', currentSession?.lowest_heart_rate ?? null, 'bpm', '#F87171')} />
                            </div>
                            {/* Supporting vitals */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                <MetricCard title="Avg HR" value={currentSession?.average_heart_rate?.toFixed(0)} unit="bpm" color="#F87171" showDrillDownIndicator onClick={() => handleMetricCardClick('heart_rate', currentSession?.average_heart_rate ?? null, 'bpm', '#F87171')} />
                                <MetricCard title="SpO2" value={currentSpo2?.spo2_percentage?.average?.toFixed(1)} unit="%" color="#06B6D4" showDrillDownIndicator onClick={() => handleMetricCardClick('spo2', currentSpo2?.spo2_percentage?.average ?? null, '%', '#06B6D4')} />
                                <MetricCard title="Stress" value={getStressLabel(currentStress?.day_summary)} color={getStressColor(currentStress?.day_summary)} />
                                <MetricCard title="Resilience" value={currentResilience?.level ? currentResilience.level.charAt(0).toUpperCase() + currentResilience.level.slice(1) : null} color={getResilienceColor(currentResilience?.level)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <MetricCard title="Breathing" value={currentSession?.average_breath?.toFixed(1)} unit="br/min" subtext="Average during sleep" />
                                <MetricCard
                                    title="Body Temp"
                                    value={bodyTempDeviationF != null ? `${bodyTempDeviationF > 0 ? '+' : ''}${bodyTempDeviationF.toFixed(1)}` : null}
                                    unit="°F" subtext="From baseline"
                                    color={bodyTempDeviationF != null ? (Math.abs(bodyTempDeviationF) > 0.9 ? '#F87171' : '#34D399') : undefined}
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
                                            <XAxis dataKey="day" tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => val.slice(5)} />
                                            <YAxis tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} unit=" ms" />
                                            <Tooltip contentStyle={{ backgroundColor: '#1C1C1C', border: '1px solid #333', borderRadius: '8px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} formatter={(value: number) => [`${value} ms`, 'HRV']} />
                                            <Line type="monotone" dataKey="average_hrv" stroke="#A855F7" dot={false} strokeWidth={1.5} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </section>

                        {/* ── Activity ── */}
                        <section className="mb-14">
                            <div className="section-header-v2">
                                <Flame className="w-4 h-4 text-[#FBBF24]" />
                                <h3>Activity</h3>
                            </div>
                            {/* Featured */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <MetricCard title="Steps" value={currentActivity?.steps?.toLocaleString()} color="#FBBF24" showDrillDownIndicator onClick={() => handleMetricCardClick('steps', currentActivity?.steps ?? null, 'steps', '#FBBF24')} />
                                <MetricCard title="Active Calories" value={currentActivity?.active_calories?.toLocaleString()} unit="kcal" color="#FBBF24" showDrillDownIndicator onClick={() => handleMetricCardClick('calories', currentActivity?.active_calories ?? null, 'kcal', '#FBBF24')} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                <MetricCard title="Total Calories" value={currentActivity?.total_calories?.toLocaleString()} unit="kcal" />
                                <MetricCard title="Distance" value={distanceMiles} unit="mi" />
                                <MetricCard title="High Activity" value={formatDuration(currentActivity?.high_activity_time)} color="#EF4444" />
                                <MetricCard title="Medium Activity" value={formatDuration(currentActivity?.medium_activity_time)} color="#F59E0B" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <MetricCard title="Low Activity" value={formatDuration(currentActivity?.low_activity_time)} color="#22C55E" />
                                <MetricCard title="Sedentary" value={formatDuration(currentActivity?.sedentary_time)} color="#64748B" />
                            </div>
                        </section>

                        {/* ── Score Contributors ── */}
                        <section className="mb-8">
                            <div className="section-header-v2">
                                <Brain className="w-4 h-4 text-[#777]" />
                                <h3>Score Contributors</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <ContributorsBreakdown title="Readiness" contributors={readinessContributors} />
                                <ContributorsBreakdown title="Sleep" contributors={sleepContributors} />
                            </div>
                        </section>
                    </div>
                )}

                {/* ======== COMPARE VIEW ======== */}
                {viewMode === 'compare' && compareEntries.length >= 2 && (
                    <div className="space-y-6 pt-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[#666]">Compare Date</p>
                                <p className="text-sm text-[#A0A0A0]">{compareDay ? formatDayLabel(compareDay) : 'No shared date available'}</p>
                            </div>
                            <DateRangePicker
                                mode="date"
                                dates={compareAvailableDays}
                                selectedDate={compareDay}
                                onSelectDate={setCompareDay}
                            />
                        </div>
                        <div className="bg-[#141414] border border-[#222] rounded-lg p-5 flex items-center justify-between">
                            <div className="text-center flex-1">
                                <p className="text-sm font-semibold text-[#60A5FA]">{compareEntries[0].name.split('@')[0]}</p>
                                <p className="font-mono text-xl font-bold">{compareEntries[0].average}</p>
                            </div>
                            <div className="text-[#444] text-sm font-medium px-4">vs</div>
                            <div className="text-center flex-1">
                                <p className="text-sm font-semibold text-[#A855F7]">{compareEntries[1].name.split('@')[0]}</p>
                                <p className="font-mono text-xl font-bold">{compareEntries[1].average}</p>
                            </div>
                        </div>
                        {compareDay ? (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <MetricComparisonGroup
                                        title="Readiness" scoreA={p1Readiness?.score} scoreB={p2Readiness?.score}
                                        userAName={compareProfileA?.firstName || compareProfileA?.email?.split('@')[0] || compareEntries[0].name}
                                        userBName={compareProfileB?.firstName || compareProfileB?.email?.split('@')[0] || compareEntries[1].name}
                                        defaultOpen={true}
                                        metrics={[
                                            { label: "Resting HR", valA: p1Readiness?.contributors.resting_heart_rate, valB: p2Readiness?.contributors.resting_heart_rate, displayA: p1Session?.lowest_heart_rate ? `${p1Session.lowest_heart_rate}` : undefined, displayB: p2Session?.lowest_heart_rate ? `${p2Session.lowest_heart_rate}` : undefined, unit: "bpm", inverse: true, max: 100 },
                                            { label: "HRV Balance", valA: p1Readiness?.contributors.hrv_balance, valB: p2Readiness?.contributors.hrv_balance, displayA: p1Session?.average_hrv ? `${p1Session.average_hrv}` : undefined, displayB: p2Session?.average_hrv ? `${p2Session.average_hrv}` : undefined, unit: "ms", max: 100 },
                                            { label: "Sleep Balance", valA: p1Readiness?.contributors.sleep_balance, valB: p2Readiness?.contributors.sleep_balance, max: 100 },
                                            { label: "Recovery Index", valA: p1Readiness?.contributors.recovery_index, valB: p2Readiness?.contributors.recovery_index, max: 100 },
                                        ]}
                                    />
                                    <MetricComparisonGroup
                                        title="Sleep" scoreA={p1Sleep?.score} scoreB={p2Sleep?.score}
                                        userAName={compareProfileA?.firstName || compareProfileA?.email?.split('@')[0] || compareEntries[0].name}
                                        userBName={compareProfileB?.firstName || compareProfileB?.email?.split('@')[0] || compareEntries[1].name}
                                        defaultOpen={true}
                                        metrics={[
                                            { label: "Total Sleep", valA: p1Sleep?.contributors.total_sleep, valB: p2Sleep?.contributors.total_sleep, displayA: p1Session?.total_sleep_duration ? formatDuration(p1Session.total_sleep_duration) : undefined, displayB: p2Session?.total_sleep_duration ? formatDuration(p2Session.total_sleep_duration) : undefined, max: 100 },
                                            { label: "Efficiency", valA: p1Sleep?.contributors.efficiency, valB: p2Sleep?.contributors.efficiency, displayA: p1Session?.efficiency ? `${p1Session.efficiency}` : undefined, displayB: p2Session?.efficiency ? `${p2Session.efficiency}` : undefined, unit: "%", max: 100 },
                                            { label: "Deep Sleep", valA: p1Sleep?.contributors.deep_sleep, valB: p2Sleep?.contributors.deep_sleep, displayA: p1Session?.deep_sleep_duration ? formatDuration(p1Session.deep_sleep_duration) : undefined, displayB: p2Session?.deep_sleep_duration ? formatDuration(p2Session.deep_sleep_duration) : undefined, max: 100 },
                                            { label: "REM Sleep", valA: p1Sleep?.contributors.rem_sleep, valB: p2Sleep?.contributors.rem_sleep, displayA: p1Session?.rem_sleep_duration ? formatDuration(p1Session.rem_sleep_duration) : undefined, displayB: p2Session?.rem_sleep_duration ? formatDuration(p2Session.rem_sleep_duration) : undefined, max: 100 },
                                        ]}
                                    />
                                </div>
                                {(p1Hr?.length || p2Hr?.length) ? (
                                    <div className="bg-[#141414] border border-[#222] rounded-lg p-4 h-64">
                                        <h4 className="text-xs text-[#666] uppercase tracking-wider mb-3">Heart Rate (48h)</h4>
                                        <ComparisonHeartRateChart userAData={p1Hr || []} userBData={p2Hr || []} userAName={compareEntries[0].name} userBName={compareEntries[1].name} />
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <div className="rounded-lg border border-[#222] bg-[#141414] p-4 text-sm text-[#8A8A8A]">
                                No overlapping compare day is available yet for these profiles.
                            </div>
                        )}
                    </div>
                )}
                {viewMode === 'compare' && profiles.length < 2 && (
                    <div className="pt-16 text-center">
                        <p className="text-[#666] mb-4">Add a second profile to compare metrics</p>
                        <button onClick={login} className="px-4 py-2 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm hover:opacity-90 transition-opacity">Add Profile</button>
                    </div>
                )}
                {viewMode === 'compare' && profiles.length >= 2 && compareEntries.length < 2 && (
                    <div className="pt-16 text-center">
                        <p className="text-[#666]">Waiting for enough synced data to compare profiles.</p>
                    </div>
                )}

                {/* ======== TRENDS VIEW ======== */}
                {viewMode === 'trends' && (
                    <div className="pt-6 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[#666]">Date Scope</p>
                                <p className="text-sm text-[#A0A0A0]">{formatRangeLabel(effectiveTrendsRange)}</p>
                            </div>
                            <DateRangePicker
                                mode="range"
                                dates={availableDays}
                                selectedDate={referenceDay}
                                onSelectDate={handleSelectReferenceDay}
                                range={effectiveTrendsRange || undefined}
                                onRangeChange={(nextRange) => setTrendsRange(nextRange)}
                            />
                        </div>
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
            <div className="flex flex-wrap gap-1.5">
                {([
                    { key: 'timeline', label: '24h Timeline' }, { key: 'correlation', label: 'Correlations' },
                    { key: 'whatif', label: 'What-If' },
                    { key: 'streaks', label: 'Streaks' }, { key: 'patterns', label: 'Patterns' },
                    { key: 'milestones', label: 'Milestones' }, { key: 'snapshot', label: 'Snapshot' },
                ] as const).map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#222] text-[#FAFAFA]' : 'text-[#666] hover:text-[#A0A0A0] hover:bg-[#1C1C1C]'}`}>{t.label}</button>
                ))}
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

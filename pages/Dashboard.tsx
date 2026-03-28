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
import { X, RefreshCw, Settings, Plus, Moon, Heart, Flame, Brain, Users } from 'lucide-react';
import { getProfileDisplayName } from '../utils/profileName';
import { getCompetitionInviteToken, isInviteLocation } from '../utils/inviteLink';
import {
    formatLocalISODate,
    formatISODateForDisplay,
    isISODateString,
    shiftLocalISODate,
} from '../utils/date';

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
    if (!value) return null;
    const rawPrefix = value.slice(0, 10);
    return isIsoDay(rawPrefix) ? rawPrefix : null;
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
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return (date.getHours() * 60) + date.getMinutes();
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
                    fetchDailyStats(token, { start: FULL_HISTORY_START_DATE }, {
                        grantedScopes: p.grantedScopes,
                        availabilityKey: p.id,
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
            staleTime: 1000 * 60 * 60 * 24,
            refetchOnWindowFocus: false,
            enabled: viewMode === 'trends' || viewMode === 'insights',
        }))
    });

    const activeUserQuery = userQueries.find((_, idx) => profiles[idx].id === activeProfile?.id);
    const activeData = activeUserQuery?.data as DailyStats | undefined;
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
    const todayIsoDay = useMemo(() => {
        const observedDays = new Set<string>();
        availableDays.forEach((day) => observedDays.add(day));
        spo2History.forEach((item) => item.day && observedDays.add(item.day));
        stressHistory.forEach((item) => item.day && observedDays.add(item.day));
        resilienceHistory.forEach((item) => item.day && observedDays.add(item.day));
        hrData.forEach((item) => {
            const day = toIsoDayFromTimestamp(item.timestamp);
            if (day) observedDays.add(day);
        });

        return Array.from(observedDays).sort((a, b) => b.localeCompare(a))[0] || formatLocalISODate();
    }, [availableDays, hrData, resilienceHistory, spo2History, stressHistory]);

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
        { label: 'Meet Daily Targets', value: currentActivity.contributors.meet_daily_targets, color: '#22c55e', key: 'meet_daily_targets' },
        { label: 'Move Every Hour', value: currentActivity.contributors.move_every_hour, color: '#7BC4A0', key: 'move_every_hour' },
        { label: 'Recovery Time', value: currentActivity.contributors.recovery_time, color: '#60a5fa', key: 'recovery_time' },
        { label: 'Stay Active', value: currentActivity.contributors.stay_active, color: '#D4A574', key: 'stay_active' },
        { label: 'Training Frequency', value: currentActivity.contributors.training_frequency, color: '#a855f7', key: 'training_frequency' },
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
        color?: string
    ) => {
        if (!activeProfile?.id) return;

        // Show modal immediately with currently available data
        const allTimeQueryKey = ['allTimeStats', activeProfile.id] as const;
        const cachedAllTime = queryClient.getQueryData(allTimeQueryKey) as DailyStats | undefined;
        const bestAvailable = cachedAllTime || activeData;
        const historyData = bestAvailable
            ? getMetricHistoryData(metricType, bestAvailable)
            : [];
        setMetricDetailModal({ isOpen: true, metricType, currentValue, historyData, unit, color, date: referenceDay });

        if (!cachedAllTime) {
            void queryClient.fetchQuery({
                queryKey: allTimeQueryKey,
                queryFn: () => runWithAutoTokenRefresh(activeProfile.id, (token) =>
                    fetchDailyStats(token, { start: FULL_HISTORY_START_DATE }, {
                        grantedScopes: activeProfile.grantedScopes,
                        availabilityKey: activeProfile.id,
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
    }, [activeProfile?.id, queryClient, referenceDay, todayIsoDay, viewMode]);

    useEffect(() => {
        if (!profiles.length) return;
        let timer: number | null = null;

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
                                {competitionInviteToken ? 'Competition invite' : inviteLanding ? 'Invite link' : 'Private leaderboard'}
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
                            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#7A756E] sm:text-base">
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
                                                        className={`mt-1 text-[11px] ${
                                                            profileHealthById.get(profile.id)?.level === 'error'
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
            <nav className="sticky top-0 z-40 bg-[#F2EDE8]/90 backdrop-blur-md border-b border-[rgba(0,0,0,0.06)]">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-semibold tracking-tight !text-[#9A9A9A]">{userName}</h1>
                        <span className="text-[#888] text-xs font-mono hidden sm:inline">{formatLastSync(lastSyncTime)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <PrimaryProfileSwitcher
                            className="hidden sm:block"
                            selectClassName="h-8 text-xs min-w-[9.5rem]"
                        />
                        <button
                            onClick={() => setIsInviteModalOpen(true)}
                            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.06)] px-3 text-xs font-medium text-[#6B9E8A] transition-colors hover:bg-[rgba(107,158,138,0.1)]"
                            title="Invite a friend"
                        >
                            <Users className="h-4 w-4" />
                            <span className="hidden md:inline">Invite</span>
                        </button>
                        <button onClick={handleSyncAllData} disabled={isSyncing} className="p-2 rounded-md hover:bg-[#FAF7F4] text-[#A8A29E] hover:text-[#2D2A26] transition-colors disabled:opacity-40" title="Refresh data">
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={login} className="p-2 rounded-md hover:bg-[#FAF7F4] text-[#A8A29E] hover:text-[#2D2A26] transition-colors" title="Add profile">
                            <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="p-2 rounded-md hover:bg-[#FAF7F4] text-[#A8A29E] hover:text-[#2D2A26] transition-colors" title="Settings">
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
                        { key: 'compete', label: 'Compete' },
                        { key: 'trends', label: 'Trends' },
                        { key: 'insights', label: 'Insights' },
                        { key: 'export', label: 'Export' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setViewMode(tab.key as any)}
                            className={`px-4 py-2.5 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${viewMode === tab.key ? 'border-[#6B9E8A] text-[#2D2A26]' : 'border-transparent text-[#C8C2BB] hover:text-[#7A756E]'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-4 pb-16">
                {profilesNeedingAttention.length > 0 && (
                    <div className="mt-6 p-4 bg-[#FAF7F4] border border-[rgba(0,0,0,0.10)] rounded-lg">
                        <p className="text-[#2D2A26] text-sm font-medium mb-2">Sync attention needed</p>
                        <div className="space-y-1">
                            {profilesNeedingAttention.map((profile) => {
                                const status = profileHealthById.get(profile.id);
                                const name = profile.firstName || (profile.email || 'User').split('@')[0];
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
                                    <p className="text-[#777] text-sm leading-relaxed">
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
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ── Scores ── */}
                        <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-14">
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
                                        <div className="relative w-[76px] h-[76px] sm:w-[88px] sm:h-[88px] mx-auto mb-3">
                                            <svg viewBox="0 0 76 76" className="w-full h-full transform -rotate-90">
                                                <circle cx="38" cy="38" r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
                                                <circle cx="38" cy="38" r={radius} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" className="transition-all duration-1000 ease-out" style={{ filter: `drop-shadow(0 0 4px ${color}22)` }} />
                                            </svg>
                                            <span className="absolute inset-0 flex items-center justify-center text-xl sm:text-2xl font-bold font-mono tabular-nums" style={{ color }}>
                                                {score ?? '—'}
                                            </span>
                                        </div>
                                        <span className="text-xs text-[#888] font-medium tracking-wide">{label}</span>
                                        {quality && <span className="text-[10px] text-[#C8C2BB] mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">{quality}</span>}
                                    </button>
                                );
                            })}
                        </div>

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
                                <MetricCard title="Deep Sleep" value={formatDuration(currentSession?.deep_sleep_duration)} color="#1E40AF" showDrillDownIndicator onClick={() => handleMetricCardClick('deep_sleep', currentSession?.deep_sleep_duration ?? null, 'hours', '#1E40AF')} />
                                <MetricCard title="REM Sleep" value={formatDuration(currentSession?.rem_sleep_duration)} color="#8B5CF6" showDrillDownIndicator onClick={() => handleMetricCardClick('rem_sleep', currentSession?.rem_sleep_duration ?? null, 'hours', '#8B5CF6')} />
                                <MetricCard title="Light Sleep" value={formatDuration(currentSession?.light_sleep_duration)} color="#93C5FD" showDrillDownIndicator onClick={() => handleMetricCardClick('light_sleep', currentSession?.light_sleep_duration ?? null, 'hours', '#93C5FD')} />
                            </div>
                            {/* Timing & details */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                <MetricCard title="Bedtime" value={formatTime(currentSession?.bedtime_start)} subtext="Fell asleep" showDrillDownIndicator onClick={() => handleMetricCardClick('bedtime', currentBedtimeMinutes, undefined, '#818CF8')} />
                                <MetricCard title="Wake Time" value={formatTime(currentSession?.bedtime_end)} subtext="Woke up" showDrillDownIndicator onClick={() => handleMetricCardClick('wake_time', currentWakeTimeMinutes, undefined, '#FACC15')} />
                                <MetricCard title="Latency" value={currentSession?.latency ? `${Math.round(currentSession.latency / 60)}` : null} unit="min" subtext="Time to fall asleep" showDrillDownIndicator onClick={() => handleMetricCardClick('latency', currentSession?.latency ?? null, 'min', '#7BC4A0')} />
                                <MetricCard title="Awake Time" value={formatDuration(currentSession?.awake_time)} subtext="During sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('awake_time', currentSession?.awake_time ?? null, 'hours', '#F97316')} />
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
                                <MetricCard title="SpO2" value={currentSpo2DisplayValue} unit="%" color="#06B6D4" showDrillDownIndicator onClick={() => handleMetricCardClick('spo2', currentSpo2?.spo2_percentage?.average ?? null, '%', '#06B6D4')} />
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
                                            <XAxis dataKey="day" tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => val.slice(5)} />
                                            <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} unit=" ms" />
                                            <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', fontSize: '12px', boxShadow: '4px 4px 8px rgba(0,0,0,0.06)' }} formatter={(value: number) => [`${value} ms`, 'HRV']} />
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
                                <MetricCard title="Total Calories" value={currentActivity?.total_calories?.toLocaleString()} unit="kcal" showDrillDownIndicator onClick={() => handleMetricCardClick('total_calories', currentActivity?.total_calories ?? null, 'kcal', '#F97316')} />
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
                                        {compareDay ? formatDayLabel(compareDay) : 'Choose a shared date'}
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
                                            className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                                                isSelected
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
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {compareSnapshots.map((snapshot, index) => (
                                        <article
                                            key={snapshot.id}
                                            className="rounded-[1.25rem] border bg-white p-4"
                                            style={{ borderColor: `${snapshot.color}40` }}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Rank #{index + 1}</p>
                                                    <h3 className="mt-2 truncate text-lg font-semibold text-[#2D2A26]">{snapshot.name}</h3>
                                                </div>
                                                <span
                                                    className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em]"
                                                    style={{ backgroundColor: `${snapshot.color}18`, color: snapshot.color }}
                                                >
                                                    {snapshot.availableScoreCount}/3 scores
                                                </span>
                                            </div>

                                            <div className="mt-5 flex items-end justify-between">
                                                <div>
                                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Daily average</p>
                                                    <p className="mt-1 font-mono text-3xl font-semibold text-[#2D2A26]">
                                                        {snapshot.compareAverage ?? '--'}
                                                    </p>
                                                </div>
                                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: snapshot.color }} />
                                            </div>

                                            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                                                <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#0E0E0E] px-3 py-2">
                                                    <p className="text-[#A8A29E]">Readiness</p>
                                                    <p className="mt-1 font-mono text-sm text-[#2D2A26]">{snapshot.readiness?.score ?? '--'}</p>
                                                </div>
                                                <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#0E0E0E] px-3 py-2">
                                                    <p className="text-[#A8A29E]">Sleep</p>
                                                    <p className="mt-1 font-mono text-sm text-[#2D2A26]">{snapshot.sleep?.score ?? '--'}</p>
                                                </div>
                                                <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#0E0E0E] px-3 py-2">
                                                    <p className="text-[#A8A29E]">Activity</p>
                                                    <p className="mt-1 font-mono text-sm text-[#2D2A26]">{snapshot.activity?.score ?? '--'}</p>
                                                </div>
                                            </div>

                                            <div className="mt-4 flex items-center justify-between text-[11px] text-[#7A756E]">
                                                <span>{formatDuration(snapshot.session?.total_sleep_duration)}</span>
                                                <span>{snapshot.activity?.steps?.toLocaleString() || '--'} steps</span>
                                            </div>
                                        </article>
                                    ))}
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
                    <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#222] text-[#2D2A26]' : 'text-[#A8A29E] hover:text-[#7A756E] hover:bg-[#FAF7F4]'}`}>{t.label}</button>
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

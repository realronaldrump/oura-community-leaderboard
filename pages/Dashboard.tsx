import React, { useState, useMemo } from 'react';
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
import { fetchDailyStats, FULL_HISTORY_START_DATE } from '../hooks/useOuraData';
import MetricComparisonGroup from '../components/MetricComparisonGroup';
import ComparisonHeartRateChart from '../components/charts/ComparisonHeartRateChart';
import AllTimeHistory from '../components/AllTimeHistory';
import SyncModal from '../components/SyncModal';
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
import { ChevronLeft, ChevronRight, X, RefreshCw, Settings, Plus, Moon, Heart, Flame, Brain, ArrowUpDown } from 'lucide-react';

const METERS_TO_MILES = 0.000621371;
const CELSIUS_DELTA_TO_FAHRENHEIT_DELTA = 9 / 5;

const Dashboard: React.FC = () => {
    const { activeProfile, profiles, setActiveProfileId, login, removeProfile, firebaseError, isLoadingProfiles, retryFirebaseConnection } = useUser();
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

    const queryClient = useQueryClient();

    // Auto-sync every hour
    const tokens = useMemo(() => profiles.map(p => p.token), [profiles]);
    const { lastSyncTime, refreshNow } = useAutoSync(tokens, !!activeProfile);

    // Manual sync
    const handleSyncAllData = async () => {
        if (!activeProfile) return;
        setIsSyncing(true);
        setShowSyncModal(true);
        try {
            const existingData = queryClient.getQueryData(['dailyStats', activeProfile.token]) as any;
            const syncedData = await smartSync(activeProfile.token, existingData, (progress) => {
                setSyncProgress(progress);
            });
            queryClient.setQueryData(['dailyStats', activeProfile.token], syncedData);
            queryClient.setQueryData(['allTimeStats', activeProfile.token], syncedData);
        } catch (err) {
            console.error('Sync failed:', err);
            setSyncProgress(prev => ({ ...prev, status: 'error', error: 'Something went wrong. Please try again.' }));
        } finally {
            setIsSyncing(false);
        }
    };

    // Data queries
    const userQueries = useQueries({
        queries: profiles.map(p => ({
            queryKey: ['dailyStats', p.token],
            queryFn: () => fetchDailyStats(p.token, { start: FULL_HISTORY_START_DATE }),
            staleTime: 1000 * 60 * 60,
        }))
    });

    // Canonical history source: dailyStats already contains complete history.
    const allTimeQueries = userQueries;

    const leaderboardData = useMemo(() => {
        return profiles.map((p, idx) => {
            const query = userQueries[idx];
            const data = query.data;
            if (!data) return null;
            const { sleep, readiness, activity, session } = data;
            const lastSleep = sleep[0];
            const lastReadiness = readiness[0];
            const lastActivity = activity[0];
            const lastSession = lastSleep ? session.find(s => s.day === lastSleep.day) : null;
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

    const activeUserQuery = userQueries.find((_, idx) => profiles[idx].id === activeProfile?.id);
    const activeData = activeUserQuery?.data as DailyStats | undefined;
    const hrData = activeData?.heartrate || [];

    const [dateIndex, setDateIndex] = useState(0);

    const sleepHistory = activeData?.sleep || [];
    const readinessHistory = activeData?.readiness || [];
    const activityHistory = activeData?.activity || [];
    const sessionHistory = activeData?.session || [];
    const spo2History = activeData?.spo2 || [];
    const stressHistory = activeData?.stress || [];
    const resilienceHistory = activeData?.resilience || [];

    const getPreviousDay = (day?: string): string | undefined => {
        if (!day) return undefined;
        const d = new Date(`${day}T00:00:00`);
        if (Number.isNaN(d.getTime())) return undefined;
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    };

    const findByDay = <T extends { day?: string }>(items: T[], day?: string): T | undefined => {
        if (!day) return undefined;
        return items.find(item => item.day === day);
    };

    const getSessionDisplayDay = (session: { day?: string; bedtime_end?: string }): string | undefined => {
        if (session.bedtime_end) return session.bedtime_end.split('T')[0];
        return session.day;
    };

    const findSessionForDay = (day?: string) => {
        if (!day) return undefined;
        const direct = sessionHistory
            .filter(s => getSessionDisplayDay(s) === day)
            .sort((a, b) => new Date(b.bedtime_end || 0).getTime() - new Date(a.bedtime_end || 0).getTime())[0];
        if (direct) return direct;

        // Fallback only for legacy payloads where session "day" is previous-night anchored.
        const prevDay = getPreviousDay(day);
        if (!prevDay) return undefined;
        return sessionHistory
            .filter(s => s.day === prevDay)
            .sort((a, b) => new Date(b.bedtime_end || 0).getTime() - new Date(a.bedtime_end || 0).getTime())[0];
    };

    const scoreAnchorDay =
        sleepHistory[dateIndex]?.day ||
        readinessHistory[dateIndex]?.day ||
        activityHistory[dateIndex]?.day;
    const referenceDay =
        scoreAnchorDay ||
        sleepHistory[0]?.day ||
        readinessHistory[0]?.day ||
        activityHistory[0]?.day;

    const currentSleep = findByDay(sleepHistory, referenceDay) || sleepHistory[dateIndex] || sleepHistory[0];
    const currentReadiness = findByDay(readinessHistory, referenceDay) || readinessHistory[dateIndex] || readinessHistory[0];
    const currentActivity = findByDay(activityHistory, referenceDay) || activityHistory[dateIndex] || activityHistory[0];
    const currentSession = findSessionForDay(referenceDay);
    const currentSpo2 = findByDay(spo2History, referenceDay);
    const currentStress = findByDay(stressHistory, referenceDay);
    const currentResilience = findByDay(resilienceHistory, referenceDay);
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
        const dataPoints: { date: string; value: number }[] = [];
        for (let i = 0; i < Math.min(days, sh?.length || 0); i++) {
            const session = sh?.[i]; const activity = ah?.[i]; const spo2 = sp?.[i]; const stress = st?.[i]; const resilience = rl?.[i];
            if (!session?.day) continue;
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
            if (value !== null && (!isHR || value > 0)) dataPoints.push({ date: session.day, value });
        }
        return dataPoints;
    };

    const handleMetricCardClick = async (
        metricType: 'hrv' | 'heart_rate' | 'lowest_hr' | 'spo2' | 'stress' | 'resilience' | 'steps' | 'calories' | 'sleep_duration' | 'deep_sleep' | 'rem_sleep' | 'efficiency',
        currentValue: number | null,
        unit?: string,
        color?: string
    ) => {
        if (!activeProfile?.token) return;
        const allTimeData = await fetchDailyStats(
            activeProfile.token,
            { start: FULL_HISTORY_START_DATE }
        );
        const historyData = getMetricHistoryData(metricType, allTimeData.session?.length || 0, allTimeData);
        setMetricDetailModal({ isOpen: true, metricType, currentValue, historyData, unit, color, date: currentSleep?.day });
    };

    // Versus data
    const p1Data = userQueries[0]?.data as DailyStats | undefined;
    const p2Data = userQueries[1]?.data as DailyStats | undefined;
    const p1Hr = p1Data?.heartrate || [];
    const p2Hr = p2Data?.heartrate || [];
    const p1Sleep = p1Data?.sleep[0]; const p1Readiness = p1Data?.readiness[0]; const p1Session = p1Data?.session[0];
    const p2Sleep = p2Data?.sleep[0]; const p2Readiness = p2Data?.readiness[0]; const p2Session = p2Data?.session[0];

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

    const getProfileDisplayName = (profile: { firstName?: string | null; lastName?: string | null; email?: string | null; }) => {
        return profile.firstName
            ? `${profile.firstName} ${profile.lastName || ''}`.trim()
            : (profile.email || 'User').split('@')[0];
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
                                            <span className="text-[#FAFAFA] font-medium text-sm">
                                                {getProfileDisplayName(p)}
                                            </span>
                                            <span className="text-[#444] text-xs font-mono">
                                                {p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
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
                    message={profilePendingRemoval ? `Remove ${profilePendingRemoval.name} from this device? You can reconnect this profile at any time.` : ''}
                    intent="destructive"
                    confirmText={isRemovingProfile ? 'Removing...' : 'Remove'}
                    cancelText="Keep Profile"
                    confirmDisabled={isRemovingProfile}
                    onConfirm={handleConfirmRemoveProfile}
                    onCancel={() => !isRemovingProfile && setProfilePendingRemoval(null)}
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
                    <button onClick={() => { if (activeProfile) removeProfile(activeProfile.id); }} className="text-[#666] hover:text-[#FAFAFA] text-sm transition-colors">
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
                    <div className="flex items-center gap-1">
                        <button onClick={handleSyncAllData} disabled={isSyncing} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors disabled:opacity-40" title="Refresh data">
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </button>
                        {profiles.length > 1 && (
                            <button onClick={() => setActiveProfileId('')} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors" title="Switch profile">
                                <ArrowUpDown className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={login} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors" title="Add profile">
                            <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="p-2 rounded-md hover:bg-[#1C1C1C] text-[#666] hover:text-[#FAFAFA] transition-colors" title="Settings">
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
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
                {/* ======== TODAY VIEW ======== */}
                {viewMode === 'today' && (
                    <div className="pt-8 animate-fade-in">
                        {/* ── Greeting & Date Navigation ── */}
                        <div className="mb-10">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1.5">
                                        {formatDayLabel(referenceDay)}
                                    </h2>
                                    <p className="text-[#777] text-sm leading-relaxed">
                                        {getDailyInsight()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0 mt-1">
                                    <button disabled={dateIndex >= sleepHistory.length - 1} onClick={() => setDateIndex(dateIndex + 1)} className="p-2.5 rounded-lg hover:bg-[#1C1C1C] disabled:opacity-20 transition-colors text-[#555]">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs text-[#555] font-mono min-w-[72px] text-center tabular-nums">{referenceDay || '--'}</span>
                                    <button disabled={dateIndex === 0} onClick={() => setDateIndex(dateIndex - 1)} className="p-2.5 rounded-lg hover:bg-[#1C1C1C] disabled:opacity-20 transition-colors text-[#555]">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
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
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={100}>
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
                {viewMode === 'compare' && profiles.length >= 2 && leaderboardData.length >= 2 && (
                    <div className="space-y-6 pt-6">
                        <div className="bg-[#141414] border border-[#222] rounded-lg p-5 flex items-center justify-between">
                            <div className="text-center flex-1">
                                <p className="text-sm font-semibold text-[#60A5FA]">{leaderboardData[0].name.split('@')[0]}</p>
                                <p className="font-mono text-xl font-bold">{leaderboardData[0].average}</p>
                            </div>
                            <div className="text-[#444] text-sm font-medium px-4">vs</div>
                            <div className="text-center flex-1">
                                <p className="text-sm font-semibold text-[#A855F7]">{leaderboardData[1].name.split('@')[0]}</p>
                                <p className="font-mono text-xl font-bold">{leaderboardData[1].average}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <MetricComparisonGroup
                                title="Readiness" scoreA={p1Readiness?.score} scoreB={p2Readiness?.score}
                                userAName={profiles[0]?.firstName || profiles[0]?.email?.split('@')[0]}
                                userBName={profiles[1]?.firstName || profiles[1]?.email?.split('@')[0]}
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
                                userAName={profiles[0]?.firstName || profiles[0]?.email?.split('@')[0]}
                                userBName={profiles[1]?.firstName || profiles[1]?.email?.split('@')[0]}
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
                                <ComparisonHeartRateChart userAData={p1Hr || []} userBData={p2Hr || []} userAName={leaderboardData[0].name} userBName={leaderboardData[1].name} />
                            </div>
                        ) : null}
                    </div>
                )}
                {viewMode === 'compare' && profiles.length < 2 && (
                    <div className="pt-16 text-center">
                        <p className="text-[#666] mb-4">Add a second profile to compare metrics</p>
                        <button onClick={login} className="px-4 py-2 bg-[#00C896] text-[#0C0C0C] font-medium rounded-md text-sm hover:opacity-90 transition-opacity">Add Profile</button>
                    </div>
                )}

                {/* ======== TRENDS VIEW ======== */}
                {viewMode === 'trends' && <div className="pt-6"><AllTimeHistory profiles={profiles} userQueries={allTimeQueries} /></div>}

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
    const [tab, setTab] = useState<'timeline' | 'correlation' | 'streaks' | 'patterns' | 'milestones' | 'snapshot'>('timeline');
    return (
        <div className="pt-6 space-y-6">
            <div className="flex flex-wrap gap-1.5">
                {([
                    { key: 'timeline', label: '24h Timeline' }, { key: 'correlation', label: 'Correlations' },
                    { key: 'streaks', label: 'Streaks' }, { key: 'patterns', label: 'Patterns' },
                    { key: 'milestones', label: 'Milestones' }, { key: 'snapshot', label: 'Snapshot' },
                ] as const).map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#222] text-[#FAFAFA]' : 'text-[#666] hover:text-[#A0A0A0] hover:bg-[#1C1C1C]'}`}>{t.label}</button>
                ))}
            </div>
            {tab === 'timeline' && <TimelineView profiles={profiles} usersData={userQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }))} />}
            {tab === 'correlation' && <CorrelationExplorer profiles={profiles} usersData={userQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }))} />}
            {tab === 'streaks' && <StreakTracker profiles={profiles} usersData={userQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }))} />}
            {tab === 'patterns' && <PatternDetector profiles={profiles} usersData={userQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }))} />}
            {tab === 'milestones' && <MilestoneTracker profiles={profiles} usersData={allTimeQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }))} />}
            {tab === 'snapshot' && <DailySnapshot profiles={profiles} usersData={userQueries.map((q: any) => ({ data: q.data as DailyStats | undefined }))} />}
        </div>
    );
};

export default Dashboard;

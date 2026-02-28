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
import DataExport from './DataExport';
import {
    LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchDailyStats, useHeartRate } from '../hooks/useOuraData';
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
            await smartSync(activeProfile.token, existingData, (progress) => {
                setSyncProgress(progress);
            });
            await queryClient.invalidateQueries({ queryKey: ['dailyStats'] });
            await queryClient.invalidateQueries({ queryKey: ['heartRate'] });
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
            queryFn: () => fetchDailyStats(p.token),
            staleTime: 1000 * 60 * 60,
        }))
    });

    const allTimeQueries = useQueries({
        queries: profiles.map(p => ({
            queryKey: ['allTimeStats', p.token],
            queryFn: () => fetchDailyStats(p.token, { start: '2016-01-01' }),
            staleTime: 1000 * 60 * 60 * 24,
            enabled: viewMode === 'trends',
        }))
    });

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
            const sScore = lastSleep?.score || 0;
            const rScore = lastReadiness?.score || 0;
            const aScore = lastActivity?.score || 0;
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

    const { data: hrData } = useHeartRate(activeProfile?.token || '', !!activeProfile);

    const activeUserQuery = userQueries.find((_, idx) => profiles[idx].id === activeProfile?.id);
    const activeData = activeUserQuery?.data as DailyStats | undefined;

    const [dateIndex, setDateIndex] = useState(0);

    const sleepHistory = activeData?.sleep || [];
    const readinessHistory = activeData?.readiness || [];
    const activityHistory = activeData?.activity || [];
    const sessionHistory = activeData?.session || [];
    const spo2History = activeData?.spo2 || [];
    const stressHistory = activeData?.stress || [];
    const resilienceHistory = activeData?.resilience || [];

    const currentSleep = sleepHistory[dateIndex] || sleepHistory[0];
    const currentReadiness = readinessHistory[dateIndex] || readinessHistory[0];
    const currentActivity = activityHistory[dateIndex] || activityHistory[0];
    const currentSession = currentSleep ? sessionHistory.find(s => s.day === currentSleep.day) : undefined;
    const currentSpo2 = spo2History.find(s => s.day === currentSleep?.day) || spo2History[dateIndex] || spo2History[0];
    const currentStress = stressHistory.find(s => s.day === currentSleep?.day) || stressHistory[dateIndex] || stressHistory[0];
    const currentResilience = resilienceHistory.find(r => r.day === currentSleep?.day) || resilienceHistory[dateIndex] || resilienceHistory[0];

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
        const allTimeData = await fetchDailyStats(activeProfile.token, { start: '2016-01-01' });
        const historyData = getMetricHistoryData(metricType, allTimeData.session?.length || 0, allTimeData);
        setMetricDetailModal({ isOpen: true, metricType, currentValue, historyData, unit, color, date: currentSleep?.day });
    };

    // Versus data
    const p1Data = userQueries[0]?.data as DailyStats | undefined;
    const p2Data = userQueries[1]?.data as DailyStats | undefined;
    const { data: p1Hr } = useHeartRate(profiles[0]?.token || '', viewMode === 'compare' && !!profiles[0]);
    const { data: p2Hr } = useHeartRate(profiles[1]?.token || '', viewMode === 'compare' && !!profiles[1]);
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

    // ============================================
    // LOGIN / PROFILE SELECTION
    // ============================================
    if (!activeProfile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-sm">
                    <div className="text-center mb-10">
                        <h1 className="text-3xl font-bold tracking-tight text-[#FAFAFA] mb-2">Health Dashboard</h1>
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
                            <p className="text-[#666] text-xs uppercase tracking-wider mb-3 px-1">Choose profile</p>
                            <div className="space-y-2">
                                {profiles.map(p => (
                                    <div key={p.id} className="flex gap-2">
                                        <button
                                            onClick={() => setActiveProfileId(p.id)}
                                            className="flex-1 bg-[#141414] border border-[#222] rounded-lg p-4 text-left hover:border-[#444] transition-colors flex items-center justify-between"
                                        >
                                            <span className="text-[#FAFAFA] font-medium text-sm">
                                                {p.firstName ? `${p.firstName} ${p.lastName || ''}`.trim() : (p.email || 'User').split('@')[0]}
                                            </span>
                                            <span className="text-[#444] text-xs font-mono">
                                                {p.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                            </span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); if (confirm('Remove this profile?')) removeProfile(p.id); }}
                                            className="px-3 bg-[#141414] border border-[#222] rounded-lg text-[#666] hover:text-[#F87171] hover:border-[#F87171]/30 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={login} className="w-full py-3.5 bg-[#00C896] text-[#0C0C0C] font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm">
                        {profiles.length > 0 ? 'Add Another Profile' : 'Connect Oura Ring'}
                    </button>
                </div>
            </div>
        );
    }

    // ============================================
    // LOADING STATE
    // ============================================
    if (!activeData && userQueries.some(q => q.isLoading)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#333] border-t-[#00C896] rounded-full animate-spin" />
                <p className="text-[#666] mt-4 text-sm">Loading your data...</p>
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
                <div className="max-w-5xl mx-auto px-4 flex gap-1 -mb-px overflow-x-auto">
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
                            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${viewMode === tab.key ? 'border-[#00C896] text-[#FAFAFA]' : 'border-transparent text-[#666] hover:text-[#A0A0A0]'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-4 pb-16">
                {/* ======== TODAY VIEW ======== */}
                {viewMode === 'today' && (
                    <div className="space-y-8 pt-6">
                        {/* Date nav */}
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">{formatDayLabel(currentSleep?.day)}</h2>
                            <div className="flex items-center gap-1">
                                <button disabled={dateIndex >= sleepHistory.length - 1} onClick={() => setDateIndex(dateIndex + 1)} className="p-2 rounded-md hover:bg-[#1C1C1C] disabled:opacity-20 transition-colors text-[#666]">
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs text-[#666] font-mono min-w-[80px] text-center">{currentSleep?.day || '--'}</span>
                                <button disabled={dateIndex === 0} onClick={() => setDateIndex(dateIndex - 1)} className="p-2 rounded-md hover:bg-[#1C1C1C] disabled:opacity-20 transition-colors text-[#666]">
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Oura Scores */}
                        <section>
                            <h3 className="section-label">Oura Scores</h3>
                            <div className="grid grid-cols-3 gap-3">
                                <button onClick={() => setScoreBreakdownModal({ isOpen: true, scoreType: 'readiness' })} className="score-card">
                                    <span className="text-xs text-[#666] uppercase tracking-wider">Readiness</span>
                                    <span className="text-2xl font-mono font-bold text-[#34D399] mt-1">{currentReadiness?.score ?? '--'}</span>
                                </button>
                                <button onClick={() => setScoreBreakdownModal({ isOpen: true, scoreType: 'sleep' })} className="score-card">
                                    <span className="text-xs text-[#666] uppercase tracking-wider">Sleep</span>
                                    <span className="text-2xl font-mono font-bold text-[#60A5FA] mt-1">{currentSleep?.score ?? '--'}</span>
                                </button>
                                <button onClick={() => setScoreBreakdownModal({ isOpen: true, scoreType: 'activity' })} className="score-card">
                                    <span className="text-xs text-[#666] uppercase tracking-wider">Activity</span>
                                    <span className="text-2xl font-mono font-bold text-[#FBBF24] mt-1">{currentActivity?.score ?? '--'}</span>
                                </button>
                            </div>
                        </section>

                        {/* Sleep */}
                        <section>
                            <h3 className="section-label flex items-center gap-2"><Moon className="w-3.5 h-3.5" /> Sleep</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <MetricCard title="Total Sleep" value={formatDuration(currentSession?.total_sleep_duration)} color="#60A5FA" showDrillDownIndicator onClick={() => handleMetricCardClick('sleep_duration', currentSession?.total_sleep_duration ?? null, 'hours', '#60A5FA')} />
                                <MetricCard title="Time in Bed" value={formatDuration(currentSession?.time_in_bed)} color="#60A5FA" />
                                <MetricCard title="Bedtime" value={formatTime(currentSession?.bedtime_start)} subtext="Fell asleep" />
                                <MetricCard title="Wake Time" value={formatTime(currentSession?.bedtime_end)} subtext="Woke up" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <MetricCard title="Deep Sleep" value={formatDuration(currentSession?.deep_sleep_duration)} color="#1E40AF" showDrillDownIndicator onClick={() => handleMetricCardClick('deep_sleep', currentSession?.deep_sleep_duration ?? null, 'hours', '#1E40AF')} />
                                <MetricCard title="REM Sleep" value={formatDuration(currentSession?.rem_sleep_duration)} color="#8B5CF6" showDrillDownIndicator onClick={() => handleMetricCardClick('rem_sleep', currentSession?.rem_sleep_duration ?? null, 'hours', '#8B5CF6')} />
                                <MetricCard title="Light Sleep" value={formatDuration(currentSession?.light_sleep_duration)} color="#93C5FD" />
                                <MetricCard title="Efficiency" value={currentSession?.efficiency} unit="%" color="#34D399" showDrillDownIndicator onClick={() => handleMetricCardClick('efficiency', currentSession?.efficiency ?? null, '%', '#34D399')} />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <MetricCard title="Sleep Latency" value={currentSession?.latency ? `${Math.round(currentSession.latency / 60)}` : null} unit="min" subtext="Time to fall asleep" />
                                <MetricCard title="Awake Time" value={formatDuration(currentSession?.awake_time)} subtext="During sleep period" />
                            </div>
                            {sessionHistory.length > 0 && (
                                <div className="bg-[#141414] border border-[#222] rounded-lg p-4" style={{ height: 260 }}>
                                    <h4 className="text-xs text-[#666] uppercase tracking-wider mb-3">Sleep Architecture (14 Days)</h4>
                                    <SleepStagesChart data={sessionHistory.slice(0, 14).reverse()} />
                                </div>
                            )}
                        </section>

                        {/* Heart & Body */}
                        <section>
                            <h3 className="section-label flex items-center gap-2"><Heart className="w-3.5 h-3.5" /> Heart & Body</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <MetricCard title="Lowest HR" value={currentSession?.lowest_heart_rate} unit="bpm" color="#F87171" subtext="During sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('lowest_hr', currentSession?.lowest_heart_rate ?? null, 'bpm', '#F87171')} />
                                <MetricCard title="Avg HR" value={currentSession?.average_heart_rate?.toFixed(0)} unit="bpm" color="#F87171" subtext="During sleep" showDrillDownIndicator onClick={() => handleMetricCardClick('heart_rate', currentSession?.average_heart_rate ?? null, 'bpm', '#F87171')} />
                                <MetricCard title="HRV" value={currentSession?.average_hrv} unit="ms" color="#A855F7" subtext="Heart rate variability" showDrillDownIndicator onClick={() => handleMetricCardClick('hrv', currentSession?.average_hrv ?? null, 'ms', '#A855F7')} />
                                <MetricCard title="SpO2" value={currentSpo2?.spo2_percentage?.average?.toFixed(1)} unit="%" color="#06B6D4" subtext="Oxygen saturation" showDrillDownIndicator onClick={() => handleMetricCardClick('spo2', currentSpo2?.spo2_percentage?.average ?? null, '%', '#06B6D4')} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <MetricCard title="Avg Breathing" value={currentSession?.average_breath?.toFixed(1)} unit="br/min" subtext="During sleep" />
                                <MetricCard
                                    title="Body Temp"
                                    value={currentReadiness?.temperature_deviation != null ? `${currentReadiness.temperature_deviation > 0 ? '+' : ''}${currentReadiness.temperature_deviation.toFixed(1)}` : null}
                                    unit="°C" subtext="From baseline"
                                    color={currentReadiness?.temperature_deviation != null ? (Math.abs(currentReadiness.temperature_deviation) > 0.5 ? '#F87171' : '#34D399') : undefined}
                                />
                                <MetricCard title="Stress" value={getStressLabel(currentStress?.day_summary)} color={getStressColor(currentStress?.day_summary)} />
                                <MetricCard title="Resilience" value={currentResilience?.level ? currentResilience.level.charAt(0).toUpperCase() + currentResilience.level.slice(1) : null} color={getResilienceColor(currentResilience?.level)} />
                            </div>

                            {hrData && hrData.length > 0 && (
                                <div className="bg-[#141414] border border-[#222] rounded-lg p-4 mb-4" style={{ height: 200 }}>
                                    <HeartRateChart data={hrData} showLabels />
                                </div>
                            )}
                            {sessionHistory.length > 0 && (
                                <div className="bg-[#141414] border border-[#222] rounded-lg p-4" style={{ height: 180 }}>
                                    <h4 className="text-xs text-[#666] uppercase tracking-wider mb-3">HRV Trend (30 Days)</h4>
                                    <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                                        <LineChart data={sessionHistory.slice(0, 30).reverse()}>
                                            <XAxis dataKey="day" tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => val.slice(5)} />
                                            <YAxis tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} unit=" ms" />
                                            <Tooltip contentStyle={{ backgroundColor: '#1C1C1C', border: '1px solid #333', borderRadius: '6px', fontSize: '12px' }} formatter={(value: number) => [`${value} ms`, 'HRV']} />
                                            <Line type="monotone" dataKey="average_hrv" stroke="#A855F7" dot={false} strokeWidth={1.5} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </section>

                        {/* Activity */}
                        <section>
                            <h3 className="section-label flex items-center gap-2"><Flame className="w-3.5 h-3.5" /> Activity</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <MetricCard title="Steps" value={currentActivity?.steps?.toLocaleString()} color="#FBBF24" showDrillDownIndicator onClick={() => handleMetricCardClick('steps', currentActivity?.steps ?? null, 'steps', '#FBBF24')} />
                                <MetricCard title="Active Calories" value={currentActivity?.active_calories?.toLocaleString()} unit="kcal" color="#FBBF24" showDrillDownIndicator onClick={() => handleMetricCardClick('calories', currentActivity?.active_calories ?? null, 'kcal', '#FBBF24')} />
                                <MetricCard title="Total Calories" value={currentActivity?.total_calories?.toLocaleString()} unit="kcal" />
                                <MetricCard title="Distance" value={((currentActivity?.equivalent_walking_distance || 0) / 1000).toFixed(1)} unit="km" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <MetricCard title="High Activity" value={formatDuration(currentActivity?.high_activity_time)} color="#EF4444" />
                                <MetricCard title="Medium Activity" value={formatDuration(currentActivity?.medium_activity_time)} color="#F59E0B" />
                                <MetricCard title="Low Activity" value={formatDuration(currentActivity?.low_activity_time)} color="#22C55E" />
                                <MetricCard title="Sedentary" value={formatDuration(currentActivity?.sedentary_time)} color="#64748B" />
                            </div>
                        </section>

                        {/* Score Contributors */}
                        <section>
                            <h3 className="section-label flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> Score Contributors</h3>
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

import React, { useEffect, useState, useMemo } from 'react';
import {
    DailyActivity, DailyReadiness, DailySleep, SleepSession, HeartRate,
    DailySpO2, DailyStress, DailyResilience, LeaderboardEntry, formatDuration, formatTime, DailyStats
} from '../types';
import { ouraService } from '../services/ouraService';
import { useUser } from '../contexts/UserContext';
import ScoreRing from '../components/ScoreRing';
import MetricCard from '../components/MetricCard';
import HistoryChart from '../components/HistoryChart';
import SleepStagesChart from '../components/charts/SleepStagesChart';
import HeartRateChart from '../components/charts/HeartRateChart';
import ContributorsBreakdown from '../components/ContributorsBreakdown';
import {
    LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip
} from 'recharts';
import { useQueries } from '@tanstack/react-query';
import { fetchDailyStats, useHeartRate } from '../hooks/useOuraData';
import ComparisonRow from '../components/ComparisonRow';
import MetricComparisonGroup from '../components/MetricComparisonGroup';
import ComparisonHeartRateChart from '../components/charts/ComparisonHeartRateChart';
import { generateBriefing } from '../services/aiService';
import ReactMarkdown from 'react-markdown';

const Dashboard: React.FC = () => {
    const { activeProfile, profiles, setActiveProfileId, login, removeProfile } = useUser();
    const [loading, setLoading] = useState(false);
    const [isVersusMode, setIsVersusMode] = useState(false);

    // AI Briefing State
    const [briefing, setBriefing] = useState<string | null>(null);
    const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);

    // Fetch basic stats for ALL profiles (Leaderboard & Versus)
    const userQueries = useQueries({
        queries: profiles.map(p => ({
            queryKey: ['dailyStats', p.token],
            queryFn: () => fetchDailyStats(p.token),
            staleTime: 1000 * 60 * 60, // 1 hour
        }))
    });

    const leaderboardData = useMemo(() => {
        return profiles.map((p, idx) => {
            const query = userQueries[idx];
            const data = query.data;

            if (!data) return null;

            const { sleep, readiness, activity, session } = data;
            // Data is full history arrays
            // Leaderboard uses the LATEST (index 0)

            const lastSleep = sleep[0];
            const lastReadiness = readiness[0];
            const lastActivity = activity[0];
            const lastSession = session[0];

            const sScore = lastSleep?.score || 0;
            const rScore = lastReadiness?.score || 0;
            const aScore = lastActivity?.score || 0;

            return {
                id: p.id,
                name: p.email || 'User',
                readiness: rScore,
                sleep: sScore,
                activity: aScore,
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

    // Active User deep data (Heart Rate, etc)
    const { data: hrData } = useHeartRate(activeProfile?.token || '', !!activeProfile);

    const activeUserQuery = userQueries.find((_, idx) => profiles[idx].id === activeProfile?.id);
    const activeData = activeUserQuery?.data as DailyStats | undefined;

    // Derived Data for Active View
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
    const currentSession = sessionHistory.find(s => s.day === currentSleep?.day) || sessionHistory[dateIndex] || sessionHistory[0];


    const handleGenerateBriefing = async () => {
        if (profiles.length < 2) return;
        setIsGeneratingBriefing(true);
        const p1 = profiles[0];
        const p2 = profiles[1];
        const d1 = userQueries[0].data as DailyStats | undefined;
        const d2 = userQueries[1].data as DailyStats | undefined;

        if (d1 && d2) {
            // Use latest data for briefing
            const summary = await generateBriefing(
                { sleep: d1.sleep[0], readiness: d1.readiness[0], activity: d1.activity[0] },
                { sleep: d2.sleep[0], readiness: d2.readiness[0], activity: d2.activity[0] },
                (p1.email || 'User A').split('@')[0],
                (p2.email || 'User B').split('@')[0]
            );
            setBriefing(summary);
        }
        setIsGeneratingBriefing(false);
    };

    // Additional Derived Data
    const currentSpo2 = spo2History.find(s => s.day === currentSleep?.day) || spo2History[dateIndex] || spo2History[0];
    const currentStress = stressHistory.find(s => s.day === currentSleep?.day) || stressHistory[dateIndex] || stressHistory[0];
    const currentResilience = resilienceHistory.find(r => r.day === currentSleep?.day) || resilienceHistory[dateIndex] || resilienceHistory[0];

    const readinessContributors = currentReadiness?.contributors ? [
        { label: 'Previous Night', value: currentReadiness.contributors.previous_night, color: '#3b82f6' },
        { label: 'Sleep Balance', value: currentReadiness.contributors.sleep_balance, color: '#3b82f6' },
        { label: 'HRV Balance', value: currentReadiness.contributors.hrv_balance, color: '#8b5cf6' },
        { label: 'Resting HR', value: currentReadiness.contributors.resting_heart_rate, color: '#ef4444' },
        { label: 'Recovery Index', value: currentReadiness.contributors.recovery_index, color: '#10b981' },
        { label: 'Body Temperature', value: currentReadiness.contributors.body_temperature, color: '#f97316' },
        { label: 'Activity Balance', value: currentReadiness.contributors.activity_balance, color: '#f59e0b' },
        { label: 'Previous Day Activity', value: currentReadiness.contributors.previous_day_activity, color: '#f59e0b' },
    ] : [];

    const sleepContributors = currentSleep?.contributors ? [
        { label: 'Total Sleep', value: currentSleep.contributors.total_sleep, color: '#3b82f6' },
        { label: 'Efficiency', value: currentSleep.contributors.efficiency, color: '#3b82f6' },
        { label: 'Restfulness', value: currentSleep.contributors.restfulness, color: '#8b5cf6' },
        { label: 'REM Sleep', value: currentSleep.contributors.rem_sleep, color: '#8b5cf6' },
        { label: 'Deep Sleep', value: currentSleep.contributors.deep_sleep, color: '#1e40af' },
        { label: 'Latency', value: currentSleep.contributors.latency, color: '#10b981' },
        { label: 'Timing', value: currentSleep.contributors.timing, color: '#10b981' },
    ] : [];

    const comparisonMetrics = useMemo(() => [
        { key: 'readiness', label: 'Readiness Score', formatter: (u: LeaderboardEntry) => u.readiness ?? '--', color: 'text-metric-readiness' },
        { key: 'sleep', label: 'Sleep Score', formatter: (u: LeaderboardEntry) => u.sleep ?? '--', color: 'text-metric-sleep' },
        { key: 'activity', label: 'Activity Score', formatter: (u: LeaderboardEntry) => u.activity ?? '--', color: 'text-metric-activity' },
        { key: 'steps', label: 'Steps', formatter: (u: LeaderboardEntry) => u.steps?.toLocaleString() ?? '--', color: '' },
        { key: 'activeCalories', label: 'Active Calories', formatter: (u: LeaderboardEntry) => u.activeCalories?.toLocaleString() ?? '--', color: '' },
        { key: 'sleepDuration', label: 'Sleep Duration', formatter: (u: LeaderboardEntry) => formatDuration(u.sleepDuration), color: '' },
        { key: 'restingHeartRate', label: 'Lowest HR (Sleep)', formatter: (u: LeaderboardEntry) => u.restingHeartRate ? `${u.restingHeartRate} bpm` : '--', color: '' },
        { key: 'averageHrv', label: 'Avg HRV (Sleep)', formatter: (u: LeaderboardEntry) => u.averageHrv ? `${u.averageHrv} ms` : '--', color: '' },
    ], [leaderboardData]);


    // Versus Data Preparation
    const p1Data = userQueries[0]?.data as DailyStats | undefined;
    const p2Data = userQueries[1]?.data as DailyStats | undefined;

    // Fetch HR for Versus Mode (only if versus mode is active and we have profiles)
    const { data: p1Hr } = useHeartRate(profiles[0]?.token || '', isVersusMode && !!profiles[0]);
    const { data: p2Hr } = useHeartRate(profiles[1]?.token || '', isVersusMode && !!profiles[1]);

    // We compare index 0 (latest)
    const p1Sleep = p1Data?.sleep[0];
    const p1Readiness = p1Data?.readiness[0];
    const p1Activity = p1Data?.activity[0];
    const p1Session = p1Data?.session[0];
    const p1Resilience = p1Data?.resilience[0];
    const p1Stress = p1Data?.stress[0];
    const p1Spo2 = p1Data?.spo2[0];

    const p2Sleep = p2Data?.sleep[0];
    const p2Readiness = p2Data?.readiness[0];
    const p2Activity = p2Data?.activity[0];
    const p2Session = p2Data?.session[0];
    const p2Resilience = p2Data?.resilience[0];
    const p2Stress = p2Data?.stress[0];
    const p2Spo2 = p2Data?.spo2[0];


    // Login screen
    if (!activeProfile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-dashboard-bg text-center">
                <h1 className="text-4xl font-bold text-text-primary mb-4">
                    Davis Watches You Sleep
                </h1>
                <p className="text-text-secondary mb-8 max-w-md">
                    Gimma yo Oura data fam
                </p>

                {profiles.length > 0 && (
                    <div className="w-full max-w-sm mb-8">
                        <p className="text-text-muted text-sm mb-3">Select a profile:</p>
                        <div className="space-y-2">
                            {profiles.map(p => (
                                <div key={p.id} className="flex gap-2">
                                    <button
                                        onClick={() => setActiveProfileId(p.id)}
                                        className="flex-1 card p-4 text-left hover:bg-dashboard-cardHover transition-colors flex items-center justify-between group"
                                    >
                                        <span className="text-text-primary">{p.email || 'User'}</span>
                                        <span className="text-xs text-text-muted group-hover:text-text-secondary transition-colors">
                                            {new Date(p.lastUpdated || '').toLocaleDateString()}
                                        </span>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Are you sure you want to delete this profile?')) {
                                                removeProfile(p.id);
                                            }
                                        }}
                                        className="px-4 bg-red-900/20 text-red-400 rounded-xl hover:bg-red-900/40 transition-colors border border-red-900/50"
                                        title="Remove Profile"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={login}
                    className="px-8 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                >
                    Connect Oura Ring
                </button>
            </div>
        );
    }

    // Loading state for initial load (when no data for active profile)
    if (!activeData && userQueries.some(q => q.isLoading)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-dashboard-bg">
                <div className="w-8 h-8 border-2 border-text-muted border-t-text-primary rounded-full animate-spin mb-4" />
                <p className="text-text-secondary">Loading your data...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dashboard-bg text-text-primary pb-20">
            {/* Top Nav */}
            <nav className="sticky top-0 z-50 bg-dashboard-bg/95 backdrop-blur-sm border-b border-dashboard-border px-4 md:px-6 py-3 flex justify-between items-center">
                <h1 className="text-lg font-semibold">Davis Watches You Sleep</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setActiveProfileId('')}
                        className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                    >
                        Switch Profile
                    </button>
                    <button
                        onClick={login}
                        className="text-sm px-3 py-1.5 bg-dashboard-card border border-dashboard-border rounded-lg hover:bg-dashboard-cardHover transition-colors"
                    >
                        + Add User
                    </button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">

                {/* Leaderboard / Versus Toggle */}
                {leaderboardData.length > 1 && (
                    <section className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <h2 className="section-header mb-0">Daily Standings</h2>
                        <button
                            onClick={() => setIsVersusMode(!isVersusMode)}
                            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${isVersusMode ? 'bg-blue-600 text-white' : 'bg-dashboard-card text-text-secondary hover:text-text-primary'}`}
                        >
                            {isVersusMode ? 'Exit Versus Mode' : 'Enter Versus Mode'}
                        </button>
                    </section>
                )}

                {/* Versus Mode UI */}
                {isVersusMode && leaderboardData.length >= 2 && (
                    <section className="space-y-6 animate-fadeIn">

                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row items-center justify-between card p-6 border-b-4 border-blue-900/50 gap-4">
                            <div className="flex items-center gap-8 w-full justify-center md:justify-start">
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-text-primary">{leaderboardData[0].name.split('@')[0]}</h3>
                                    <p className="text-accent-green font-mono text-lg">{leaderboardData[0].average} Avg</p>
                                </div>
                                <div className="text-3xl font-bold text-text-muted">VS</div>
                                <div className="text-center">
                                    <h3 className="text-xl font-bold text-text-primary">{leaderboardData[1].name.split('@')[0]}</h3>
                                    <p className="text-accent-purple font-mono text-lg">{leaderboardData[1].average} Avg</p>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateBriefing}
                                disabled={isGeneratingBriefing}
                                className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isGeneratingBriefing ? <span className="animate-pulse">Generating...</span> : 'Get AI Insights'}
                            </button>
                        </div>

                        {briefing && (
                            <div className="mb-6 card p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-lg">💡</span>
                                    <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">AI Insights</h4>
                                </div>
                                <div className="prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 prose-p:text-text-secondary prose-p:my-2 prose-p:leading-relaxed prose-strong:text-text-primary prose-ul:my-2 prose-li:text-text-secondary prose-li:my-1">
                                    <ReactMarkdown>{briefing}</ReactMarkdown>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Readiness Group */}
                            <MetricComparisonGroup
                                title="Readiness"
                                scoreA={p1Readiness?.score}
                                scoreB={p2Readiness?.score}
                                defaultOpen={true}
                                metrics={[
                                    { label: "Resting HR", valA: p1Readiness?.contributors.resting_heart_rate, valB: p2Readiness?.contributors.resting_heart_rate, max: 100 },
                                    { label: "HRV Balance", valA: p1Readiness?.contributors.hrv_balance, valB: p2Readiness?.contributors.hrv_balance, max: 100 },
                                    { label: "Sleep Balance", valA: p1Readiness?.contributors.sleep_balance, valB: p2Readiness?.contributors.sleep_balance, max: 100 },
                                    { label: "Recovery Index", valA: p1Readiness?.contributors.recovery_index, valB: p2Readiness?.contributors.recovery_index, max: 100 },
                                    { label: "Body Temp", valA: p1Readiness?.contributors.body_temperature, valB: p2Readiness?.contributors.body_temperature, max: 100 },
                                    { label: "Activity Balance", valA: p1Readiness?.contributors.activity_balance, valB: p2Readiness?.contributors.activity_balance, max: 100 },
                                    { label: "Previous Day", valA: p1Readiness?.contributors.previous_day_activity, valB: p2Readiness?.contributors.previous_day_activity, max: 100 },
                                ]}
                            />

                            {/* Sleep Group */}
                            <MetricComparisonGroup
                                title="Sleep"
                                scoreA={p1Sleep?.score}
                                scoreB={p2Sleep?.score}
                                defaultOpen={true}
                                metrics={[
                                    { label: "Total Sleep", valA: p1Sleep?.contributors.total_sleep, valB: p2Sleep?.contributors.total_sleep, max: 100 },
                                    { label: "Efficiency", valA: p1Sleep?.contributors.efficiency, valB: p2Sleep?.contributors.efficiency, max: 100 },
                                    { label: "Restfulness", valA: p1Sleep?.contributors.restfulness, valB: p2Sleep?.contributors.restfulness, max: 100 },
                                    { label: "REM Score", valA: p1Sleep?.contributors.rem_sleep, valB: p2Sleep?.contributors.rem_sleep, max: 100 },
                                    { label: "Deep Score", valA: p1Sleep?.contributors.deep_sleep, valB: p2Sleep?.contributors.deep_sleep, max: 100 },
                                    { label: "Latency Score", valA: p1Sleep?.contributors.latency, valB: p2Sleep?.contributors.latency, max: 100 },
                                    { label: "Timing", valA: p1Sleep?.contributors.timing, valB: p2Sleep?.contributors.timing, max: 100 },
                                ]}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Activity Group */}
                            <MetricComparisonGroup
                                title="Activity"
                                scoreA={p1Activity?.score}
                                scoreB={p2Activity?.score}
                                metrics={[
                                    { label: "Steps", valA: p1Activity?.steps, valB: p2Activity?.steps, max: Math.max(p1Activity?.steps || 0, p2Activity?.steps || 0) * 1.1 },
                                    { label: "Active Calories", valA: p1Activity?.active_calories, valB: p2Activity?.active_calories, unit: 'kcal' },
                                    { label: "Meet Daily Targets", valA: p1Activity?.contributors.meet_daily_targets, valB: p2Activity?.contributors.meet_daily_targets, max: 100 },
                                    { label: "Training Freq", valA: p1Activity?.contributors.training_frequency, valB: p2Activity?.contributors.training_frequency, max: 100 },
                                    { label: "Training Vol", valA: p1Activity?.contributors.training_volume, valB: p2Activity?.contributors.training_volume, max: 100 },
                                    { label: "Move Every Hour", valA: p1Activity?.contributors.move_every_hour, valB: p2Activity?.contributors.move_every_hour, max: 100 },
                                ]}
                            />

                            {/* Recovery & Stress (New Metrics!) */}
                            <MetricComparisonGroup
                                title="Resilience & Stress"
                                scoreA={undefined}
                                scoreB={undefined}
                                metrics={[
                                    { label: "Sleep Recovery", valA: p1Resilience?.contributors?.sleep_recovery, valB: p2Resilience?.contributors?.sleep_recovery, max: 100 },
                                    { label: "Daytime Recovery", valA: p1Resilience?.contributors?.daytime_recovery, valB: p2Resilience?.contributors?.daytime_recovery, max: 100 },
                                    { label: "Stress Resilience", valA: p1Resilience?.contributors?.stress, valB: p2Resilience?.contributors?.stress, max: 100 },
                                    { label: "Time Restored", valA: p1Stress?.recovery_high ? (p1Stress.recovery_high / 60 | 0) : 0, valB: p2Stress?.recovery_high ? (p2Stress.recovery_high / 60 | 0) : 0, unit: 'min', max: Math.max((p1Stress?.recovery_high || 0) / 60, (p2Stress?.recovery_high || 0) / 60) * 1.1 },
                                    { label: "High Stress", valA: p1Stress?.stress_high ? (p1Stress.stress_high / 60 | 0) : 0, valB: p2Stress?.stress_high ? (p2Stress.stress_high / 60 | 0) : 0, unit: 'min', inverse: true },
                                    { label: "Avg SpO2", valA: p1Spo2?.spo2_percentage?.average, valB: p2Spo2?.spo2_percentage?.average, unit: '%', max: 100 },
                                    { label: "Breathing Disturbance", valA: p1Spo2?.breathing_disturbance_index, valB: p2Spo2?.breathing_disturbance_index, inverse: true, max: 100 },
                                ]}
                            />
                        </div>

                        {/* Comparative Chart */}
                        <div className="card p-4 h-64 mt-6">
                            <h3 className="text-sm text-text-muted uppercase mb-4">Heart Rate Comparison (Last 48h)</h3>
                            <ComparisonHeartRateChart
                                userAData={p1Hr || []}
                                userBData={p2Hr || []}
                                userAName={leaderboardData[0].name}
                                userBName={leaderboardData[1].name}
                            />
                        </div>
                    </section>
                )}

                {/* Leaderboard (Hidden in Versus Mode?) - Optional, let's keep it but below */}
                {!isVersusMode && leaderboardData.length > 1 && (
                    <section>
                        <h2 className="section-header">Daily Standings</h2>
                        <div className="card overflow-hidden">
                            <div className="grid grid-cols-6 text-xs text-text-muted uppercase tracking-wider p-3 border-b border-dashboard-border font-medium">
                                <div className="col-span-2">User</div>
                                <div className="text-center">Readiness</div>
                                <div className="text-center">Sleep</div>
                                <div className="text-center">Activity</div>
                                <div className="text-center">Avg</div>
                            </div>
                            {leaderboardData.map((user, idx) => (
                                <div
                                    key={user.id}
                                    className={`grid grid-cols-6 p-3 items-center hover:bg-dashboard-cardHover transition-colors ${user.isCurrentUser ? 'bg-metric-readiness/5 border-l-2 border-metric-readiness' : ''
                                        }`}
                                >
                                    <div className="col-span-2 flex items-center gap-2">
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${idx === 0 ? 'bg-yellow-500 text-black' :
                                            idx === 1 ? 'bg-gray-400 text-black' :
                                                idx === 2 ? 'bg-orange-500 text-black' : 'bg-dashboard-border text-text-secondary'
                                            }`}>
                                            {idx + 1}
                                        </span>
                                        <span className={user.isCurrentUser ? 'font-medium' : 'text-text-secondary'}>
                                            {user.name.split('@')[0]}
                                        </span>
                                    </div>
                                    <div className="text-center font-mono text-metric-readiness">{user.readiness}</div>
                                    <div className="text-center font-mono text-metric-sleep">{user.sleep}</div>
                                    <div className="text-center font-mono text-metric-activity">{user.activity}</div>
                                    <div className="text-center font-mono font-semibold">{user.average}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {leaderboardData.length > 1 && !isVersusMode && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold">Compare Every Metric</h2>
                            <p className="text-sm text-text-secondary">Side-by-side snapshot of the latest data from each user.</p>
                        </div>
                        <div className="card overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="text-xs uppercase tracking-wider text-text-muted">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Metric</th>
                                        {leaderboardData.map(user => (
                                            <th key={user.id} className="px-3 py-2 text-center font-medium">
                                                <div className={`px-2 py-1 rounded-lg inline-flex ${user.isCurrentUser ? 'bg-metric-readiness/10 text-text-primary' : 'text-text-secondary'}`}>
                                                    {user.name.split('@')[0]}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparisonMetrics.map(metric => (
                                        <tr key={metric.key} className="border-t border-dashboard-border">
                                            <td className="px-3 py-2 text-text-secondary">{metric.label}</td>
                                            {leaderboardData.map(user => (
                                                <td key={`${metric.key}-${user.id}`} className={`px-3 py-2 text-center font-mono ${metric.color}`}>
                                                    {metric.formatter(user)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* Date Navigation */}
                {!isVersusMode && (
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold">Your Metrics</h2>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={dateIndex >= sleepHistory.length - 1}
                                onClick={() => setDateIndex(dateIndex + 1)}
                                className="p-2 rounded-lg hover:bg-dashboard-card disabled:opacity-30 transition-colors"
                            >
                                ←
                            </button>
                            <span className="px-3 py-1.5 bg-dashboard-card rounded-lg font-mono text-sm border border-dashboard-border">
                                {currentSleep?.day || 'Today'}
                            </span>
                            <button
                                disabled={dateIndex === 0}
                                onClick={() => setDateIndex(dateIndex - 1)}
                                className="p-2 rounded-lg hover:bg-dashboard-card disabled:opacity-30 transition-colors"
                            >
                                →
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Scores */}
                {!isVersusMode && (
                    <div className="grid grid-cols-3 gap-4 md:gap-6">
                        <div className="card p-4 md:p-6 flex flex-col items-center">
                            <ScoreRing
                                score={currentReadiness?.score}
                                label="Readiness"
                                color="#10b981"
                                size={100}
                            />
                            <div className="w-full mt-4 opacity-70 hover:opacity-100 transition-opacity">
                                <HistoryChart data={[...readinessHistory].reverse()} dataKey="score" color="#10b981" height={48} />
                            </div>
                        </div>

                        <div className="card p-4 md:p-6 flex flex-col items-center">
                            <ScoreRing
                                score={currentSleep?.score}
                                label="Sleep"
                                color="#3b82f6"
                                size={100}
                            />
                            <div className="w-full mt-4 opacity-70 hover:opacity-100 transition-opacity">
                                <HistoryChart data={[...sleepHistory].reverse()} dataKey="score" color="#3b82f6" height={48} />
                            </div>
                        </div>

                        <div className="card p-4 md:p-6 flex flex-col items-center">
                            <ScoreRing
                                score={currentActivity?.score}
                                label="Activity"
                                color="#f59e0b"
                                size={100}
                            />
                            <div className="w-full mt-4 opacity-70 hover:opacity-100 transition-opacity">
                                <HistoryChart data={[...activityHistory].reverse()} dataKey="score" color="#f59e0b" height={48} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Sleep Details */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">Sleep Details</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricCard
                                title="Total Sleep"
                                value={formatDuration(currentSession?.total_sleep_duration)}
                                color="#3b82f6"
                            />
                            <MetricCard
                                title="Time in Bed"
                                value={formatDuration(currentSession?.time_in_bed)}
                                color="#3b82f6"
                            />
                            <MetricCard
                                title="Bedtime"
                                value={formatTime(currentSession?.bedtime_start)}
                                subtext="Fell asleep"
                            />
                            <MetricCard
                                title="Wake Time"
                                value={formatTime(currentSession?.bedtime_end)}
                                subtext="Woke up"
                            />
                            <MetricCard
                                title="Deep Sleep"
                                value={formatDuration(currentSession?.deep_sleep_duration)}
                                color="#1e40af"
                            />
                            <MetricCard
                                title="REM Sleep"
                                value={formatDuration(currentSession?.rem_sleep_duration)}
                                color="#8b5cf6"
                            />
                            <MetricCard
                                title="Light Sleep"
                                value={formatDuration(currentSession?.light_sleep_duration)}
                                color="#60a5fa"
                            />
                            <MetricCard
                                title="Awake Time"
                                value={formatDuration(currentSession?.awake_time)}
                                color="#6b7280"
                            />
                            <MetricCard
                                title="Efficiency"
                                value={currentSession?.efficiency}
                                unit="%"
                                subtext="Sleep efficiency"
                            />
                            <MetricCard
                                title="Latency"
                                value={formatDuration(currentSession?.latency)}
                                subtext="Time to fall asleep"
                            />
                            <MetricCard
                                title="Restless Periods"
                                value={currentSession?.restless_periods}
                                subtext="Movement events"
                            />
                            <MetricCard
                                title="Avg Breath Rate"
                                value={currentSession?.average_breath?.toFixed(1)}
                                unit="br/min"
                            />
                        </div>
                    </section>
                )}

                {/* Sleep Stages Chart */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">Sleep Architecture (14 Days)</h3>
                        <div className="card p-4" style={{ height: 280 }}>
                            <SleepStagesChart data={sessionHistory.slice(0, 14).reverse()} />
                        </div>
                    </section>
                )}

                {/* Heart Rate & HRV - CORRECTED DATA */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">Heart Rate & HRV</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <MetricCard
                                title="Lowest HR (Sleep)"
                                value={currentSession?.lowest_heart_rate}
                                unit="bpm"
                                color="#ef4444"
                                subtext="During sleep"
                            />
                            <MetricCard
                                title="Avg HR (Sleep)"
                                value={currentSession?.average_heart_rate?.toFixed(0)}
                                unit="bpm"
                                color="#ef4444"
                                subtext="During sleep"
                            />
                            <MetricCard
                                title="HRV (Sleep)"
                                value={currentSession?.average_hrv}
                                unit="ms"
                                color="#8b5cf6"
                                subtext="Heart rate variability"
                            />
                            <MetricCard
                                title="SpO2 Average"
                                value={currentSpo2?.spo2_percentage?.average?.toFixed(1)}
                                unit="%"
                                color="#06b6d4"
                                subtext="Oxygen saturation"
                            />
                        </div>

                        {hrData && hrData.length > 0 && (
                            <div className="card p-4" style={{ height: 200 }}>
                                <HeartRateChart data={hrData} showLabels />
                            </div>
                        )}
                    </section>
                )}

                {/* HRV Trend */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">HRV Trend (30 Days)</h3>
                        <div className="card p-4" style={{ height: 180 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sessionHistory.slice(0, 30).reverse()}>
                                    <XAxis
                                        dataKey="day"
                                        tick={{ fill: '#737373', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(val) => val.slice(5)}
                                    />
                                    <YAxis
                                        tick={{ fill: '#737373', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        unit=" ms"
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1a1a',
                                            border: '1px solid #2a2a2a',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value: number) => [`${value} ms`, 'HRV']}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="average_hrv"
                                        stroke="#8b5cf6"
                                        dot={false}
                                        strokeWidth={2}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                )}

                {/* Body & Recovery */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">Body & Recovery</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricCard
                                title="Body Temp Deviation"
                                value={currentReadiness?.temperature_deviation?.toFixed(2)}
                                unit="°C"
                                color={
                                    Math.abs(currentReadiness?.temperature_deviation || 0) > 0.5
                                        ? '#ef4444'
                                        : '#10b981'
                                }
                                subtext={
                                    Math.abs(currentReadiness?.temperature_deviation || 0) > 0.5
                                        ? 'Elevated'
                                        : 'Normal range'
                                }
                            />
                            <MetricCard
                                title="Temp Trend"
                                value={currentReadiness?.temperature_trend_deviation?.toFixed(2)}
                                unit="°C"
                                subtext="Trend deviation"
                            />
                            {currentStress && (
                                <>
                                    <MetricCard
                                        title="High Stress Time"
                                        value={formatDuration(currentStress.stress_high)}
                                        color="#ec4899"
                                        subtext="Time in high stress"
                                    />
                                    <MetricCard
                                        title="Recovery Time"
                                        value={formatDuration(currentStress.recovery_high)}
                                        color="#10b981"
                                        subtext="Time in recovery"
                                    />
                                </>
                            )}
                            {currentResilience && (
                                <MetricCard
                                    title="Resilience"
                                    value={currentResilience.level || '--'}
                                    subtext="Current level"
                                />
                            )}
                            {currentSpo2?.breathing_disturbance_index != null && (
                                <MetricCard
                                    title="Breathing Index"
                                    value={currentSpo2.breathing_disturbance_index}
                                    subtext="Disturbance index"
                                />
                            )}
                        </div>
                    </section>
                )}

                {/* Activity Details */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">Activity Details</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricCard
                                title="Steps"
                                value={currentActivity?.steps?.toLocaleString()}
                                color="#f59e0b"
                            />
                            <MetricCard
                                title="Active Calories"
                                value={currentActivity?.active_calories?.toLocaleString()}
                                unit="kcal"
                                color="#f59e0b"
                            />
                            <MetricCard
                                title="Total Calories"
                                value={currentActivity?.total_calories?.toLocaleString()}
                                unit="kcal"
                                subtext="All calories burned"
                            />
                            <MetricCard
                                title="Walking Distance"
                                value={((currentActivity?.equivalent_walking_distance || 0) / 1000).toFixed(1)}
                                unit="km"
                                subtext="Equivalent"
                            />
                            <MetricCard
                                title="High Activity"
                                value={formatDuration(currentActivity?.high_activity_time)}
                                color="#dc2626"
                            />
                            <MetricCard
                                title="Medium Activity"
                                value={formatDuration(currentActivity?.medium_activity_time)}
                                color="#f59e0b"
                            />
                            <MetricCard
                                title="Low Activity"
                                value={formatDuration(currentActivity?.low_activity_time)}
                                color="#22c55e"
                            />
                            <MetricCard
                                title="Sedentary Time"
                                value={formatDuration(currentActivity?.sedentary_time)}
                                color="#6b7280"
                            />
                            <MetricCard
                                title="Resting Time"
                                value={formatDuration(currentActivity?.resting_time)}
                            />
                            <MetricCard
                                title="Non-Wear Time"
                                value={formatDuration(currentActivity?.non_wear_time)}
                                subtext="Ring not worn"
                            />
                            <MetricCard
                                title="Inactivity Alerts"
                                value={currentActivity?.inactivity_alerts}
                                subtext="Move reminders"
                            />
                            <MetricCard
                                title="To Target"
                                value={currentActivity?.meters_to_target}
                                unit="m"
                                subtext="Distance remaining"
                            />
                        </div>
                    </section>
                )}

                {/* MET Minutes Breakdown */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">MET Minutes Breakdown</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricCard
                                title="Average MET"
                                value={currentActivity?.average_met_minutes?.toFixed(1)}
                                subtext="Daily average"
                            />
                            <MetricCard
                                title="High Activity MET"
                                value={currentActivity?.high_activity_met_minutes}
                                color="#dc2626"
                            />
                            <MetricCard
                                title="Medium Activity MET"
                                value={currentActivity?.medium_activity_met_minutes}
                                color="#f59e0b"
                            />
                            <MetricCard
                                title="Low Activity MET"
                                value={currentActivity?.low_activity_met_minutes}
                                color="#22c55e"
                            />
                        </div>
                    </section>
                )}

                {/* Score Contributors */}
                {!isVersusMode && (
                    <section>
                        <h3 className="section-header">Score Contributors</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ContributorsBreakdown
                                title="Readiness Contributors"
                                contributors={readinessContributors}
                            />
                            <ContributorsBreakdown
                                title="Sleep Contributors"
                                contributors={sleepContributors}
                            />
                        </div>
                    </section>
                )}

                {/* SpO2 Trend */}
                {!isVersusMode && spo2History.length > 0 && (
                    <section>
                        <h3 className="section-header">SpO2 Trend (14 Days)</h3>
                        <div className="card p-4" style={{ height: 160 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={[...spo2History].reverse().slice(-14)}>
                                    <XAxis
                                        dataKey="day"
                                        tick={{ fill: '#737373', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(val) => val.slice(5)}
                                    />
                                    <YAxis
                                        domain={[90, 100]}
                                        tick={{ fill: '#737373', fontSize: 10 }}
                                        axisLine={false}
                                        tickLine={false}
                                        unit="%"
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1a1a',
                                            border: '1px solid #2a2a2a',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value: number) => [`${value?.toFixed(1)}%`, 'SpO2']}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="spo2_percentage.average"
                                        stroke="#06b6d4"
                                        dot={{ r: 2, fill: '#06b6d4' }}
                                        strokeWidth={2}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                )}

            </div>
        </div>
    );
};

export default Dashboard;

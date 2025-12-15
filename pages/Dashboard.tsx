import React, { useEffect, useState, useMemo, useRef } from 'react';
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
import HeroSection from '../components/HeroSection';
import ParallaxSection, { SectionDivider } from '../components/ParallaxSection';
import FloatingOrb from '../components/FloatingOrb';
import { Reveal } from '../hooks/useScrollReveal';
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

    // Get user name for display
    const userName = activeProfile?.email?.split('@')[0] || 'there';

    // ============================================
    // LOGIN SCREEN - Redesigned with new aesthetic
    // ============================================
    if (!activeProfile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
                {/* Background effects */}
                <div className="absolute inset-0 bg-gradient-mesh opacity-50" />

                {/* Floating orbs */}
                <FloatingOrb
                    size={200}
                    color="rgba(0, 212, 255, 0.1)"
                    glowColor="rgba(0, 212, 255, 0.2)"
                    style={{ top: '10%', left: '5%' }}
                    delay={0}
                />
                <FloatingOrb
                    size={150}
                    color="rgba(168, 85, 247, 0.1)"
                    glowColor="rgba(168, 85, 247, 0.2)"
                    style={{ top: '20%', right: '10%' }}
                    delay={2}
                />
                <FloatingOrb
                    size={100}
                    color="rgba(16, 185, 129, 0.1)"
                    glowColor="rgba(16, 185, 129, 0.2)"
                    style={{ bottom: '20%', left: '15%' }}
                    delay={4}
                />

                <div className="relative z-10 text-center max-w-md w-full">
                    {/* Logo/Title */}
                    <h1 className="text-5xl md:text-6xl font-bold mb-4 animate-fade-in-up">
                        <span className="gradient-text">Davis Watches</span>
                        <br />
                        <span className="text-text-primary">You Sleep</span>
                    </h1>

                    <p className="text-text-secondary text-lg mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        Connect your Oura Ring to compare health metrics with friends
                    </p>

                    {/* Existing profiles */}
                    {profiles.length > 0 && (
                        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                            <p className="text-text-muted text-sm mb-4 uppercase tracking-wider">Select a profile</p>
                            <div className="space-y-3">
                                {profiles.map(p => (
                                    <div key={p.id} className="flex gap-2">
                                        <button
                                            onClick={() => setActiveProfileId(p.id)}
                                            className="flex-1 glass-card p-4 text-left hover:border-accent-cyan/50 transition-all duration-300 flex items-center justify-between group"
                                        >
                                            <span className="text-text-primary font-medium group-hover:text-accent-cyan transition-colors">
                                                {(p.email || 'User').split('@')[0]}
                                            </span>
                                            <span className="text-xs text-text-dim group-hover:text-text-muted transition-colors">
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
                                            className="px-4 glass-card text-accent-rose hover:bg-accent-rose/10 hover:border-accent-rose/30 transition-all duration-300"
                                            title="Remove Profile"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Connect button */}
                    <button
                        onClick={login}
                        className="btn-primary w-full text-lg py-4 animate-fade-in-up"
                        style={{ animationDelay: '0.3s' }}
                    >
                        Connect Oura Ring
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
            <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-mesh opacity-30" />

                {/* Loading spinner */}
                <div className="relative">
                    <div className="w-16 h-16 border-2 border-accent-cyan/20 border-t-accent-cyan rounded-full animate-spin" />
                    <div className="absolute inset-0 w-16 h-16 border-2 border-accent-purple/20 border-b-accent-purple rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                </div>

                <p className="text-text-secondary mt-6 animate-pulse">Loading your data...</p>
            </div>
        );
    }

    // ============================================
    // MAIN DASHBOARD
    // ============================================
    return (
        <div className="min-h-screen text-text-primary relative">
            {/* Fixed Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-void/80 backdrop-blur-xl border-b border-dashboard-border px-4 md:px-8 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <h1 className="text-lg font-bold">
                        <span className="gradient-text">Davis Watches You Sleep</span>
                    </h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setActiveProfileId('')}
                            className="text-sm text-text-muted hover:text-text-primary transition-colors"
                        >
                            Switch Profile
                        </button>
                        <button
                            onClick={login}
                            className="btn-secondary text-sm px-4 py-2"
                        >
                            + Add User
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <HeroSection
                title="Your Health Today"
                subtitle={`Here's how you're doing, ${userName}. Track your readiness, sleep quality, and activity levels.`}
                userName={userName}
                scores={{
                    readiness: currentReadiness?.score,
                    sleep: currentSleep?.score,
                    activity: currentActivity?.score,
                }}
                onScrollDown={() => {
                    document.getElementById('daily-standings')?.scrollIntoView({ behavior: 'smooth' });
                }}
            />

            {/* Main Content Container */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-24">

                {/* ========== LEADERBOARD SECTION ========== */}
                {leaderboardData.length > 1 && (
                    <ParallaxSection
                        id="daily-standings"
                        title="Daily Standings"
                        subtitle="See how you compare against others."
                    >
                        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
                            <button
                                onClick={() => setIsVersusMode(!isVersusMode)}
                                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${isVersusMode
                                        ? 'bg-gradient-to-r from-accent-cyan to-accent-purple text-white shadow-glow-cyan'
                                        : 'btn-secondary'
                                    }`}
                            >
                                {isVersusMode ? 'Exit Versus Mode' : 'Enter Versus Mode'}
                            </button>
                        </div>

                        {/* Versus Mode UI */}
                        {isVersusMode && leaderboardData.length >= 2 && (
                            <div className="space-y-6 animate-fade-in">
                                {/* Header */}
                                <div className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                                    <div className="flex items-center gap-8">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-accent-cyan">{leaderboardData[0].name.split('@')[0]}</h3>
                                            <p className="font-mono text-2xl text-text-primary">{leaderboardData[0].average}</p>
                                        </div>
                                        <div className="text-3xl font-bold text-text-dim">VS</div>
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold text-accent-purple">{leaderboardData[1].name.split('@')[0]}</h3>
                                            <p className="font-mono text-2xl text-text-primary">{leaderboardData[1].average}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleGenerateBriefing}
                                        disabled={isGeneratingBriefing}
                                        className="btn-primary px-6 py-3 disabled:opacity-50"
                                    >
                                        {isGeneratingBriefing ? <span className="animate-pulse">Generating...</span> : 'Get AI Insights'}
                                    </button>
                                </div>

                                {/* AI Briefing */}
                                {briefing && (
                                    <Reveal>
                                        <div className="glass-card p-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="text-lg">💡</span>
                                                <h4 className="text-sm font-semibold text-text-muted uppercase tracking-wider">AI Insights</h4>
                                            </div>
                                            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-text-primary prose-p:text-text-secondary prose-strong:text-accent-cyan">
                                                <ReactMarkdown>{briefing}</ReactMarkdown>
                                            </div>
                                        </div>
                                    </Reveal>
                                )}

                                {/* Comparison Groups */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                        ]}
                                    />
                                    <MetricComparisonGroup
                                        title="Sleep"
                                        scoreA={p1Sleep?.score}
                                        scoreB={p2Sleep?.score}
                                        defaultOpen={true}
                                        metrics={[
                                            { label: "Total Sleep", valA: p1Sleep?.contributors.total_sleep, valB: p2Sleep?.contributors.total_sleep, max: 100 },
                                            { label: "Efficiency", valA: p1Sleep?.contributors.efficiency, valB: p2Sleep?.contributors.efficiency, max: 100 },
                                            { label: "Deep Score", valA: p1Sleep?.contributors.deep_sleep, valB: p2Sleep?.contributors.deep_sleep, max: 100 },
                                            { label: "REM Score", valA: p1Sleep?.contributors.rem_sleep, valB: p2Sleep?.contributors.rem_sleep, max: 100 },
                                        ]}
                                    />
                                </div>

                                {/* Heart Rate Comparison */}
                                <div className="glass-card p-6 h-72">
                                    <h3 className="text-sm text-text-muted uppercase tracking-wider mb-4">Heart Rate Comparison (Last 48h)</h3>
                                    <ComparisonHeartRateChart
                                        userAData={p1Hr || []}
                                        userBData={p2Hr || []}
                                        userAName={leaderboardData[0].name}
                                        userBName={leaderboardData[1].name}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Standard Leaderboard */}
                        {!isVersusMode && (
                            <Reveal>
                                <div className="glass-card overflow-hidden">
                                    <div className="grid grid-cols-6 text-xs text-text-muted uppercase tracking-wider p-4 border-b border-dashboard-border font-medium">
                                        <div className="col-span-2">User</div>
                                        <div className="text-center">Readiness</div>
                                        <div className="text-center">Sleep</div>
                                        <div className="text-center">Activity</div>
                                        <div className="text-center">Avg</div>
                                    </div>
                                    {leaderboardData.map((user, idx) => (
                                        <div
                                            key={user.id}
                                            className={`grid grid-cols-6 p-4 items-center hover:bg-white/5 transition-colors ${user.isCurrentUser ? 'bg-accent-cyan/5 border-l-2 border-accent-cyan' : ''
                                                }`}
                                        >
                                            <div className="col-span-2 flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-500 text-black' :
                                                        idx === 1 ? 'bg-gray-400 text-black' :
                                                            idx === 2 ? 'bg-orange-600 text-black' : 'bg-dashboard-border text-text-muted'
                                                    }`}>
                                                    {idx + 1}
                                                </span>
                                                <span className={user.isCurrentUser ? 'font-semibold text-accent-cyan' : 'text-text-secondary'}>
                                                    {user.name.split('@')[0]}
                                                </span>
                                            </div>
                                            <div className="text-center font-mono text-metric-readiness">{user.readiness}</div>
                                            <div className="text-center font-mono text-metric-sleep">{user.sleep}</div>
                                            <div className="text-center font-mono text-metric-activity">{user.activity}</div>
                                            <div className="text-center font-mono font-bold text-text-primary">{user.average}</div>
                                        </div>
                                    ))}
                                </div>
                            </Reveal>
                        )}
                    </ParallaxSection>
                )}

                <SectionDivider />

                {/* ========== DATE NAVIGATION ========== */}
                {!isVersusMode && (
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl md:text-3xl font-bold">Your Metrics</h2>
                        <div className="flex items-center gap-2">
                            <button
                                disabled={dateIndex >= sleepHistory.length - 1}
                                onClick={() => setDateIndex(dateIndex + 1)}
                                className="p-3 rounded-xl hover:bg-white/5 disabled:opacity-30 transition-all"
                            >
                                ←
                            </button>
                            <span className="px-4 py-2 glass-card font-mono text-sm">
                                {currentSleep?.day || 'Today'}
                            </span>
                            <button
                                disabled={dateIndex === 0}
                                onClick={() => setDateIndex(dateIndex - 1)}
                                className="p-3 rounded-xl hover:bg-white/5 disabled:opacity-30 transition-all"
                            >
                                →
                            </button>
                        </div>
                    </div>
                )}

                {/* ========== MAIN SCORES ========== */}
                {!isVersusMode && (
                    <ParallaxSection parallaxSpeed={0.05}>
                        <div className="grid grid-cols-3 gap-4 md:gap-8">
                            <Reveal delay={0}>
                                <div className="glass-card p-6 md:p-8 flex flex-col items-center">
                                    <ScoreRing
                                        score={currentReadiness?.score}
                                        label="Readiness"
                                        color="#10B981"
                                        size={120}
                                    />
                                    <div className="w-full mt-6 opacity-70 hover:opacity-100 transition-opacity">
                                        <HistoryChart data={[...readinessHistory].reverse()} dataKey="score" color="#10B981" height={48} />
                                    </div>
                                </div>
                            </Reveal>

                            <Reveal delay={100}>
                                <div className="glass-card p-6 md:p-8 flex flex-col items-center">
                                    <ScoreRing
                                        score={currentSleep?.score}
                                        label="Sleep"
                                        color="#3B82F6"
                                        size={120}
                                    />
                                    <div className="w-full mt-6 opacity-70 hover:opacity-100 transition-opacity">
                                        <HistoryChart data={[...sleepHistory].reverse()} dataKey="score" color="#3B82F6" height={48} />
                                    </div>
                                </div>
                            </Reveal>

                            <Reveal delay={200}>
                                <div className="glass-card p-6 md:p-8 flex flex-col items-center">
                                    <ScoreRing
                                        score={currentActivity?.score}
                                        label="Activity"
                                        color="#F59E0B"
                                        size={120}
                                    />
                                    <div className="w-full mt-6 opacity-70 hover:opacity-100 transition-opacity">
                                        <HistoryChart data={[...activityHistory].reverse()} dataKey="score" color="#F59E0B" height={48} />
                                    </div>
                                </div>
                            </Reveal>
                        </div>
                    </ParallaxSection>
                )}

                <SectionDivider />

                {/* ========== SLEEP DETAILS ========== */}
                {!isVersusMode && (
                    <ParallaxSection
                        title="Sleep Details"
                        subtitle="Deep dive into your sleep architecture and quality."
                        parallaxSpeed={0.03}
                    >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                            <MetricCard title="Total Sleep" value={formatDuration(currentSession?.total_sleep_duration)} color="#3B82F6" />
                            <MetricCard title="Time in Bed" value={formatDuration(currentSession?.time_in_bed)} color="#3B82F6" />
                            <MetricCard title="Bedtime" value={formatTime(currentSession?.bedtime_start)} subtext="Fell asleep" />
                            <MetricCard title="Wake Time" value={formatTime(currentSession?.bedtime_end)} subtext="Woke up" />
                            <MetricCard title="Deep Sleep" value={formatDuration(currentSession?.deep_sleep_duration)} color="#1E40AF" />
                            <MetricCard title="REM Sleep" value={formatDuration(currentSession?.rem_sleep_duration)} color="#8B5CF6" />
                            <MetricCard title="Light Sleep" value={formatDuration(currentSession?.light_sleep_duration)} color="#60A5FA" />
                            <MetricCard title="Efficiency" value={currentSession?.efficiency} unit="%" color="#10B981" />
                        </div>

                        {/* Sleep Stages Chart */}
                        <Reveal>
                            <div className="glass-card p-6" style={{ height: 300 }}>
                                <h3 className="text-sm text-text-muted uppercase tracking-wider mb-4">Sleep Architecture (14 Days)</h3>
                                <SleepStagesChart data={sessionHistory.slice(0, 14).reverse()} />
                            </div>
                        </Reveal>
                    </ParallaxSection>
                )}

                <SectionDivider />

                {/* ========== HEART RATE & HRV ========== */}
                {!isVersusMode && (
                    <ParallaxSection
                        title="Heart Rate & HRV"
                        subtitle="Track your cardiovascular health and recovery."
                        parallaxSpeed={0.03}
                    >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                            <MetricCard title="Lowest HR" value={currentSession?.lowest_heart_rate} unit="bpm" color="#EF4444" subtext="During sleep" />
                            <MetricCard title="Avg HR" value={currentSession?.average_heart_rate?.toFixed(0)} unit="bpm" color="#EF4444" subtext="During sleep" />
                            <MetricCard title="HRV" value={currentSession?.average_hrv} unit="ms" color="#A855F7" subtext="Heart rate variability" />
                            <MetricCard title="SpO2" value={currentSpo2?.spo2_percentage?.average?.toFixed(1)} unit="%" color="#06B6D4" subtext="Oxygen saturation" />
                        </div>

                        {hrData && hrData.length > 0 && (
                            <Reveal>
                                <div className="glass-card p-6" style={{ height: 220 }}>
                                    <HeartRateChart data={hrData} showLabels />
                                </div>
                            </Reveal>
                        )}

                        {/* HRV Trend */}
                        <Reveal delay={100}>
                            <div className="glass-card p-6 mt-4" style={{ height: 200 }}>
                                <h3 className="text-sm text-text-muted uppercase tracking-wider mb-4">HRV Trend (30 Days)</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={sessionHistory.slice(0, 30).reverse()}>
                                        <XAxis
                                            dataKey="day"
                                            tick={{ fill: '#64748B', fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => val.slice(5)}
                                        />
                                        <YAxis
                                            tick={{ fill: '#64748B', fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            unit=" ms"
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(22, 22, 35, 0.9)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '12px',
                                                backdropFilter: 'blur(10px)',
                                            }}
                                            formatter={(value: number) => [`${value} ms`, 'HRV']}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="average_hrv"
                                            stroke="#A855F7"
                                            dot={false}
                                            strokeWidth={2}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Reveal>
                    </ParallaxSection>
                )}

                <SectionDivider />

                {/* ========== ACTIVITY DETAILS ========== */}
                {!isVersusMode && (
                    <ParallaxSection
                        title="Activity Details"
                        subtitle="Your movement and energy expenditure."
                        parallaxSpeed={0.03}
                    >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricCard title="Steps" value={currentActivity?.steps?.toLocaleString()} color="#F59E0B" />
                            <MetricCard title="Active Calories" value={currentActivity?.active_calories?.toLocaleString()} unit="kcal" color="#F59E0B" />
                            <MetricCard title="Total Calories" value={currentActivity?.total_calories?.toLocaleString()} unit="kcal" subtext="All calories burned" />
                            <MetricCard title="Walking Distance" value={((currentActivity?.equivalent_walking_distance || 0) / 1000).toFixed(1)} unit="km" />
                            <MetricCard title="High Activity" value={formatDuration(currentActivity?.high_activity_time)} color="#DC2626" />
                            <MetricCard title="Medium Activity" value={formatDuration(currentActivity?.medium_activity_time)} color="#F59E0B" />
                            <MetricCard title="Low Activity" value={formatDuration(currentActivity?.low_activity_time)} color="#22C55E" />
                            <MetricCard title="Sedentary Time" value={formatDuration(currentActivity?.sedentary_time)} color="#64748B" />
                        </div>
                    </ParallaxSection>
                )}

                <SectionDivider />

                {/* ========== SCORE CONTRIBUTORS ========== */}
                {!isVersusMode && (
                    <ParallaxSection
                        title="Score Contributors"
                        subtitle="What's impacting your scores today."
                        parallaxSpeed={0.02}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Reveal>
                                <ContributorsBreakdown
                                    title="Readiness Contributors"
                                    contributors={readinessContributors}
                                />
                            </Reveal>
                            <Reveal delay={100}>
                                <ContributorsBreakdown
                                    title="Sleep Contributors"
                                    contributors={sleepContributors}
                                />
                            </Reveal>
                        </div>
                    </ParallaxSection>
                )}

            </div>
        </div>
    );
};

export default Dashboard;

import React, { useEffect, useState, useMemo } from 'react';
import {
    DailyActivity, DailyReadiness, DailySleep, SleepSession, HeartRate,
    DailySpO2, DailyStress, DailyResilience, LeaderboardEntry, formatDuration, formatTime
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

const Dashboard: React.FC = () => {
    const { activeProfile, profiles, setActiveProfileId, login } = useUser();
    const [loading, setLoading] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);

    // Active User Data State
    const [sleep, setSleep] = useState<DailySleep[]>([]);
    const [readiness, setReadiness] = useState<DailyReadiness[]>([]);
    const [activity, setActivity] = useState<DailyActivity[]>([]);
    const [sessions, setSessions] = useState<SleepSession[]>([]);
    const [heartRate, setHeartRate] = useState<HeartRate[]>([]);
    const [spo2, setSpo2] = useState<DailySpO2[]>([]);
    const [stress, setStress] = useState<DailyStress[]>([]);
    const [resilience, setResilience] = useState<DailyResilience[]>([]);

    const [dateIndex, setDateIndex] = useState(0);

    // Fetch Leaderboard for ALL Profiles
    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (profiles.length === 0) return;
            const entries: LeaderboardEntry[] = [];

            for (const p of profiles) {
                try {
                    const [s, r, a] = await Promise.all([
                        ouraService.getDailySleep(p.token),
                        ouraService.getDailyReadiness(p.token),
                        ouraService.getDailyActivity(p.token)
                    ]);

                    const sortFn = (x: any, y: any) => new Date(y.day).getTime() - new Date(x.day).getTime();
                    const lastS = s.sort(sortFn)[0];
                    const lastR = r.sort(sortFn)[0];
                    const lastA = a.sort(sortFn)[0];

                    if (lastS && lastR && lastA) {
                        const sScore = lastS.score || 0;
                        const rScore = lastR.score || 0;
                        const aScore = lastA.score || 0;
                        entries.push({
                            id: p.id,
                            name: p.email || 'User',
                            readiness: rScore,
                            sleep: sScore,
                            activity: aScore,
                            average: Math.round((sScore + rScore + aScore) / 3),
                            isCurrentUser: p.id === activeProfile?.id
                        });
                    }
                } catch (e) {
                    console.error(`Failed to fetch stats for ${p.id}`, e);
                }
            }
            setLeaderboardData(entries.sort((a, b) => b.average - a.average));
        };
        fetchLeaderboard();
    }, [profiles, activeProfile?.id]);

    // Fetch Deep Data for ACTIVE Profile
    useEffect(() => {
        const fetchData = async () => {
            if (!activeProfile) return;
            setLoading(true);
            try {
                const [s, r, a, sess, hr, sp, str, res] = await Promise.all([
                    ouraService.getDailySleep(activeProfile.token),
                    ouraService.getDailyReadiness(activeProfile.token),
                    ouraService.getDailyActivity(activeProfile.token),
                    ouraService.getSleepSessions(activeProfile.token),
                    ouraService.getHeartRate(activeProfile.token),
                    ouraService.getDailySpO2(activeProfile.token),
                    ouraService.getDailyStress(activeProfile.token),
                    ouraService.getDailyResilience(activeProfile.token),
                ]);

                const sortFn = (a: any, b: any) =>
                    new Date(b.day || b.timestamp).getTime() - new Date(a.day || a.timestamp).getTime();

                setSleep(s.sort(sortFn));
                setReadiness(r.sort(sortFn));
                setActivity(a.sort(sortFn));
                setSessions(sess.sort(sortFn));
                setHeartRate(hr);
                setSpo2(sp.sort(sortFn));
                setStress(str.sort(sortFn));
                setResilience(res.sort(sortFn));
            } catch (e) {
                console.error("Failed to fetch dashboard data", e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeProfile]);

    // Login screen
    if (!activeProfile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-dashboard-bg text-center">
                <h1 className="text-4xl font-bold text-text-primary mb-4">
                    Davis Watches You Sleep
                </h1>
                <p className="text-text-secondary mb-8 max-w-md">
                    View comprehensive health metrics from your Oura Ring.
                </p>

                {profiles.length > 0 && (
                    <div className="w-full max-w-sm mb-8">
                        <p className="text-text-muted text-sm mb-3">Select a profile:</p>
                        <div className="space-y-2">
                            {profiles.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setActiveProfileId(p.id)}
                                    className="w-full card p-4 text-left hover:bg-dashboard-cardHover transition-colors"
                                >
                                    <span className="text-text-primary">{p.email || 'User'}</span>
                                </button>
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

    // Loading state
    if (loading && sleep.length === 0) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-dashboard-bg">
                <div className="w-8 h-8 border-2 border-text-muted border-t-text-primary rounded-full animate-spin mb-4" />
                <p className="text-text-secondary">Loading your data...</p>
            </div>
        );
    }

    // Derived Data
    const currentSleep = sleep[dateIndex] || sleep[0];
    const currentReadiness = readiness[dateIndex] || readiness[0];
    const currentActivity = activity[dateIndex] || activity[0];
    const currentSession = sessions.find(s => s.day === currentSleep?.day) || sessions[0];
    const currentSpo2 = spo2.find(s => s.day === currentSleep?.day);
    const currentStress = stress.find(s => s.day === currentSleep?.day);
    const currentResilience = resilience.find(r => r.day === currentSleep?.day);

    // Readiness contributors for breakdown
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

    // Sleep contributors
    const sleepContributors = currentSleep?.contributors ? [
        { label: 'Total Sleep', value: currentSleep.contributors.total_sleep, color: '#3b82f6' },
        { label: 'Efficiency', value: currentSleep.contributors.efficiency, color: '#3b82f6' },
        { label: 'Restfulness', value: currentSleep.contributors.restfulness, color: '#8b5cf6' },
        { label: 'REM Sleep', value: currentSleep.contributors.rem_sleep, color: '#8b5cf6' },
        { label: 'Deep Sleep', value: currentSleep.contributors.deep_sleep, color: '#1e40af' },
        { label: 'Latency', value: currentSleep.contributors.latency, color: '#10b981' },
        { label: 'Timing', value: currentSleep.contributors.timing, color: '#10b981' },
    ] : [];

    return (
        <div className="min-h-screen bg-dashboard-bg text-text-primary pb-20">
            {/* Top Nav */}
            <nav className="sticky top-0 z-50 bg-dashboard-bg/95 backdrop-blur-sm border-b border-dashboard-border px-4 md:px-6 py-3 flex justify-between items-center">
                <h1 className="text-lg font-semibold">Oura Dashboard</h1>
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

                {/* Leaderboard */}
                {leaderboardData.length > 1 && (
                    <section>
                        <h2 className="section-header">Daily Standings</h2>
                        <div className="card overflow-hidden">
                            <div className="grid grid-cols-5 text-xs text-text-muted uppercase tracking-wider p-3 border-b border-dashboard-border font-medium">
                                <div className="col-span-2">User</div>
                                <div className="text-center">Readiness</div>
                                <div className="text-center">Sleep</div>
                                <div className="text-center">Avg</div>
                            </div>
                            {leaderboardData.map((user, idx) => (
                                <div
                                    key={user.id}
                                    className={`grid grid-cols-5 p-3 items-center hover:bg-dashboard-cardHover transition-colors ${user.isCurrentUser ? 'bg-metric-readiness/5 border-l-2 border-metric-readiness' : ''
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
                                    <div className="text-center font-mono font-semibold">{user.average}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Date Navigation */}
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Your Metrics</h2>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={dateIndex >= sleep.length - 1}
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

                {/* Main Scores */}
                <div className="grid grid-cols-3 gap-4 md:gap-6">
                    <div className="card p-4 md:p-6 flex flex-col items-center">
                        <ScoreRing
                            score={currentReadiness?.score}
                            label="Readiness"
                            color="#10b981"
                            size={100}
                        />
                        <div className="w-full mt-4 opacity-70 hover:opacity-100 transition-opacity">
                            <HistoryChart data={[...readiness].reverse()} dataKey="score" color="#10b981" height={48} />
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
                            <HistoryChart data={[...sleep].reverse()} dataKey="score" color="#3b82f6" height={48} />
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
                            <HistoryChart data={[...activity].reverse()} dataKey="score" color="#f59e0b" height={48} />
                        </div>
                    </div>
                </div>

                {/* Sleep Details */}
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

                {/* Sleep Stages Chart */}
                <section>
                    <h3 className="section-header">Sleep Architecture (14 Days)</h3>
                    <div className="card p-4" style={{ height: 280 }}>
                        <SleepStagesChart data={sessions.slice(0, 14).reverse()} />
                    </div>
                </section>

                {/* Heart Rate & HRV - CORRECTED DATA */}
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

                    {heartRate.length > 0 && (
                        <div className="card p-4" style={{ height: 200 }}>
                            <HeartRateChart data={heartRate} showLabels />
                        </div>
                    )}
                </section>

                {/* HRV Trend */}
                <section>
                    <h3 className="section-header">HRV Trend (30 Days)</h3>
                    <div className="card p-4" style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={sessions.slice(0, 30).reverse()}>
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

                {/* Body & Recovery */}
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

                {/* Activity Details */}
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

                {/* MET Minutes Breakdown */}
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

                {/* Score Contributors */}
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

                {/* SpO2 Trend */}
                {spo2.length > 0 && (
                    <section>
                        <h3 className="section-header">SpO2 Trend (14 Days)</h3>
                        <div className="card p-4" style={{ height: 160 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={[...spo2].reverse().slice(-14)}>
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

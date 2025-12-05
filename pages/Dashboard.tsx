import React, { useEffect, useState, useMemo } from 'react';
import {
    DailyActivity, DailyReadiness, DailySleep, SleepSession, HeartRate, DailySpO2, Workout, LeaderboardEntry
} from '../types';
import { ouraService } from '../services/ouraService';
import { useUser } from '../contexts/UserContext';
import ScoreRing from '../components/ScoreRing';
import MetricCard from '../components/MetricCard';
import HistoryChart from '../components/HistoryChart';
import SleepStagesChart from '../components/charts/SleepStagesChart';
import {
    LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, Legend
} from 'recharts';

const Dashboard: React.FC = () => {
    const { activeProfile, profiles, setActiveProfileId, addProfile, login, authStatus } = useUser();
    const [loading, setLoading] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);

    // Active User Data State
    const [sleep, setSleep] = useState<DailySleep[]>([]);
    const [readiness, setReadiness] = useState<DailyReadiness[]>([]);
    const [activity, setActivity] = useState<DailyActivity[]>([]);
    const [sessions, setSessions] = useState<SleepSession[]>([]);
    const [heartRate, setHeartRate] = useState<HeartRate[]>([]);
    const [spo2, setSpo2] = useState<DailySpO2[]>([]);
    // const [workouts, setWorkouts] = useState<Workout[]>([]); // Optional if API empty

    const [dateIndex, setDateIndex] = useState(0); // 0 = latest

    // Fetch Leaderboard for ALL Profiles
    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (profiles.length === 0) return;
            const entries: LeaderboardEntry[] = [];

            for (const p of profiles) {
                try {
                    // Fetch just the latest daily summary for leaderboard
                    const [s, r, a] = await Promise.all([
                        ouraService.getDailySleep(p.token),
                        ouraService.getDailyReadiness(p.token),
                        ouraService.getDailyActivity(p.token)
                    ]);

                    // Get latest
                    // Simple sort by day desc
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
                            name: p.email || 'User', // Fallback name
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
    }, [profiles, activeProfile?.id]); // Re-run if profiles change

    // Fetch Deep Data for ACTIVE Profile
    useEffect(() => {
        const fetchData = async () => {
            if (!activeProfile) return;
            setLoading(true);
            try {
                const [s, r, a, sess, hr, sp] = await Promise.all([
                    ouraService.getDailySleep(activeProfile.token),
                    ouraService.getDailyReadiness(activeProfile.token),
                    ouraService.getDailyActivity(activeProfile.token),
                    ouraService.getSleepSessions(activeProfile.token),
                    ouraService.getHeartRate(activeProfile.token),
                    ouraService.getDailySpO2(activeProfile.token),
                ]);

                const sortFn = (a: any, b: any) => new Date(b.day || b.timestamp).getTime() - new Date(a.day || a.timestamp).getTime();

                setSleep(s.sort(sortFn));
                setReadiness(r.sort(sortFn));
                setActivity(a.sort(sortFn));
                setSessions(sess.sort(sortFn));
                setHeartRate(hr); // keep raw for graphing
                setSpo2(sp.sort(sortFn));
            } catch (e) {
                console.error("Failed to fetch dashboard data", e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeProfile]);

    // Render Helpers
    if (!activeProfile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-black text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20 pointer-events-none" />
                <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-oura-purple to-pink-500 mb-6 z-10">
                    Oura Leaderboard
                </h1>
                <p className="text-gray-400 mb-12 max-w-lg z-10 text-lg">
                    Compare your stats with friends and dive deep into your own data. <br />
                    Log in with Oura to get started.
                </p>

                {profiles.length > 0 ? (
                    <div className="grid gap-4 w-full max-w-md z-10">
                        <h3 className="text-white text-xl font-semibold mb-2">Select Profile</h3>
                        {profiles.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setActiveProfileId(p.id)}
                                className="bg-gray-900/80 backdrop-blur border border-gray-700 p-4 rounded-xl text-white hover:border-oura-purple transition-all flex justify-between items-center group"
                            >
                                <span>{p.email || 'User'}</span>
                                <span className="text-oura-purple opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                            </button>
                        ))}
                        <div className="border-t border-gray-800 my-4" />
                    </div>
                ) : null}

                <button
                    onClick={login}
                    className="bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)] z-10"
                >
                    Connect Oura Ring
                </button>
            </div>
        );
    }

    if (loading && sleep.length === 0) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-oura-purple mb-4"></div>
            <div className="animate-pulse">Syncing complete health data...</div>
        </div>
    );

    // Derived Data
    const currentSleep = sleep[dateIndex] || sleep[0] || {};
    const currentReadiness = readiness[dateIndex] || readiness[0] || {};
    const currentActivity = activity[dateIndex] || activity[0] || {};
    const currentSpo2 = spo2.find(s => s.day === currentSleep.day);
    const currentHr = heartRate.slice(0, 100); // simplify for now

    return (
        <div className="min-h-screen bg-black text-gray-100 pb-20 overflow-x-hidden selection:bg-purple-500/30">

            {/* Top Nav */}
            <nav className="sticky top-0 z-50 backdrop-blur-md bg-black/50 border-b border-white/10 px-6 py-4 flex justify-between items-center">
                <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                    Oura Leaderboard
                </div>
                <div className="flex items-center gap-4">
                    {/* Profile Dropdown logic could go here, for now just a Logout/Switch button */}
                    <button onClick={() => setActiveProfileId('')} className="text-sm text-gray-400 hover:text-white transition-colors">
                        Switch Profile
                    </button>
                    <button onClick={login} className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded-full transition-colors border border-gray-700">
                        + Add Friend
                    </button>
                </div>
            </nav>

            <div className="container mx-auto px-4 md:px-6 py-8 space-y-12">

                {/* LEADERBOARD SECTION */}
                <section>
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                        <span className="bg-yellow-500/10 text-yellow-500 p-2 rounded-lg text-lg">🏆</span> Daily Standings
                    </h2>
                    <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-white/5 overflow-hidden">
                        <div className="grid grid-cols-5 text-xs text-gray-400 uppercase tracking-wider p-4 border-b border-white/5 font-medium">
                            <div className="col-span-2">Athlete</div>
                            <div className="text-center">Readiness</div>
                            <div className="text-center">Sleep</div>
                            <div className="text-center text-white font-bold">Avg Score</div>
                        </div>
                        {leaderboardData.map((user, idx) => (
                            <div key={user.id} className={`grid grid-cols-5 p-4 items-center hover:bg-white/5 transition-colors ${user.isCurrentUser ? 'bg-oura-purple/10 border-l-2 border-oura-purple' : ''}`}>
                                <div className="col-span-2 flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-black ${idx === 0 ? 'bg-yellow-400' : idx === 1 ? 'bg-gray-300' : idx === 2 ? 'bg-orange-400' : 'bg-gray-700 text-white'}`}>
                                        {idx + 1}
                                    </div>
                                    <span className={user.isCurrentUser ? 'font-bold text-white' : 'text-gray-300'}>
                                        {user.name.split('@')[0]}
                                    </span>
                                </div>
                                <div className="text-center font-mono text-teal-400">{user.readiness}</div>
                                <div className="text-center font-mono text-purple-400">{user.sleep}</div>
                                <div className="text-center font-mono text-xl font-bold text-white">{user.average}</div>
                            </div>
                        ))}
                        {leaderboardData.length === 0 && (
                            <div className="p-8 text-center text-gray-500">No data available for leaderboard.</div>
                        )}
                    </div>
                </section>

                {/* PERSONAL DASHBOARD */}
                <section className="animate-fade-in relative">
                    <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-4">
                        <div>
                            <h2 className="text-4xl font-bold text-white mb-1">Your Metrics</h2>
                            <p className="text-gray-400 text-sm">Deep dive into your biometrics</p>
                        </div>
                        <div className="flex gap-2">
                            {/* Date Controls */}
                            <button
                                disabled={dateIndex >= sleep.length - 1}
                                onClick={() => setDateIndex(dateIndex + 1)}
                                className="p-2 hover:bg-gray-800 rounded-lg disabled:opacity-30 text-white"
                            >←</button>
                            <div className="bg-gray-800 px-4 py-2 rounded-lg text-white font-mono border border-gray-700">
                                {currentSleep.day || 'Today'}
                            </div>
                            <button
                                disabled={dateIndex === 0}
                                onClick={() => setDateIndex(dateIndex - 1)}
                                className="p-2 hover:bg-gray-800 rounded-lg disabled:opacity-30 text-white"
                            >→</button>
                        </div>
                    </div>

                    {/* Big 3 Rings */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                        <div className="bg-gradient-to-br from-gray-900 to-black p-1 rounded-3xl shadow-2xl relative group">
                            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-teal-500/50 to-transparent opacity-50" />
                            <div className="bg-gray-900/90 rounded-[22px] p-6 h-full flex flex-col items-center">
                                <h3 className="text-teal-400 font-medium mb-4 tracking-wide uppercase text-xs">Readiness</h3>
                                <ScoreRing score={currentReadiness.score} label="Ready" color="#2DD4BF" size={140} />
                                <div className="w-full mt-6 h-16 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <HistoryChart data={[...readiness].reverse()} dataKey="score" color="#2DD4BF" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-900 to-black p-1 rounded-3xl shadow-2xl relative group">
                            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent opacity-50" />
                            <div className="bg-gray-900/90 rounded-[22px] p-6 h-full flex flex-col items-center">
                                <h3 className="text-purple-400 font-medium mb-4 tracking-wide uppercase text-xs">Sleep</h3>
                                <ScoreRing score={currentSleep.score} label="Sleep" color="#A855F7" size={140} />
                                <div className="w-full mt-6 h-16 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <HistoryChart data={[...sleep].reverse()} dataKey="score" color="#A855F7" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-900 to-black p-1 rounded-3xl shadow-2xl relative group">
                            <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50" />
                            <div className="bg-gray-900/90 rounded-[22px] p-6 h-full flex flex-col items-center">
                                <h3 className="text-blue-400 font-medium mb-4 tracking-wide uppercase text-xs">Activity</h3>
                                <ScoreRing score={currentActivity.score} label="Activity" color="#3B82F6" size={140} />
                                <div className="w-full mt-6 h-16 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <HistoryChart data={[...activity].reverse()} dataKey="score" color="#3B82F6" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Metrics Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                        {/* Main Graph Area */}
                        <div className="lg:col-span-3 space-y-6">
                            {/* Sleep Architecture */}
                            <div className="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-3xl p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-white font-semibold">Sleep Architecture Trend</h3>
                                    <span className="text-xs text-gray-500">Last 14 Days</span>
                                </div>
                                <div className="h-64">
                                    <SleepStagesChart data={sessions.slice(0, 14).reverse()} />
                                </div>
                            </div>

                            {/* Heart Rate & SpO2 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-3xl p-6">
                                    <h3 className="text-white font-semibold mb-4">SpO2 Levels</h3>
                                    <div className="flex items-end gap-2 mb-4">
                                        <span className="text-4xl font-bold text-blue-400">{currentSpo2?.spo2_percentage?.average || '--'}%</span>
                                        <span className="text-sm text-gray-500 mb-2">avg overnight</span>
                                    </div>
                                    <div className="h-32">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={[...spo2].reverse().slice(-14)}>
                                                <Line type="monotone" dataKey="spo2_percentage.average" stroke="#60A5FA" dot={{ r: 2 }} strokeWidth={2} />
                                                <XAxis dataKey="day" hide />
                                                <YAxis domain={[90, 100]} hide />
                                                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="bg-gray-900/60 backdrop-blur border border-gray-800 rounded-3xl p-6">
                                    <h3 className="text-white font-semibold mb-4">HRV Balance</h3>
                                    <div className="flex items-end gap-2 mb-4">
                                        <span className="text-4xl font-bold text-pink-400">{currentReadiness.contributors?.hrv_balance || '--'}</span>
                                        <span className="text-sm text-gray-500 mb-2">ms</span>
                                    </div>
                                    <div className="h-32">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={[...readiness].reverse().slice(-30)}>
                                                <Line type="monotone" dataKey="contributors.hrv_balance" stroke="#F472B6" dot={false} strokeWidth={2} />
                                                <YAxis hide />
                                                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column Stats */}
                        <div className="space-y-4">
                            <MetricCard title="Resting HR" value={currentReadiness.contributors?.resting_heart_rate} unit="bpm" subtext="Lowest" colorClass="text-red-400" />
                            <MetricCard title="Steps" value={currentActivity.steps?.toLocaleString()} subtext="Daily Total" colorClass="text-green-400" />
                            <MetricCard title="Calories" value={currentActivity.total_calories?.toLocaleString()} unit="kcal" subtext="Total Burn" colorClass="text-orange-400" />
                            <MetricCard title="Body Temp" value={currentReadiness.temperature_deviation} unit="°C" subtext="Deviation" colorClass={currentReadiness.temperature_deviation > 0.5 ? 'text-red-400' : 'text-white'} />

                            <div className="bg-gradient-to-b from-gray-800/50 to-black border border-gray-800 rounded-3xl p-6 mt-6">
                                <h4 className="text-gray-400 text-xs uppercase mb-4 font-bold tracking-wider">Workout Context</h4>
                                {/* Placeholder for workout list if we had it, or just generic advice */}
                                <p className="text-sm text-gray-300 italic">
                                    {currentReadiness.score && currentReadiness.score > 85 ? "You are well recovered. Push hard today!" : "Prioritize recovery today."}
                                </p>
                            </div>
                        </div>
                    </div>

                </section>
            </div>
        </div>
    );
};

export default Dashboard;

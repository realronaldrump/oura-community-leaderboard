
import React, { useEffect, useState } from 'react';
import {
  DailyActivity, DailyReadiness, DailySleep, SleepSession, HeartRate, DailySpO2, Workout
} from '../types';
import { ouraService } from '../services/ouraService';
import { useUser } from '../contexts/UserContext';
import ScoreRing from '../components/ScoreRing';
import MetricCard from '../components/MetricCard';
import HistoryChart from '../components/HistoryChart';
import SleepStagesChart from '../components/charts/SleepStagesChart';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

const Dashboard: React.FC = () => {
  const { activeProfile, profiles, setActiveProfileId } = useUser();
  const [loading, setLoading] = useState(false);

  // Data State
  const [sleep, setSleep] = useState<DailySleep[]>([]);
  const [readiness, setReadiness] = useState<DailyReadiness[]>([]);
  const [activity, setActivity] = useState<DailyActivity[]>([]);
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [heartRate, setHeartRate] = useState<HeartRate[]>([]);
  const [spo2, setSpo2] = useState<DailySpO2[]>([]);
  // const [workouts, setWorkouts] = useState<Workout[]>([]);

  const [dateIndex, setDateIndex] = useState(0); // 0 = latest

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
          // ouraService.getWorkouts(activeProfile.token) // API might be flaky or empty, optional
        ]);

        // Sort all by date descending
        const sortFn = (a: any, b: any) => new Date(b.day || b.timestamp).getTime() - new Date(a.day || a.timestamp).getTime();

        setSleep(s.sort(sortFn));
        setReadiness(r.sort(sortFn));
        setActivity(a.sort(sortFn));
        setSessions(sess.sort(sortFn));

        // HR is intraday timestamp, we can just keep it full or filter for chart
        // Let's keep HR raw and maybe aggregate for chart
        setHeartRate(hr);
        setSpo2(sp.sort(sortFn));
        // setWorkouts(w.sort(sortFn));

      } catch (e) {
        console.error("Failed to fetch dashboard data", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeProfile]);

  if (!activeProfile) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-2xl text-white mb-4">No Profile Selected</h2>
        <p className="text-gray-400 mb-8">Please select a user profile or add a new one in Settings.</p>
        <div className="grid gap-4">
          {profiles.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProfileId(p.id)}
              className="bg-oura-card border border-gray-700 px-6 py-3 rounded-xl text-white hover:border-oura-purple transition-all"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return <div className="text-center text-gray-500 mt-20 animate-pulse">Fetching comprehensive data from Oura...</div>;
  if (sleep.length === 0) return <div className="text-center text-gray-500 mt-20">No data found for this user. Check token validity in Settings.</div>;

  // Derived Data for Display
  const currentSleep = sleep[dateIndex] || sleep[0];
  const currentReadiness = readiness[dateIndex] || readiness[0];
  const currentActivity = activity[dateIndex] || activity[0];
  const currentSession = sessions.find(s => s.day === currentSleep.day) || sessions[0];
  const currentSpo2 = spo2.find(s => s.day === currentSleep.day);

  // Chart Data preparation
  const hrData = heartRate
    .filter(h => h.timestamp.startsWith(currentSleep.day) || h.timestamp.startsWith(currentSleep.day)) // Simplified day matching
    .map(h => ({ time: h.timestamp.split('T')[1].slice(0, 5), bpm: h.bpm }));
  // This HR filter is naive, ideally we match "day" rigorously accounting for timezone, 
  // but for now let's just show a simple slice or the full history graph if safer.
  // Actually, HR array can be huge. Let's just graph the last 24h if possible or just use a generic trending chart.
  // Better: Detailed HR graph for the "Selected Day" is hard without complex timezone logic.
  // Let's stick to Trend Charts for the detailed section using the 30-day arrays.

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Profile Switcher & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-oura-purple to-pink-500 flex items-center justify-center text-xs font-bold">
              {activeProfile.name[0]}
            </div>
            <h2 className="text-3xl font-bold text-white shadow-sm">
              {activeProfile.name}'s Dashboard
            </h2>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-400">
            <button
              onClick={() => setDateIndex(Math.min(sleep.length - 1, dateIndex + 1))}
              className="hover:text-white p-1"
              disabled={dateIndex >= sleep.length - 1}
            >
              ← Prev
            </button>
            <span className="font-mono bg-gray-800 px-2 py-1 rounded text-white border border-gray-700">
              {currentSleep.day}
            </span>
            <button
              onClick={() => setDateIndex(Math.max(0, dateIndex - 1))}
              className="hover:text-white p-1"
              disabled={dateIndex === 0}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Main Rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg flex flex-col items-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-teal-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <h3 className="text-gray-400 font-medium mb-6 w-full text-left z-10">Readiness</h3>
          <ScoreRing score={currentReadiness.score} label="Ready" color="#38B2AC" size={160} />
          <div className="w-full mt-6 h-24">
            <HistoryChart data={[...readiness].reverse()} dataKey="score" color="#38B2AC" />
          </div>
        </div>

        <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg flex flex-col items-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <h3 className="text-gray-400 font-medium mb-6 w-full text-left z-10">Sleep</h3>
          <ScoreRing score={currentSleep.score} label="Sleep" color="#9F7AEA" size={160} />
          <div className="w-full mt-6 h-24">
            <HistoryChart data={[...sleep].reverse()} dataKey="score" color="#9F7AEA" />
          </div>
        </div>

        <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg flex flex-col items-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <h3 className="text-gray-400 font-medium mb-6 w-full text-left z-10">Activity</h3>
          <ScoreRing score={currentActivity.score} label="Activity" color="#4299E1" size={160} />
          <div className="w-full mt-6 h-24">
            <HistoryChart data={[...activity].reverse()} dataKey="score" color="#4299E1" />
          </div>
        </div>
      </div>

      {/* Deep Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Sleep Analysis */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg">
            <h3 className="text-white font-bold text-lg mb-4">Sleep Architecture</h3>
            <SleepStagesChart data={sessions.slice(0, 14)} />
            <p className="text-xs text-center text-gray-500 mt-2">Last 14 Days</p>
          </div>

          {/* SpO2 and HRV */}
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="Average SpO2"
              value={currentSpo2?.spo2_percentage?.average || '--'}
              unit="%"
              subtext="Blood Oxygen"
              colorClass="text-blue-400"
            />
            <MetricCard
              title="HRV Balance"
              value={currentReadiness.contributors.hrv_balance || '--'}
              subtext="Stress Recovery"
              colorClass="text-pink-400"
            />
          </div>
        </div>

        {/* Column 2: Activity & Vitals Details */}
        <div className="space-y-4">
          <MetricCard
            title="Resting Heart Rate"
            value={currentReadiness.contributors.resting_heart_rate || '--'}
            unit="bpm"
            subtext="Lowest overnight"
            colorClass="text-red-400"
          />
          <MetricCard
            title="Body Temp"
            value={currentReadiness.temperature_deviation || 0 > 0 ? `+${currentReadiness.temperature_deviation}` : currentReadiness.temperature_deviation}
            unit="°C"
            subtext="Deviation from baseline"
          />
          <MetricCard
            title="Steps"
            value={currentActivity.steps.toLocaleString()}
            subtext={`Goal: ${6000}`} // Could fetch from target if available
            colorClass="text-teal-400"
          />
          <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg">
            <h3 className="text-gray-400 text-sm font-medium mb-4">Recent Heart Rate (Sample)</h3>
            <div className="h-32 w-full">
              <ResponsiveContainer>
                <LineChart data={hrData.slice(-50)}>
                  <Line type="monotone" dataKey="bpm" stroke="#F56565" strokeWidth={2} dot={false} />
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center text-xs text-gray-500 mt-2">Latest 50 data points</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

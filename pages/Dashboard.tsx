import React from 'react';
import { DailyActivity, DailyReadiness, DailySleep, SleepSession, UserProfile } from '../types';
import ScoreRing from '../components/ScoreRing';
import MetricCard from '../components/MetricCard';
import HistoryChart from '../components/HistoryChart';

interface DashboardProps {
  user: UserProfile | null;
  sleep: DailySleep[];
  sleepSessions: SleepSession[];
  readiness: DailyReadiness[];
  activity: DailyActivity[];
}

const Dashboard: React.FC<DashboardProps> = ({ user, sleep, sleepSessions, readiness, activity }) => {
  // Sort data by date descending (most recent first)
  const sortedSleep = [...sleep].sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());
  const sortedReadiness = [...readiness].sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());
  const sortedActivity = [...activity].sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());
  const sortedSessions = [...sleepSessions].sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());

  // Get available dates from the data
  const availableDates = sortedSleep.map(s => s.day);
  const [selectedDate, setSelectedDate] = React.useState<string>(availableDates[0] || '');

  // Get data for selected date
  const latestSleep = sortedSleep.find(s => s.day === selectedDate) || sortedSleep[0];
  const latestReadiness = sortedReadiness.find(r => r.day === selectedDate) || sortedReadiness[0];
  const latestActivity = sortedActivity.find(a => a.day === selectedDate) || sortedActivity[0];

  if (!latestSleep || !latestReadiness || !latestActivity) {
    return <div className="text-center text-gray-500 mt-20">Loading metrics...</div>;
  }

  // Find corresponding sleep session for detailed metrics
  const latestSession = sortedSessions.find(s => s.day === latestSleep.day) || sortedSessions[0];


  // Format Total Sleep (seconds -> hours/min)
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Hello, {user?.email?.split('@')[0] || 'Member'}</h2>
          <p className="text-gray-400 mt-1">Here's your data for {latestSleep.day}.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-oura-card border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-oura-purple"
          >
            {availableDates.map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
          <span className="text-xs font-bold bg-oura-purple/20 text-oura-purple px-3 py-1 rounded-full uppercase tracking-wider">
            Private Dashboard
          </span>
        </div>
      </div>

      {/* Main Score Rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg flex flex-col items-center">
          <h3 className="text-gray-400 font-medium mb-6 w-full text-left">Readiness</h3>
          <ScoreRing score={latestReadiness.score} label="Ready to perform" color="#38B2AC" size={160} />
          <div className="w-full mt-6">
            <HistoryChart data={sortedReadiness} dataKey="score" color="#38B2AC" />
          </div>
        </div>

        <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg flex flex-col items-center">
          <h3 className="text-gray-400 font-medium mb-6 w-full text-left">Sleep</h3>
          <ScoreRing score={latestSleep.score} label="Sleep Quality" color="#9F7AEA" size={160} />
          <div className="w-full mt-6">
            <HistoryChart data={sortedSleep} dataKey="score" color="#9F7AEA" />
          </div>
        </div>

        <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg flex flex-col items-center">
          <h3 className="text-gray-400 font-medium mb-6 w-full text-left">Activity</h3>
          <ScoreRing score={latestActivity.score} label="Activity Balance" color="#4299E1" size={160} />
          <div className="w-full mt-6">
            <HistoryChart data={sortedActivity} dataKey="score" color="#4299E1" />
          </div>
        </div>
      </div>

      {/* Detailed Metrics Grid */}
      <h3 className="text-xl font-bold text-white mt-8">Details</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Sleep Details */}
        <MetricCard
          title="Total Sleep"
          value={latestSession?.total_sleep_duration ? formatDuration(latestSession.total_sleep_duration) : '--'}
          subtext="Duration"
        />
        <MetricCard
          title="Deep Sleep"
          value={latestSession?.deep_sleep_duration ? formatDuration(latestSession.deep_sleep_duration) : '--'}
          subtext="Restorative"
          colorClass="text-oura-purple"
        />
        <MetricCard
          title="REM Sleep"
          value={latestSession?.rem_sleep_duration ? formatDuration(latestSession.rem_sleep_duration) : '--'}
          subtext="Mental recovery"
          colorClass="text-oura-blue"
        />
        <MetricCard
          title="Efficiency"
          value={latestSession?.efficiency || latestSleep.contributors.efficiency || 0}
          unit="%"
          subtext="Time asleep in bed"
        />

        {/* Activity Details */}
        <MetricCard
          title="Steps"
          value={latestActivity.steps?.toLocaleString() || '--'}
          subtext="Daily total"
          colorClass="text-oura-teal"
        />
        <MetricCard
          title="Active Burn"
          value={latestActivity.active_calories}
          unit="kcal"
          subtext={`Target: ${latestActivity.target_calories}`}
        />
        <MetricCard
          title="Resting HR"
          value={latestSession?.average_heart_rate || '--'}
          unit={latestSession?.average_heart_rate ? "bpm" : ""}
          subtext="Average during sleep"
          colorClass="text-oura-danger"
        />
        <MetricCard
          title="HRV"
          value={latestSession?.average_hrv || '--'}
          unit={latestSession?.average_hrv ? "ms" : ""}
          subtext="Average overnight"
        />
      </div>
    </div>
  );
};

export default Dashboard;

import React from 'react';
import { DailyActivity, DailyReadiness, DailySleep, LeaderboardEntry, UserProfile } from '../types';

interface LeaderboardProps {
    user: UserProfile | null;
    sleep: DailySleep[];
    readiness: DailyReadiness[];
    activity: DailyActivity[];
}

const Leaderboard: React.FC<LeaderboardProps> = ({ user, sleep, readiness, activity }) => {
    // Placeholder logic for now, as checking other users isn't implemented in this scope
    // But we need the component to exist.

    // Create a mock entry for the current user based on latest data
    const latestSleep = sleep[sleep.length - 1];
    const latestReadiness = readiness[readiness.length - 1];
    const latestActivity = activity[activity.length - 1];

    const currentUserEntry: LeaderboardEntry | null = latestSleep && latestReadiness && latestActivity ? {
        id: user?.id || 'current',
        name: user?.email?.split('@')[0] || 'You',
        readiness: latestReadiness.score || 0,
        sleep: latestSleep.score || 0,
        activity: latestActivity.score || 0,
        average: Math.round(((latestReadiness.score || 0) + (latestSleep.score || 0) + (latestActivity.score || 0)) / 3),
        isCurrentUser: true,
    } : null;

    return (
        <div className="animate-fade-in space-y-6">
            <h2 className="text-3xl font-bold text-white mb-6">Community Leaderboard</h2>

            <div className="bg-oura-card rounded-3xl p-6 border border-gray-800 shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-gray-400 border-b border-gray-800">
                                <th className="p-4 font-medium">Rank</th>
                                <th className="p-4 font-medium">Member</th>
                                <th className="p-4 font-medium text-center">Avg Score</th>
                                <th className="p-4 font-medium text-center hidden md:table-cell">Readiness</th>
                                <th className="p-4 font-medium text-center hidden md:table-cell">Sleep</th>
                                <th className="p-4 font-medium text-center hidden md:table-cell">Activity</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentUserEntry ? (
                                <tr className="border-b border-gray-800/50 hover:bg-white/5 transition-colors">
                                    <td className="p-4 text-white font-bold">1</td>
                                    <td className="p-4 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-oura-purple flex items-center justify-center text-xs font-bold text-black">
                                            {currentUserEntry.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-white font-medium">{currentUserEntry.name} (You)</span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-block px-3 py-1 rounded-full bg-oura-success/20 text-oura-success font-bold text-sm">
                                            {currentUserEntry.average}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center text-gray-300 hidden md:table-cell">{currentUserEntry.readiness}</td>
                                    <td className="p-4 text-center text-gray-300 hidden md:table-cell">{currentUserEntry.sleep}</td>
                                    <td className="p-4 text-center text-gray-300 hidden md:table-cell">{currentUserEntry.activity}</td>
                                </tr>
                            ) : (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-500">
                                        No data available for leaderboard.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;

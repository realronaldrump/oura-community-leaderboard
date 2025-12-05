
import React, { useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { ouraService } from '../services/ouraService';
import { LeaderboardEntry } from '../types';

const Leaderboard: React.FC = () => {
    const { profiles } = useUser();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (profiles.length === 0) return;
            setLoading(true);
            const newEntries: LeaderboardEntry[] = [];

            await Promise.all(profiles.map(async (profile) => {
                try {
                    const sleep = await ouraService.getDailySleep(profile.token);
                    const readiness = await ouraService.getDailyReadiness(profile.token);
                    const activity = await ouraService.getDailyActivity(profile.token);

                    // Get latest data (assuming array is sorted or we sort it, service returns range)
                    // Service returns last 30 days. Let's pick the absolute latest date available across the board?
                    // For simplicity, let's just pick the last item in the list which should be "today" or "yesterday"

                    const latestSleep = sleep[sleep.length - 1];
                    const latestReadiness = readiness[readiness.length - 1];
                    const latestActivity = activity[activity.length - 1];

                    if (latestSleep && latestReadiness && latestActivity) {
                        const rScore = latestReadiness.score || 0;
                        const sScore = latestSleep.score || 0;
                        const aScore = latestActivity.score || 0;
                        const avg = Math.round((rScore + sScore + aScore) / 3);

                        newEntries.push({
                            id: profile.id,
                            name: profile.name,
                            readiness: rScore,
                            sleep: sScore,
                            activity: aScore,
                            average: avg,
                            steps: latestActivity.steps,
                            isCurrentUser: false // user context doesn't distinguish "me" from others really, everyone is a profile
                        });
                    }
                } catch (e) {
                    console.error(`Failed to fetch data for ${profile.name}`, e);
                }
            }));

            // Sort by Average Score Descending
            newEntries.sort((a, b) => b.average - a.average);
            setEntries(newEntries);
            setLoading(false);
        };

        fetchData();
    }, [profiles]);

    if (loading) {
        return <div className="text-center text-gray-500 mt-20 animate-pulse">Loading community data...</div>;
    }

    if (profiles.length === 0) {
        return <div className="text-center text-gray-500 mt-20">No profiles found. Go to Settings to add users.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-white">Community Leaderboard</h2>
                    <p className="text-gray-400">Comparing today's stats.</p>
                </div>
            </div>

            <div className="bg-oura-card rounded-3xl border border-gray-800 overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-900/50 border-b border-gray-800">
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Rank</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Oura Score</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-oura-teal uppercase tracking-wider">Readiness</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-oura-purple uppercase tracking-wider">Sleep</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-oura-blue uppercase tracking-wider">Activity</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {entries.map((entry, index) => (
                                <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' :
                                                index === 1 ? 'bg-gray-400/20 text-gray-400' :
                                                    index === 2 ? 'bg-orange-700/20 text-orange-700' :
                                                        'text-gray-500'
                                            }`}>
                                            {index + 1}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-oura-purple to-oura-blue flex items-center justify-center text-xs font-bold text-white mr-3">
                                                {entry.name[0]}
                                            </div>
                                            <div className="text-sm font-medium text-white">{entry.name}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <div className="text-xl font-bold text-white">{entry.average}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-300">
                                        {entry.readiness}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-300">
                                        {entry.sleep}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-300">
                                        {entry.activity}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-gray-300">
                                        {entry.steps.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;

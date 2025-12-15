import React, { useMemo, useState } from 'react';
import { DailyStats } from '../types';
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface AllTimeHistoryProps {
    profiles: { id: string; email?: string | null }[];
    userQueries: { data: DailyStats | undefined }[];
}

interface HistoryEntry {
    id: string; // Unique ID for key (timestamp + userId)
    userId: string;
    userName: string;
    date: Date;
    dateStr: string;
    sleep: number;
    readiness: number;
    activity: number;
    average: number;
}

type SortField = 'date' | 'userName' | 'sleep' | 'readiness' | 'activity' | 'average';
type SortDirection = 'asc' | 'desc';

const AllTimeHistory: React.FC<AllTimeHistoryProps> = ({ profiles, userQueries }) => {
    const [sortField, setSortField] = useState<SortField>('average');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [chartMetric, setChartMetric] = useState<'sleep' | 'readiness' | 'activity'>('sleep');
    const [filterUser, setFilterUser] = useState<string>('all');

    // 1. Flatten Data
    const allData = useMemo(() => {
        const entries: HistoryEntry[] = [];

        profiles.forEach((profile, idx) => {
            // Apply User Filter
            if (filterUser !== 'all' && profile.id !== filterUser) return;

            const data = userQueries[idx]?.data;
            if (!data) return;

            // Iterate through sleep data as the anchor (assuming days align mostly)
            data.sleep.forEach((sleepDay) => {
                const dayStr = sleepDay.day;
                const readinessDay = data.readiness.find(d => d.day === dayStr);
                const activityDay = data.activity.find(d => d.day === dayStr);

                const sScore = sleepDay.score || 0;
                const rScore = readinessDay?.score || 0;
                const aScore = activityDay?.score || 0;

                entries.push({
                    id: `${profile.id}-${dayStr}`,
                    userId: profile.id,
                    userName: (profile.email || 'User').split('@')[0],
                    date: new Date(dayStr),
                    dateStr: dayStr,
                    sleep: sScore,
                    readiness: rScore,
                    activity: aScore,
                    average: Math.round((sScore + rScore + aScore) / 3)
                });
            });
        });

        return entries;
    }, [profiles, userQueries, filterUser]);

    // 2. Sort Data
    const sortedData = useMemo(() => {
        return [...allData].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            // Handle date specifically if needed, strictly speaking JS Date objects compare fine with < > - but subtraction is safer
            if (valA instanceof Date && valB instanceof Date) {
                return sortDirection === 'asc' ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [allData, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new metrics usually
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="text-white/20 ml-1">↕</span>;
        return <span className="text-accent-cyan ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    // 3. Prepare Chart Data grouped by User for multiple series
    // Recharts Scatter needs separate series for different colors usually, or use a custom shape. 
    // Easier to just map profiles to specific Scatter components.
    const chartDataByUser = useMemo(() => {
        const map = new Map<string, any[]>();
        profiles.forEach(p => map.set(p.id, []));

        allData.forEach(entry => {
            const userArr = map.get(entry.userId);
            if (userArr) {
                userArr.push({
                    x: entry.date.getTime(),
                    y: entry[chartMetric],
                    ...entry
                });
            }
        });
        return map;
    }, [allData, profiles, chartMetric]);

    // User Colors
    const userColors = ['#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Controls & Chart */}
            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                    <h3 className="text-xl font-bold">History Visualization</h3>

                    <div className="flex items-center gap-4">
                        {/* User Filter */}
                        <div className="relative">
                            <select
                                value={filterUser}
                                onChange={(e) => setFilterUser(e.target.value)}
                                className="appearance-none bg-white/5 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan cursor-pointer hover:bg-white/10 transition-colors"
                            >
                                <option value="all" className="bg-void text-text-primary">All Users</option>
                                {profiles.map(p => (
                                    <option key={p.id} value={p.id} className="bg-void text-text-primary">
                                        {(p.email || 'User').split('@')[0]}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {/* Metric Toggles */}
                        <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                            {(['sleep', 'readiness', 'activity'] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setChartMetric(m)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors uppercase ${chartMetric === m
                                        ? 'bg-accent-cyan/20 text-accent-cyan shadow-sm'
                                        : 'hover:text-white text-text-muted'
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis
                                type="number"
                                dataKey="x"
                                name="Date"
                                domain={['auto', 'auto']}
                                tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                stroke="#94a3b8"
                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                            />
                            <YAxis
                                type="number"
                                dataKey="y"
                                name="Score"
                                unit=""
                                domain={[40, 100]} // Oura scores usually 0-100, zoom in a bit
                                stroke="#94a3b8"
                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="glass-card p-3 text-xs bg-void/90 border border-white/10">
                                                <p className="font-bold text-accent-cyan mb-1">{data.userName}</p>
                                                <p className="text-text-muted mb-2">{data.date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                                <p><span className="text-metric-sleep">Sleep:</span> {data.sleep}</p>
                                                <p><span className="text-metric-readiness">Readiness:</span> {data.readiness}</p>
                                                <p><span className="text-metric-activity">Activity:</span> {data.activity}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend />
                            {profiles.map((p, idx) => (
                                <Scatter
                                    key={p.id}
                                    name={(p.email || 'User').split('@')[0]}
                                    data={chartDataByUser.get(p.id) || []}
                                    fill={userColors[idx % userColors.length]}
                                    line={{ stroke: userColors[idx % userColors.length], strokeWidth: 1 }}
                                    shape="circle"
                                />
                            ))}
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-xs text-text-muted uppercase tracking-wider border-b border-dashboard-border bg-white/5">
                                <th className="p-4 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('date')}>
                                    Date <SortIcon field="date" />
                                </th>
                                <th className="p-4 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('userName')}>
                                    User <SortIcon field="userName" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('sleep')}>
                                    Sleep <SortIcon field="sleep" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('readiness')}>
                                    Readiness <SortIcon field="readiness" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('activity')}>
                                    Activity <SortIcon field="activity" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('average')}>
                                    Avg <SortIcon field="average" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dashboard-border">
                            {sortedData.map((entry) => (
                                <tr key={entry.id} className="hover:bg-white/5 transition-colors text-sm">
                                    <td className="p-4 font-mono text-text-secondary">{entry.dateStr}</td>
                                    <td className="p-4 font-medium text-text-primary">{entry.userName}</td>

                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded ${entry.sleep >= 85 ? 'bg-metric-sleep/20 text-metric-sleep' : entry.sleep >= 70 ? 'text-text-primary' : 'text-text-muted'}`}>
                                            {entry.sleep}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded ${entry.readiness >= 85 ? 'bg-metric-readiness/20 text-metric-readiness' : entry.readiness >= 70 ? 'text-text-primary' : 'text-text-muted'}`}>
                                            {entry.readiness}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`px-2 py-1 rounded ${entry.activity >= 85 ? 'bg-metric-activity/20 text-metric-activity' : entry.activity >= 70 ? 'text-text-primary' : 'text-text-muted'}`}>
                                            {entry.activity}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center font-bold font-mono">{entry.average}</td>
                                </tr>
                            ))}
                            {sortedData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-text-muted">No data available for history view.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AllTimeHistory;

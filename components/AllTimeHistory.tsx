import React, { useMemo, useState } from 'react';
import { DailyStats } from '../types';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart
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
type DateRange = '7d' | '30d' | '90d' | '1y' | 'all';
type Smoothing = 'raw' | '3d' | '7d' | '14d';

const AllTimeHistory: React.FC<AllTimeHistoryProps> = ({ profiles, userQueries }) => {
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [chartMetric, setChartMetric] = useState<'sleep' | 'readiness' | 'activity' | 'average'>('average');
    const [filterUser, setFilterUser] = useState<string>('all');

    // New Filters
    const [dateRange, setDateRange] = useState<DateRange>('30d');
    const [showCommonDatesOnly, setShowCommonDatesOnly] = useState(false);
    const [smoothing, setSmoothing] = useState<Smoothing>('3d');

    // 1. Flatten Data
    const rawData = useMemo(() => {
        const entries: HistoryEntry[] = [];

        profiles.forEach((profile, idx) => {
            const data = userQueries[idx]?.data;
            if (!data) return;

            // Iterate through sleep data as the anchor
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
    }, [profiles, userQueries]);

    // 2. Filter Data (Date Range & Common Dates)
    const filteredData = useMemo(() => {
        let data = [...rawData];

        // A. Date Range Filter
        if (dateRange !== 'all') {
            const now = new Date();
            const cutoff = new Date();

            switch (dateRange) {
                case '7d': cutoff.setDate(now.getDate() - 7); break;
                case '30d': cutoff.setDate(now.getDate() - 30); break;
                case '90d': cutoff.setDate(now.getDate() - 90); break;
                case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
            }

            // Set to beginning of that day
            cutoff.setHours(0, 0, 0, 0);

            data = data.filter(d => d.date >= cutoff);
        }

        // B. Common Dates Only Filter
        if (showCommonDatesOnly && profiles.length > 1) {
            // Find dates that exist for ALL selected profiles (if filtering by user, this toggle is less relevant, but let's respect global context)
            // But usually "Common Dates" implies intersection of ALL available profiles in the dataset

            const userDates = new Map<string, Set<string>>();
            profiles.forEach(p => userDates.set(p.id, new Set()));

            data.forEach(d => {
                userDates.get(d.userId)?.add(d.dateStr);
            });

            // Find intersection
            let commonDates: Set<string> | null = null;
            userDates.forEach((dates) => {
                if (commonDates === null) {
                    commonDates = new Set(dates);
                } else {
                    commonDates = new Set([...commonDates].filter(x => dates.has(x)));
                }
            });

            if (commonDates) {
                data = data.filter(d => commonDates!.has(d.dateStr));
            }
        }

        // C. Filter by User (for Table primarily, but affects chart if we want)
        // The Chart usually shows ALL valid users so you can compare. 
        // The table definitely needs to respect filterUser.
        // Let's decide: Chart shows all allowed by filterUser.
        if (filterUser !== 'all') {
            data = data.filter(d => d.userId === filterUser);
        }

        return data;
    }, [rawData, dateRange, showCommonDatesOnly, filterUser, profiles]);

    // 3. Sort Data (for Table)
    const tableData = useMemo(() => {
        return [...filteredData].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            // Handle date
            if (valA instanceof Date && valB instanceof Date) {
                return sortDirection === 'asc' ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
            }

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredData, sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="text-white/20 ml-1">↕</span>;
        return <span className="text-accent-cyan ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    // 4. Prepare Chart Data (Moving Averages)
    const chartData = useMemo(() => {
        // Group by user
        const userGroups = new Map<string, HistoryEntry[]>();
        filteredData.forEach(d => {
            if (!userGroups.has(d.userId)) userGroups.set(d.userId, []);
            userGroups.get(d.userId)!.push(d);
        });

        const finalSeries = new Map<string, any[]>();

        // Window Size
        let windowSize = 1;
        if (smoothing === '3d') windowSize = 3;
        if (smoothing === '7d') windowSize = 7;
        if (smoothing === '14d') windowSize = 14;

        userGroups.forEach((entries, userId) => {
            // Sort by date asc for MA calculation
            entries.sort((a, b) => a.date.getTime() - b.date.getTime());

            const processed = entries.map((entry, idx, arr) => {
                let yVal = entry[chartMetric === 'average' ? 'average' : chartMetric];

                // Calculate Moving Average
                if (windowSize > 1) {
                    let sum = 0;
                    let count = 0;
                    for (let i = 0; i < windowSize; i++) {
                        if (idx - i >= 0) {
                            const prev = arr[idx - i];
                            // Basic check to ensure continuity? 
                            // If dates are skipped, MA might be misleading if we just look at array index.
                            // But for simplicity, we'll just take last N points available.
                            sum += prev[chartMetric === 'average' ? 'average' : chartMetric];
                            count++;
                        }
                    }
                    if (count > 0) yVal = sum / count;
                }

                return {
                    x: entry.date.getTime(),
                    y: Math.round(yVal * 10) / 10, // Round to 1 decimal
                    original: entry,
                    dateStr: entry.dateStr
                };
            });

            finalSeries.set(userId, processed);
        });

        return finalSeries;
    }, [filteredData, chartMetric, smoothing]);

    // User Colors
    const userColors = ['#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Controls & Chart */}
            <div className="glass-card p-6">
                <div className="flex flex-col gap-6">
                    {/* Header Controls */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <h3 className="text-xl font-bold">History Visualization</h3>

                        <div className="flex flex-wrap items-center gap-4">
                            {/* Date Range */}
                            <div className="bg-white/5 p-1 rounded-lg flex gap-1">
                                {(['7d', '30d', '90d', '1y', 'all'] as const).map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setDateRange(r)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${dateRange === r
                                            ? 'bg-accent-cyan/20 text-accent-cyan shadow-sm'
                                            : 'hover:text-white text-text-muted'
                                            }`}
                                    >
                                        {r === 'all' ? 'Max' : r.toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            {/* Filters */}
                            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-white transition-colors">
                                <input
                                    type="checkbox"
                                    checked={showCommonDatesOnly}
                                    onChange={e => setShowCommonDatesOnly(e.target.checked)}
                                    className="rounded border-white/20 bg-white/5 text-accent-cyan focus:ring-accent-cyan"
                                />
                                Overlap Only
                            </label>
                        </div>
                    </div>

                    {/* Secondary Controls (Metric & Smoothing) */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-white/5 pt-4">
                        <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                            {(['sleep', 'readiness', 'activity', 'average'] as const).map(m => (
                                <button
                                    key={m}
                                    onClick={() => setChartMetric(m as any)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors uppercase ${chartMetric === m
                                        ? 'bg-accent-purple/20 text-accent-purple shadow-sm'
                                        : 'hover:text-white text-text-muted'
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Smoothing:</span>
                            <select
                                value={smoothing}
                                onChange={(e) => setSmoothing(e.target.value as Smoothing)}
                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent-cyan text-white"
                            >
                                <option value="raw" className="bg-gray-900 text-white">None (Raw)</option>
                                <option value="3d" className="bg-gray-900 text-white">3-Day Avg</option>
                                <option value="7d" className="bg-gray-900 text-white">7-Day Avg</option>
                                <option value="14d" className="bg-gray-900 text-white">14-Day Avg</option>
                            </select>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="h-[400px] w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                            <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis
                                    type="number"
                                    dataKey="x"
                                    name="Date"
                                    domain={['auto', 'auto']}
                                    tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    allowDuplicatedCategory={false}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name="Score"
                                    unit=""
                                    domain={[50, 100]}
                                    stroke="#94a3b8"
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                />
                                <Tooltip
                                    cursor={{ stroke: 'white', strokeOpacity: 0.2 }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            // Sort by score
                                            const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
                                            const dateStr = new Date(sorted[0].payload.x).toLocaleDateString();

                                            return (
                                                <div className="glass-card p-3 text-xs bg-void/95 border border-white/10 shadow-xl">
                                                    <p className="text-text-muted mb-2 font-mono">{dateStr}</p>
                                                    <div className="space-y-1">
                                                        {sorted.map((p, idx) => (
                                                            <div key={idx} className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                                                <span className="text-white font-medium">{p.name}:</span>
                                                                <span className="font-mono text-accent-cyan ml-auto">{p.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Legend />
                                {profiles.map((p, idx) => {
                                    // Only render if we have data for this user
                                    const data = chartData.get(p.id);
                                    if (!data || data.length === 0) return null;

                                    // If filterUser is set, only show that user
                                    if (filterUser !== 'all' && filterUser !== p.id) return null;

                                    return (
                                        <Line
                                            key={p.id}
                                            type="monotone"
                                            name={(p.email || 'User').split('@')[0]}
                                            data={data}
                                            dataKey="y"
                                            stroke={userColors[idx % userColors.length]}
                                            strokeWidth={2}
                                            dot={dateRange === '7d' || dateRange === '30d' ? { r: 3, fill: userColors[idx % userColors.length] } : false}
                                            activeDot={{ r: 6 }}
                                            connectNulls
                                        />
                                    );
                                })}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-dashboard-border bg-white/5 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Detailed Data</h3>

                    <select
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        className="bg-base/50 text-text-primary text-xs border border-white/10 rounded px-2 py-1 focus:outline-none text-white"
                    >
                        <option value="all" className="bg-gray-900 text-white">All Users</option>
                        {profiles.map(p => (
                            <option key={p.id} value={p.id} className="bg-gray-900 text-white">{(p.email || 'User').split('@')[0]}</option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-void z-10 shadow-lg">
                            <tr className="text-xs text-text-muted uppercase tracking-wider border-b border-dashboard-border">
                                <th className="p-4 cursor-pointer hover:text-text-primary transition-colors bg-void" onClick={() => handleSort('date')}>
                                    Date <SortIcon field="date" />
                                </th>
                                <th className="p-4 cursor-pointer hover:text-text-primary transition-colors bg-void" onClick={() => handleSort('userName')}>
                                    User <SortIcon field="userName" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors bg-void" onClick={() => handleSort('sleep')}>
                                    Sleep <SortIcon field="sleep" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors bg-void" onClick={() => handleSort('readiness')}>
                                    Readiness <SortIcon field="readiness" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors bg-void" onClick={() => handleSort('activity')}>
                                    Activity <SortIcon field="activity" />
                                </th>
                                <th className="p-4 text-center cursor-pointer hover:text-text-primary transition-colors bg-void" onClick={() => handleSort('average')}>
                                    Avg <SortIcon field="average" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dashboard-border">
                            {tableData.map((entry) => (
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
                            {tableData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-text-muted">No data available for the selected range.</td>
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

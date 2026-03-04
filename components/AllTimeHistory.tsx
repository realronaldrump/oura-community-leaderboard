import React, { useEffect, useMemo, useState } from 'react';
import { DailyStats } from '../types';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart
} from 'recharts';

interface AllTimeHistoryProps {
    profiles: { id: string; email?: string | null }[];
    userQueries: { data: DailyStats | undefined; isFetching?: boolean; isPending?: boolean }[];
}

interface HistoryEntry {
    id: string;
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

const parseOuraDay = (day: string): Date => new Date(`${day}T12:00:00`);
const compareNames = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
const TABLE_PAGE_SIZE = 250;
const countAvailableScores = (sleep: number, readiness: number, activity: number): number =>
    Number(sleep > 0) + Number(readiness > 0) + Number(activity > 0);

const AllTimeHistory: React.FC<AllTimeHistoryProps> = ({ profiles, userQueries }) => {
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [chartMetric, setChartMetric] = useState<'sleep' | 'readiness' | 'activity' | 'average'>('average');
    const [filterUser, setFilterUser] = useState<string>('all');

    const [dateRange, setDateRange] = useState<DateRange>('90d');
    const [showCommonDatesOnly, setShowCommonDatesOnly] = useState(false);
    const [smoothing, setSmoothing] = useState<Smoothing>('3d');
    const [visibleRows, setVisibleRows] = useState(TABLE_PAGE_SIZE);
    const isHistoryFetching = userQueries.some(query => query.isFetching || query.isPending);

    const rawData = useMemo(() => {
        const entriesByUserDay = new Map<string, HistoryEntry>();

        profiles.forEach((profile, idx) => {
            const data = userQueries[idx]?.data;
            if (!data) return;

            const userName = (profile.email || 'User').split('@')[0];
            const readinessByDay = new Map<string, number>();
            const activityByDay = new Map<string, number>();

            data.readiness.forEach((readinessDay) => {
                readinessByDay.set(readinessDay.day, Number(readinessDay.score) || 0);
            });
            data.activity.forEach((activityDay) => {
                activityByDay.set(activityDay.day, Number(activityDay.score) || 0);
            });

            data.sleep.forEach((sleepDay, sleepIndex) => {
                const dayStr = sleepDay.day;
                if (!dayStr) return;

                const sScore = Number(sleepDay.score) || 0;
                const rScore = readinessByDay.get(dayStr) || 0;
                const aScore = activityByDay.get(dayStr) || 0;
                const average = Math.round((sScore + rScore + aScore) / 3);
                const entryKey = `${profile.id}:${dayStr}`;

                const nextEntry: HistoryEntry = {
                    id: `${profile.id}-${dayStr}-${sleepDay.id || sleepIndex}`,
                    userId: profile.id,
                    userName,
                    date: parseOuraDay(dayStr),
                    dateStr: dayStr,
                    sleep: sScore,
                    readiness: rScore,
                    activity: aScore,
                    average
                };

                const previous = entriesByUserDay.get(entryKey);
                if (!previous) {
                    entriesByUserDay.set(entryKey, nextEntry);
                    return;
                }

                const previousCompleteness = countAvailableScores(previous.sleep, previous.readiness, previous.activity);
                const nextCompleteness = countAvailableScores(nextEntry.sleep, nextEntry.readiness, nextEntry.activity);
                if (nextCompleteness >= previousCompleteness) {
                    entriesByUserDay.set(entryKey, nextEntry);
                }
            });
        });

        return Array.from(entriesByUserDay.values());
    }, [profiles, userQueries]);

    const filteredData = useMemo(() => {
        let data = rawData;

        if (dateRange !== 'all') {
            const now = new Date();
            const cutoff = new Date();

            switch (dateRange) {
                case '7d': cutoff.setDate(now.getDate() - 7); break;
                case '30d': cutoff.setDate(now.getDate() - 30); break;
                case '90d': cutoff.setDate(now.getDate() - 90); break;
                case '1y': cutoff.setFullYear(now.getFullYear() - 1); break;
            }
            cutoff.setHours(0, 0, 0, 0);
            data = data.filter(d => d.date >= cutoff);
        }

        if (filterUser !== 'all') {
            data = data.filter(d => d.userId === filterUser);
        }

        if (showCommonDatesOnly) {
            const activeUserIds = Array.from(new Set(data.map(entry => entry.userId)));
            if (activeUserIds.length > 1) {
                const datesByUser = new Map<string, Set<string>>();
                activeUserIds.forEach((userId) => datesByUser.set(userId, new Set()));

                data.forEach((entry) => {
                    datesByUser.get(entry.userId)?.add(entry.dateStr);
                });

                let commonDates: Set<string> | null = null;
                datesByUser.forEach((dates) => {
                    if (commonDates == null) {
                        commonDates = new Set(dates);
                        return;
                    }
                    commonDates = new Set(Array.from(commonDates).filter(date => dates.has(date)));
                });

                if (commonDates && commonDates.size > 0) {
                    const safeCommonDates = commonDates;
                    data = data.filter(entry => safeCommonDates.has(entry.dateStr));
                } else {
                    data = [];
                }
            }
        }

        return data;
    }, [rawData, dateRange, showCommonDatesOnly, filterUser]);

    const tableData = useMemo(() => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        const sorted = [...filteredData];

        sorted.sort((a, b) => {
            let primary = 0;

            if (sortField === 'date') {
                primary = a.dateStr.localeCompare(b.dateStr);
            } else if (sortField === 'userName') {
                primary = compareNames(a.userName, b.userName);
            } else {
                const numericField: Extract<SortField, 'sleep' | 'readiness' | 'activity' | 'average'> = sortField;
                primary = a[numericField] - b[numericField];
            }

            if (primary !== 0) {
                return direction * primary;
            }

            const tieDate = b.dateStr.localeCompare(a.dateStr);
            if (tieDate !== 0) return tieDate;
            const tieName = compareNames(a.userName, b.userName);
            if (tieName !== 0) return tieName;
            return a.id.localeCompare(b.id);
        });

        return sorted;
    }, [filteredData, sortField, sortDirection]);

    const visibleTableData = useMemo(
        () => tableData.slice(0, visibleRows),
        [tableData, visibleRows]
    );
    const hasMoreTableRows = visibleRows < tableData.length;

    useEffect(() => {
        setVisibleRows(TABLE_PAGE_SIZE);
    }, [sortField, sortDirection, filterUser, dateRange, showCommonDatesOnly]);

    const getInitialSortDirection = (field: SortField): SortDirection =>
        field === 'userName' ? 'asc' : 'desc';

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(getInitialSortDirection(field));
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
                        <div>
                            <h3 className="text-xl font-bold">History Visualization</h3>
                            {isHistoryFetching && (
                                <p className="text-xs text-text-muted mt-1">Syncing older history in the background...</p>
                            )}
                        </div>

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
                        <ResponsiveContainer
                            width="100%"
                            height="100%"
                            minWidth={0}
                            minHeight={300}
                            initialDimension={{ width: 960, height: 300 }}
                        >
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
                            {visibleTableData.map((entry) => (
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
                            {visibleTableData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-text-muted">No data available for the selected range.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 border-t border-dashboard-border bg-white/[0.03] flex items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">
                        Showing {visibleTableData.length.toLocaleString()} of {tableData.length.toLocaleString()} rows
                    </p>
                    {hasMoreTableRows && (
                        <button
                            onClick={() => setVisibleRows((prev) => prev + TABLE_PAGE_SIZE)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-text-primary transition-colors"
                        >
                            Load More
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AllTimeHistory;

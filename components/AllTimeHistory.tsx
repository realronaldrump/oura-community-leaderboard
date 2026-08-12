import React, { useEffect, useMemo, useState } from 'react';
import { DailyStats } from '../types';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart
} from 'recharts';

import { getProfileDisplayName } from '../utils/profileName';
import { getUTCDateFromISODate } from '../utils/temporal';

interface AllTimeHistoryProps {
    profiles: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }[];
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

interface ChartPoint {
    x: number;
    y: number;
    original: HistoryEntry;
    dateStr: string;
}

type SortField = 'date' | 'userName' | 'sleep' | 'readiness' | 'activity' | 'average';
type SortDirection = 'asc' | 'desc';
type Smoothing = 'raw' | '3d' | '7d' | '14d';

const USER_COLORS = ['#A08BBE', '#7BA8D4', '#7BC4A0', '#D4A574', '#D4897B'];
const parseOuraDay = (day: string): Date => getUTCDateFromISODate(day) || new Date(`${day}T12:00:00Z`);
const compareNames = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
const TABLE_PAGE_SIZE = 250;
const countAvailableScores = (sleep: number, readiness: number, activity: number): number =>
    Number(sleep > 0) + Number(readiness > 0) + Number(activity > 0);
const formatScoreStat = (value: number): string =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

const AllTimeHistory: React.FC<AllTimeHistoryProps> = ({ profiles, userQueries }) => {
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [chartMetric, setChartMetric] = useState<'sleep' | 'readiness' | 'activity' | 'average'>('average');
    const [filterUser, setFilterUser] = useState<string>('all');

    const [showCommonDatesOnly, setShowCommonDatesOnly] = useState(false);
    const [smoothing, setSmoothing] = useState<Smoothing>('3d');
    const [hiddenChartUserIds, setHiddenChartUserIds] = useState<Set<string>>(() => new Set());
    const [visibleRows, setVisibleRows] = useState(TABLE_PAGE_SIZE);
    const isHistoryFetching = userQueries.some(query => query.isFetching || query.isPending);

    const rawData = useMemo(() => {
        const entriesByUserDay = new Map<string, HistoryEntry>();

        profiles.forEach((profile, idx) => {
            const data = userQueries[idx]?.data;
            if (!data) return;

            const userName = getProfileDisplayName(profile);
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
    }, [rawData, showCommonDatesOnly, filterUser]);

    const tableData = useMemo(() => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        const sorted = [...filteredData];

        sorted.sort((a, b) => {
            const primary = sortField === 'date'
                ? a.dateStr.localeCompare(b.dateStr)
                : sortField === 'userName'
                    ? compareNames(a.userName, b.userName)
                    : a[sortField] - b[sortField];

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
    }, [sortField, sortDirection, filterUser, showCommonDatesOnly]);

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
        if (sortField !== field) return (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline ml-1 text-black/20 align-[-1px]">
                <path d="M6 2L8.5 5H3.5L6 2Z" fill="currentColor" />
                <path d="M6 10L3.5 7H8.5L6 10Z" fill="currentColor" />
            </svg>
        );
        return sortDirection === 'asc' ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline ml-1 text-accent align-[-1px]">
                <path d="M6 2L9 6H3L6 2Z" fill="currentColor" />
            </svg>
        ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline ml-1 text-accent align-[-1px]">
                <path d="M6 10L3 6H9L6 10Z" fill="currentColor" />
            </svg>
        );
    };

    // 4. Prepare Chart Data (Moving Averages)
    const chartData = useMemo(() => {
        // Group by user
        const userGroups = new Map<string, HistoryEntry[]>();
        filteredData.forEach(d => {
            if (!userGroups.has(d.userId)) userGroups.set(d.userId, []);
            userGroups.get(d.userId)!.push(d);
        });

        const finalSeries = new Map<string, ChartPoint[]>();

        // Window Size
        let windowSize = 1;
        if (smoothing === '3d') windowSize = 3;
        if (smoothing === '7d') windowSize = 7;
        if (smoothing === '14d') windowSize = 14;

        userGroups.forEach((entries, userId) => {
            // Sort by date asc for MA calculation
            entries.sort((a, b) => a.date.getTime() - b.date.getTime());

            // Filter out entries where the selected metric is 0 (erroneous/missing data)
            const nonZeroEntries = entries.filter((entry) => {
                const val = entry[chartMetric === 'average' ? 'average' : chartMetric];
                return val > 0;
            });

            const processed = nonZeroEntries.map((entry, idx, arr) => {
                let yVal = entry[chartMetric === 'average' ? 'average' : chartMetric];

                // Calculate Moving Average
                if (windowSize > 1) {
                    let sum = 0;
                    let count = 0;
                    for (let i = 0; i < windowSize; i++) {
                        if (idx - i >= 0) {
                            const prev = arr[idx - i];
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

    const chartProfiles = useMemo(
        () => profiles
            .map((profile, index) => ({ profile, index }))
            .filter(({ profile }) => {
                const data = chartData.get(profile.id);
                if (!data || data.length === 0) return false;
                return filterUser === 'all' || filterUser === profile.id;
            }),
        [profiles, chartData, filterUser]
    );

    const toggleChartUser = (userId: string) => {
        setHiddenChartUserIds((current) => {
            const next = new Set(current);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    };

    const visibleChartPoints = useMemo(
        () => chartProfiles.flatMap(({ profile }) => {
            if (hiddenChartUserIds.has(profile.id)) return [];
            return (chartData.get(profile.id) || []).filter((point) => point.y > 0);
        }),
        [chartData, chartProfiles, hiddenChartUserIds]
    );

    // Friendly chart summary
    const chartSummary = useMemo(() => {
        if (visibleChartPoints.length < 3) return null;

        const sorted = [...visibleChartPoints].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
        const values = sorted.map(point => point.y);
        const allTimeAvg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
        const recentCount = Math.min(7, values.length);
        const recentSlice = values.slice(-recentCount);
        const recentAvg = Math.round(recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length);
        const allTimeBest = Math.max(...values);
        const allTimeWorst = Math.min(...values);
        const bestDisplay = formatScoreStat(allTimeBest);
        const worstDisplay = formatScoreStat(allTimeWorst);
        const parts: string[] = [`Visible-series average: ${allTimeAvg}`];

        if (values.length >= 14) {
            const diff = recentAvg - allTimeAvg;
            parts.push(`Recent ${recentCount} points: ${recentAvg} (${diff > 0 ? '+' : ''}${diff})`);
        }

        const range = allTimeBest - allTimeWorst;
        if (range > 0) {
            parts.push(`Range: ${worstDisplay}–${bestDisplay} across ${values.length} points`);
        }

        return {
            text: parts.join('. ') + '.',
            stats: { allTimeAvg, recentAvg, best: bestDisplay, worst: worstDisplay, totalDays: values.length },
        };
    }, [chartMetric, visibleChartPoints]);

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
                                <p className="text-xs text-text-muted mt-1">Older history will appear automatically.</p>
                            )}
                            {chartSummary && (
                                <p className="text-sm text-text-secondary mt-2 max-w-xl leading-relaxed">{chartSummary.text}</p>
                            )}
                            {chartSummary && (
                                <div className="flex flex-wrap gap-3 mt-2">
                                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#7BC4A0]" /> Best: <span className="font-mono font-semibold text-text-primary">{chartSummary.stats.best}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                                        <span className="w-1.5 h-1.5 rounded-full bg-error" /> Lowest: <span className="font-mono font-semibold text-text-primary">{chartSummary.stats.worst}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#7BA8D4]" /> {chartSummary.stats.totalDays} days tracked
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            {/* Filters */}
                            <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-ink transition-colors">
                                <input
                                    type="checkbox"
                                    checked={showCommonDatesOnly}
                                    onChange={e => setShowCommonDatesOnly(e.target.checked)}
                                    className="h-5 w-5 rounded border-black/20 bg-black/5 text-accent focus:ring-accent"
                                />
                                Overlap Only
                            </label>
                        </div>
                    </div>

                    {/* Secondary Controls (Metric & Smoothing) */}
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-black/5 pt-4">
                        <div className="flex gap-1 bg-black/5 p-1 rounded-lg" role="group" aria-label="Chart metric">
                            {(['sleep', 'readiness', 'activity', 'average'] as const).map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setChartMetric(m as any)}
                                    aria-pressed={chartMetric === m}
                                    className={`min-h-11 px-3 py-1.5 rounded-md text-xs font-medium transition-colors uppercase ${chartMetric === m
                                        ? 'bg-metric-insight/20 text-metric-insight shadow-sm'
                                        : 'hover:text-ink text-text-muted'
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
                                aria-label="Chart smoothing"
                                className="min-h-11 bg-black/5 border border-black/5 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent text-ink"
                            >
                                <option value="raw" className="bg-surface-raised text-ink">None (Raw)</option>
                                <option value="3d" className="bg-surface-raised text-ink">3-Day Avg</option>
                                <option value="7d" className="bg-surface-raised text-ink">7-Day Avg</option>
                                <option value="14d" className="bg-surface-raised text-ink">14-Day Avg</option>
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
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                                <XAxis
                                    type="number"
                                    dataKey="x"
                                    name="Date"
                                    domain={['auto', 'auto']}
                                    tickFormatter={(unixTime) => new Date(unixTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                                    stroke="#A8A29E"
                                    tick={{ fill: '#A8A29E', fontSize: 12 }}
                                    allowDuplicatedCategory={false}
                                />
                                <YAxis
                                    type="number"
                                    dataKey="y"
                                    name="Score"
                                    unit=""
                                    domain={[50, 100]}
                                    stroke="#A8A29E"
                                    tick={{ fill: '#A8A29E', fontSize: 12 }}
                                />
                                <Tooltip
                                    cursor={{ stroke: '#2D2A26', strokeOpacity: 0.2 }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            // Sort by score
                                            const sorted = [...payload].sort((a, b) => (b.value as number) - (a.value as number));
                                            const dateStr = new Date(sorted[0].payload.x).toLocaleDateString('en-US', { timeZone: 'UTC' });

                                            return (
                                                <div className="glass-card border border-line bg-surface-raised p-3 text-xs shadow-card">
                                                    <p className="text-text-muted mb-2 font-mono">{dateStr}</p>
                                                    <div className="space-y-1">
                                                        {sorted.map((p, idx) => (
                                                            <div key={idx} className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                                                                <span className="text-ink font-medium">{p.name}:</span>
                                                                <span className="font-mono text-accent ml-auto">{p.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Legend
                                    align="center"
                                    verticalAlign="bottom"
                                    height={64}
                                    content={() => (
                                        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-2 pt-3">
                                            {chartProfiles.map(({ profile, index }) => {
                                                const userName = getProfileDisplayName(profile);
                                                const isHidden = hiddenChartUserIds.has(profile.id);
                                                const color = USER_COLORS[index % USER_COLORS.length];

                                                return (
                                                    <button
                                                        key={profile.id}
                                                        type="button"
                                                        onClick={() => toggleChartUser(profile.id)}
                                                        aria-pressed={!isHidden}
                                                        aria-label={`${isHidden ? 'Show' : 'Hide'} ${userName}'s scores`}
                                                        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 bg-transparent px-2 text-sm font-normal transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:underline ${isHidden ? 'opacity-40' : 'opacity-100'}`}
                                                    >
                                                        <span
                                                            className="h-2 w-2 rounded-full"
                                                            style={{ backgroundColor: color }}
                                                            aria-hidden="true"
                                                        />
                                                        <span>{userName}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                />
                                {chartProfiles.map(({ profile: p, index: idx }) => {
                                    // Only render if we have data for this user
                                    const data = chartData.get(p.id);
                                    if (!data || data.length === 0) return null;

                                    // If filterUser is set, only show that user
                                    if (filterUser !== 'all' && filterUser !== p.id) return null;

                                    const color = USER_COLORS[idx % USER_COLORS.length];

                                    return (
                                        <Line
                                            key={p.id}
                                            type="monotone"
                                            name={getProfileDisplayName(p)}
                                            data={data}
                                            dataKey="y"
                                            stroke={color}
                                            strokeWidth={2}
                                            dot={filteredData.length <= 60 ? { r: 3, fill: color } : false}
                                            activeDot={{ r: 6 }}
                                            connectNulls
                                            hide={hiddenChartUserIds.has(p.id)}
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
                <div className="p-4 border-b border-dashboard-border bg-black/5 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">Detailed Data</h3>

                    <select
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        aria-label="Filter detailed data by user"
                            className="min-h-11 bg-canvas/50 text-text-primary text-xs border border-black/5 rounded px-2 py-1 focus:outline-none text-ink"
                    >
                        <option value="all" className="bg-surface-raised text-ink">All Users</option>
                        {profiles.map(p => (
                            <option key={p.id} value={p.id} className="bg-surface-raised text-ink">{getProfileDisplayName(p)}</option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto" tabIndex={0} aria-label="Detailed history table; scroll horizontally to see every score">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-void z-10 shadow-lg">
                            <tr className="text-xs text-text-muted uppercase tracking-wider border-b border-dashboard-border">
                                <th className="p-0 bg-void" aria-sort={sortField === 'date' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button type="button" className="flex min-h-11 w-full items-center p-4 hover:text-text-primary transition-colors" onClick={() => handleSort('date')}>
                                        Date <SortIcon field="date" />
                                    </button>
                                </th>
                                <th className="p-0 bg-void" aria-sort={sortField === 'userName' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button type="button" className="flex min-h-11 w-full items-center p-4 hover:text-text-primary transition-colors" onClick={() => handleSort('userName')}>
                                        User <SortIcon field="userName" />
                                    </button>
                                </th>
                                <th className="p-0 text-center bg-void" aria-sort={sortField === 'sleep' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button type="button" className="flex min-h-11 w-full items-center justify-center p-4 hover:text-text-primary transition-colors" onClick={() => handleSort('sleep')}>
                                        Sleep <SortIcon field="sleep" />
                                    </button>
                                </th>
                                <th className="p-0 text-center bg-void" aria-sort={sortField === 'readiness' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button type="button" className="flex min-h-11 w-full items-center justify-center p-4 hover:text-text-primary transition-colors" onClick={() => handleSort('readiness')}>
                                        Readiness <SortIcon field="readiness" />
                                    </button>
                                </th>
                                <th className="p-0 text-center bg-void" aria-sort={sortField === 'activity' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button type="button" className="flex min-h-11 w-full items-center justify-center p-4 hover:text-text-primary transition-colors" onClick={() => handleSort('activity')}>
                                        Activity <SortIcon field="activity" />
                                    </button>
                                </th>
                                <th className="p-0 text-center bg-void" aria-sort={sortField === 'average' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button type="button" className="flex min-h-11 w-full items-center justify-center p-4 hover:text-text-primary transition-colors" onClick={() => handleSort('average')}>
                                        Avg <SortIcon field="average" />
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dashboard-border">
                            {visibleTableData.map((entry) => (
                                <tr key={entry.id} className="hover:bg-black/5 transition-colors text-sm">
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
                <div className="p-3 border-t border-dashboard-border bg-black/[0.03] flex items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">
                        Showing {visibleTableData.length.toLocaleString()} of {tableData.length.toLocaleString()} rows
                    </p>
                    {hasMoreTableRows && (
                        <button
                            type="button"
                            onClick={() => setVisibleRows((prev) => prev + TABLE_PAGE_SIZE)}
                            className="min-h-11 px-3 py-1.5 text-xs font-medium rounded-md bg-black/5 hover:bg-black/5 text-text-primary transition-colors"
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

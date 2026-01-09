// Analytics Service - Statistical calculations and pattern detection

import {
    DailyStats, DailySleep, DailyReadiness, DailyActivity, SleepSession
} from '../types';
import {
    Streak, StreakType, StreakDefinition, Badge, BadgeTier,
    Pattern, PatternType, CorrelationResult, MetricOption,
    WhatIfScenario, WhatIfResult, Milestone, MilestoneType,
    DailySnapshotData, TimelineDataPoint, TimelineInsight,
    CalendarHeatmapDay
} from '../types/analyticsTypes';
import * as ss from 'simple-statistics';

// ============================================
// STREAK DEFINITIONS
// ============================================

export const STREAK_DEFINITIONS: StreakDefinition[] = [
    {
        type: 'sleep_consistency',
        name: 'Sleep King',
        description: 'Sleep score above 80 for consecutive days',
        icon: 'crown',
        threshold: 80,
        minDays: 3,
        metric: 'sleep'
    },
    {
        type: 'readiness_streak',
        name: 'Ready Warrior',
        description: 'Readiness score above 75 for consecutive days',
        icon: 'zap',
        threshold: 75,
        minDays: 3,
        metric: 'readiness'
    },
    {
        type: 'step_goal',
        name: 'Step Champion',
        description: 'Hit 10,000 steps for consecutive days',
        icon: 'footprints',
        threshold: 10000,
        minDays: 3,
        metric: 'steps'
    },
    {
        type: 'early_bedtime',
        name: 'Early Bird',
        description: 'In bed before 11 PM for consecutive days',
        icon: 'moon',
        threshold: 23, // 11 PM in 24h
        minDays: 3,
        metric: 'bedtime'
    },
    {
        type: 'hrv_improvement',
        name: 'HRV Hero',
        description: 'HRV above personal average for consecutive days',
        icon: 'heart',
        threshold: 0, // Calculated dynamically
        minDays: 3,
        metric: 'hrv'
    }
];

// ============================================
// BADGE TIERS
// ============================================

export const BADGE_TIERS: Record<BadgeTier, { days: number; color: string }> = {
    bronze: { days: 7, color: '#CD7F32' },
    silver: { days: 14, color: '#C0C0C0' },
    gold: { days: 30, color: '#FFD700' },
    platinum: { days: 60, color: '#E5E4E2' }
};

// ============================================
// STREAK CALCULATIONS
// ============================================

export function calculateStreaks(
    data: DailyStats,
    userId: string,
    userName: string
): Streak[] {
    const streaks: Streak[] = [];

    for (const def of STREAK_DEFINITIONS) {
        const streak = calculateSingleStreak(data, def, userId, userName);
        if (streak) {
            streaks.push(streak);
        }
    }

    return streaks;
}

function calculateSingleStreak(
    data: DailyStats,
    definition: StreakDefinition,
    userId: string,
    userName: string
): Streak | null {
    let currentStreak = 0;
    let longestStreak = 0;
    let streakStart: string | null = null;
    let currentStreakStart: string | null = null;
    let isActive = false;

    // Get relevant data array sorted by date ascending
    const dataArray = getMetricArray(data, definition.metric);
    if (!dataArray.length) return null;

    const sortedData = [...dataArray].sort((a, b) =>
        new Date(a.day).getTime() - new Date(b.day).getTime()
    );

    // Calculate threshold for HRV (use personal average)
    let threshold = definition.threshold;
    if (definition.metric === 'hrv' && data.session?.length) {
        const hrvValues = data.session
            .filter(s => s.average_hrv != null)
            .map(s => s.average_hrv!);
        threshold = hrvValues.length ? ss.mean(hrvValues) : 0;
    }

    for (let i = 0; i < sortedData.length; i++) {
        const item = sortedData[i];
        const meetsThreshold = checkThreshold(item, definition.metric, threshold);

        if (meetsThreshold) {
            if (currentStreak === 0) {
                currentStreakStart = item.day;
            }
            currentStreak++;

            if (currentStreak > longestStreak) {
                longestStreak = currentStreak;
                streakStart = currentStreakStart;
            }

            // Check if this is the most recent day (active streak)
            if (i === sortedData.length - 1) {
                isActive = true;
            }
        } else {
            currentStreak = 0;
            currentStreakStart = null;
        }
    }

    if (longestStreak < definition.minDays) {
        return null;
    }

    // Calculate impact on trend during streak
    const impactOnTrend = calculateStreakImpact(data, streakStart!, longestStreak, definition.metric);

    return {
        id: `${userId}-${definition.type}`,
        type: definition.type,
        userId,
        userName,
        currentLength: isActive ? currentStreak : 0,
        longestLength: longestStreak,
        startDate: streakStart!,
        isActive,
        threshold,
        impactOnTrend,
        icon: definition.icon
    };
}

function getMetricArray(data: DailyStats, metric: string): Array<{ day: string;[key: string]: any }> {
    switch (metric) {
        case 'sleep': return data.sleep || [];
        case 'readiness': return data.readiness || [];
        case 'activity': return data.activity || [];
        case 'steps': return data.activity || [];
        case 'hrv': return data.session || [];
        case 'bedtime': return data.session || [];
        default: return [];
    }
}

function checkThreshold(item: any, metric: string, threshold: number): boolean {
    switch (metric) {
        case 'sleep':
        case 'readiness':
        case 'activity':
            return (item.score ?? 0) >= threshold;
        case 'steps':
            return (item.steps ?? 0) >= threshold;
        case 'hrv':
            return (item.average_hrv ?? 0) >= threshold;
        case 'bedtime':
            if (!item.bedtime_start) return false;
            const hour = new Date(item.bedtime_start).getHours();
            return hour < threshold || hour >= 22; // Before 11 PM
        default:
            return false;
    }
}

function calculateStreakImpact(
    data: DailyStats,
    startDate: string,
    length: number,
    metric: string
): number {
    // Compare average readiness during streak vs before streak
    const readiness = data.readiness || [];
    const startIdx = readiness.findIndex(r => r.day === startDate);

    if (startIdx < length) return 0;

    const duringStreak = readiness
        .slice(startIdx, startIdx + length)
        .filter(r => r.score != null)
        .map(r => r.score!);

    const beforeStreak = readiness
        .slice(Math.max(0, startIdx - length), startIdx)
        .filter(r => r.score != null)
        .map(r => r.score!);

    if (!duringStreak.length || !beforeStreak.length) return 0;

    const avgDuring = ss.mean(duringStreak);
    const avgBefore = ss.mean(beforeStreak);

    return ((avgDuring - avgBefore) / avgBefore) * 100;
}

// ============================================
// BADGE GENERATION
// ============================================

export function generateBadges(streaks: Streak[]): Badge[] {
    const badges: Badge[] = [];

    for (const streak of streaks) {
        const def = STREAK_DEFINITIONS.find(d => d.type === streak.type);
        if (!def) continue;

        for (const [tier, config] of Object.entries(BADGE_TIERS)) {
            const isUnlocked = streak.longestLength >= config.days;
            const progress = Math.min(100, (streak.longestLength / config.days) * 100);

            badges.push({
                id: `${streak.userId}-${streak.type}-${tier}`,
                name: `${def.name} (${tier.charAt(0).toUpperCase() + tier.slice(1)})`,
                description: `${config.days}-day ${def.description.toLowerCase()}`,
                icon: def.icon,
                tier: tier as BadgeTier,
                isUnlocked,
                progress,
                requirement: config.days,
                userId: streak.userId,
                streakType: streak.type
            });
        }
    }

    return badges;
}

// ============================================
// PATTERN DETECTION
// ============================================

export function detectPatterns(
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): Pattern[] {
    const patterns: Pattern[] = [];

    // Day of week patterns
    patterns.push(...detectDayOfWeekPatterns(usersData));

    // Activity-sleep correlations
    patterns.push(...detectActivitySleepPatterns(usersData));

    // Weekend effect
    patterns.push(...detectWeekendEffect(usersData));

    return patterns.filter(p => p.confidence >= 0.5);
}

function detectDayOfWeekPatterns(
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): Pattern[] {
    const patterns: Pattern[] = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const { userId, userName, data } of usersData) {
        // Group sleep scores by day of week
        const byDay: number[][] = [[], [], [], [], [], [], []];

        for (const sleep of data.sleep || []) {
            if (sleep.score == null) continue;
            const dayOfWeek = new Date(sleep.day).getDay();
            byDay[dayOfWeek].push(sleep.score);
        }

        const averages = byDay.map(scores => scores.length >= 3 ? ss.mean(scores) : null);
        const overallAvg = ss.mean(averages.filter((a): a is number => a !== null));

        for (let i = 0; i < 7; i++) {
            if (averages[i] === null) continue;

            const diff = ((averages[i]! - overallAvg) / overallAvg) * 100;

            if (Math.abs(diff) >= 10) { // At least 10% difference
                patterns.push({
                    id: `dow-sleep-${userId}-${i}`,
                    type: 'day_of_week',
                    title: `${dayNames[i]} Sleep Pattern`,
                    description: diff < 0
                        ? `${userName}'s sleep scores are ${Math.abs(diff).toFixed(0)}% lower on ${dayNames[i]}s`
                        : `${userName}'s sleep scores are ${diff.toFixed(0)}% higher on ${dayNames[i]}s`,
                    affectedUsers: [userId],
                    confidence: Math.min(1, byDay[i].length / 10),
                    impact: diff,
                    dayOfWeek: i,
                    metric: 'sleep',
                    tip: diff < 0
                        ? `Try improving ${dayNames[i === 0 ? 6 : i - 1]} evening routines`
                        : `Keep doing what works on ${dayNames[i === 0 ? 6 : i - 1]} evenings!`,
                    dataPoints: byDay[i].length,
                    discoveredAt: new Date().toISOString()
                });
            }
        }
    }

    return patterns;
}

function detectActivitySleepPatterns(
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): Pattern[] {
    const patterns: Pattern[] = [];

    for (const { userId, userName, data } of usersData) {
        const pairs: Array<{ steps: number; nextDaySleep: number }> = [];

        const sleepByDay = new Map(data.sleep?.map(s => [s.day, s.score]) || []);

        for (const activity of data.activity || []) {
            if (activity.steps == null) continue;

            const nextDay = new Date(activity.day);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = nextDay.toISOString().split('T')[0];
            const nextDaySleep = sleepByDay.get(nextDayStr);

            if (nextDaySleep != null) {
                pairs.push({ steps: activity.steps, nextDaySleep });
            }
        }

        if (pairs.length < 14) continue;

        // Split into high and low activity days
        const sortedBySteps = [...pairs].sort((a, b) => b.steps - a.steps);
        const topQuarter = sortedBySteps.slice(0, Math.floor(pairs.length / 4));
        const bottomQuarter = sortedBySteps.slice(-Math.floor(pairs.length / 4));

        const avgSleepHighActivity = ss.mean(topQuarter.map(p => p.nextDaySleep));
        const avgSleepLowActivity = ss.mean(bottomQuarter.map(p => p.nextDaySleep));
        const diff = ((avgSleepHighActivity - avgSleepLowActivity) / avgSleepLowActivity) * 100;

        if (Math.abs(diff) >= 5) {
            patterns.push({
                id: `activity-sleep-${userId}`,
                type: 'activity_sleep',
                title: diff > 0 ? 'High Activity → Better Sleep' : 'High Activity → Worse Sleep',
                description: diff > 0
                    ? `${userName} sleeps ${diff.toFixed(0)}% better after high-step days (>10k steps)`
                    : `${userName} sleeps ${Math.abs(diff).toFixed(0)}% worse after high-step days`,
                affectedUsers: [userId],
                confidence: Math.min(1, pairs.length / 30),
                impact: diff,
                metric: 'steps→sleep',
                tip: diff > 0
                    ? 'Keep up the active lifestyle for better sleep!'
                    : 'Try spacing intense workouts earlier in the day',
                dataPoints: pairs.length,
                discoveredAt: new Date().toISOString()
            });
        }
    }

    return patterns;
}

function detectWeekendEffect(
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): Pattern[] {
    const patterns: Pattern[] = [];

    for (const { userId, userName, data } of usersData) {
        const weekdayScores: number[] = [];
        const weekendScores: number[] = [];

        for (const sleep of data.sleep || []) {
            if (sleep.score == null) continue;
            const day = new Date(sleep.day).getDay();
            if (day === 0 || day === 6) {
                weekendScores.push(sleep.score);
            } else {
                weekdayScores.push(sleep.score);
            }
        }

        if (weekdayScores.length < 10 || weekendScores.length < 4) continue;

        const weekdayAvg = ss.mean(weekdayScores);
        const weekendAvg = ss.mean(weekendScores);
        const diff = ((weekendAvg - weekdayAvg) / weekdayAvg) * 100;

        if (Math.abs(diff) >= 5) {
            patterns.push({
                id: `weekend-effect-${userId}`,
                type: 'weekend_effect',
                title: diff > 0 ? 'Weekend Sleep Boost' : 'Weekend Sleep Dip',
                description: diff > 0
                    ? `${userName} sleeps ${diff.toFixed(0)}% better on weekends`
                    : `${userName} sleeps ${Math.abs(diff).toFixed(0)}% worse on weekends`,
                affectedUsers: [userId],
                confidence: Math.min(1, Math.min(weekdayScores.length, weekendScores.length) / 20),
                impact: diff,
                metric: 'sleep',
                tip: diff < 0
                    ? 'Try maintaining consistent sleep schedules on weekends'
                    : 'Weekends are working for you - can you replicate that routine?',
                dataPoints: weekdayScores.length + weekendScores.length,
                discoveredAt: new Date().toISOString()
            });
        }
    }

    return patterns;
}

// ============================================
// CORRELATION ANALYSIS
// ============================================

export function calculateCorrelation(
    metricX: MetricOption,
    metricY: MetricOption,
    dataX: DailyStats,
    dataY: DailyStats,
    dateRange?: { start: string; end: string }
): CorrelationResult {
    const xValues = extractMetricValues(dataX, metricX.metric, dateRange);
    const yValues = extractMetricValues(dataY, metricY.metric, dateRange);

    // Match by date
    const pairedData: Array<{ x: number; y: number; date: string }> = [];

    for (const xPoint of xValues) {
        const yPoint = yValues.find(y => y.date === xPoint.date);
        if (yPoint) {
            pairedData.push({ x: xPoint.value, y: yPoint.value, date: xPoint.date });
        }
    }

    if (pairedData.length < 7) {
        return {
            metricX,
            metricY,
            coefficient: 0,
            strength: 'none',
            direction: 'none',
            dataPoints: pairedData,
            insight: 'Not enough data to calculate correlation',
            sampleSize: pairedData.length
        };
    }

    const xArr = pairedData.map(p => p.x);
    const yArr = pairedData.map(p => p.y);

    const coefficient = ss.sampleCorrelation(xArr, yArr);
    const absCoef = Math.abs(coefficient);

    let strength: 'none' | 'weak' | 'moderate' | 'strong';
    if (absCoef < 0.3) strength = 'weak';
    else if (absCoef < 0.6) strength = 'moderate';
    else strength = 'strong';

    const direction = coefficient > 0.1 ? 'positive' : coefficient < -0.1 ? 'negative' : 'none';

    // Generate insight
    let insight = '';
    if (strength === 'strong' || strength === 'moderate') {
        const percentEffect = (coefficient * ss.standardDeviation(yArr) / ss.mean(yArr) * 100).toFixed(1);
        insight = direction === 'positive'
            ? `When ${metricX.userName}'s ${metricX.label} is high, ${metricY.userName}'s ${metricY.label} tends to be ${Math.abs(parseFloat(percentEffect))}% higher`
            : `When ${metricX.userName}'s ${metricX.label} is high, ${metricY.userName}'s ${metricY.label} tends to be ${Math.abs(parseFloat(percentEffect))}% lower`;
    } else {
        insight = `No significant correlation found between ${metricX.label} and ${metricY.label}`;
    }

    return {
        metricX,
        metricY,
        coefficient,
        strength,
        direction,
        dataPoints: pairedData,
        insight,
        sampleSize: pairedData.length
    };
}

function extractMetricValues(
    data: DailyStats,
    metric: string,
    dateRange?: { start: string; end: string }
): Array<{ date: string; value: number }> {
    const results: Array<{ date: string; value: number }> = [];

    const filterByDate = (day: string) => {
        if (!dateRange) return true;
        return day >= dateRange.start && day <= dateRange.end;
    };

    switch (metric) {
        case 'sleep_score':
            for (const s of data.sleep || []) {
                if (s.score != null && filterByDate(s.day)) {
                    results.push({ date: s.day, value: s.score });
                }
            }
            break;
        case 'readiness_score':
            for (const r of data.readiness || []) {
                if (r.score != null && filterByDate(r.day)) {
                    results.push({ date: r.day, value: r.score });
                }
            }
            break;
        case 'activity_score':
            for (const a of data.activity || []) {
                if (a.score != null && filterByDate(a.day)) {
                    results.push({ date: a.day, value: a.score });
                }
            }
            break;
        case 'steps':
            for (const a of data.activity || []) {
                if (a.steps != null && filterByDate(a.day)) {
                    results.push({ date: a.day, value: a.steps });
                }
            }
            break;
        case 'hrv':
            for (const s of data.session || []) {
                if (s.average_hrv != null && filterByDate(s.day)) {
                    results.push({ date: s.day, value: s.average_hrv });
                }
            }
            break;
        case 'resting_hr':
            for (const s of data.session || []) {
                if (s.lowest_heart_rate != null && filterByDate(s.day)) {
                    results.push({ date: s.day, value: s.lowest_heart_rate });
                }
            }
            break;
        case 'deep_sleep':
            for (const s of data.session || []) {
                if (s.deep_sleep_duration != null && filterByDate(s.day)) {
                    results.push({ date: s.day, value: s.deep_sleep_duration / 60 }); // Convert to minutes
                }
            }
            break;
    }

    return results;
}

// ============================================
// WHAT-IF SIMULATOR
// ============================================

export function simulateWhatIf(
    scenario: WhatIfScenario,
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): WhatIfResult[] {
    const results: WhatIfResult[] = [];

    for (const { userId, userName, data } of usersData) {
        const result = simulateForUser(scenario, userId, userName, data);
        if (result) {
            results.push(result);
        }
    }

    return results.sort((a, b) => b.projectedChange - a.projectedChange);
}

function simulateForUser(
    scenario: WhatIfScenario,
    userId: string,
    userName: string,
    data: DailyStats
): WhatIfResult | null {
    // Get the metric values and corresponding next-day readiness
    const pairs: Array<{ metric: number; readiness: number }> = [];

    const readinessByDay = new Map(
        (data.readiness || []).map(r => [r.day, r.score])
    );

    const metricValues = getScenarioMetricValues(data, scenario.metric);

    for (const { day, value } of metricValues) {
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0];
        const readiness = readinessByDay.get(nextDayStr);

        if (readiness != null) {
            pairs.push({ metric: value, readiness });
        }
    }

    if (pairs.length < 14) return null;

    // Calculate linear regression
    const x = pairs.map(p => p.metric);
    const y = pairs.map(p => p.readiness);

    const regression = ss.linearRegression(pairs.map(p => [p.metric, p.readiness]));
    const currentAvg = ss.mean(x);
    const currentReadiness = ss.mean(y);

    // Project the change
    const newMetricValue = currentAvg + scenario.adjustment;
    const projectedReadiness = regression.m * newMetricValue + regression.b;
    const projectedChange = projectedReadiness - currentReadiness;

    // Calculate confidence (standard error)
    const residuals = pairs.map(p => {
        const predicted = regression.m * p.metric + regression.b;
        return p.readiness - predicted;
    });
    const confidence = ss.standardDeviation(residuals);

    return {
        userId,
        userName,
        scenario,
        projectedChange,
        confidence,
        basedOnDays: pairs.length,
        currentBaseline: currentReadiness
    };
}

function getScenarioMetricValues(
    data: DailyStats,
    metric: string
): Array<{ day: string; value: number }> {
    const results: Array<{ day: string; value: number }> = [];

    switch (metric) {
        case 'deep_sleep':
            for (const s of data.session || []) {
                if (s.deep_sleep_duration != null) {
                    results.push({ day: s.day, value: s.deep_sleep_duration / 60 }); // minutes
                }
            }
            break;
        case 'steps':
            for (const a of data.activity || []) {
                if (a.steps != null) {
                    results.push({ day: a.day, value: a.steps });
                }
            }
            break;
        case 'hrv':
            for (const s of data.session || []) {
                if (s.average_hrv != null) {
                    results.push({ day: s.day, value: s.average_hrv });
                }
            }
            break;
        case 'sleep_duration':
            for (const s of data.session || []) {
                if (s.total_sleep_duration != null) {
                    results.push({ day: s.day, value: s.total_sleep_duration / 60 }); // minutes
                }
            }
            break;
    }

    return results;
}

// ============================================
// MILESTONES
// ============================================

export function calculateMilestones(
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): Milestone[] {
    const milestones: Milestone[] = [];
    const milestoneDays = [30, 100, 365, 500, 1000];
    const sleepHourMilestones = [100, 500, 1000, 2500, 5000];
    const stepMilestones = [1000000, 5000000, 10000000]; // Total steps

    for (const { userId, userName, data } of usersData) {
        // Days tracked
        const daysTracked = new Set([
            ...(data.sleep || []).map(s => s.day),
            ...(data.readiness || []).map(r => r.day),
            ...(data.activity || []).map(a => a.day)
        ]).size;

        for (const target of milestoneDays) {
            milestones.push({
                id: `days-${userId}-${target}`,
                type: 'days_tracked',
                name: `${target} Days Tracked`,
                description: `Track your health for ${target} consecutive days`,
                icon: target >= 365 ? 'trophy' : target >= 100 ? 'target' : 'calendar',
                value: daysTracked,
                target,
                isAchieved: daysTracked >= target,
                userId
            });
        }

        // Total sleep hours
        const totalSleepHours = (data.session || [])
            .filter(s => s.total_sleep_duration != null)
            .reduce((sum, s) => sum + (s.total_sleep_duration || 0) / 3600, 0);

        for (const target of sleepHourMilestones) {
            milestones.push({
                id: `sleep-hours-${userId}-${target}`,
                type: 'total_sleep_hours',
                name: `${target} Hours Slept`,
                description: `Accumulate ${target} total hours of sleep`,
                icon: target >= 2500 ? 'sleep' : 'bed',
                value: Math.round(totalSleepHours),
                target,
                isAchieved: totalSleepHours >= target,
                userId
            });
        }
    }

    // Group milestones
    const combinedSleepHours = usersData.reduce((sum, { data }) => {
        return sum + (data.session || [])
            .filter(s => s.total_sleep_duration != null)
            .reduce((s, session) => s + (session.total_sleep_duration || 0) / 3600, 0);
    }, 0);

    for (const target of sleepHourMilestones.map(t => t * usersData.length)) {
        milestones.push({
            id: `group-sleep-hours-${target}`,
            type: 'total_sleep_hours',
            name: `Group: ${target} Hours Slept`,
            description: `Combined sleep hours across all users`,
            icon: 'users',
            value: Math.round(combinedSleepHours),
            target,
            isAchieved: combinedSleepHours >= target
        });
    }

    return milestones;
}

// ============================================
// CALENDAR HEATMAP DATA
// ============================================

export function generateCalendarHeatmap(
    data: DailyStats,
    metric: 'sleep' | 'readiness' | 'activity' | 'average' = 'average'
): CalendarHeatmapDay[] {
    const days: CalendarHeatmapDay[] = [];
    const scoreMap = new Map<string, { sleep?: number; readiness?: number; activity?: number }>();

    for (const s of data.sleep || []) {
        const existing = scoreMap.get(s.day) || {};
        existing.sleep = s.score ?? undefined;
        scoreMap.set(s.day, existing);
    }

    for (const r of data.readiness || []) {
        const existing = scoreMap.get(r.day) || {};
        existing.readiness = r.score ?? undefined;
        scoreMap.set(r.day, existing);
    }

    for (const a of data.activity || []) {
        const existing = scoreMap.get(a.day) || {};
        existing.activity = a.score ?? undefined;
        scoreMap.set(a.day, existing);
    }

    for (const [date, scores] of scoreMap) {
        let value: number;
        if (metric === 'average') {
            const vals = [scores.sleep, scores.readiness, scores.activity].filter((v): v is number => v != null);
            value = vals.length ? ss.mean(vals) : 0;
        } else {
            value = scores[metric] ?? 0;
        }

        days.push({ date, value, metric });
    }

    return days.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================
// DAILY SNAPSHOT
// ============================================

export function generateDailySnapshot(
    date: string,
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): DailySnapshotData {
    const users: DailySnapshotData['users'] = [];
    const highlights: DailySnapshotData['highlights'] = [];

    for (const { userId, userName, data } of usersData) {
        const sleep = data.sleep?.find(s => s.day === date)?.score ?? 0;
        const readiness = data.readiness?.find(r => r.day === date)?.score ?? 0;
        const activity = data.activity?.find(a => a.day === date)?.score ?? 0;
        const activityData = data.activity?.find(a => a.day === date);
        const sessionData = data.session?.find(s => s.day === date);

        users.push({
            userId,
            userName,
            sleep,
            readiness,
            activity,
            average: Math.round((sleep + readiness + activity) / 3),
            steps: activityData?.steps,
            sleepDuration: sessionData?.total_sleep_duration
        });
    }

    // Determine winners
    const categories = ['sleep', 'readiness', 'activity', 'steps'] as const;

    for (const category of categories) {
        const sorted = [...users].sort((a, b) => {
            const aVal = category === 'steps' ? (a.steps ?? 0) : a[category];
            const bVal = category === 'steps' ? (b.steps ?? 0) : b[category];
            return bVal - aVal;
        });

        if (sorted.length >= 2) {
            const first = sorted[0];
            const second = sorted[1];
            const firstVal = category === 'steps' ? (first.steps ?? 0) : first[category];
            const secondVal = category === 'steps' ? (second.steps ?? 0) : second[category];

            if (firstVal === secondVal) {
                highlights.push({
                    type: 'tie',
                    category,
                    description: `Tie in ${category}!`
                });
            } else {
                highlights.push({
                    type: 'winner',
                    category,
                    winnerId: first.userId,
                    winnerName: first.userName,
                    value: firstVal,
                    description: `${first.userName} won ${category}`
                });
            }
        }
    }

    return {
        date,
        users,
        highlights,
        createdAt: new Date().toISOString(),
        isPinned: false
    };
}

// ============================================
// TIMELINE DATA
// ============================================

export function generateTimelineData(
    date: string,
    usersData: Array<{ userId: string; userName: string; data: DailyStats }>
): { dataPoints: TimelineDataPoint[]; insights: TimelineInsight[] } {
    const dataPoints: TimelineDataPoint[] = [];
    const insights: TimelineInsight[] = [];

    const sleepTimes: Array<{ userId: string; userName: string; start?: Date; end?: Date }> = [];

    for (const { userId, userName, data } of usersData) {
        const session = data.session?.find(s => s.day === date);

        if (session?.bedtime_start) {
            const start = new Date(session.bedtime_start);
            sleepTimes.push({ userId, userName, start, end: session.bedtime_end ? new Date(session.bedtime_end) : undefined });

            dataPoints.push({
                timestamp: session.bedtime_start,
                hour: start.getHours(),
                minute: start.getMinutes(),
                userId,
                userName,
                type: 'sleep_start',
                label: 'Fell asleep'
            });
        }

        if (session?.bedtime_end) {
            const end = new Date(session.bedtime_end);
            dataPoints.push({
                timestamp: session.bedtime_end,
                hour: end.getHours(),
                minute: end.getMinutes(),
                userId,
                userName,
                type: 'sleep_end',
                label: 'Woke up'
            });
        }
    }

    // Generate sleep timing insights
    if (sleepTimes.length >= 2 && sleepTimes[0].start && sleepTimes[1].start) {
        const diff = Math.abs(sleepTimes[0].start.getTime() - sleepTimes[1].start.getTime()) / 60000; // minutes
        const earlier = sleepTimes[0].start < sleepTimes[1].start ? sleepTimes[0] : sleepTimes[1];
        const later = sleepTimes[0].start < sleepTimes[1].start ? sleepTimes[1] : sleepTimes[0];

        if (diff >= 15) {
            insights.push({
                type: 'sleep_timing',
                description: `${earlier.userName} fell asleep ${Math.round(diff)} minutes earlier than ${later.userName}`,
                difference: Math.round(diff)
            });
        }
    }

    return { dataPoints, insights };
}

// Export all utilities
export const analyticsService = {
    calculateStreaks,
    generateBadges,
    detectPatterns,
    calculateCorrelation,
    simulateWhatIf,
    calculateMilestones,
    generateCalendarHeatmap,
    generateDailySnapshot,
    generateTimelineData,
    STREAK_DEFINITIONS,
    BADGE_TIERS
};

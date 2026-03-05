// Analytics Service - Statistical calculations and pattern detection

import {
    DailyStats, DailySleep, DailyReadiness, DailyActivity, SleepSession
} from '../types';
import {
    Streak, StreakType, StreakDefinition, Badge, BadgeTier,
    Pattern, PatternType, CorrelationResult, MetricOption,
    WhatIfScenario, WhatIfResult, WhatIfReliability, WhatIfTargetScore, Milestone, MilestoneType,
    DailySnapshotData, TimelineDataPoint, TimelineInsight,
    CalendarHeatmapDay, UserChallenge, ChallengeDefinition, ChallengeStatus, AutomatedInsight
} from '../types/analyticsTypes';
import * as ss from 'simple-statistics';
import {
    formatLocalISODate,
    getISODateWeekday,
    parseLocalISODate,
    shiftLocalISODate,
} from '../utils/date';

// ============================================
// CHALLENGE DEFINITIONS
// ============================================

export const CHALLENGE_DEFINITIONS: ChallengeDefinition[] = [
    {
        id: 'sleep_week',
        type: 'sleep_consistency',
        name: 'Sleep Week',
        description: 'Get a Sleep Score above 85 for 7 consecutive days.',
        icon: 'crown',
        durationDays: 7,
        threshold: 85,
        metric: 'sleep'
    },
    {
        id: 'activity_blitz',
        type: 'step_goal',
        name: 'Activity Blitz',
        description: 'Hit 12,000 steps for 3 days in a row.',
        icon: 'footprints',
        durationDays: 3,
        threshold: 12000,
        metric: 'steps'
    },
    {
        id: 'readiness_reboot',
        type: 'readiness_streak',
        name: 'Readiness Reboot',
        description: 'Keep Readiness above 80 for 5 days.',
        icon: 'zap',
        durationDays: 5,
        threshold: 80,
        metric: 'readiness'
    },
    {
        id: 'early_bird_challenge',
        type: 'early_bedtime',
        name: 'Early Bird Special',
        description: 'Go to bed before 10 PM for 5 nights.',
        icon: 'moon',
        durationDays: 5,
        threshold: 22,
        metric: 'bedtime'
    }
];

// ============================================
// CHALLENGE LOGIC
// ============================================

export function checkChallengeProgress(
    challenge: UserChallenge,
    data: DailyStats
): UserChallenge {
    if (challenge.status !== 'active') return challenge;

    const def = CHALLENGE_DEFINITIONS.find(d => d.id === challenge.challengeId);
    if (!def) return challenge;

    const updatedHistory = { ...challenge.history };
    let consecutiveDays = 0;
    let maxConsecutive = 0;
    let isFailed = false;

    // Iterate through dates from startDate to today (or endDate)
    if (!parseLocalISODate(challenge.startDate)) return challenge;

    const today = formatLocalISODate();
    const maxEndDate = shiftLocalISODate(challenge.startDate, def.durationDays - 1);
    const checkUntil = today < maxEndDate ? today : maxEndDate;

    for (let dateStr = challenge.startDate; dateStr <= checkUntil; dateStr = shiftLocalISODate(dateStr, 1)) {

        // Skip if already recorded (unless we want to re-verify, but for now trust history if present)
        // Actually, we should re-verify if data might have synced late.

        const metricValue = getMetricValueForDate(data, def.metric, dateStr);
        let success = false;

        if (metricValue !== null) {
            if (def.type === 'early_bedtime') {
                // Special case for bedtime: must be < threshold OR >= 22 (meaning 10PM, so technically > 22 if threshold is 22? No, < 22 is earlier) 
                // Wait, 10 PM is 22:00. 
                // "Before 10 PM" means hour < 22. But bedtime is usually late.
                // 22:00, 23:00, 00:00, 01:00.
                // If threshold is 22 (10 PM). 
                // success if hour < 22 (e.g. 21) OR hour > 4 (next morning? No bedtime is usually evening).
                // Let's assume standard logic: < threshold. But 01:00 is < 22.
                // Usually bedtimes are 18:00 - 06:00.
                // Let's use logic: if hour >= 18 and hour < threshold. Or hour < 4 (very late/early).
                // Simple logic from `checkThreshold` earlier: `hour < threshold || hour >= 22` was for "Before 11 PM".
                // If threshold is 22. We want < 22.
                // What if bedtime is 23:00? > 22. Fail.
                // What if bedtime is 01:00? < 22. But that's LATE.
                // We need to handle the day wrap.
                // Let's use the helper `checkThreshold` if possible, but we don't have the `item` here, just value.
                // Let's replicate logic: < threshold means *earlier* than threshold?
                // If threshold is 22 (10 PM). 
                // 21:00 is OK. 23:00 is Bad. 01:00 is Bad.
                // 01:00 is numerically < 22.
                // We need to treat 0-4 as "High numbers" effectively.
                // Adjusted hour: if hour < 12, hour += 24.
                // 21 -> 21. 22 -> 22. 23 -> 23. 00 -> 24. 01 -> 25.
                // Threshold 22.
                // 21 < 22 (Pass). 23 > 22 (Fail). 24 > 22 (Fail).
                const adjHour = metricValue < 12 ? metricValue + 24 : metricValue;
                // Threshold also needs logic? If threshold is 22.
                success = adjHour < def.threshold;
            } else {
                success = metricValue >= def.threshold;
            }
        }

        updatedHistory[dateStr] = success;

        if (success) {
            consecutiveDays++;
        } else {
            // Include today in the failure check only if data exists. 
            // If data is missing (null), is it a fail?
            // Usually yes, for a "streak".
            // But if it's "today" and data hasn't synced, we shouldn't fail yet.
            if (dateStr === today && metricValue === null) {
                // Today, no data yet. Don't count as fail, but break streak calculation?
                // Actually, just ignore for now.
            } else {
                // Past day or today with data that failed.
                consecutiveDays = 0;
            }
        }

        maxConsecutive = Math.max(maxConsecutive, consecutiveDays);
    }

    // Determine Status
    // If we missed a day in the *past*, and it acts as a streak reset, can we still complete it?
    // "7 consecutive days". If we are at day 4 and miss one, we reset to 0.
    // Can we finish? Any 7 day window?
    // "Get ... for 7 consecutive days".
    // Usually challenges have a fixed duration e.g. "This Week".
    // Or is it "Start a 7 day challenge"? 
    // If I start today, I have 7 days to do it.
    // If I miss day 2, I fail the challenge.
    // Yes, let's go with "Strict Streak" for now.

    // Check for failure: Any `false` in history *before* today?
    // Or simpler: check if we have enough days left to finish?
    // If I need 7 days. I am on day 3. I missed day 2.
    // I can never get 7 consecutive days within a 7 day window.

    // So: Status is completed if all days in duration are success.
    // Failed if any day is failure (assuming strict consecutive).

    // Let's refine: The user starts a challenge. The clock starts.
    // They must maintain the streak for `durationDays`.
    // Day 1: Success. Day 2: Fail. -> Challenge Failed.

    const sortedDates = Object.keys(updatedHistory).sort();
    let currentStreak = 0;

    for (const d of sortedDates) {
        if (updatedHistory[d]) {
            currentStreak++;
        } else {
            // Failure!
            if (d < today || (d === today && getMetricValueForDate(data, def.metric, d) !== null)) {
                // Only fail if it's a confirmed failure (past or present with data)
                isFailed = true;
            }
            // Reset logic if we allowed retries, but we don't.
        }
    }

    let status: ChallengeStatus = 'active';
    if (currentStreak >= def.durationDays) {
        status = 'completed';
    } else if (isFailed) {
        status = 'failed';
    }

    return {
        ...challenge,
        progress: currentStreak,
        history: updatedHistory,
        status
    };
}

function getMetricValueForDate(data: DailyStats, metric: string, date: string): number | null {
    const array = getMetricArray(data, metric);
    const item = array.find(i => i.day === date);
    if (!item) return null;
    return getMetricValue(item, metric);
}


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
    const dataArray = getMetricArray(data, definition.metric);
    if (!dataArray.length) return null;

    const sortedData = [...dataArray].sort((a, b) =>
        new Date(a.day).getTime() - new Date(b.day).getTime()
    );
    if (!sortedData.length) return null;

    // Track current run and all-time record separately so the UI can display both clearly.
    let currentDates: string[] = [];
    let longestDates: string[] = [];
    let currentValues: number[] = [];
    let longestValues: number[] = [];
    let previousDay: string | null = null;

    // Calculate threshold for HRV (use personal average)
    let threshold = definition.threshold;
    if (definition.metric === 'hrv' && data.session?.length) {
        const hrvValues = data.session
            .filter(s => s.average_hrv != null)
            .map(s => s.average_hrv!);
        threshold = hrvValues.length ? ss.mean(hrvValues) : 0;
    }

    for (const item of sortedData) {
        if (previousDay && getDateDiffInDays(previousDay, item.day) > 1) {
            currentDates = [];
            currentValues = [];
        }

        const meetsThreshold = checkThreshold(item, definition.metric, threshold);
        const value = getMetricValue(item, definition.metric);

        if (meetsThreshold) {
            currentDates.push(item.day);
            if (value !== null) currentValues.push(value);

            if (currentDates.length > longestDates.length) {
                longestDates = [...currentDates];
                longestValues = [...currentValues];
            }
        } else {
            currentDates = [];
            currentValues = [];
        }

        previousDay = item.day;
    }

    if (longestDates.length < definition.minDays) {
        return null;
    }

    const mostRecentTrackedDay = sortedData[sortedData.length - 1].day;
    const isActive = currentDates.length > 0 && currentDates[currentDates.length - 1] === mostRecentTrackedDay;
    const activeDates = isActive ? [...currentDates] : [];
    const impactSourceDates = activeDates.length >= definition.minDays ? activeDates : longestDates;
    const impactOnTrend = calculateStreakImpact(data, impactSourceDates);

    const avgValue = longestValues.length ? ss.mean(longestValues) : undefined;

    return {
        id: `${userId}-${definition.type}`,
        type: definition.type,
        userId,
        userName,
        currentLength: activeDates.length,
        longestLength: longestDates.length,
        startDate: longestDates[0],
        endDate: longestDates[longestDates.length - 1],
        isActive,
        dates: longestDates,
        currentDates: activeDates,
        longestDates: [...longestDates],
        currentStartDate: activeDates[0],
        currentEndDate: activeDates[activeDates.length - 1],
        longestStartDate: longestDates[0],
        longestEndDate: longestDates[longestDates.length - 1],
        avgValue,
        threshold,
        impactOnTrend,
        icon: definition.icon
    };
}

function getMetricValue(item: any, metric: string): number | null {
    switch (metric) {
        case 'sleep':
        case 'readiness':
        case 'activity':
            return item.score ?? null;
        case 'steps':
            return item.steps ?? null;
        case 'hrv':
            return item.average_hrv ?? null;
        case 'bedtime':
            if (!item.bedtime_start) return null;
            return normalizeBedtimeHour(new Date(item.bedtime_start).getHours());
        default:
            return null;
    }
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
            return normalizeBedtimeHour(new Date(item.bedtime_start).getHours()) < threshold;
        default:
            return false;
    }
}

function normalizeBedtimeHour(hour: number): number {
    return hour < 12 ? hour + 24 : hour;
}

function getDateDiffInDays(dayA: string, dayB: string): number {
    const a = new Date(`${dayA}T00:00:00Z`).getTime();
    const b = new Date(`${dayB}T00:00:00Z`).getTime();
    return Math.round((b - a) / 86400000);
}

function calculateStreakImpact(
    data: DailyStats,
    streakDates: string[]
): number {
    if (!streakDates.length) return 0;

    // Compare average readiness during streak vs the same number of prior readiness days.
    const readiness = [...(data.readiness || [])]
        .filter(r => r.score != null)
        .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());
    if (!readiness.length) return 0;

    const streakSet = new Set(streakDates);
    const duringStreak = readiness
        .filter(r => streakSet.has(r.day))
        .map(r => r.score!);
    if (!duringStreak.length) return 0;

    const startIdx = readiness.findIndex(r => r.day === streakDates[0]);
    if (startIdx <= 0) return 0;

    const beforeStreak = readiness
        .slice(Math.max(0, startIdx - duringStreak.length), startIdx)
        .map(r => r.score!);

    if (!duringStreak.length || !beforeStreak.length) return 0;

    const avgDuring = ss.mean(duringStreak);
    const avgBefore = ss.mean(beforeStreak);
    if (avgBefore === 0) return 0;

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
            const dayOfWeek = getISODateWeekday(sleep.day);
            if (dayOfWeek == null) continue;
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

            const nextDayStr = shiftLocalISODate(activity.day, 1);
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
            const day = getISODateWeekday(sleep.day);
            if (day == null) continue;
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
        case 'rem_sleep':
            for (const s of data.session || []) {
                if (s.rem_sleep_duration != null && filterByDate(s.day)) {
                    results.push({ date: s.day, value: s.rem_sleep_duration / 60 }); // Convert to minutes
                }
            }
            break;
        case 'active_calories':
            for (const a of data.activity || []) {
                if (a.active_calories != null && filterByDate(a.day)) {
                    results.push({ date: a.day, value: a.active_calories });
                }
            }
            break;
        case 'bedtime':
            for (const s of data.session || []) {
                if (s.bedtime_start && filterByDate(s.day)) {
                    const hr = new Date(s.bedtime_start).getHours();
                    // Adjust hour so 0-4 AM are treated as 24-28 (late bedtimes)
                    const adjHr = hr < 12 ? hr + 24 : hr;
                    results.push({ date: s.day, value: adjHr });
                }
            }
            break;
        case 'body_temp':
            for (const r of data.readiness || []) {
                if (r.temperature_deviation != null && filterByDate(r.day)) {
                    results.push({ date: r.day, value: r.temperature_deviation });
                }
            }
            break;
    }

    return results;
}

export function generateAutomatedInsights(data: DailyStats, userId: string, userName: string): AutomatedInsight[] {
    const insights: AutomatedInsight[] = [];

    // Define a comprehensive list of metrics we want to test
    const availableMetrics: MetricOption[] = [
        { userId, userName, metric: 'sleep_score', label: 'Sleep Score' },
        { userId, userName, metric: 'readiness_score', label: 'Readiness Score' },
        { userId, userName, metric: 'activity_score', label: 'Activity Score' },
        { userId, userName, metric: 'steps', label: 'Steps' },
        { userId, userName, metric: 'hrv', label: 'HRV' },
        { userId, userName, metric: 'resting_hr', label: 'Resting HR' },
        { userId, userName, metric: 'deep_sleep', label: 'Deep Sleep (min)' },
        { userId, userName, metric: 'rem_sleep', label: 'REM Sleep (min)' },
        { userId, userName, metric: 'bedtime', label: 'Bedtime Hour' },
        { userId, userName, metric: 'active_calories', label: 'Active Calories' },
        { userId, userName, metric: 'body_temp', label: 'Body Temp Deviation' }
    ];

    // Filter out obvious/trivial correlations (e.g., Active Calories vs Steps = basically the same thing)
    const trivialPairs = [
        'steps-active_calories',
        'steps-activity_score',
        'active_calories-activity_score',
        'sleep_score-deep_sleep',
        'sleep_score-rem_sleep',
        'deep_sleep-rem_sleep'
    ];

    // Calculate correlation for every unique pair
    for (let i = 0; i < availableMetrics.length; i++) {
        for (let j = i + 1; j < availableMetrics.length; j++) {
            const metricX = availableMetrics[i];
            const metricY = availableMetrics[j];

            const pairKey1 = `${metricX.metric}-${metricY.metric}`;
            const pairKey2 = `${metricY.metric}-${metricX.metric}`;

            if (trivialPairs.includes(pairKey1) || trivialPairs.includes(pairKey2)) continue;

            const correlation = calculateCorrelation(metricX, metricY, data, data);

            // Only keep moderate or strong correlations
            if (correlation.strength === 'moderate' || correlation.strength === 'strong') {

                // Determine insight type based on the metrics and direction
                let insightType: 'positive_habit' | 'negative_habit' | 'neutral_observation' = 'neutral_observation';

                const isGoodX = isMetricPositive(metricX.metric);
                const isGoodY = isMetricPositive(metricY.metric);

                if (correlation.direction === 'positive') {
                    if (isGoodX && isGoodY) insightType = 'positive_habit';
                    else if (!isGoodX && !isGoodY) insightType = 'negative_habit';
                } else if (correlation.direction === 'negative') {
                    if (isGoodX && !isGoodY) insightType = 'positive_habit'; // Good goes up, bad goes down
                    else if (!isGoodX && isGoodY) insightType = 'negative_habit'; // Bad goes up, good goes down
                }

                const yValues = correlation.dataPoints.map(p => p.y);
                const percentEffect = (correlation.coefficient * ss.standardDeviation(yValues) / ss.mean(yValues) * 100).toFixed(1);

                let title = '';
                let description = '';

                if (correlation.direction === 'positive') {
                    title = `Higher ${metricX.label} = Higher ${metricY.label}`;
                    description = `When you push your ${metricX.label} higher, your ${metricY.label} sees a typical boost of ${Math.abs(parseFloat(percentEffect))}%.`;
                } else {
                    title = `Higher ${metricX.label} = Lower ${metricY.label}`;
                    description = `When your ${metricX.label} goes up, your ${metricY.label} tends to drop by about ${Math.abs(parseFloat(percentEffect))}%.`;
                }

                insights.push({
                    id: `insight-${metricX.metric}-${metricY.metric}`,
                    title,
                    description,
                    metricXLabel: metricX.label,
                    metricYLabel: metricY.label,
                    metricXKey: metricX.metric,
                    metricYKey: metricY.metric,
                    strength: correlation.strength as 'moderate' | 'strong',
                    direction: correlation.direction as 'positive' | 'negative',
                    coefficient: correlation.coefficient,
                    sampleSize: correlation.sampleSize,
                    type: insightType,
                    correlationData: correlation
                });
            }
        }
    }

    // Sort by absolute correlation strength (strongest first)
    return insights.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
}

// Helper to determine if a higher value for a metric is generally "good"
function isMetricPositive(metricKey: string): boolean {
    const positiveMetrics = ['sleep_score', 'readiness_score', 'activity_score', 'steps', 'hrv', 'deep_sleep', 'rem_sleep', 'active_calories'];
    return positiveMetrics.includes(metricKey);
}

// ============================================
// WHAT-IF SIMULATOR
// ============================================

const READINESS_MIN_SCORE = 0;
const READINESS_MAX_SCORE = 100;
const WHAT_IF_MIN_DAYS = 14;
const WHAT_IF_DEFAULT_LOOKBACK_DAYS = 120;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const toUtcDayMs = (day: string): number => new Date(`${day}T12:00:00Z`).getTime();

const winsorize = (values: number[], trimPercent: number): number[] => {
    if (values.length === 0) return [];
    const safeTrim = clamp(trimPercent, 0, 0.2);
    if (safeTrim === 0) return [...values];

    const sorted = [...values].sort((a, b) => a - b);
    const low = ss.quantileSorted(sorted, safeTrim);
    const high = ss.quantileSorted(sorted, 1 - safeTrim);
    return values.map((value) => clamp(value, low, high));
};

const getReliability = (sampleSize: number, rSquared: number, ciHalfWidth: number): WhatIfReliability => {
    if (sampleSize >= 60 && rSquared >= 0.35 && ciHalfWidth <= 2) return 'high';
    if (sampleSize >= 30 && rSquared >= 0.15 && ciHalfWidth <= 4) return 'medium';
    return 'low';
};

const getTargetScoresByDay = (data: DailyStats, targetScore: WhatIfTargetScore): Map<string, number> => {
    const scoresByDay = new Map<string, number>();
    const add = (day: string, score: number | null | undefined) => {
        if (score == null) return;
        scoresByDay.set(day, score);
    };

    switch (targetScore) {
        case 'readiness':
            for (const item of data.readiness || []) {
                add(item.day, item.score);
            }
            break;
        case 'sleep':
            for (const item of data.sleep || []) {
                add(item.day, item.score);
            }
            break;
        case 'activity':
            for (const item of data.activity || []) {
                add(item.day, item.score);
            }
            break;
    }

    return scoresByDay;
};

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

    return results.sort((a, b) => {
        const reliabilityOrder: Record<WhatIfReliability, number> = { high: 3, medium: 2, low: 1 };
        const reliabilityDelta = reliabilityOrder[b.reliability] - reliabilityOrder[a.reliability];
        if (reliabilityDelta !== 0) return reliabilityDelta;
        return b.projectedChange - a.projectedChange;
    });
}

function simulateForUser(
    scenario: WhatIfScenario,
    userId: string,
    userName: string,
    data: DailyStats
): WhatIfResult | null {
    const targetScore: WhatIfTargetScore = scenario.targetScore || 'readiness';
    const allPairs: Array<{ day: string; metric: number; target: number }> = [];
    const targetByDay = getTargetScoresByDay(data, targetScore);

    const metricValues = getScenarioMetricValues(data, scenario.metric);

    for (const { day, value } of metricValues) {
        const nextDayStr = shiftLocalISODate(day, 1);
        const targetValue = targetByDay.get(nextDayStr);

        if (targetValue != null) {
            allPairs.push({ day, metric: value, target: targetValue });
        }
    }

    const lookbackDays = scenario.lookbackDays === 'all'
        ? 'all'
        : (scenario.lookbackDays ?? WHAT_IF_DEFAULT_LOOKBACK_DAYS);

    const pairs = (() => {
        if (allPairs.length === 0 || lookbackDays === 'all' || lookbackDays <= 0) return [...allPairs];
        const latestDayMs = allPairs.reduce((maxMs, pair) => Math.max(maxMs, toUtcDayMs(pair.day)), 0);
        const cutoffMs = latestDayMs - ((lookbackDays - 1) * 86_400_000);
        return allPairs.filter(pair => toUtcDayMs(pair.day) >= cutoffMs);
    })();

    if (pairs.length < WHAT_IF_MIN_DAYS) return null;

    const trimPercent = scenario.outlierTrimPercent ?? 0.05;
    const winsorizedMetrics = winsorize(pairs.map(p => p.metric), trimPercent);
    const winsorizedTarget = winsorize(pairs.map(p => p.target), trimPercent);
    const modelPairs = pairs.map((pair, idx) => ({
        day: pair.day,
        metric: winsorizedMetrics[idx],
        target: winsorizedTarget[idx]
    }));

    const x = modelPairs.map(p => p.metric);
    const y = modelPairs.map(p => p.target);

    const xMean = ss.mean(x);
    const sxx = x.reduce((sum, value) => sum + Math.pow(value - xMean, 2), 0);
    if (sxx <= 1e-6) return null;

    const samples = modelPairs.map(p => [p.metric, p.target] as [number, number]);
    const regression = ss.linearRegression(samples);
    const regressionLine = ss.linearRegressionLine(regression);

    const currentMetricAverage = xMean;
    const currentBaseline = ss.mean(y);
    const adjustedMetricValue = currentMetricAverage + scenario.adjustment;
    const projectedScoreRaw = regressionLine(adjustedMetricValue);
    const projectedScore = clamp(projectedScoreRaw, READINESS_MIN_SCORE, READINESS_MAX_SCORE);
    const projectedChange = projectedScore - currentBaseline;
    const isCapped = projectedScoreRaw !== projectedScore;

    let correlation = 0;
    try {
        correlation = ss.sampleCorrelation(x, y);
    } catch {
        correlation = 0;
    }
    const rawRSquared = ss.rSquared(samples, regressionLine);
    const rSquared = Number.isFinite(rawRSquared) ? rawRSquared : 0;

    const residuals = modelPairs.map(p => {
        const predicted = regressionLine(p.metric);
        return p.target - predicted;
    });
    const n = modelPairs.length;
    const sumSquaredResiduals = residuals.reduce((sum, value) => sum + (value * value), 0);
    const residualStandardError = n > 2 ? Math.sqrt(sumSquaredResiduals / (n - 2)) : 0;
    const z = 1.96;
    const confidenceHalfWidth =
        residualStandardError > 0
            ? z * residualStandardError * Math.abs(adjustedMetricValue - currentMetricAverage) / Math.sqrt(sxx)
            : 0;
    const confidenceLow = projectedChange - confidenceHalfWidth;
    const confidenceHigh = projectedChange + confidenceHalfWidth;

    const metricMin = ss.min(x);
    const metricMax = ss.max(x);
    const notes: string[] = [];
    if (pairs.length < 30) {
        notes.push('Limited sample size; treat this projection as directional.');
    }
    if (Math.abs(correlation) < 0.2 || rSquared < 0.1) {
        notes.push(`Weak historical relationship between this metric and ${targetScore} score.`);
    }
    if (confidenceHalfWidth > 3) {
        notes.push('Wide uncertainty band around the projected change.');
    }
    if (adjustedMetricValue < metricMin || adjustedMetricValue > metricMax) {
        notes.push('Adjustment extrapolates beyond your observed history.');
    }
    if (isCapped) {
        notes.push('Projection was capped to stay within the 0-100 score range.');
    }

    const reliability = getReliability(pairs.length, rSquared, confidenceHalfWidth);

    return {
        userId,
        userName,
        scenario,
        targetScore,
        projectedChange,
        confidence: confidenceHalfWidth,
        basedOnDays: pairs.length,
        currentBaseline,
        projectedScore,
        confidenceLow,
        confidenceHigh,
        confidenceHalfWidth,
        slope: regression.m,
        correlation,
        rSquared,
        reliability,
        notes,
        isCapped
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

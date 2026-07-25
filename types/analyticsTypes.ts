// Analytics Types for Advanced Dashboard Features

// ============================================
// STREAK TRACKING
// ============================================

export type StreakType =
    | 'sleep_consistency'      // Sleep score above threshold for N days
    | 'activity_sync'          // Both users hit step goals same day
    | 'readiness_streak'       // Readiness above threshold
    | 'hrv_improvement'        // HRV trending upward
    | 'early_bedtime'          // Consistent early bedtime
    | 'step_goal';             // Hit step goal for N days

export interface Streak {
    id: string;
    type: StreakType;
    userId: string;
    userName: string;
    currentLength: number;      // Current streak length in days
    longestLength: number;      // All-time longest
    startDate: string;          // ISO date
    endDate?: string;           // ISO date (undefined if active)
    isActive: boolean;
    dates: string[];            // ISO dates included in the streak
    currentDates?: string[];    // Dates in the active run
    longestDates?: string[];    // Dates in the all-time record run
    currentStartDate?: string;  // ISO date
    currentEndDate?: string;    // ISO date
    longestStartDate?: string;  // ISO date
    longestEndDate?: string;    // ISO date
    avgValue?: number;          // Average value during the streak
    threshold?: number;         // e.g., sleep score > 80
    impactOnTrend?: number;     // % improvement during streak
    icon?: string;              // Icon identifier
}

export interface StreakDefinition {
    type: StreakType;
    name: string;
    description: string;
    icon: string;               // Emoji or icon name
    threshold: number;
    minDays: number;            // Minimum days to count as streak
    metric: 'sleep' | 'readiness' | 'activity' | 'hrv' | 'steps' | 'bedtime';
}

// ============================================
// BADGES / ACHIEVEMENTS
// ============================================

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;               // Emoji or icon name
    tier: BadgeTier;
    unlockedAt?: string;        // ISO date when earned
    isUnlocked: boolean;
    progress: number;           // 0-100 progress percentage
    requirement: number;        // e.g., 7 days for bronze
    userId: string;
    streakType?: StreakType;
}

// ============================================
// PATTERN DETECTION
// ============================================

export type PatternType =
    | 'day_of_week'            // "Fridays show 20% higher stress"
    | 'activity_sleep'         // "Best sleep follows >10k step days"
    | 'hrv_readiness'          // HRV compared with next-day readiness
    | 'cross_user'             // Both users affected similarly
    | 'seasonal'               // Time-of-year patterns
    | 'weekend_effect';        // Weekend vs weekday differences

export interface Pattern {
    id: string;
    type: PatternType;
    title: string;
    description: string;
    affectedUsers: string[];    // User IDs
    confidence: number;         // Legacy 0-1 sample-coverage heuristic
    impact: number;             // Observed percentage difference
    dayOfWeek?: number;         // 0-6 for day patterns
    metric: string;
    dataPoints: number;         // Sample size
    discoveredAt: string;       // ISO date
}

// ============================================
// CORRELATIONS & INSIGHTS
// ============================================

export interface MetricOption {
    userId: string;
    userName: string;
    metric: string;
    label: string;
}

export interface CorrelationResult {
    metricX: MetricOption;
    metricY: MetricOption;
    coefficient: number;        // Pearson r (-1 to 1)
    pValue?: number;
    strength: 'none' | 'weak' | 'moderate' | 'strong';
    direction: 'positive' | 'negative' | 'none';
    dataPoints: Array<{ x: number; y: number; date: string }>;
    insight: string;            // Natural language description
    sampleSize: number;
}

export interface AutomatedInsight {
    id: string;
    title: string;
    description: string;
    metricXLabel: string;
    metricYLabel: string;
    metricXKey: string;
    metricYKey: string;
    strength: 'moderate' | 'strong';
    direction: 'positive' | 'negative';
    coefficient: number;
    sampleSize: number;
    type: 'positive_habit' | 'negative_habit' | 'neutral_observation';
    correlationData: CorrelationResult;
}

// ============================================
// WHAT-IF SIMULATOR
// ============================================

export interface WhatIfScenario {
    metric: string;
    currentAverage?: number;
    adjustment: number;         // e.g., +30 minutes
    unit: string;               // e.g., "minutes", "steps"
    targetScore?: WhatIfTargetScore; // Score domain used for the historical estimate
    lookbackDays?: number | 'all'; // Restrict model to recent days for relevance
    outlierTrimPercent?: number; // Winsorization percent on both tails (0-0.2 typical)
}

export type WhatIfReliability = 'low' | 'medium' | 'high';
export type WhatIfTargetScore = 'readiness' | 'sleep' | 'activity';

export interface WhatIfResult {
    userId: string;
    userName: string;
    scenario: WhatIfScenario;
    targetScore: WhatIfTargetScore;
    projectedChange: number;    // e.g., +8.2 points in target score
    confidence: number;         // Legacy alias: 95% CI half-width of projected change
    basedOnDays: number;        // Sample size
    currentBaseline: number;    // Current baseline target score
    projectedScore: number;     // Baseline + projectedChange (bounded to score range)
    confidenceLow: number;      // Lower bound for projected change (95% CI)
    confidenceHigh: number;     // Upper bound for projected change (95% CI)
    confidenceHalfWidth: number; // 95% CI half-width
    slope: number;              // Change in target score per 1 unit of metric
    correlation: number;        // Pearson correlation between metric and next-day target score
    rSquared: number;           // Coefficient of determination
    reliability: WhatIfReliability;
    notes: string[];
    isCapped: boolean;
}

// ============================================
// MILESTONES
// ============================================

export type MilestoneType =
    | 'days_tracked'
    | 'total_sleep_hours'
    | 'total_steps'
    | 'streak_achievement'
    | 'score_improvement';

export interface Milestone {
    id: string;
    type: MilestoneType;
    name: string;
    description: string;
    icon: string;
    value: number;              // Current value
    target: number;             // Target value
    isAchieved: boolean;
    achievedAt?: string;        // ISO date
    userId?: string;            // undefined = group milestone
    trendImprovement?: number;  // % improvement over milestone period
}

export interface CalendarHeatmapDay {
    date: string;
    value: number;              // Score for the day
    metric: 'sleep' | 'readiness' | 'activity' | 'average';
}

// ============================================
// DAILY SNAPSHOT / SHARING
// ============================================

export interface DailySnapshotData {
    date: string;
    users: Array<{
        userId: string;
        userName: string;
        sleep: number;
        readiness: number;
        activity: number;
        average: number;
        steps?: number;
        sleepDuration?: number;
    }>;
    highlights: Array<{
        type: 'winner' | 'tie' | 'achievement';
        category: string;
        winnerId?: string;
        winnerName?: string;
        value?: number;
        description: string;
    }>;
    note?: string;
    createdAt: string;
    isPinned: boolean;
}

// ============================================
// TIMELINE VIEW
// ============================================

export interface TimelineDataPoint {
    timestamp: string;          // ISO datetime
    hour: number;               // 0-23
    minute: number;
    userId: string;
    userName: string;
    type: 'heart_rate' | 'sleep_start' | 'sleep_end' | 'activity_peak';
    value?: number;
    label?: string;
}

export interface TimelineInsight {
    type: 'sleep_timing' | 'activity' | 'heart_rate';
    description: string;        // "User A fell asleep 45 min earlier"
    timeA?: string;
    timeB?: string;
    difference?: number;        // In minutes
}

// ============================================
// PROFILE EXTENSION FOR ANALYTICS
// ============================================

export interface UserAnalyticsProfile {
    userId: string;
    userName: string;
    streaks: Streak[];
    badges: Badge[];
    milestones: Milestone[];
    pinnedSnapshots: string[];  // Snapshot IDs
}

// ============================================
// CHALLENGES
// ============================================

export type ChallengeType = 'sleep_consistency' | 'readiness_streak' | 'step_goal' | 'early_bedtime';

export interface ChallengeDefinition {
    id: string;
    type: ChallengeType;
    name: string;
    description: string;
    icon: string;
    durationDays: number;
    threshold: number;
    metric: 'sleep' | 'readiness' | 'activity' | 'steps' | 'bedtime';
}

export type ChallengeStatus = 'active' | 'completed' | 'failed';

export interface UserChallenge {
    id: string; // unique instance id
    challengeId: string; // refers to ChallengeDefinition.id
    userId: string;
    startDate: string; // ISO date
    endDate: string; // ISO date
    status: ChallengeStatus;
    progress: number; // days completed
    history: Record<string, boolean>; // date -> success map
}

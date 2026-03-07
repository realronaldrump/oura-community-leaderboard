import { DailyStats } from '../types';

export type CompetitionMode = 'solo' | 'friends';
export type CompetitionFormat = 'goal' | 'race' | 'combo';
export type CompetitionStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
export type CompetitionParticipantStatus = 'invited' | 'accepted' | 'declined' | 'removed';
export type CompetitionRuleOperator = 'gte' | 'lte' | 'between';
export type CompetitionRuleAggregation = 'daily' | 'total' | 'average';

export type CompetitionMetricId =
    | 'steps'
    | 'active_calories'
    | 'sleep_score'
    | 'readiness_score'
    | 'activity_score'
    | 'total_sleep_duration'
    | 'bedtime_start'
    | 'average_hrv'
    | 'lowest_heart_rate'
    | 'stress_high_minutes'
    | 'recovery_high_minutes'
    | 'spo2_average'
    | 'resilience_score';

export interface CompetitionRule {
    id: string;
    metricId: CompetitionMetricId;
    label: string;
    operator: CompetitionRuleOperator;
    target: number;
    secondaryTarget?: number | null;
    weight: number;
    aggregation: CompetitionRuleAggregation;
    capAtTarget: boolean;
}

export interface CompetitionParticipant {
    profileId: string;
    displayName: string;
    status: CompetitionParticipantStatus;
    invitedAt?: string | null;
    respondedAt?: string | null;
    joinedAt?: string | null;
    source?: 'creator' | 'selected' | 'link';
}

export interface Competition {
    id: string;
    title: string;
    description?: string;
    mode: CompetitionMode;
    format: CompetitionFormat;
    status: CompetitionStatus;
    createdByProfileId: string;
    createdAt: string;
    updatedAt: string;
    startDate: string;
    endDate: string;
    timeZone: string;
    rules: CompetitionRule[];
    participants: CompetitionParticipant[];
    participantProfileIds: string[];
    inviteTokenIds?: string[];
    templateId?: string | null;
}

export interface CompetitionInvite {
    id: string;
    competitionId: string;
    token: string;
    createdByProfileId: string;
    createdAt: string;
    expiresAt?: string | null;
    maxUses?: number | null;
    acceptedProfileIds: string[];
    status: 'active' | 'revoked' | 'expired';
}

export interface CompetitionInvitePreview {
    competition: Competition;
    invite: CompetitionInvite;
}

export interface CompetitionMetricDefinition {
    id: CompetitionMetricId;
    label: string;
    shortLabel: string;
    description: string;
    category: 'activity' | 'sleep' | 'recovery' | 'vitals';
    unit: string;
    inputMode: 'number' | 'duration' | 'time';
    valueDirection: 'higher' | 'lower';
    defaultOperator: CompetitionRuleOperator;
    defaultTarget: number;
    defaultAggregation: CompetitionRuleAggregation;
    min?: number;
    max?: number;
    step?: number;
    suggestedWeights?: number[];
    extractDailyValue: (data: DailyStats | undefined, day: string) => number | null;
    formatValue: (value: number | null | undefined) => string;
    formatTarget: (value: number, secondaryValue?: number | null) => string;
}

export interface CompetitionTemplate {
    id: string;
    title: string;
    description: string;
    mode: CompetitionMode;
    format: CompetitionFormat;
    durationDays: number;
    accentColor: string;
    rules: CompetitionRule[];
}

export interface CompetitionRuleEvaluation {
    ruleId: string;
    metricId: CompetitionMetricId;
    value: number | null;
    normalizedScore: number;
    passed: boolean;
}

export interface CompetitionDailyScore {
    day: string;
    totalScore: number;
    completedGoal: boolean;
    rules: CompetitionRuleEvaluation[];
}

export interface CompetitionLeaderboardEntry {
    profileId: string;
    displayName: string;
    status: CompetitionParticipantStatus;
    rank: number;
    totalScore: number;
    progressDays: number;
    totalDays: number;
    dailyScores: CompetitionDailyScore[];
    aggregateValues: Record<string, number | null>;
    averageDailyScore: number;
}

export interface CompetitionEvaluation {
    competition: Competition;
    status: CompetitionStatus;
    days: string[];
    finalizedThrough: string | null;
    leaderboard: CompetitionLeaderboardEntry[];
    acceptedCount: number;
    invitedCount: number;
    summary: string;
}

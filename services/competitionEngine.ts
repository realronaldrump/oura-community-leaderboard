import { COMPETITION_METRICS_BY_ID, getCompetitionMetricDefinition } from '../constants/competitionMetrics';
import { DailyStats } from '../types';
import {
    Competition,
    CompetitionEvaluation,
    CompetitionLeaderboardEntry,
    CompetitionRule,
    CompetitionRuleEvaluation,
    CompetitionStatus,
} from '../types/competitionTypes';
import { formatLocalISODate, shiftLocalISODate } from '../utils/date';

const DEFAULT_SUMMARY = 'Track progress across your chosen Oura metrics.';

const getCompetitionWeightMap = (rules: CompetitionRule[]): Record<string, number> => {
    const total = rules.reduce((sum, rule) => sum + (Number.isFinite(rule.weight) ? Math.max(rule.weight, 0) : 0), 0);
    if (total <= 0) {
        const evenWeight = rules.length > 0 ? 1 / rules.length : 0;
        return rules.reduce<Record<string, number>>((acc, rule) => {
            acc[rule.id] = evenWeight;
            return acc;
        }, {});
    }

    return rules.reduce<Record<string, number>>((acc, rule) => {
        acc[rule.id] = Math.max(rule.weight, 0) / total;
        return acc;
    }, {});
};

const getCompetitionDays = (competition: Competition, endDate: string): string[] => {
    if (competition.startDate > endDate) return [];

    const days: string[] = [];
    for (let day = competition.startDate; day <= competition.endDate && day <= endDate; day = shiftLocalISODate(day, 1)) {
        days.push(day);
    }
    return days;
};

const evaluateRulePass = (value: number | null, rule: CompetitionRule): boolean => {
    if (value == null) return false;
    switch (rule.operator) {
        case 'gte':
            return value >= rule.target;
        case 'lte':
            return value <= rule.target;
        case 'between':
            return value >= rule.target && value <= (rule.secondaryTarget ?? rule.target);
        default:
            return false;
    }
};

const evaluateRuleScore = (value: number | null, rule: CompetitionRule): number => {
    if (value == null) return 0;

    if (rule.operator === 'between') {
        const upper = rule.secondaryTarget ?? rule.target;
        return value >= rule.target && value <= upper ? 1 : 0;
    }

    let score = 0;
    if (rule.operator === 'gte') {
        if (rule.target <= 0) {
            score = value > 0 ? 1 : 0;
        } else {
            score = value / rule.target;
        }
    } else if (rule.operator === 'lte') {
        if (value <= 0) {
            score = 0;
        } else {
            score = rule.target / value;
        }
    }

    if (rule.capAtTarget) {
        score = Math.min(score, 1);
    }

    return Number.isFinite(score) ? score : 0;
};

const aggregateRuleValues = (rule: CompetitionRule, values: Array<number | null>): number | null => {
    const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (!filtered.length) return null;

    if (rule.aggregation === 'total') {
        return filtered.reduce((sum, value) => sum + value, 0);
    }

    const average = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
    return average;
};

export const deriveCompetitionStatus = (
    competition: Competition,
    today: string = formatLocalISODate()
): CompetitionStatus => {
    if (competition.status === 'cancelled' || competition.status === 'draft') {
        return competition.status;
    }

    if (today < competition.startDate) return 'scheduled';
    if (today > competition.endDate) return 'completed';
    return 'active';
};

export const buildCompetitionSummary = (competition: Competition): string => {
    if (competition.description?.trim()) return competition.description.trim();

    const targets = competition.rules.map((rule) => {
        const metric = getCompetitionMetricDefinition(rule.metricId);
        if (rule.operator === 'between') {
            return `${metric.shortLabel} between ${metric.formatTarget(rule.target, rule.secondaryTarget)}`;
        }
        return `${metric.shortLabel} ${rule.operator === 'lte' ? '<=' : '>='} ${metric.formatTarget(rule.target, rule.secondaryTarget)}`;
    });

    if (competition.format === 'goal') {
        return `Complete the goal on as many days as possible: ${targets.join(' + ')}.`;
    }

    return `Scores are based on ${targets.join(' + ')}.`;
};

export const evaluateCompetition = (
    competition: Competition,
    statsByProfileId: Record<string, DailyStats | undefined>,
    today: string = formatLocalISODate()
): CompetitionEvaluation => {
    const status = deriveCompetitionStatus(competition, today);
    const scoringEndDate = status === 'scheduled' ? shiftLocalISODate(competition.startDate, -1) : (
        today < competition.endDate ? today : competition.endDate
    );
    const days = getCompetitionDays(competition, scoringEndDate);
    const weightMap = getCompetitionWeightMap(competition.rules);

    const acceptedParticipants = competition.participants.filter((participant) => participant.status === 'accepted');
    const leaderboard: CompetitionLeaderboardEntry[] = acceptedParticipants.map((participant) => {
        const data = statsByProfileId[participant.profileId];
        const aggregateValues: Record<string, number | null> = {};
        const dailyScores = days.map((day) => {
            const ruleEvaluations: CompetitionRuleEvaluation[] = competition.rules.map((rule) => {
                const metric = COMPETITION_METRICS_BY_ID[rule.metricId];
                const value = metric.extractDailyValue(data, day);
                return {
                    ruleId: rule.id,
                    metricId: rule.metricId,
                    value,
                    normalizedScore: evaluateRuleScore(value, rule),
                    passed: evaluateRulePass(value, rule),
                };
            });

            const completedGoal = ruleEvaluations.every((ruleEvaluation) => ruleEvaluation.passed);
            const totalScore = competition.format === 'goal'
                ? (completedGoal ? 1 : 0)
                : ruleEvaluations.reduce((sum, ruleEvaluation) => sum + (ruleEvaluation.normalizedScore * (weightMap[ruleEvaluation.ruleId] ?? 0)), 0);

            return {
                day,
                totalScore,
                completedGoal,
                rules: ruleEvaluations,
            };
        });

        competition.rules.forEach((rule) => {
            const metric = COMPETITION_METRICS_BY_ID[rule.metricId];
            const values = days.map((day) => metric.extractDailyValue(data, day));
            aggregateValues[rule.id] = aggregateRuleValues(rule, values);
        });

        const totalScore = competition.format === 'goal'
            ? dailyScores.filter((score) => score.completedGoal).length
            : dailyScores.reduce((sum, score) => sum + score.totalScore, 0);

        const progressDays = competition.format === 'goal'
            ? dailyScores.filter((score) => score.completedGoal).length
            : dailyScores.filter((score) => score.totalScore > 0).length;

        return {
            profileId: participant.profileId,
            displayName: participant.displayName,
            status: participant.status,
            rank: 0,
            totalScore,
            progressDays,
            totalDays: competition.rules.length === 0 ? 0 : days.length,
            dailyScores,
            aggregateValues,
            averageDailyScore: days.length > 0 ? totalScore / days.length : 0,
        };
    }).sort((left, right) => {
        if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
        return left.displayName.localeCompare(right.displayName);
    }).map((entry, index) => ({
        ...entry,
        rank: index + 1,
    }));

    const finalizedThrough = days.length ? days[days.length - 1] : null;

    return {
        competition,
        status,
        days,
        finalizedThrough,
        leaderboard,
        acceptedCount: acceptedParticipants.length,
        invitedCount: competition.participants.filter((participant) => participant.status === 'invited').length,
        summary: buildCompetitionSummary(competition) || DEFAULT_SUMMARY,
    };
};

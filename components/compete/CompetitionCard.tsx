import React from 'react';
import { CalendarDays, Copy, Medal, Send, Target, Timer, Trophy, Users } from 'lucide-react';
import { COMPETITION_METRICS_BY_ID } from '../../constants/competitionMetrics';
import { CompetitionEvaluation, CompetitionInvite } from '../../types/competitionTypes';
import { formatISODateForDisplay, shiftLocalISODate } from '../../utils/date';

interface CompetitionCardProps {
    evaluation: CompetitionEvaluation;
    activeProfileId: string;
    invite?: CompetitionInvite | null;
    canShareInvite?: boolean;
    shareStatus?: 'idle' | 'copied' | 'shared' | 'error';
    onShareInvite?: () => void;
    onCopyInvite?: () => void;
}

const formatScore = (evaluation: CompetitionEvaluation, totalScore: number): string => {
    if (evaluation.competition.format === 'goal') {
        return `${Math.round(totalScore)}/${evaluation.days.length || 0} days`;
    }
    return `${totalScore.toFixed(1)} pts`;
};

const CompetitionCard: React.FC<CompetitionCardProps> = ({
    evaluation,
    activeProfileId,
    canShareInvite = false,
    shareStatus = 'idle',
    onShareInvite,
    onCopyInvite,
}) => {
    const isCreator = evaluation.competition.createdByProfileId === activeProfileId;
    const hasInviteActions = canShareInvite && isCreator && evaluation.competition.mode === 'friends';
    const totalDays = evaluation.leaderboard[0]?.totalDays || (
        Math.max(1, Math.round((new Date(`${shiftLocalISODate(evaluation.competition.endDate, 1)}T00:00:00Z`).getTime() - new Date(`${evaluation.competition.startDate}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24)))
    );
    const progressPercent = evaluation.status === 'scheduled' || evaluation.days.length === 0
        ? 0
        : Math.min(100, (evaluation.days.length / totalDays) * 100);

    return (
        <article className="min-w-0 rounded-[var(--radius-xl)] border border-line bg-surface p-5 shadow-card sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
                            <Trophy className="h-3.5 w-3.5" />
                            {evaluation.status}
                        </span>
                        <span className="text-xs capitalize text-ink-muted">
                            {evaluation.competition.mode} · {evaluation.competition.format}
                        </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{evaluation.competition.title}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-secondary">{evaluation.summary}</p>
                </div>

                <div className="grid min-w-[15rem] gap-3 rounded-[1.35rem] border border-line bg-canvas p-4 sm:grid-cols-3 lg:grid-cols-1">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">Window</p>
                        <p className="mt-1 text-sm text-ink">
                            {formatISODateForDisplay(evaluation.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}
                            {' '}to{' '}
                            {formatISODateForDisplay(evaluation.competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">Participants</p>
                        <p className="mt-1 text-sm text-ink">{evaluation.acceptedCount} active</p>
                        {evaluation.invitedCount > 0 ? (
                            <p className="text-xs text-ink-muted">{evaluation.invitedCount} pending</p>
                        ) : null}
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">Scored Through</p>
                        <p className="mt-1 text-sm text-ink">
                            {evaluation.finalizedThrough
                                ? formatISODateForDisplay(evaluation.finalizedThrough, 'en-US', { month: 'short', day: 'numeric' })
                                : 'Starts soon'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
                <div className="min-w-0 rounded-[1.35rem] border border-line bg-canvas p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-ink-muted">
                            <Target className="h-3.5 w-3.5" />
                            Metrics
                        </div>
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <Timer className="h-3.5 w-3.5" />
                            {evaluation.days.length} scored day{evaluation.days.length === 1 ? '' : 's'}
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {evaluation.competition.rules.map((rule) => {
                            const metric = COMPETITION_METRICS_BY_ID[rule.metricId];
                            const label = rule.operator === 'lte'
                                ? `${metric.label} ≤ ${metric.formatTarget(rule.target, rule.secondaryTarget)}`
                                : `${metric.label} ≥ ${metric.formatTarget(rule.target, rule.secondaryTarget)}`;

                            return (
                                <span
                                    key={rule.id}
                                    className="inline-flex items-center rounded-full border border-line bg-surface-raised px-3 py-2 text-xs text-ink-secondary"
                                >
                                    {label}
                                </span>
                            );
                        })}
                    </div>

                    <div className="mt-5">
                        <div className="flex items-center justify-between text-xs text-ink-muted">
                            <span>Competition progress</span>
                            <span>{Math.round(progressPercent)}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
                            <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent)_0%,var(--color-success)_100%)]"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {evaluation.competition.participants.map((participant) => (
                            <span
                                key={participant.profileId}
                                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                                    participant.status === 'accepted'
                                        ? 'bg-accent-soft text-accent'
                                        : participant.status === 'invited'
                                            ? 'bg-warning-soft text-warning'
                                            : 'bg-surface-raised text-ink-secondary'
                                }`}
                            >
                                <Users className="h-3.5 w-3.5" />
                                {participant.displayName}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="min-w-0 rounded-[1.35rem] border border-line bg-canvas p-4">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Leaderboard</p>
                            <h4 className="mt-2 text-lg font-semibold text-ink">Current standings</h4>
                        </div>
                        {hasInviteActions ? (
                            <div className="flex w-full gap-2 sm:w-auto">
                                <button
                                    type="button"
                                    onClick={onShareInvite}
                                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3.5 text-sm font-medium text-accent transition-colors hover:bg-surface-subtle sm:flex-none"
                                >
                                    <Send className="h-4 w-4" />
                                    {shareStatus === 'shared' ? 'Shared' : 'Share'}
                                </button>
                                <button
                                    type="button"
                                    onClick={onCopyInvite}
                                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle sm:flex-none"
                                >
                                    <Copy className="h-4 w-4" />
                                    {shareStatus === 'copied' ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface-raised divide-y divide-line">
                        {evaluation.leaderboard.length === 0 ? (
                            <div className="px-4 py-5 text-sm text-ink-muted">
                                Standings will appear once accepted participants have Oura days in the date range.
                            </div>
                        ) : evaluation.leaderboard.map((entry) => (
                            <div
                                key={entry.profileId}
                                className={`px-4 py-3 ${
                                    entry.rank === 1
                                        ? 'bg-accent-soft'
                                        : 'bg-transparent'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                            entry.rank === 1 ? 'bg-accent-soft text-accent' : 'bg-[rgba(0,0,0,0.04)] text-ink-secondary'
                                        }`}>
                                            {entry.rank === 1 ? <Medal className="h-[1.125rem] w-[1.125rem]" /> : `#${entry.rank}`}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-ink">{entry.displayName}</p>
                                            <p className="text-xs text-ink-muted">
                                                {evaluation.competition.format === 'goal'
                                                    ? `${entry.progressDays} successful day${entry.progressDays === 1 ? '' : 's'}`
                                                    : `${entry.progressDays} scoring day${entry.progressDays === 1 ? '' : 's'}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-lg font-semibold text-ink">{formatScore(evaluation, entry.totalScore)}</p>
                                        {evaluation.competition.format !== 'goal' ? (
                                            <p className="text-xs text-ink-muted">{entry.averageDailyScore.toFixed(2)} avg/day</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Starts {formatISODateForDisplay(evaluation.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="inline-flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    {evaluation.acceptedCount + evaluation.invitedCount} total invited
                </span>
                <span className="inline-flex items-center gap-2">
                    <Trophy className="h-3.5 w-3.5" />
                    {evaluation.competition.format === 'goal' ? 'Goal completion' : 'Weighted points leaderboard'}
                </span>
            </div>
        </article>
    );
};

export default CompetitionCard;

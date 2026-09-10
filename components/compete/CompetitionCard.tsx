import React from 'react';
import { Send } from 'lucide-react';
import { COMPETITION_METRICS_BY_ID } from '../../constants/competitionMetrics';
import { CompetitionEvaluation, CompetitionLeaderboardEntry } from '../../types/competitionTypes';
import { formatISODateForDisplay, shiftLocalISODate } from '../../utils/date';
import { Button } from '../ui';

interface CompetitionCardProps {
    evaluation: CompetitionEvaluation;
    activeProfileId: string;
    scoresLoading?: boolean;
    scoresError?: boolean;
    shareStatus?: 'idle' | 'copied' | 'shared' | 'error' | 'loading';
    onShareInvite?: () => void;
}

const hasData = (entry: CompetitionLeaderboardEntry) => entry.dailyScores.some((day) => day.rules.some((rule) => rule.value != null));
const syncedDaysLabel = (entry: CompetitionLeaderboardEntry) => {
    const count = entry.dailyScores.filter((day) => day.rules.some((rule) => rule.value != null)).length;
    return count ? `${count} day${count === 1 ? '' : 's'} synced` : 'Waiting for Oura';
};

const formatScore = (evaluation: CompetitionEvaluation, entry: CompetitionLeaderboardEntry): string => {
    if (!hasData(entry)) return '—';
    const { competition } = evaluation;
    if (competition.format === 'goal') return `${entry.progressDays} / ${entry.totalDays} days`;
    if (competition.scoring === 'total') return `${Math.round(entry.totalScore).toLocaleString()} steps`;
    if (competition.scoring === 'average') return `${entry.totalScore.toFixed(1)} avg`;
    return `${entry.totalScore.toFixed(1)} pts`;
};

const CompetitionCard: React.FC<CompetitionCardProps> = ({
    evaluation,
    activeProfileId,
    scoresLoading = false,
    scoresError = false,
    shareStatus = 'idle',
    onShareInvite,
}) => {
    const { competition, status } = evaluation;
    const isSolo = competition.mode === 'solo';
    const canShare = !isSolo && competition.createdByProfileId === activeProfileId && (status === 'scheduled' || status === 'active');
    const totalDays = Math.max(1, Math.round((Date.parse(`${shiftLocalISODate(competition.endDate, 1)}T00:00:00Z`) - Date.parse(`${competition.startDate}T00:00:00Z`)) / 86_400_000));
    const ownEntry = evaluation.leaderboard.find((entry) => entry.profileId === activeProfileId);
    const hasAnyData = evaluation.leaderboard.some(hasData);
    const dateLabel = `${formatISODateForDisplay(competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}–${formatISODateForDisplay(competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}`;
    const rulesSummary = competition.rules.map((rule) => {
        const metric = COMPETITION_METRICS_BY_ID[rule.metricId];
        const target = metric.formatTarget(rule.target);
        const condition = rule.operator === 'between' ? `${target}–${metric.formatTarget(rule.secondaryTarget ?? rule.target)}` : `${rule.operator === 'lte' ? 'at most' : 'at least'} ${target}`;
        return `${metric.label}: ${condition}`;
    }).join(' · ');

    return (
        <article className="min-w-0 rounded-[var(--radius-xl)] border border-line bg-surface p-5 shadow-card sm:p-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="break-words text-xl font-semibold tracking-tight text-ink">{competition.title}</h3>
                    <p className="mt-1 text-xs text-ink-muted">{dateLabel} · {isSolo ? 'Solo' : `${evaluation.acceptedCount} joined`}{evaluation.invitedCount > 0 ? ` · ${evaluation.invitedCount} invited` : ''}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${status === 'active' ? 'bg-accent-soft text-accent' : 'bg-surface-raised text-ink-secondary'}`}>
                    {status === 'active' ? 'In progress' : status === 'scheduled' ? 'Upcoming' : status === 'completed' ? 'Finished' : status === 'cancelled' ? 'Cancelled' : 'Draft'}
                </span>
            </div>
            <p className="mt-3 text-sm text-ink-secondary">{evaluation.summary}</p>

            {status === 'scheduled' ? (
                <p className="mt-5 text-sm text-ink-muted">{isSolo ? 'Your progress will appear here when it starts.' : 'Ready to go. Invite friends before it starts.'}</p>
            ) : scoresLoading ? (
                <p className="mt-5 text-sm text-ink-muted" role="status">Loading scores…</p>
            ) : scoresError ? (
                <p className="mt-5 text-sm text-error" role="status">Scores are unavailable right now. Try again later.</p>
            ) : isSolo && ownEntry ? (
                <div className="mt-5">
                    <p className="font-mono text-2xl font-semibold text-ink">{formatScore(evaluation, ownEntry)}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-subtle" role="progressbar" aria-label="Days completed" aria-valuemin={0} aria-valuemax={totalDays} aria-valuenow={ownEntry.progressDays}>
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ownEntry.progressDays / totalDays * 100)}%` }} />
                    </div>
                </div>
            ) : (
                <ol className="mt-4 divide-y divide-line" aria-label="Standings">
                    {evaluation.leaderboard.map((entry) => (
                        <li key={entry.profileId} className="flex items-center justify-between gap-3 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="w-5 shrink-0 text-center text-sm text-ink-muted">{hasData(entry) ? entry.rank : '—'}</span>
                                <span className="min-w-0 truncate text-sm font-medium text-ink">{entry.displayName}{entry.profileId === activeProfileId ? ' (you)' : ''}</span>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="font-mono text-base font-semibold text-ink">{formatScore(evaluation, entry)}</p>
                                <p className="text-xs text-ink-muted">{syncedDaysLabel(entry)}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            {status !== 'scheduled' && !scoresLoading && !scoresError ? (
                <p className="mt-3 text-xs text-ink-muted">
                    {!hasAnyData ? 'Waiting for Oura data.' : competition.scoring === 'average' ? 'Averages use synced days.' : 'Scores use synced Oura data.'}
                    {status === 'active' ? ' Today’s results may change.' : ''}
                </p>
            ) : null}

            {!competition.scoring ? (
                <details className="mt-4 text-xs text-ink-muted">
                    <summary className="w-fit cursor-pointer py-2">Scoring details</summary>
                    <p className="mt-1 leading-relaxed">{rulesSummary}</p>
                    {competition.format !== 'goal' ? <p className="mt-2">{competition.rules.map((rule) => `${COMPETITION_METRICS_BY_ID[rule.metricId].label}: ${rule.weight} weight${rule.capAtTarget ? ', capped at target' : ''}`).join(' · ')}</p> : null}
                </details>
            ) : null}

            {canShare ? (
                <div className="mt-5 border-t border-line pt-4">
                    <Button variant="secondary" onClick={onShareInvite} disabled={shareStatus === 'loading'} className="w-full sm:w-auto">
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {shareStatus === 'loading' ? 'Preparing link…' : shareStatus === 'copied' ? 'Link copied' : shareStatus === 'shared' ? 'Invite sent' : 'Invite friends'}
                    </Button>
                    {shareStatus === 'error' ? <p role="alert" className="mt-2 text-xs text-error">Could not share the link. Try again.</p> : null}
                    {shareStatus === 'copied' ? <p role="status" className="mt-2 text-xs text-ink-muted">Paste the link to invite a friend.</p> : null}
                </div>
            ) : null}
        </article>
    );
};

export default CompetitionCard;

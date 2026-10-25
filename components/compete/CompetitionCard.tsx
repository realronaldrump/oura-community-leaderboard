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
        <article className="challenge-card">
            <div className="challenge-card__head">
                <div className="min-w-0">
                    <h3>{competition.title}</h3>
                    <p className="challenge-card__meta">{dateLabel} · {isSolo ? 'Solo' : `${evaluation.acceptedCount} joined`}{evaluation.invitedCount > 0 ? ` · ${evaluation.invitedCount} invited` : ''}</p>
                </div>
                <span className={`status-pill ${status === 'active' ? 'status-pill--active' : ''}`}>
                    {status === 'active' ? 'In progress' : status === 'scheduled' ? 'Upcoming' : status === 'completed' ? 'Finished' : status === 'cancelled' ? 'Cancelled' : 'Draft'}
                </span>
            </div>
            <p className="challenge-card__summary">{evaluation.summary}</p>

            {status === 'scheduled' ? (
                <p className="challenge-card__note">{isSolo ? 'Your progress shows here once it starts.' : 'Ready to go. Invite friends before it starts.'}</p>
            ) : scoresLoading ? (
                <p className="challenge-card__note" role="status">Loading scores…</p>
            ) : scoresError ? (
                <p className="challenge-card__note text-error" role="status">Scores are unavailable right now. Try again later.</p>
            ) : isSolo && ownEntry ? (
                <div>
                    <p className="challenge-card__score">{formatScore(evaluation, ownEntry)}</p>
                    <div className="challenge-progress" role="progressbar" aria-label="Days completed" aria-valuemin={0} aria-valuemax={totalDays} aria-valuenow={ownEntry.progressDays}>
                        <div style={{ width: `${Math.min(100, ownEntry.progressDays / totalDays * 100)}%` }} />
                    </div>
                </div>
            ) : (
                <ol className="standings" aria-label="Standings">
                    {evaluation.leaderboard.map((entry) => (
                        <li key={entry.profileId} className={entry.profileId === activeProfileId ? 'is-you' : undefined}>
                            <div>
                                <span className="standing-rank">{hasData(entry) ? entry.rank : '–'}</span>
                                <span className="standing-name">{entry.displayName}{entry.profileId === activeProfileId ? ' (you)' : ''}</span>
                            </div>
                            <div className="standing-score">
                                <strong>{formatScore(evaluation, entry)}</strong>
                                <small>{syncedDaysLabel(entry)}</small>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            {status !== 'scheduled' && !scoresLoading && !scoresError ? (
                <p className="challenge-card__note">
                    {!hasAnyData ? 'Waiting for Oura data.' : competition.scoring === 'average' ? 'Averages count synced days only.' : 'Totals count synced days only.'}
                    {status === 'active' ? ' Today can still change.' : ''}
                </p>
            ) : null}

            {!competition.scoring ? (
                <details>
                    <summary>Scoring</summary>
                    <p className="m-0">{rulesSummary}</p>
                    {competition.format !== 'goal' ? <p className="m-0 mt-2">{competition.rules.map((rule) => `${COMPETITION_METRICS_BY_ID[rule.metricId].label}: ${rule.weight} weight${rule.capAtTarget ? ', capped at target' : ''}`).join(' · ')}</p> : null}
                </details>
            ) : null}

            {canShare ? (
                <div className="challenge-card__actions">
                    <Button variant="secondary" onClick={onShareInvite} disabled={shareStatus === 'loading'} className="w-full sm:w-auto">
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {shareStatus === 'loading' ? 'Preparing link…' : shareStatus === 'copied' ? 'Link copied' : shareStatus === 'shared' ? 'Invite sent' : 'Invite friends'}
                    </Button>
                    {shareStatus === 'error' ? <p role="alert" className="status-note status-note--error">Could not share the link. Try again.</p> : null}
                    {shareStatus === 'copied' ? <p role="status" className="fine-print">Paste the link to invite a friend.</p> : null}
                </div>
            ) : null}
        </article>
    );
};

export default CompetitionCard;

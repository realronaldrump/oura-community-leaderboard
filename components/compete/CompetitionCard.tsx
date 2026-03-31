import React from 'react';
import { CalendarDays, Copy, Medal, Send, Sparkles, Target, Timer, Trophy, Users } from 'lucide-react';
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
    invite,
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
        <article className="rounded-[1.6rem] border border-[rgba(0,0,0,0.06)] bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF7F4_100%)] p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.06)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#6B9E8A]">
                            <Trophy className="h-3.5 w-3.5" />
                            {evaluation.status}
                        </span>
                        <span className="rounded-full border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#7A756E]">
                            {evaluation.competition.mode}
                        </span>
                        <span className="rounded-full border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#7A756E]">
                            {evaluation.competition.format}
                        </span>
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-[#2D2A26]">{evaluation.competition.title}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#7A756E]">{evaluation.summary}</p>
                </div>

                <div className="grid min-w-[15rem] gap-3 rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[#F2EDE8] p-4 sm:grid-cols-3 lg:grid-cols-1">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#A8A29E]">Window</p>
                        <p className="mt-1 text-sm text-[#2D2A26]">
                            {formatISODateForDisplay(evaluation.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}
                            {' '}to{' '}
                            {formatISODateForDisplay(evaluation.competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#A8A29E]">Participants</p>
                        <p className="mt-1 text-sm text-[#2D2A26]">{evaluation.acceptedCount} active</p>
                        {evaluation.invitedCount > 0 ? (
                            <p className="text-xs text-[#A8A29E]">{evaluation.invitedCount} pending</p>
                        ) : null}
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#A8A29E]">Scored Through</p>
                        <p className="mt-1 text-sm text-[#2D2A26]">
                            {evaluation.finalizedThrough
                                ? formatISODateForDisplay(evaluation.finalizedThrough, 'en-US', { month: 'short', day: 'numeric' })
                                : 'Starts soon'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
                <div className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[#F2EDE8] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#A8A29E]">
                            <Target className="h-3.5 w-3.5" />
                            Metrics
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#A8A29E]">
                            <Timer className="h-3.5 w-3.5" />
                            {evaluation.days.length} scored day{evaluation.days.length === 1 ? '' : 's'}
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {evaluation.competition.rules.map((rule) => {
                            const metric = COMPETITION_METRICS_BY_ID[rule.metricId];
                            const label = rule.operator === 'lte'
                                ? `${metric.label} <= ${metric.formatTarget(rule.target, rule.secondaryTarget)}`
                                : `${metric.label} >= ${metric.formatTarget(rule.target, rule.secondaryTarget)}`;

                            return (
                                <span
                                    key={rule.id}
                                    className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,0,0,0.06)] bg-white px-3 py-2 text-xs text-[#4A4540]"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-[#6B9E8A]" />
                                    {label}
                                </span>
                            );
                        })}
                    </div>

                    <div className="mt-5">
                        <div className="flex items-center justify-between text-xs text-[#A8A29E]">
                            <span>Competition progress</span>
                            <span>{Math.round(progressPercent)}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
                            <div
                                className="h-full rounded-full bg-[linear-gradient(90deg,#6B9E8A_0%,#A3D4BE_100%)]"
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
                                        ? 'bg-[rgba(107,158,138,0.12)] text-[#6B9E8A]'
                                        : participant.status === 'invited'
                                            ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
                                            : 'bg-[#FAF7F4] text-[#7A756E]'
                                }`}
                            >
                                <Users className="h-3.5 w-3.5" />
                                {participant.displayName}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-[#F2EDE8] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Leaderboard</p>
                            <h4 className="mt-2 text-lg font-semibold text-[#2D2A26]">Current standings</h4>
                        </div>
                        {hasInviteActions ? (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onShareInvite}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.08)] px-3.5 text-sm font-medium text-[#6B9E8A] transition-colors hover:bg-[rgba(107,158,138,0.14)]"
                                >
                                    <Send className="h-4 w-4" />
                                    {shareStatus === 'shared' ? 'Shared' : 'Share'}
                                </button>
                                <button
                                    type="button"
                                    onClick={onCopyInvite}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#FAF7F4] px-3.5 text-sm font-medium text-[#2D2A26] transition-colors hover:bg-[#F0EBE5]"
                                >
                                    <Copy className="h-4 w-4" />
                                    {shareStatus === 'copied' ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-4 space-y-3">
                        {evaluation.leaderboard.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[rgba(0,0,0,0.10)] bg-[#FAF7F4] px-4 py-5 text-sm text-[#A8A29E]">
                                Standings will appear once accepted participants start syncing data.
                            </div>
                        ) : evaluation.leaderboard.map((entry) => (
                            <div
                                key={entry.profileId}
                                className={`rounded-[1.1rem] border px-4 py-3 ${
                                    entry.rank === 1
                                        ? 'border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.06)]'
                                        : 'border-[rgba(0,0,0,0.06)] bg-white'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                            entry.rank === 1 ? 'bg-[rgba(107,158,138,0.12)] text-[#6B9E8A]' : 'bg-[rgba(0,0,0,0.04)] text-[#7A756E]'
                                        }`}>
                                            {entry.rank === 1 ? <Medal className="h-4.5 w-4.5" /> : `#${entry.rank}`}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-[#2D2A26]">{entry.displayName}</p>
                                            <p className="text-xs text-[#A8A29E]">
                                                {evaluation.competition.format === 'goal'
                                                    ? `${entry.progressDays} successful day${entry.progressDays === 1 ? '' : 's'}`
                                                    : `${entry.progressDays} scoring day${entry.progressDays === 1 ? '' : 's'}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-lg font-semibold text-[#2D2A26]">{formatScore(evaluation, entry.totalScore)}</p>
                                        {evaluation.competition.format !== 'goal' ? (
                                            <p className="text-xs text-[#A8A29E]">{entry.averageDailyScore.toFixed(2)} avg/day</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[#A8A29E]">
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

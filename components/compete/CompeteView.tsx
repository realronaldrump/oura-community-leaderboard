import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Flag, Trophy, Users } from 'lucide-react';
import { COMPETITION_TEMPLATES } from '../../constants/competitionMetrics';
import { useCompetitionInvitePreview, useCompetitions } from '../../hooks/useCompetitions';
import { competitionService, CreateCompetitionInput } from '../../services/competitionService';
import { evaluateCompetition } from '../../services/competitionEngine';
import { DailyStats, UserProfile } from '../../types';
import { CompetitionInvite, CompetitionTemplate } from '../../types/competitionTypes';
import { formatISODateForDisplay } from '../../utils/date';
import { getProfileDisplayName } from '../../utils/profileName';
import { Button } from '../ui';
import {
    copyCompetitionInviteLink,
    shareCompetitionInviteLink,
} from '../../utils/inviteLink';
import CompetitionBuilder from './CompetitionBuilder';
import CompetitionCard from './CompetitionCard';

type ProfileCompetitionData = {
    profile: UserProfile;
    data?: DailyStats;
    isLoading: boolean;
    isError: boolean;
};

interface CompeteViewProps {
    activeProfile: UserProfile;
    profiles: UserProfile[];
    profileData: ProfileCompetitionData[];
    competitionInviteToken?: string | null;
    onClearCompetitionInviteToken?: () => void;
}

type Notice = {
    tone: 'success' | 'warning' | 'error';
    message: string;
};

type ShareStatus = 'idle' | 'copied' | 'shared' | 'error';

const noticeClassNames: Record<Notice['tone'], string> = {
    success: 'border-success/30 bg-success-soft text-success',
    warning: 'border-warning/30 bg-warning-soft text-warning',
    error: 'border-error/30 bg-error-soft text-error',
};

const CompeteView: React.FC<CompeteViewProps> = ({
    activeProfile,
    profiles,
    profileData,
    competitionInviteToken,
    onClearCompetitionInviteToken,
}) => {
    const { competitions, isLoading, error } = useCompetitions(activeProfile.id);
    const { preview: invitePreview, isLoading: invitePreviewLoading, error: invitePreviewError } = useCompetitionInvitePreview(competitionInviteToken);

    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [initialTemplate, setInitialTemplate] = useState<CompetitionTemplate | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [isAcceptingTokenInvite, setIsAcceptingTokenInvite] = useState(false);
    const [isRespondingCompetitionId, setIsRespondingCompetitionId] = useState<string | null>(null);
    const [inviteByCompetitionId, setInviteByCompetitionId] = useState<Record<string, CompetitionInvite>>({});
    const [shareStatusByCompetitionId, setShareStatusByCompetitionId] = useState<Record<string, ShareStatus>>({});

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 3200);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const statsByProfileId = useMemo<Record<string, DailyStats | undefined>>(
        () => profileData.reduce<Record<string, DailyStats | undefined>>((acc, entry) => {
            acc[entry.profile.id] = entry.data;
            return acc;
        }, {}),
        [profileData]
    );

    const evaluations = useMemo(
        () => competitions.map((competition) => evaluateCompetition(competition, statsByProfileId)),
        [competitions, statsByProfileId]
    );

    const pendingInvites = useMemo(
        () => competitions.filter((competition) =>
            competition.participants.some((participant) => participant.profileId === activeProfile.id && participant.status === 'invited')
        ),
        [activeProfile.id, competitions]
    );

    const scheduledEvaluations = evaluations.filter((evaluation) => evaluation.status === 'scheduled');
    const activeEvaluations = evaluations.filter((evaluation) => evaluation.status === 'active');
    const completedEvaluations = evaluations.filter((evaluation) => evaluation.status === 'completed').slice(0, 8);

    const linkInviteAlreadyJoined = Boolean(
        invitePreview?.competition.participants.some((participant) => participant.profileId === activeProfile.id && participant.status === 'accepted')
    );

    const handleOpenBuilder = (template?: CompetitionTemplate | null, mode?: 'solo' | 'friends') => {
        const fallbackTemplate = template || COMPETITION_TEMPLATES.find((item) => item.mode === (mode || 'solo')) || COMPETITION_TEMPLATES[0];
        setInitialTemplate(fallbackTemplate);
        setIsBuilderOpen(true);
    };

    const handleCreateCompetition = async (input: CreateCompetitionInput) => {
        const { competition, invite } = await competitionService.createCompetition(input);
        if (invite) {
            setInviteByCompetitionId((current) => ({ ...current, [competition.id]: invite }));
        }

        setNotice({
            tone: 'success',
            message: invite
                ? `${competition.title} is scheduled. The invite link is ready to send.`
                : `${competition.title} is scheduled and starts tomorrow.`,
        });
    };

    const handleRespondToInvite = async (competitionId: string, status: 'accepted' | 'declined') => {
        setIsRespondingCompetitionId(competitionId);
        try {
            await competitionService.respondToCompetition(competitionId, activeProfile.id, status);
            setNotice({
                tone: status === 'accepted' ? 'success' : 'warning',
                message: status === 'accepted' ? 'Competition joined.' : 'Competition invite declined.',
            });
        } catch (responseError) {
            console.error('Failed to respond to competition invite:', responseError);
            setNotice({ tone: 'error', message: 'Could not update the invite right now.' });
        } finally {
            setIsRespondingCompetitionId(null);
        }
    };

    const ensureCompetitionInvite = async (competitionId: string): Promise<CompetitionInvite> => {
        const cached = inviteByCompetitionId[competitionId];
        if (cached) return cached;
        const invite = await competitionService.ensureCompetitionInvite(competitionId, activeProfile.id);
        setInviteByCompetitionId((current) => ({ ...current, [competitionId]: invite }));
        return invite;
    };

    const updateShareStatus = (competitionId: string, status: ShareStatus) => {
        setShareStatusByCompetitionId((current) => ({ ...current, [competitionId]: status }));
        if (status !== 'idle') {
            window.setTimeout(() => {
                setShareStatusByCompetitionId((current) => ({ ...current, [competitionId]: 'idle' }));
            }, 2600);
        }
    };

    const handleShareInvite = async (competitionId: string, title: string) => {
        try {
            const invite = await ensureCompetitionInvite(competitionId);
            const result = await shareCompetitionInviteLink(invite.token, title);
            if (result !== 'dismissed') {
                updateShareStatus(competitionId, result);
            }
        } catch (shareError) {
            console.error('Failed to share competition invite:', shareError);
            updateShareStatus(competitionId, 'error');
        }
    };

    const handleCopyInvite = async (competitionId: string) => {
        try {
            const invite = await ensureCompetitionInvite(competitionId);
            await copyCompetitionInviteLink(invite.token);
            updateShareStatus(competitionId, 'copied');
        } catch (copyError) {
            console.error('Failed to copy competition invite:', copyError);
            updateShareStatus(competitionId, 'error');
        }
    };

    const handleAcceptLinkInvite = async () => {
        if (!competitionInviteToken) return;
        setIsAcceptingTokenInvite(true);
        try {
            const result = await competitionService.acceptCompetitionInviteToken(competitionInviteToken, {
                profileId: activeProfile.id,
                displayName: getProfileDisplayName(activeProfile),
            });
            setInviteByCompetitionId((current) => {
                const invite = result.invite;
                return invite ? { ...current, [result.competition.id]: invite } : current;
            });
            setNotice({
                tone: 'success',
                message: `You joined ${result.competition.title}.`,
            });
            onClearCompetitionInviteToken?.();
        } catch (acceptError) {
            console.error('Failed to accept token invite:', acceptError);
            setNotice({ tone: 'error', message: 'Could not join that competition.' });
        } finally {
            setIsAcceptingTokenInvite(false);
        }
    };

    return (
        <div className="pt-6 space-y-6">
            <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface p-5 shadow-card sm:p-7">
                <div className="relative">
                    <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent">
                        <Trophy className="h-3.5 w-3.5" />
                        Compete
                    </div>
                    <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[2.4rem]">
                                Set a goal—or make it a competition.
                            </h1>
                            <p className="mt-3 text-sm leading-relaxed text-ink-secondary sm:text-base">
                                Choose the metric, dates, and who is in. Track a target alone or keep score with friends.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'solo') || null, 'solo')}
                                size="lg"
                            >
                                <Flag className="h-4 w-4" />
                                Create Solo Goal
                            </Button>
                            <Button
                                onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'friends') || null, 'friends')}
                                variant="secondary"
                                size="lg"
                            >
                                <Users className="h-4 w-4" />
                                Challenge Friends
                            </Button>
                        </div>
                    </div>

                    <dl className="mt-6 grid grid-cols-3 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface-raised shadow-pressed">
                        <div className="min-w-0 p-3 sm:p-4">
                            <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-muted sm:text-[11px] sm:tracking-[0.16em]">Active</dt>
                            <dd className="mt-1 font-mono text-2xl font-semibold text-ink sm:text-3xl">{activeEvaluations.length}</dd>
                        </div>
                        <div className="min-w-0 border-l border-line p-3 sm:p-4">
                            <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-muted sm:text-[11px] sm:tracking-[0.16em]">Starting tomorrow</dt>
                            <dd className="mt-1 font-mono text-2xl font-semibold text-ink sm:text-3xl">{scheduledEvaluations.length}</dd>
                        </div>
                        <div className="min-w-0 border-l border-line p-3 sm:p-4">
                            <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-muted sm:text-[11px] sm:tracking-[0.16em]">Pending invites</dt>
                            <dd className="mt-1 font-mono text-2xl font-semibold text-ink sm:text-3xl">{pendingInvites.length}</dd>
                        </div>
                    </dl>
                </div>
            </section>

            {notice ? (
                <div className={`rounded-[1.25rem] border px-4 py-3 text-sm ${noticeClassNames[notice.tone]}`}>
                    {notice.message}
                </div>
            ) : null}

            {competitionInviteToken ? (
                <section className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="max-w-3xl">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Invite Link</p>
                            <h2 className="mt-2 text-xl font-semibold text-ink">
                                {invitePreviewLoading ? 'Loading competition...' : invitePreview?.competition.title || 'Competition invite'}
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                                {invitePreview?.competition.description || 'Open this invite to join the next scheduled competition.'}
                            </p>
                            {invitePreview ? (
                                <p className="mt-3 text-xs text-ink-muted">
                                    Starts {formatISODateForDisplay(invitePreview.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })} and runs through {formatISODateForDisplay(invitePreview.competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}.
                                </p>
                            ) : null}
                            {invitePreviewError ? (
                                <p className="mt-3 text-xs text-error">{invitePreviewError}</p>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            {invitePreview && !linkInviteAlreadyJoined ? (
                                <button
                                    type="button"
                                    onClick={handleAcceptLinkInvite}
                                    disabled={isAcceptingTokenInvite}
                                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                                >
                                    <Check className="h-4 w-4" />
                                    {isAcceptingTokenInvite ? 'Joining...' : 'Join Competition'}
                                </button>
                            ) : (
                                <div className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent-soft px-5 py-3 text-sm font-semibold text-accent">
                                    Already joined
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={onClearCompetitionInviteToken}
                                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </section>
            ) : null}

            <section>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Templates</p>
                        <h2 className="mt-2 text-xl font-semibold text-ink">Start from a template</h2>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {COMPETITION_TEMPLATES.map((template) => (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => handleOpenBuilder(template)}
                            className="rounded-[1.35rem] border border-line bg-surface-raised p-4 text-left transition-colors hover:border-accent/30"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${template.accentColor}22`, color: template.accentColor }}
                                >
                                    <Trophy className="h-4 w-4" />
                                </span>
                                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">{template.format}</span>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-ink">{template.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{template.description}</p>
                            <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-accent">
                                <CalendarPlus className="h-3.5 w-3.5" />
                                Starts tomorrow
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            {pendingInvites.length > 0 ? (
                <section className="space-y-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Pending For You</p>
                        <h2 className="mt-2 text-xl font-semibold text-ink">Accept or pass on incoming invites</h2>
                    </div>
                    {pendingInvites.map((competition) => (
                        <div key={competition.id} className="rounded-[1.35rem] border border-line bg-surface p-4 shadow-sm sm:p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="max-w-3xl">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Invited</p>
                                    <h3 className="mt-2 text-lg font-semibold text-ink">{competition.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{competition.description}</p>
                                    <p className="mt-3 text-xs text-ink-muted">
                                        Starts {formatISODateForDisplay(competition.startDate, 'en-US', { month: 'short', day: 'numeric' })} and runs for{' '}
                                        {formatISODateForDisplay(competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => handleRespondToInvite(competition.id, 'accepted')}
                                        disabled={isRespondingCompetitionId === competition.id}
                                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                                    >
                                        <Check className="h-4 w-4" />
                                        Join
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRespondToInvite(competition.id, 'declined')}
                                        disabled={isRespondingCompetitionId === competition.id}
                                        className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-60"
                                    >
                                        Decline
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}

            {isLoading ? (
                <div className="rounded-[1.25rem] border border-line bg-surface px-4 py-5 text-sm text-ink-secondary shadow-sm">
                    Loading competitions...
                </div>
            ) : null}

            {error ? (
                <div className="rounded-[1.35rem] border border-line bg-surface p-5 text-sm text-ink-secondary sm:p-6" role="status">
                    {error}
                </div>
            ) : null}

            {activeEvaluations.length > 0 ? (
                <section className="space-y-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Active</p>
                        <h2 className="mt-2 text-xl font-semibold text-ink">Happening right now</h2>
                    </div>
                    {activeEvaluations.map((evaluation) => (
                        <CompetitionCard
                            key={evaluation.competition.id}
                            evaluation={evaluation}
                            activeProfileId={activeProfile.id}
                            invite={inviteByCompetitionId[evaluation.competition.id] || null}
                            canShareInvite={evaluation.competition.mode === 'friends'}
                            shareStatus={shareStatusByCompetitionId[evaluation.competition.id] || 'idle'}
                            onShareInvite={() => handleShareInvite(evaluation.competition.id, evaluation.competition.title)}
                            onCopyInvite={() => handleCopyInvite(evaluation.competition.id)}
                        />
                    ))}
                </section>
            ) : null}

            {scheduledEvaluations.length > 0 ? (
                <section className="space-y-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Scheduled</p>
                        <h2 className="mt-2 text-xl font-semibold text-ink">Starts next</h2>
                    </div>
                    {scheduledEvaluations.map((evaluation) => (
                        <CompetitionCard
                            key={evaluation.competition.id}
                            evaluation={evaluation}
                            activeProfileId={activeProfile.id}
                            invite={inviteByCompetitionId[evaluation.competition.id] || null}
                            canShareInvite={evaluation.competition.mode === 'friends'}
                            shareStatus={shareStatusByCompetitionId[evaluation.competition.id] || 'idle'}
                            onShareInvite={() => handleShareInvite(evaluation.competition.id, evaluation.competition.title)}
                            onCopyInvite={() => handleCopyInvite(evaluation.competition.id)}
                        />
                    ))}
                </section>
            ) : null}

            {completedEvaluations.length > 0 ? (
                <section className="space-y-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">History</p>
                        <h2 className="mt-2 text-xl font-semibold text-ink">Recently completed</h2>
                    </div>
                    {completedEvaluations.map((evaluation) => (
                        <CompetitionCard
                            key={evaluation.competition.id}
                            evaluation={evaluation}
                            activeProfileId={activeProfile.id}
                            invite={inviteByCompetitionId[evaluation.competition.id] || null}
                            canShareInvite={evaluation.competition.mode === 'friends'}
                            shareStatus={shareStatusByCompetitionId[evaluation.competition.id] || 'idle'}
                            onShareInvite={() => handleShareInvite(evaluation.competition.id, evaluation.competition.title)}
                            onCopyInvite={() => handleCopyInvite(evaluation.competition.id)}
                        />
                    ))}
                </section>
            ) : null}

            {!isLoading && !error && activeEvaluations.length === 0 && scheduledEvaluations.length === 0 && completedEvaluations.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-line-strong bg-surface px-5 py-8 text-center">
                    <h2 className="text-xl font-semibold text-ink">No rivalries on the books yet</h2>
                    <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                        Start with a solo goal or create a friend competition that starts tomorrow.
                    </p>
                    <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'solo') || null, 'solo')}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white"
                        >
                            <Flag className="h-4 w-4" />
                            Create Solo Goal
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'friends') || null, 'friends')}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line px-5 py-3 text-sm font-medium text-ink"
                        >
                            <Users className="h-4 w-4" />
                            Challenge Friends
                        </button>
                    </div>
                </div>
            ) : null}

            <CompetitionBuilder
                isOpen={isBuilderOpen}
                activeProfile={activeProfile}
                profiles={profiles}
                initialTemplate={initialTemplate}
                onClose={() => setIsBuilderOpen(false)}
                onCreate={handleCreateCompetition}
            />
        </div>
    );
};

export default CompeteView;

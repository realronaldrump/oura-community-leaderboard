import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Copy, Flag, Send, Sparkles, Trophy, Users } from 'lucide-react';
import { COMPETITION_TEMPLATES } from '../../constants/competitionMetrics';
import { useCompetitionInvitePreview, useCompetitions } from '../../hooks/useCompetitions';
import { competitionService, CreateCompetitionInput } from '../../services/competitionService';
import { evaluateCompetition } from '../../services/competitionEngine';
import { DailyStats, UserProfile } from '../../types';
import { CompetitionInvite, CompetitionTemplate } from '../../types/competitionTypes';
import { formatISODateForDisplay } from '../../utils/date';
import { getProfileDisplayName } from '../../utils/profileName';
import {
    copyCompetitionInviteLink,
    InviteShareResult,
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
    success: 'border-[rgba(107,158,138,0.3)] bg-[#FAF7F4] text-[#6B9E8A]',
    warning: 'border-[rgba(212,165,116,0.3)] bg-[#FAF7F4] text-[#D4A574]',
    error: 'border-[rgba(212,137,123,0.3)] bg-[#FAF7F4] text-[#D4897B]',
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
            <section className="relative overflow-hidden rounded-[2rem] border border-[rgba(0,0,0,0.06)] bg-[radial-gradient(circle_at_top_right,rgba(107,158,138,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(123,168,212,0.10),transparent_38%),#FFFFFF] p-5 sm:p-7">
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.4),transparent_45%)]" />
                <div className="relative">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#6B9E8A]">
                        <Trophy className="h-3.5 w-3.5" />
                        Compete
                    </div>
                    <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <h2 className="text-3xl font-semibold tracking-tight text-[#2D2A26] sm:text-[2.4rem]">
                                Goals for you. Competitions for the group.
                            </h2>
                            <p className="mt-3 text-sm leading-relaxed text-[#7A756E] sm:text-base">
                                Set tomorrow's targets, challenge specific friends, and run custom combinations across sleep, readiness, activity, steps, HRV, stress, and more.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'solo') || null, 'solo')}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B9E8A] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                            >
                                <Flag className="h-4 w-4" />
                                Create Solo Goal
                            </button>
                            <button
                                type="button"
                                onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'friends') || null, 'friends')}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.06)] px-5 py-3 text-sm font-semibold text-[#6B9E8A] transition-colors hover:bg-[rgba(107,158,138,0.12)]"
                            >
                                <Users className="h-4 w-4" />
                                Challenge Friends
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-4">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Active</p>
                            <p className="mt-2 text-3xl font-semibold text-[#2D2A26]">{activeEvaluations.length}</p>
                        </div>
                        <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-4">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Starting Tomorrow</p>
                            <p className="mt-2 text-3xl font-semibold text-[#2D2A26]">{scheduledEvaluations.length}</p>
                        </div>
                        <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-[#FAF7F4] p-4">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Pending Invites</p>
                            <p className="mt-2 text-3xl font-semibold text-[#2D2A26]">{pendingInvites.length}</p>
                        </div>
                    </div>
                </div>
            </section>

            {notice ? (
                <div className={`rounded-[1.25rem] border px-4 py-3 text-sm ${noticeClassNames[notice.tone]}`}>
                    {notice.message}
                </div>
            ) : null}

            {competitionInviteToken ? (
                <section className="rounded-[1.5rem] border border-[rgba(0,0,0,0.06)] bg-white p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="max-w-3xl">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[#6B9E8A]">Invite Link</p>
                            <h3 className="mt-2 text-xl font-semibold text-[#2D2A26]">
                                {invitePreviewLoading ? 'Loading competition...' : invitePreview?.competition.title || 'Competition invite'}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#7A756E]">
                                {invitePreview?.competition.description || 'Open this invite to join the next scheduled competition.'}
                            </p>
                            {invitePreview ? (
                                <p className="mt-3 text-xs text-[#A8A29E]">
                                    Starts {formatISODateForDisplay(invitePreview.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })} and runs through {formatISODateForDisplay(invitePreview.competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}.
                                </p>
                            ) : null}
                            {invitePreviewError ? (
                                <p className="mt-3 text-xs text-[#D4897B]">{invitePreviewError}</p>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            {invitePreview && !linkInviteAlreadyJoined ? (
                                <button
                                    type="button"
                                    onClick={handleAcceptLinkInvite}
                                    disabled={isAcceptingTokenInvite}
                                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B9E8A] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                                >
                                    <Check className="h-4 w-4" />
                                    {isAcceptingTokenInvite ? 'Joining...' : 'Join Competition'}
                                </button>
                            ) : (
                                <div className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[rgba(107,158,138,0.2)] bg-[rgba(107,158,138,0.08)] px-5 py-3 text-sm font-semibold text-[#6B9E8A]">
                                    Already joined
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={onClearCompetitionInviteToken}
                                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[rgba(0,0,0,0.08)] px-5 py-3 text-sm font-medium text-[#2D2A26] transition-colors hover:bg-[#FAF7F4]"
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
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Templates</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#2D2A26]">Launch a proven format fast</h3>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {COMPETITION_TEMPLATES.map((template) => (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => handleOpenBuilder(template)}
                            className="rounded-[1.35rem] border border-[rgba(0,0,0,0.06)] bg-white p-4 text-left transition-colors hover:border-[rgba(107,158,138,0.25)]"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${template.accentColor}22`, color: template.accentColor }}
                                >
                                    <Sparkles className="h-4 w-4" />
                                </span>
                                <span className="text-[11px] uppercase tracking-[0.14em] text-[#A8A29E]">{template.format}</span>
                            </div>
                            <h4 className="mt-4 text-lg font-semibold text-[#2D2A26]">{template.title}</h4>
                            <p className="mt-2 text-sm leading-relaxed text-[#7A756E]">{template.description}</p>
                            <div className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[#6B9E8A]">
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
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Pending For You</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#2D2A26]">Accept or pass on incoming invites</h3>
                    </div>
                    {pendingInvites.map((competition) => (
                        <div key={competition.id} className="rounded-[1.35rem] border border-[rgba(0,0,0,0.08)] bg-white p-4 sm:p-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="max-w-3xl">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[#6B9E8A]">Invited</p>
                                    <h4 className="mt-2 text-lg font-semibold text-[#2D2A26]">{competition.title}</h4>
                                    <p className="mt-2 text-sm leading-relaxed text-[#7A756E]">{competition.description}</p>
                                    <p className="mt-3 text-xs text-[#A8A29E]">
                                        Starts {formatISODateForDisplay(competition.startDate, 'en-US', { month: 'short', day: 'numeric' })} and runs for{' '}
                                        {formatISODateForDisplay(competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() => handleRespondToInvite(competition.id, 'accepted')}
                                        disabled={isRespondingCompetitionId === competition.id}
                                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B9E8A] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                                    >
                                        <Check className="h-4 w-4" />
                                        Join
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRespondToInvite(competition.id, 'declined')}
                                        disabled={isRespondingCompetitionId === competition.id}
                                        className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[rgba(0,0,0,0.08)] px-5 py-3 text-sm font-medium text-[#2D2A26] transition-colors hover:bg-[#FAF7F4] disabled:opacity-60"
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
                <div className="rounded-[1.25rem] border border-[rgba(0,0,0,0.06)] bg-white px-4 py-5 text-sm text-[#7A756E]">
                    Loading competitions...
                </div>
            ) : null}

            {error ? (
                <div className="rounded-[1.25rem] border border-[rgba(212,137,123,0.3)] bg-[#FAF7F4] px-4 py-3 text-sm text-[#D4897B]">
                    {error}
                </div>
            ) : null}

            {activeEvaluations.length > 0 ? (
                <section className="space-y-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Active</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#2D2A26]">Happening right now</h3>
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
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">Scheduled</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#2D2A26]">Starts next</h3>
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
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#A8A29E]">History</p>
                        <h3 className="mt-2 text-xl font-semibold text-[#2D2A26]">Recently completed</h3>
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
                <div className="rounded-[1.5rem] border border-dashed border-[rgba(0,0,0,0.10)] bg-white px-5 py-8 text-center">
                    <h3 className="text-xl font-semibold text-[#2D2A26]">No competitions yet</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#7A756E]">
                        Start with a solo goal or create a friend competition that starts tomorrow.
                    </p>
                    <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'solo') || null, 'solo')}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6B9E8A] px-5 py-3 text-sm font-semibold text-white"
                        >
                            <Flag className="h-4 w-4" />
                            Create Solo Goal
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenBuilder(COMPETITION_TEMPLATES.find((template) => template.mode === 'friends') || null, 'friends')}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[rgba(0,0,0,0.08)] px-5 py-3 text-sm font-medium text-[#2D2A26]"
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

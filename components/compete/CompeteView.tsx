import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trophy } from 'lucide-react';
import { useCompetitionInvitePreview, useCompetitions } from '../../hooks/useCompetitions';
import { competitionService, CreateCompetitionInput } from '../../services/competitionService';
import { buildCompetitionSummary, deriveCompetitionStatus, evaluateCompetition } from '../../services/competitionEngine';
import { DailyStats, UserProfile } from '../../types';
import { Competition, CompetitionInvite } from '../../types/competitionTypes';
import { formatISODateForDisplay } from '../../utils/date';
import { getProfileDisplayName } from '../../utils/profileName';
import { shareCompetitionInviteLink } from '../../utils/inviteLink';
import { Button } from '../ui';
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

type Notice = { tone: 'success' | 'error'; message: string };
type ShareStatus = 'idle' | 'copied' | 'shared' | 'error' | 'loading';

const formatDates = (competition: Competition) => `${formatISODateForDisplay(competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}–${formatISODateForDisplay(competition.endDate, 'en-US', { month: 'short', day: 'numeric' })}`;
const isOpenCompetition = (competition: Competition) => ['scheduled', 'active'].includes(deriveCompetitionStatus(competition));

const CompeteView: React.FC<CompeteViewProps> = ({
    activeProfile, profiles, profileData, competitionInviteToken, onClearCompetitionInviteToken,
}) => {
    const { competitions, isLoading, error } = useCompetitions(activeProfile.id);
    const { preview: invitePreview, isLoading: invitePreviewLoading, error: invitePreviewError } = useCompetitionInvitePreview(competitionInviteToken);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [isAcceptingTokenInvite, setIsAcceptingTokenInvite] = useState(false);
    const [respondingIds, setRespondingIds] = useState<string[]>([]);
    const [createdCompetition, setCreatedCompetition] = useState<Competition | null>(null);
    const [inviteByCompetitionId, setInviteByCompetitionId] = useState<Record<string, CompetitionInvite>>({});
    const [shareStatusByCompetitionId, setShareStatusByCompetitionId] = useState<Record<string, ShareStatus>>({});
    const sharingIds = useRef(new Set<string>());
    const responseIds = useRef(new Set<string>());

    useEffect(() => {
        if (!notice || notice.tone === 'error') return;
        const timer = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const statsByProfileId = useMemo<Record<string, DailyStats | undefined>>(
        () => Object.fromEntries(profileData.map((entry) => [entry.profile.id, entry.data])), [profileData]
    );
    const evaluations = useMemo(() => {
        // Keep a new competition visible while its subscription catches up.
        const visible = createdCompetition && !competitions.some((item) => item.id === createdCompetition.id)
            ? [createdCompetition, ...competitions] : competitions;
        return visible
            .filter((competition) => competition.participants.some((participant) => participant.profileId === activeProfile.id && participant.status === 'accepted'))
            .map((competition) => evaluateCompetition(competition, statsByProfileId));
    }, [activeProfile.id, competitions, createdCompetition, statsByProfileId]);
    const pendingInvites = competitions.filter((competition) => isOpenCompetition(competition) &&
        competition.id !== invitePreview?.competition.id &&
        competition.participants.some((participant) => participant.profileId === activeProfile.id && participant.status === 'invited'));
    const createdEvaluation = evaluations.find((evaluation) => evaluation.competition.id === createdCompetition?.id && ['scheduled', 'active'].includes(evaluation.status));
    const activeEvaluations = evaluations.filter((evaluation) => evaluation.status === 'active' && evaluation !== createdEvaluation);
    const scheduledEvaluations = evaluations.filter((evaluation) => evaluation.status === 'scheduled' && evaluation !== createdEvaluation)
        .sort((left, right) => left.competition.startDate.localeCompare(right.competition.startDate));
    const completedEvaluations = evaluations.filter((evaluation) => evaluation.status === 'completed')
        .sort((left, right) => right.competition.endDate.localeCompare(left.competition.endDate));
    const linkInviteAlreadyJoined = Boolean(invitePreview?.competition.participants.some((participant) => participant.profileId === activeProfile.id && participant.status === 'accepted'));
    const linkInviteClosed = Boolean(invitePreview && (!isOpenCompetition(invitePreview.competition) || invitePreview.competition.mode !== 'friends' ||
        (invitePreview.invite.maxUses != null && invitePreview.invite.acceptedProfileIds.length >= invitePreview.invite.maxUses)));

    const handleCreateCompetition = async (input: CreateCompetitionInput) => {
        const { competition, invite } = await competitionService.createCompetition(input);
        setCreatedCompetition(competition);
        if (invite) setInviteByCompetitionId((current) => ({ ...current, [competition.id]: invite }));
        setNotice({ tone: 'success', message: `${competition.title} is ready. Starts ${formatISODateForDisplay(competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}.` });
    };

    const handleRespondToInvite = async (competitionId: string, status: 'accepted' | 'declined') => {
        if (responseIds.current.has(competitionId)) return;
        responseIds.current.add(competitionId);
        setRespondingIds((current) => [...current, competitionId]);
        try {
            await competitionService.respondToCompetition(competitionId, activeProfile.id, status);
            setNotice({ tone: 'success', message: status === 'accepted' ? 'You’re in.' : 'Invite declined.' });
        } catch (responseError) {
            console.error('Failed to respond to competition invite:', responseError);
            setNotice({ tone: 'error', message: 'Could not update the invite. Try again.' });
        } finally {
            responseIds.current.delete(competitionId);
            setRespondingIds((current) => current.filter((id) => id !== competitionId));
        }
    };

    const handleShareInvite = async (competition: Competition) => {
        if (sharingIds.current.has(competition.id)) return;
        sharingIds.current.add(competition.id);
        setShareStatusByCompetitionId((current) => ({ ...current, [competition.id]: 'loading' }));
        try {
            const invite = inviteByCompetitionId[competition.id] || await competitionService.ensureCompetitionInvite(competition.id, activeProfile.id);
            setInviteByCompetitionId((current) => ({ ...current, [competition.id]: invite }));
            const result = await shareCompetitionInviteLink(invite.token, competition.title);
            setShareStatusByCompetitionId((current) => ({ ...current, [competition.id]: result === 'dismissed' ? 'idle' : result }));
        } catch (shareError) {
            console.error('Failed to share competition invite:', shareError);
            setShareStatusByCompetitionId((current) => ({ ...current, [competition.id]: 'error' }));
        } finally {
            sharingIds.current.delete(competition.id);
        }
    };

    const handleAcceptLinkInvite = async () => {
        if (!competitionInviteToken || isAcceptingTokenInvite) return;
        setIsAcceptingTokenInvite(true);
        try {
            const result = await competitionService.acceptCompetitionInviteToken(competitionInviteToken, {
                profileId: activeProfile.id, displayName: getProfileDisplayName(activeProfile),
            });
            setCreatedCompetition(result.competition);
            setNotice({ tone: 'success', message: `You joined ${result.competition.title}.` });
            onClearCompetitionInviteToken?.();
        } catch (acceptError) {
            console.error('Failed to accept token invite:', acceptError);
            setNotice({ tone: 'error', message: 'Could not join. The invite may have closed. Try again.' });
        } finally {
            setIsAcceptingTokenInvite(false);
        }
    };

    const renderCard = (evaluation: ReturnType<typeof evaluateCompetition>) => {
        const participants = profileData.filter((entry) => evaluation.competition.participants.some((participant) => participant.profileId === entry.profile.id && participant.status === 'accepted'));
        return <CompetitionCard
            key={evaluation.competition.id}
            evaluation={evaluation}
            activeProfileId={activeProfile.id}
            scoresLoading={participants.some((entry) => entry.isLoading)}
            scoresError={participants.some((entry) => entry.isError)}
            shareStatus={shareStatusByCompetitionId[evaluation.competition.id] || 'idle'}
            onShareInvite={() => handleShareInvite(evaluation.competition)}
        />;
    };

    return (
        <div className="space-y-6 pt-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Competitions</h1>
                    <p className="mt-1 text-sm text-ink-secondary">A little friendly motivation.</p>
                </div>
                <Button onClick={() => setIsBuilderOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />New competition
                </Button>
            </header>

            {notice ? <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-3 text-sm ${notice.tone === 'error' ? 'border-error/30 bg-error-soft text-error' : 'border-success/30 bg-success-soft text-success'}`}>{notice.message}</p> : null}

            {competitionInviteToken ? (
                <section className="rounded-2xl border border-accent/30 bg-surface p-5" aria-label="Competition invite">
                    {invitePreviewLoading ? <p role="status" className="text-sm text-ink-secondary">Loading invite…</p> : invitePreview ? (
                        <>
                            <p className="text-xs text-accent">You’re invited</p>
                            <h2 className="mt-2 text-xl font-semibold text-ink">{invitePreview.competition.title}</h2>
                            <p className="mt-2 text-sm text-ink-secondary">{buildCompetitionSummary(invitePreview.competition)}</p>
                            <p className="mt-2 text-xs text-ink-muted">{formatDates(invitePreview.competition)}</p>
                            {linkInviteAlreadyJoined ? <p role="status" className="mt-3 text-sm text-accent">You’re already in.</p> : linkInviteClosed ? <p className="mt-3 text-sm text-ink-muted">This competition is no longer accepting players.</p> : null}
                        </>
                    ) : <p role="status" className="text-sm text-ink-secondary">{invitePreviewError || 'This invite is no longer available.'}</p>}
                    <div className="mt-4 flex gap-2">
                        {invitePreview && !invitePreviewLoading && !linkInviteAlreadyJoined && !linkInviteClosed ? <Button onClick={handleAcceptLinkInvite} disabled={isAcceptingTokenInvite}>{isAcceptingTokenInvite ? 'Joining…' : 'Join competition'}</Button> : null}
                        <Button variant="quiet" onClick={onClearCompetitionInviteToken} disabled={isAcceptingTokenInvite}>Dismiss</Button>
                    </div>
                </section>
            ) : null}

            {pendingInvites.length > 0 ? (
                <section className="space-y-3" aria-labelledby="competition-invites-heading">
                    <h2 id="competition-invites-heading" className="text-lg font-semibold text-ink">Invites</h2>
                    {pendingInvites.map((competition) => (
                        <div key={competition.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
                            <div className="min-w-0">
                                <h3 className="break-words font-semibold text-ink">{competition.title}</h3>
                                <p className="mt-1 text-sm text-ink-secondary">{buildCompetitionSummary(competition)}</p>
                                <p className="mt-2 text-xs text-ink-muted">{formatDates(competition)}</p>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => handleRespondToInvite(competition.id, 'accepted')} disabled={respondingIds.includes(competition.id)}>Join</Button>
                                <Button variant="quiet" onClick={() => handleRespondToInvite(competition.id, 'declined')} disabled={respondingIds.includes(competition.id)}>Decline</Button>
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}

            {isLoading ? <p role="status" className="py-6 text-sm text-ink-muted">Loading competitions…</p> : null}
            {error ? <p role="status" className="rounded-2xl border border-line p-5 text-sm text-ink-secondary">{error}</p> : null}

            {createdEvaluation ? <section className="space-y-3" aria-label="Your new competition"><h2 className="text-lg font-semibold text-ink">Ready to go</h2>{renderCard(createdEvaluation)}</section> : null}

            {activeEvaluations.length > 0 ? <section className="space-y-3" aria-label="In progress"><h2 className="text-lg font-semibold text-ink">In progress</h2>{activeEvaluations.map(renderCard)}</section> : null}
            {scheduledEvaluations.length > 0 ? <section className="space-y-3" aria-label="Upcoming"><h2 className="text-lg font-semibold text-ink">Upcoming</h2>{scheduledEvaluations.map(renderCard)}</section> : null}

            {!isLoading && !error && !createdEvaluation && activeEvaluations.length === 0 && scheduledEvaluations.length === 0 && pendingInvites.length === 0 && !competitionInviteToken ? (
                <div className="rounded-3xl border border-dashed border-line-strong px-5 py-10 text-center">
                    <Trophy className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
                    <h2 className="mt-4 text-xl font-semibold text-ink">Make this week a challenge</h2>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-ink-secondary">Steps, sleep, or readiness. Pick one and you’re ready for a week with friends—or yourself.</p>
                </div>
            ) : null}

            {completedEvaluations.length > 0 ? (
                <details className="group">
                    <summary className="w-fit cursor-pointer py-3 text-sm font-medium text-ink-secondary">Past competitions ({completedEvaluations.length})</summary>
                    <div className="mt-2 space-y-3">{completedEvaluations.map(renderCard)}</div>
                </details>
            ) : null}

            <CompetitionBuilder isOpen={isBuilderOpen} activeProfile={activeProfile} profiles={profiles} onClose={() => setIsBuilderOpen(false)} onCreate={handleCreateCompetition} />
        </div>
    );
};

export default CompeteView;

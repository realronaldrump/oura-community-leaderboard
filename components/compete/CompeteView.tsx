import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Swords } from 'lucide-react';
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
        setNotice({ tone: 'success', message: `${competition.title} starts ${formatISODateForDisplay(competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}.` });
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
            setNotice({ tone: 'error', message: 'Couldn’t update the invite. Try again.' });
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
            setNotice({ tone: 'error', message: 'Couldn’t join. The invite may have closed.' });
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

    const section = (title: string, cards: Array<ReturnType<typeof evaluateCompetition>>) => cards.length > 0 ? (
        <section className="detail-section" aria-label={title}>
            <div className="section-title"><h2>{title}</h2></div>
            <div className="challenge-list">{cards.map(renderCard)}</div>
        </section>
    ) : null;

    return (
        <div>
            <header className="page-heading page-heading--row">
                <h1>Challenges</h1>
                <Button size="sm" onClick={() => setIsBuilderOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />New challenge
                </Button>
            </header>

            {notice ? <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`status-note ${notice.tone === 'error' ? 'status-note--error' : 'status-note--success'}`}>{notice.message}</p> : null}

            {competitionInviteToken ? (
                <section className="challenge-card mt-4" aria-label="Challenge invite">
                    {invitePreviewLoading ? <p role="status" className="empty-note">Loading invite…</p> : invitePreview ? (
                        <>
                            <p className="eyebrow">You’re invited</p>
                            <h2 className="m-0 text-[1.375rem] font-bold tracking-tight">{invitePreview.competition.title}</h2>
                            <p className="challenge-card__summary">{buildCompetitionSummary(invitePreview.competition)}</p>
                            <p className="challenge-card__meta">{formatDates(invitePreview.competition)}</p>
                            {linkInviteAlreadyJoined ? <p role="status" className="challenge-card__note">You’re already in.</p> : linkInviteClosed ? <p className="challenge-card__note">This challenge isn’t taking new players.</p> : null}
                        </>
                    ) : <p role="status" className="empty-note">{invitePreviewError || 'This invite is no longer available.'}</p>}
                    <div className="mt-4 flex gap-2">
                        {invitePreview && !invitePreviewLoading && !linkInviteAlreadyJoined && !linkInviteClosed ? <Button onClick={handleAcceptLinkInvite} disabled={isAcceptingTokenInvite}>{isAcceptingTokenInvite ? 'Joining…' : 'Join challenge'}</Button> : null}
                        <Button variant="quiet" onClick={onClearCompetitionInviteToken} disabled={isAcceptingTokenInvite}>Dismiss</Button>
                    </div>
                </section>
            ) : null}

            {pendingInvites.length > 0 ? (
                <section className="detail-section" aria-labelledby="competition-invites-heading">
                    <div className="section-title"><h2 id="competition-invites-heading">Invites</h2></div>
                    <div className="challenge-list">
                        {pendingInvites.map((competition) => (
                            <div key={competition.id} className="challenge-card">
                                <h3>{competition.title}</h3>
                                <p className="challenge-card__meta">{formatDates(competition)}</p>
                                <p className="challenge-card__summary">{buildCompetitionSummary(competition)}</p>
                                <div className="mt-4 flex gap-2">
                                    <Button onClick={() => handleRespondToInvite(competition.id, 'accepted')} disabled={respondingIds.includes(competition.id)}>Join</Button>
                                    <Button variant="quiet" onClick={() => handleRespondToInvite(competition.id, 'declined')} disabled={respondingIds.includes(competition.id)}>Decline</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {isLoading ? <p role="status" className="empty-note">Loading challenges…</p> : null}
            {error ? <p role="status" className="status-note status-note--error">{error}</p> : null}

            {section('Just created', createdEvaluation ? [createdEvaluation] : [])}
            {section('In progress', activeEvaluations)}
            {section('Upcoming', scheduledEvaluations)}

            {!isLoading && !error && !createdEvaluation && activeEvaluations.length === 0 && scheduledEvaluations.length === 0 && pendingInvites.length === 0 && !competitionInviteToken ? (
                <div className="quiet-state">
                    <Swords size={28} aria-hidden="true" />
                    <h2>No challenges yet</h2>
                    <p>Pick steps, sleep or readiness and go for a week, with friends or on your own.</p>
                </div>
            ) : null}

            {completedEvaluations.length > 0 ? (
                <details className="metric-group mt-6">
                    <summary><span>Past challenges ({completedEvaluations.length})</span></summary>
                    <div className="challenge-list pb-4">{completedEvaluations.map(renderCard)}</div>
                </details>
            ) : null}

            <CompetitionBuilder isOpen={isBuilderOpen} activeProfile={activeProfile} profiles={profiles} onClose={() => setIsBuilderOpen(false)} onCreate={handleCreateCompetition} />
        </div>
    );
};

export default CompeteView;

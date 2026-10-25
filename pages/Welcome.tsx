import React from 'react';
import { CalendarDays, ChevronRight, CloudOff, Plus, RefreshCw, Trophy } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useCompetitionInvitePreview } from '../hooks/useCompetitions';
import { deriveCompetitionStatus } from '../services/competitionEngine';
import { AuthStatus } from '../types';
import { formatISODateForDisplay } from '../utils/date';
import { getCompetitionInviteToken, isInviteLocation } from '../utils/inviteLink';
import { getProfileDisplayName } from '../utils/profileName';
import { Badge, BrandMark, Button, Skeleton, StatePanel } from '../components/ui';

interface WelcomeProps {
    isCompletingOAuth?: boolean;
}

const Welcome: React.FC<WelcomeProps> = ({ isCompletingOAuth = false }) => {
    const {
        profiles,
        setActiveProfileId,
        login,
        firebaseError,
        isLoadingProfiles,
        authStatus,
    } = useUser();

    const search = typeof window !== 'undefined' ? window.location.search : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
    const competitionInviteToken = getCompetitionInviteToken(search);
    const inviteLanding = isInviteLocation(pathname, search);
    const {
        preview: competitionInvitePreview,
        isLoading: isCompetitionInviteLoading,
        error: competitionInviteError,
    } = useCompetitionInvitePreview(competitionInviteToken);
    const competition = competitionInvitePreview?.competition;
    const competitionInviteClosed = Boolean(competitionInvitePreview && (
        !['scheduled', 'active'].includes(deriveCompetitionStatus(competitionInvitePreview.competition)) ||
        (competitionInvitePreview.invite.maxUses != null && competitionInvitePreview.invite.acceptedProfileIds.length >= competitionInvitePreview.invite.maxUses)
    ));

    const hero = competitionInviteToken
        ? {
            title: competition?.title ? `You’re invited to ${competition.title}` : 'Challenge invite',
            text: isCompetitionInviteLoading ? 'Loading the challenge…'
                : !competitionInvitePreview ? 'Ask the host for a new link.'
                : competitionInviteClosed ? 'This challenge isn’t taking new players.'
                : 'Pick your profile, or connect Oura to join.',
        }
        : inviteLanding
            ? { title: 'You’re invited', text: 'Connect your Oura account to join the leaderboard. Already here? Pick your profile.' }
            : profiles.length > 0
                ? { title: 'Welcome back', text: 'Pick your profile to see today’s scores.' }
                : { title: 'Oura scores, shared.', text: 'Compare sleep, readiness and activity with friends, and keep your personal bests in one place.' };

    const isConnecting = isCompletingOAuth || authStatus === AuthStatus.LOADING;
    return (
        <div className="welcome">
            <div className="welcome__inner">
                <header className="welcome__brand">
                    <BrandMark size={40} />
                    <strong>Davis Watches You Sleep</strong>
                </header>

                <section className="welcome__hero" aria-labelledby="welcome-title">
                    {competitionInviteToken ? (
                        <Badge tone="accent" className="mb-4">
                            <Trophy aria-hidden="true" className="h-3.5 w-3.5" />
                            Challenge invite
                        </Badge>
                    ) : null}
                    <h1 id="welcome-title">{hero.title}</h1>
                    <p>{hero.text}</p>
                </section>

                {competitionInviteToken ? (
                    <div className="panel panel--padded" aria-live="polite">
                        {isCompetitionInviteLoading ? (
                            <div className="space-y-3" role="status" aria-label="Loading challenge invite">
                                <Skeleton className="h-4 w-36" />
                                <Skeleton className="h-4 w-48 max-w-full" />
                            </div>
                        ) : competitionInvitePreview ? (
                            <div className="flex items-start gap-3">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
                                    <CalendarDays aria-hidden="true" className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <p className="m-0 text-[0.9375rem] font-bold text-ink">
                                        {formatISODateForDisplay(competitionInvitePreview.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}
                                        {' to '}
                                        {formatISODateForDisplay(competitionInvitePreview.competition.endDate, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    {competitionInvitePreview.competition.description ? (
                                        <p className="m-0 mt-1 text-[0.8125rem] leading-6 text-ink-secondary">{competitionInvitePreview.competition.description}</p>
                                    ) : null}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 text-[0.9375rem] text-ink-secondary">
                                <CloudOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                                <p className="m-0">{competitionInviteError || 'This invite is no longer available.'}</p>
                            </div>
                        )}
                    </div>
                ) : null}

                {isCompletingOAuth ? (
                    <StatePanel
                        title="Connecting Oura"
                        description="Keep this page open for a moment."
                        icon={<RefreshCw className="animate-spin" />}
                        role="status"
                        aria-live="polite"
                    />
                ) : null}

                {firebaseError ? (
                    <StatePanel
                        title={firebaseError === 'quota_exceeded' ? 'Data service limit reached' : 'Can’t reach the server'}
                        description={firebaseError === 'quota_exceeded'
                            ? 'New data will load when the limit resets. Saved profiles still work.'
                            : 'Reconnecting automatically.'}
                        icon={<CloudOff />}
                        tone="warning"
                        role="status"
                    />
                ) : null}

                {isLoadingProfiles ? (
                    <div className="panel" role="status" aria-label="Loading profiles">
                        {[0, 1].map((item) => (
                            <div key={item} className="person-row">
                                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                                <Skeleton className="h-4 w-36 max-w-full" />
                            </div>
                        ))}
                    </div>
                ) : profiles.length > 0 ? (
                    <section aria-labelledby="profile-picker-title">
                        <h2 id="profile-picker-title" className="eyebrow">
                            {competitionInviteToken ? 'Join as' : 'Profiles'}
                        </h2>
                        <div className="panel">
                            {profiles.map((profile) => {
                                const name = getProfileDisplayName(profile);
                                return (
                                    <button
                                        key={profile.id}
                                        type="button"
                                        className="person-row"
                                        onClick={() => setActiveProfileId(profile.id)}
                                        aria-label={`Open ${name}`}
                                    >
                                        <span className="person-avatar" aria-hidden="true">
                                            {name.trim().charAt(0).toUpperCase() || 'O'}
                                        </span>
                                        <span className="person-row__name"><strong>{name}</strong></span>
                                        <ChevronRight size={18} aria-hidden="true" />
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                ) : null}

                <div className="grid gap-3">
                    <Button
                        variant={profiles.length > 0 ? 'secondary' : 'primary'}
                        size="lg"
                        className="w-full"
                        onClick={login}
                        disabled={isConnecting}
                    >
                        {isConnecting ? (
                            <>
                                <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" />
                                Connecting…
                            </>
                        ) : (
                            <>
                                <Plus aria-hidden="true" className="h-5 w-5" />
                                {profiles.length > 0 ? 'Connect another Oura account' : 'Connect Oura account'}
                            </>
                        )}
                    </Button>
                    <p className="welcome__note">
                        Anyone with this link can see the profiles and scores here. Not a medical device.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Welcome;

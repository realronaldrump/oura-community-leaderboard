import React, { useMemo } from 'react';
import {
    ArrowRight,
    CalendarDays,
    CircleUserRound,
    Clock3,
    CloudOff,
    Plus,
    RefreshCw,
    Trophy,
    Users,
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useCompetitionInvitePreview } from '../hooks/useCompetitions';
import type { UserProfile } from '../types';
import { AuthStatus } from '../types';
import { formatISODateForDisplay } from '../utils/date';
import { getCompetitionInviteToken, isInviteLocation } from '../utils/inviteLink';
import { getProfileDisplayName } from '../utils/profileName';
import { profileRequiresReconnect } from '../utils/profileSyncHealth';
import { Badge, Button, Card, Skeleton, StatePanel, type BadgeTone } from '../components/ui';

const RECENT_SYNC_WINDOW_MS = 15 * 60 * 1000;
const STALE_SYNC_WINDOW_MS = 18 * 60 * 60 * 1000;

export interface ProfileFreshness {
    label: string;
    description: string;
    tone: BadgeTone;
    timestamp: string | null;
}

const formatElapsed = (elapsedMs: number): string => {
    const minutes = Math.floor(Math.max(0, elapsedMs) / (60 * 1000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d ago`;
    return '';
};

const formatExactTimestamp = (timestamp: string): string => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
}).format(new Date(timestamp));

export const getProfileFreshness = (
    profile: Pick<UserProfile, 'lastSuccessfulSyncAt' | 'lastSyncError'>,
    nowMs: number = Date.now(),
): ProfileFreshness => {
    if (profileRequiresReconnect(profile)) {
        return {
            label: 'Connection needs attention',
            description: 'Saved sync metadata reports an Oura connection issue.',
            tone: 'error',
            timestamp: profile.lastSuccessfulSyncAt || null,
        };
    }

    if (!profile.lastSuccessfulSyncAt) {
        return {
            label: 'No sync recorded',
            description: 'A successful sync time has not been recorded for this profile yet.',
            tone: 'neutral',
            timestamp: null,
        };
    }

    const syncMs = new Date(profile.lastSuccessfulSyncAt).getTime();
    if (!Number.isFinite(syncMs)) {
        return {
            label: 'Sync time unavailable',
            description: 'The saved sync timestamp could not be read.',
            tone: 'neutral',
            timestamp: null,
        };
    }

    const elapsedMs = Math.max(0, nowMs - syncMs);
    const relative = formatElapsed(elapsedMs);
    const exact = formatExactTimestamp(profile.lastSuccessfulSyncAt);
    const label = relative ? `Last sync ${relative}` : `Last sync ${formatISODateForDisplay(profile.lastSuccessfulSyncAt.slice(0, 10), 'en-US', { month: 'short', day: 'numeric' })}`;

    return {
        label,
        description: `Successful sync recorded ${exact}.`,
        tone: elapsedMs < RECENT_SYNC_WINDOW_MS
            ? 'success'
            : elapsedMs < STALE_SYNC_WINDOW_MS
                ? 'info'
                : 'warning',
        timestamp: profile.lastSuccessfulSyncAt,
    };
};

const ProfileListSkeleton: React.FC = () => (
    <div className="space-y-3" role="status" aria-label="Loading member profiles">
        {[0, 1].map((item) => (
            <div key={item} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-32 max-w-full" />
                        <Skeleton className="h-3 w-48 max-w-full" />
                    </div>
                </div>
                <Skeleton className="mt-4 h-11 w-full rounded-[var(--radius-md)]" />
            </div>
        ))}
        <span className="sr-only">Loading profiles…</span>
    </div>
);

const CircleMark: React.FC = () => (
    <span
        aria-hidden="true"
        className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)]"
    >
        <span className="absolute h-6 w-6 rounded-full border-2 border-[var(--color-accent)]" />
        <span className="absolute h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
    </span>
);

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
        retryFirebaseConnection,
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

    const heroCopy = useMemo(() => {
        if (competitionInviteToken) {
            return {
                eyebrow: 'Competition invitation',
                title: competitionInvitePreview?.competition.title
                    ? `You’re invited to ${competitionInvitePreview.competition.title}.`
                    : 'A friendly challenge is waiting for you.',
                description: 'Choose an existing profile or connect your Oura account. The invitation stays with you through the connection.',
            };
        }

        if (inviteLanding) {
            return {
                eyebrow: 'Circle invitation',
                title: 'Your circle saved you a place.',
                description: 'Connect once to join the shared leaderboard, or choose your profile if you already belong to this circle.',
            };
        }

        if (profiles.length > 0) {
            return {
                eyebrow: 'Welcome back',
                title: 'Who are you?',
                description: 'Pick your profile to see today’s scores and settle the rankings.',
            };
        }

        return {
            eyebrow: 'Davis Watches You Sleep',
            title: 'A lovingly overbuilt leaderboard for two.',
            description: 'Compare sleep, readiness, activity, records, and competitions from your Oura data.',
        };
    }, [competitionInvitePreview?.competition.title, competitionInviteToken, inviteLanding, profiles.length]);

    const isConnecting = isCompletingOAuth || authStatus === AuthStatus.LOADING;
    return (
        <div className="min-h-[100dvh] bg-[var(--color-canvas)] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
            <header className="mx-auto flex w-full max-w-[var(--content-width)] items-center justify-between gap-4 py-3 sm:py-5">
                <div className="flex min-w-0 items-center gap-3">
                    <CircleMark />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--color-ink)]">Davis Watches You Sleep</p>
                        <p className="truncate text-sm text-[var(--color-ink-muted)]">Oura, lovingly overanalyzed</p>
                    </div>
                </div>
                {!isLoadingProfiles && profiles.length > 0 ? (
                    <Badge tone="neutral" className="shrink-0">
                        <Users aria-hidden="true" className="h-3.5 w-3.5" />
                        {profiles.length} {profiles.length === 1 ? 'sleeper' : 'sleepers'}
                    </Badge>
                ) : null}
            </header>

            <main className="mx-auto grid w-full max-w-[var(--content-width)] gap-5 py-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.72fr)] lg:items-start lg:gap-10 lg:py-12">
                <section className="order-2 px-1 py-3 lg:order-1 lg:py-8" aria-labelledby="welcome-title">
                    <Badge tone={competitionInviteToken || inviteLanding ? 'accent' : 'neutral'}>
                        {competitionInviteToken ? <Trophy aria-hidden="true" className="h-3.5 w-3.5" /> : <Users aria-hidden="true" className="h-3.5 w-3.5" />}
                        {heroCopy.eyebrow}
                    </Badge>

                    <h1 id="welcome-title" className="mt-5 max-w-[17ch] text-[clamp(2.25rem,8vw,4.25rem)] leading-[0.98] tracking-[-0.045em] text-[var(--color-ink)]">
                        {heroCopy.title}
                    </h1>
                    <p className="mt-5 max-w-[58ch] text-[1rem] leading-7 text-[var(--color-ink-secondary)] sm:text-lg sm:leading-8">
                        {heroCopy.description}
                    </p>

                    {competitionInviteToken ? (
                        <Card variant="outlined" className="mt-5 p-4 sm:p-5" aria-live="polite">
                            {isCompetitionInviteLoading ? (
                                <div className="space-y-3" role="status" aria-label="Loading competition invitation">
                                    <Skeleton className="h-4 w-36" />
                                    <Skeleton className="h-6 w-64 max-w-full" />
                                    <Skeleton className="h-4 w-48 max-w-full" />
                                </div>
                            ) : competitionInvitePreview ? (
                                <div className="flex items-start gap-3">
                                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                                        <CalendarDays aria-hidden="true" className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[var(--color-ink)]">{competitionInvitePreview.competition.title}</p>
                                        <p className="mt-1 text-sm leading-6 text-[var(--color-ink-secondary)]">
                                            {formatISODateForDisplay(competitionInvitePreview.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}
                                            {' – '}
                                            {formatISODateForDisplay(competitionInvitePreview.competition.endDate, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                        {competitionInvitePreview.competition.description ? (
                                            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">{competitionInvitePreview.competition.description}</p>
                                        ) : null}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-3 text-sm leading-6 text-[var(--color-ink-secondary)]">
                                    <CloudOff aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
                                    <p>{competitionInviteError || 'Competition details are unavailable. You can still join the shared leaderboard.'}</p>
                                </div>
                            )}
                        </Card>
                    ) : null}
                </section>

                <Card variant="elevated" className="order-1 p-5 sm:p-6 lg:order-2" aria-labelledby="profile-picker-title">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="ui-eyebrow">Choose your view</p>
                            <h2 id="profile-picker-title" className="mt-2 text-xl font-semibold text-[var(--color-ink)] sm:text-2xl">
                                {profiles.length > 0 ? 'Choose a sleeper' : 'Connect the first profile'}
                            </h2>
                        </div>
                        <CircleUserRound aria-hidden="true" className="h-7 w-7 shrink-0 text-[var(--color-accent)]" />
                    </div>

                    {isCompletingOAuth ? (
                        <StatePanel
                            className="mt-5"
                            eyebrow="Oura connection"
                            title="Finishing your Oura connection"
                            description="Keep this page open while Oura completes the connection and the profile is saved."
                            icon={<RefreshCw className="animate-spin" />}
                            role="status"
                            aria-live="polite"
                        />
                    ) : null}

                    {firebaseError ? (
                        <StatePanel
                            className="mt-5"
                            eyebrow="Profile list"
                            title="We couldn’t refresh the profiles"
                            description={profiles.length > 0
                                ? 'Anything already shown may be older. Retry when you’re ready.'
                                : 'The profile list is unavailable right now. Retry before choosing a profile.'}
                            icon={<CloudOff />}
                            tone="error"
                            action={(
                                <Button variant="secondary" onClick={retryFirebaseConnection}>
                                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                                    Retry profile list
                                </Button>
                            )}
                            role="alert"
                        />
                    ) : null}

                    <div className="mt-6">
                        {isLoadingProfiles ? (
                            <ProfileListSkeleton />
                        ) : profiles.length > 0 ? (
                            <div className="space-y-3">
                                {profiles.map((profile) => {
                                    const freshness = getProfileFreshness(profile);
                                    const displayName = getProfileDisplayName(profile);
                                    const initial = displayName.trim().charAt(0).toUpperCase() || 'O';

                                    return (
                                        <div key={profile.id} className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-4 shadow-sm">
                                            <div className="flex items-start gap-3">
                                                <span
                                                    aria-hidden="true"
                                                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-sm font-bold text-[var(--color-accent)]"
                                                >
                                                    {initial}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[1rem] font-semibold text-[var(--color-ink)]">{displayName}</p>
                                                    <p className="truncate text-sm text-[var(--color-ink-muted)]">Oura sleeper</p>
                                                    <div className="mt-2">
                                                        <Badge tone={freshness.tone} title={freshness.description}>
                                                            <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                                                            {freshness.timestamp ? (
                                                                <time dateTime={freshness.timestamp}>{freshness.label}</time>
                                                            ) : freshness.label}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                <Button variant="secondary" className="w-full justify-between" onClick={() => setActiveProfileId(profile.id)}>
                                                    Open dashboard
                                                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}

                                <p className="px-1 text-sm leading-6 text-[var(--color-ink-muted)]">
                                    Sync labels use saved timestamps only. They do not run a new ring connection test.
                                </p>
                            </div>
                        ) : firebaseError ? null : (
                            <StatePanel
                                eyebrow="No sleepers yet"
                                title="Begin with one Oura account"
                                description="After the first profile connects, you can share an invite and build the circle together."
                                icon={<CircleUserRound />}
                            />
                        )}
                    </div>

                    <div className="mt-6 border-t border-[var(--color-line)] pt-5">
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
                                    Finishing connection…
                                </>
                            ) : (
                                <>
                                    <Plus aria-hidden="true" className="h-5 w-5" />
                                    {profiles.length > 0 ? 'Connect another Oura account' : 'Connect Oura account'}
                                </>
                            )}
                        </Button>
                        <p className="mt-3 text-center text-sm leading-6 text-[var(--color-ink-muted)]">
                            Oura will ask which health-data permissions you want to share with this leaderboard.
                        </p>
                        <p className="mt-2 text-center text-xs leading-5 text-[var(--color-ink-muted)]">
                            This app has no member sign-in. Anyone with its web address can view the shared profiles and health data.
                        </p>
                    </div>
                </Card>
            </main>

            <footer className="mx-auto w-full max-w-[var(--content-width)] border-t border-[var(--color-line)] py-5 text-sm leading-6 text-[var(--color-ink-muted)]">
                For friends, not doctors. This is not a medical or diagnostic tool.
            </footer>

        </div>
    );
};

export default Welcome;

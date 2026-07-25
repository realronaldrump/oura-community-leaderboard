import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider, useUser } from './contexts/UserContext';
import Welcome from './pages/Welcome';
import { Button, Card, Dialog, Skeleton, StatePanel } from './components/ui';
import { OAUTH_STATE_KEY, POST_AUTH_DESTINATION_KEY, REDIRECT_URI } from './constants';
import { oauthService, OAuthRequestError } from './services/oauthService';
import { competitionService } from './services/competitionService';
import { getProfileDisplayName } from './utils/profileName';
import { getCompetitionInviteToken } from './utils/inviteLink';
import { formatISODateForDisplay } from './utils/date';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

const APP_PATHS = new Set([
    '/',
    '/join',
    '/leaderboard',
    '/leaderboard/compete',
    '/trends',
    '/trends/streaks',
    '/trends/insights',
    '/more',
    '/more/export',
    '/settings',
]);

export const getSafeAppDestination = (candidate: string | null | undefined): string => {
    if (!candidate || typeof window === 'undefined') return '/';

    try {
        const url = new URL(candidate, window.location.origin);
        if (url.origin !== window.location.origin || !APP_PATHS.has(url.pathname)) return '/';
        if (url.pathname === '/join' && !getCompetitionInviteToken(url.search)) return '/';
        return `${url.pathname}${url.search}`;
    } catch {
        return '/';
    }
};

const PageLoadingFallback = () => (
    <div
        className="min-h-[100dvh] bg-[var(--color-canvas)] px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6"
        role="status"
        aria-label="Loading dashboard"
    >
        <header className="mx-auto flex w-full max-w-[var(--content-width)] items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                </div>
            </div>
            <Skeleton className="h-11 w-11 rounded-full" />
        </header>
        <main className="mx-auto w-full max-w-[var(--content-width)] py-6 sm:py-10">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-10 w-72 max-w-[80vw]" />
            <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
            <Skeleton className="mt-7 h-11 w-full rounded-[var(--radius-md)]" />
            <Card className="mt-5 overflow-hidden p-0">
                <div className="flex items-start justify-between gap-4 p-5">
                    <div className="space-y-3">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-9 w-36" />
                        <Skeleton className="h-3 w-44 max-w-full" />
                    </div>
                    <Skeleton className="h-12 w-14" />
                </div>
                <div className="grid grid-cols-3 border-y border-line">
                    {[0, 1, 2].map((item) => (
                        <div key={item} className="space-y-2 border-r border-line p-4 last:border-r-0">
                            <Skeleton className="h-3 w-14 max-w-full" />
                            <Skeleton className="h-6 w-10" />
                        </div>
                    ))}
                </div>
                <div className="p-3"><Skeleton className="h-3 w-24" /></div>
            </Card>
            <Skeleton className="mt-8 h-5 w-24" />
            <div className="mt-4 grid grid-cols-2 gap-3">
                {[0, 1].map((item) => (
                    <Card key={item} className="space-y-4 p-4">
                        <Skeleton className="h-3 w-20 max-w-full" />
                        <Skeleton className="h-7 w-16" />
                    </Card>
                ))}
            </div>
        </main>
        <span className="sr-only">Loading dashboard…</span>
    </div>
);

const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseUpstreamOAuthError = (details: unknown): { code?: string; description?: string } => {
    if (!isObject(details)) return {};
    const code = typeof details.error === 'string' ? details.error : undefined;
    const description = typeof details.error_description === 'string' ? details.error_description : undefined;
    return { code, description };
};

const formatAuthFailureMessage = (error: unknown): string => {
    if (error instanceof OAuthRequestError) {
        const upstream = parseUpstreamOAuthError(error.details);

        if (error.code === 'token_exchange_failed') {
            if (upstream.code === 'invalid_grant') {
                return 'Authentication failed: the Oura authorization code expired or was already used. Please reconnect and finish the Oura authorization again.';
            }
            if (upstream.code === 'invalid_client') {
                return 'Authentication failed: Oura client credentials are misconfigured on the server.';
            }
            if (upstream.code === 'invalid_redirect_uri') {
                return 'Authentication failed: redirect URI mismatch between this app and your Oura developer settings.';
            }
            if (upstream.description) {
                return `Authentication failed: ${upstream.description}`;
            }
            return 'Authentication failed during token exchange with Oura.';
        }

        if (error.code === 'missing_oauth_config') {
            return 'Authentication failed: server is missing OURA_CLIENT_ID or OURA_CLIENT_SECRET.';
        }

        if (error.code === 'missing_redirect_uri') {
            return 'Authentication failed: missing redirect URI in OAuth configuration.';
        }

        if (error.code === 'invalid_token_response') {
            return 'Authentication failed: token endpoint did not return an access token.';
        }

        return 'Authentication failed while contacting the OAuth server.';
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('unauthorized') || message.includes('401')) {
            return 'Authentication failed: received token could not access Oura personal info.';
        }
        if (message.includes('permission') || message.includes('firestore')) {
            return 'Authentication failed while saving your profile to Firebase.';
        }
    }

    return 'Authentication failed. Please try again.';
};

const getSafeErrorDiagnostic = (error: unknown): Record<string, unknown> => {
    if (error instanceof OAuthRequestError) {
        return { name: error.name, code: error.code, status: error.status };
    }
    if (error instanceof Error) {
        return { name: error.name };
    }
    return { type: typeof error };
};

const Router = () => {
    const { activeProfile, addProfile } = useUser();
    const [path, setPath] = useState(window.location.pathname);
    const [dialogState, setDialogState] = useState<{ title: string; message: string } | null>(null);
    const [isCompletingOAuth, setIsCompletingOAuth] = useState(() => Boolean(
        new URLSearchParams(window.location.search).get('code')?.trim()
    ));

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Handle OAuth callback (authorization code flow).
    // The exchange must run exactly once: authorization codes are single-use,
    // so re-running this effect would surface an invalid_grant error.
    const oauthHandledRef = useRef(false);
    useEffect(() => {
        if (oauthHandledRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        const oauthErrorDescription = params.get('error_description');

        if (oauthError) {
            window.history.replaceState(null, '', window.location.pathname);
            setIsCompletingOAuth(false);
            console.error('OAuth failed', { oauthError });
            setDialogState({
                title: 'Authentication Unsuccessful',
                message: `Authentication failed: ${oauthErrorDescription || oauthError}`,
            });
            return;
        }

        const code = params.get('code');
        if (params.has('code') && !code?.trim()) {
            oauthHandledRef.current = true;
            window.history.replaceState(null, '', window.location.pathname);
            setIsCompletingOAuth(false);
            setDialogState({
                title: 'Authentication Unsuccessful',
                message: 'Authentication failed: Oura returned an empty authorization code. Please reconnect and try again.',
            });
            return;
        }
        if (!code) return;
        oauthHandledRef.current = true;

        const state = params.get('state');
        const redirectScopes = params.get('scope');
        const storedState = localStorage.getItem(OAUTH_STATE_KEY);
        const storedDestination = getSafeAppDestination(localStorage.getItem(POST_AUTH_DESTINATION_KEY));
        localStorage.removeItem(OAUTH_STATE_KEY);
        localStorage.removeItem(POST_AUTH_DESTINATION_KEY);
        window.history.replaceState(null, '', window.location.pathname);

        if (!state || !storedState || state !== storedState) {
            setIsCompletingOAuth(false);
            console.error('OAuth state mismatch', {
                returnedStatePresent: Boolean(state),
                storedStatePresent: Boolean(storedState),
            });
            setDialogState({
                title: 'Authentication Unsuccessful',
                message: 'Authentication failed: invalid OAuth state.',
            });
            return;
        }

        oauthService.exchangeCodeForTokens(code, REDIRECT_URI)
            .then((tokens) => {
                // Prefer scopes from token response; fall back to redirect URL scopes
                // (Oura's token response omits the scope field)
                const scopes = tokens.grantedScopes?.length > 0
                    ? tokens.grantedScopes
                    : redirectScopes
                        ? redirectScopes.split(/[ ,]+/).map(s => s.trim()).filter(Boolean)
                        : [];
                return addProfile({
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    grantedScopes: scopes,
                    expiresInSeconds: tokens.expiresInSeconds,
                });
            })
            .then(async (profile) => {
                const inviteToken = getCompetitionInviteToken(new URL(storedDestination, window.location.origin).search);
                let nextDestination = storedDestination;
                if (inviteToken) {
                    try {
                        const result = await competitionService.acceptCompetitionInviteToken(inviteToken, {
                            profileId: profile.id,
                            displayName: getProfileDisplayName(profile),
                        });
                        setDialogState({
                            title: 'Competition Joined',
                            message: `You joined ${result.competition.title}. It starts ${formatISODateForDisplay(result.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}.`,
                        });
                        nextDestination = '/leaderboard/compete';
                    } catch (error) {
                        console.error('Competition invite acceptance failed', getSafeErrorDiagnostic(error));
                        setDialogState({
                            title: 'Invite Not Applied',
                            message: 'Your Oura account connected successfully, but the competition invite could not be applied. You can retry it from Competitions.',
                        });
                        nextDestination = `/leaderboard/compete?competitionInvite=${encodeURIComponent(inviteToken)}`;
                    }
                }

                window.history.replaceState(null, '', nextDestination);
                setPath(new URL(nextDestination, window.location.origin).pathname);
                setIsCompletingOAuth(false);
            })
            .catch(err => {
                setIsCompletingOAuth(false);
                console.error('Auth failed', getSafeErrorDiagnostic(err));
                setDialogState({
                    title: 'Authentication Unsuccessful',
                    message: formatAuthFailureMessage(err),
                });
            });
    }, [addProfile]);

    const routeIsKnown = APP_PATHS.has(path);
    const routedPage = !routeIsKnown
        ? (
            <main className="grid min-h-[100dvh] place-items-center bg-canvas px-4">
                <StatePanel
                    eyebrow="404"
                    headingLevel="h1"
                    title="This page isn’t part of the circle."
                    description="The link may be old, or the page may have moved. Return to today’s view to keep going."
                    action={(
                        <Button onClick={() => {
                            window.history.replaceState({}, '', '/');
                            setPath('/');
                        }}>
                            Go to Davis Watches You Sleep
                        </Button>
                    )}
                />
            </main>
        )
        : isCompletingOAuth || !activeProfile
            ? <Welcome isCompletingOAuth={isCompletingOAuth} />
            : path === '/settings'
                ? <Suspense fallback={<PageLoadingFallback />}><Settings /></Suspense>
                : <Suspense fallback={<PageLoadingFallback />}><Dashboard /></Suspense>;

    return (
        <>
            {routedPage}
            <Dialog
                isOpen={Boolean(dialogState)}
                title={dialogState?.title || ''}
                onClose={() => setDialogState(null)}
            >
                <p className="m-0 text-sm leading-6 text-[var(--color-ink-secondary)]">
                    {dialogState?.message || ''}
                </p>
                <Button className="mt-5 w-full" onClick={() => setDialogState(null)} data-autofocus>
                    Dismiss
                </Button>
            </Dialog>
        </>
    );
};

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Oura requests already apply bounded, Retry-After-aware retries.
            // One query-level replay recovers transient orchestration failures
            // without multiplying every endpoint burst three more times.
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        },
    },
});

const App: React.FC = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <UserProvider>
                <Router />
            </UserProvider>
        </QueryClientProvider>
    );
};

export default App;

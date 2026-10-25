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
    '/settings/export',
    '/friends',
    '/friends/challenges',
    '/records',
]);

export const getSafeAppDestination = (candidate: string | null | undefined): string => {
    if (!candidate || typeof window === 'undefined') return '/';

    try {
        const url = new URL(candidate, window.location.origin);
        if (url.origin !== window.location.origin || !(APP_PATHS.has(url.pathname) || /^\/(metrics|records)\/[^/]+$/.test(url.pathname))) return '/';
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
        aria-label="Loading"
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
        <span className="sr-only">Loading…</span>
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
                return 'The Oura sign-in expired or was already used. Connect again.';
            }
            if (upstream.code === 'invalid_client') {
                return 'The server’s Oura app credentials are wrong. Check OURA_CLIENT_ID and OURA_CLIENT_SECRET.';
            }
            if (upstream.code === 'invalid_redirect_uri') {
                return 'This address isn’t an allowed redirect in the Oura developer settings.';
            }
            if (upstream.description) {
                return `Oura said: ${upstream.description}`;
            }
            return 'Oura didn’t accept the sign-in. Try again.';
        }

        if (error.code === 'missing_oauth_config') {
            return 'The server is missing OURA_CLIENT_SECRET.';
        }

        if (error.code === 'missing_redirect_uri') {
            return 'The server has no redirect address configured.';
        }

        if (error.code === 'invalid_token_response') {
            return 'Oura didn’t return an access token. Try again.';
        }

        return 'Couldn’t reach the sign-in server. Try again.';
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('unauthorized') || message.includes('401')) {
            return 'Oura didn’t allow access to your profile. Connect again and allow personal info.';
        }
        if (message.includes('permission') || message.includes('firestore')) {
            return 'Connected to Oura, but your profile didn’t save. Try again.';
        }
    }

    return 'Couldn’t connect Oura. Try again.';
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
                title: 'Oura not connected',
                message: oauthError === 'access_denied'
                    ? 'You cancelled the Oura sign-in.'
                    : `Oura said: ${oauthErrorDescription || oauthError}`,
            });
            return;
        }

        const code = params.get('code');
        if (params.has('code') && !code?.trim()) {
            oauthHandledRef.current = true;
            window.history.replaceState(null, '', window.location.pathname);
            setIsCompletingOAuth(false);
            setDialogState({
                title: 'Oura not connected',
                message: 'Oura returned an empty sign-in code. Try again.',
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
                title: 'Oura not connected',
                message: 'The sign-in didn’t match this browser. Start again from this page.',
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
                            title: 'You’re in',
                            message: `You joined ${result.competition.title}. It starts ${formatISODateForDisplay(result.competition.startDate, 'en-US', { month: 'short', day: 'numeric' })}.`,
                        });
                        nextDestination = '/friends/challenges';
                    } catch (error) {
                        console.error('Competition invite acceptance failed', getSafeErrorDiagnostic(error));
                        setDialogState({
                            title: 'Challenge not joined',
                            message: 'Oura is connected, but the challenge invite didn’t go through. You can try again from Challenges.',
                        });
                        nextDestination = `/friends/challenges?competitionInvite=${encodeURIComponent(inviteToken)}`;
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
                    title: 'Oura not connected',
                    message: formatAuthFailureMessage(err),
                });
            });
    }, [addProfile]);

    const routeIsKnown = APP_PATHS.has(path) || /^\/(metrics|records)\/[^/]+$/.test(path);
    const routedPage = !routeIsKnown
        ? (
            <main className="grid min-h-[100dvh] place-items-center bg-canvas px-4">
                <StatePanel
                    eyebrow="404"
                    headingLevel="h1"
                    title="Page not found"
                    description="This link may be out of date."
                    action={(
                        <Button onClick={() => {
                            window.history.replaceState({}, '', '/');
                            setPath('/');
                        }}>
                            Go to Today
                        </Button>
                    )}
                />
            </main>
        )
        : isCompletingOAuth || !activeProfile
            ? <Welcome isCompletingOAuth={isCompletingOAuth} />
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
                    OK
                </Button>
            </Dialog>
        </>
    );
};

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Browser queries read saved Firestore data only. One quiet replay
            // covers transient reads; focus and reconnect never start polling.
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

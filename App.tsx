import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider, useUser } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AppDialog from './components/AppDialog';
import { OAUTH_STATE_KEY, REDIRECT_URI } from './constants';
import { oauthService, OAuthRequestError } from './services/oauthService';

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
                return 'Authentication failed: the Oura authorization code expired or was already used. Please reconnect and finish sign-in again.';
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

const Router = () => {
    const { addProfile } = useUser();
    const [path, setPath] = useState(window.location.pathname);
    const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Handle OAuth callback (authorization code flow)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        const oauthErrorDescription = params.get('error_description');

        if (oauthError) {
            window.history.replaceState(null, '', window.location.pathname);
            console.error("OAuth failed", { oauthError, oauthErrorDescription });
            setAuthErrorMessage(`Authentication failed: ${oauthErrorDescription || oauthError}`);
            return;
        }

        const code = params.get('code');
        if (!code) return;

        const state = params.get('state');
        const storedState = localStorage.getItem(OAUTH_STATE_KEY);
        localStorage.removeItem(OAUTH_STATE_KEY);
        window.history.replaceState(null, '', window.location.pathname);

        if (!state || !storedState || state !== storedState) {
            console.error("OAuth state mismatch", { state, storedState });
            setAuthErrorMessage("Authentication failed: invalid OAuth state.");
            return;
        }

        oauthService.exchangeCodeForTokens(code, REDIRECT_URI)
            .then((tokens) => {
                return addProfile({
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    grantedScopes: tokens.grantedScopes,
                    expiresInSeconds: tokens.expiresInSeconds,
                });
            })
            .then(() => {
                console.log("Profile added via OAuth");
            })
            .catch(err => {
                console.error("Auth failed", err);
                setAuthErrorMessage(formatAuthFailureMessage(err));
            });
    }, [addProfile]);

    const routedPage = path === '/settings' ? <Settings /> : <Dashboard />;

    return (
        <>
            {routedPage}
            <AppDialog
                isOpen={Boolean(authErrorMessage)}
                title="Authentication Unsuccessful"
                message={authErrorMessage || ''}
                confirmText="Dismiss"
                onConfirm={() => setAuthErrorMessage(null)}
            />
        </>
    );
};

const queryClient = new QueryClient();

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

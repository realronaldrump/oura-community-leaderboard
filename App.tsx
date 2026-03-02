import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider, useUser } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AppDialog from './components/AppDialog';
import { OAUTH_STATE_KEY, REDIRECT_URI } from './constants';
import { oauthService } from './services/oauthService';

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
                setAuthErrorMessage("Authentication failed. Please try again.");
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

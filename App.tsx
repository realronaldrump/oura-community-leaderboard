import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider, useUser } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AppDialog from './components/AppDialog';

const Router = () => {
    const { addProfile } = useUser();
    const [path, setPath] = useState(window.location.pathname);
    const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Handle OAuth Callback
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash) return;

        const params = new URLSearchParams(hash.substring(1));
        const oauthError = params.get('error');
        const oauthErrorDescription = params.get('error_description');

        if (oauthError) {
            window.history.replaceState(null, '', window.location.pathname);
            console.error("OAuth failed", { oauthError, oauthErrorDescription });
            setAuthErrorMessage(`Authentication failed: ${oauthErrorDescription || oauthError}`);
            return;
        }

        if (params.has('access_token')) {
            const accessToken = params.get('access_token');
            const scopeParam = params.get('scope') || '';
            const grantedScopes = scopeParam
                .split(/[ ,]+/)
                .map(scope => scope.trim())
                .filter(Boolean);
            const expiresInRaw = params.get('expires_in');
            const expiresInSeconds = expiresInRaw ? Number(expiresInRaw) : null;

            if (accessToken) {
                window.history.replaceState(null, '', window.location.pathname);

                addProfile(accessToken, {
                    grantedScopes,
                    expiresInSeconds: typeof expiresInSeconds === 'number' && Number.isFinite(expiresInSeconds)
                        ? expiresInSeconds
                        : null
                })
                    .then(() => {
                        console.log("Profile added via OAuth");
                    })
                    .catch(err => {
                        console.error("Auth failed", err);
                        setAuthErrorMessage("Authentication failed. Please try again.");
                    });
            }
        }
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

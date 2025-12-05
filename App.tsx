import React, { useEffect, useState } from 'react';
import { UserProvider, useUser } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';

const Router = () => {
    const { addProfile } = useUser();
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Handle OAuth Callback
    useEffect(() => {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            if (accessToken) {
                window.history.replaceState(null, '', window.location.pathname);

                addProfile(accessToken)
                    .then(() => {
                        console.log("Profile added via OAuth");
                    })
                    .catch(err => {
                        console.error("Auth failed", err);
                        alert("Authentication failed. Please try again.");
                    });
            }
        }
    }, [addProfile]);

    return <Dashboard />;
};

const App: React.FC = () => {
    return (
        <UserProvider>
            <Router />
        </UserProvider>
    );
};

export default App;

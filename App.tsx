import React, { useEffect, useState } from 'react';
import { UserProvider, useUser } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';
import { ouraService } from './services/ouraService';

// Simple Router
const Router = () => {
    const { addProfile, login, authStatus } = useUser();
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Handle OAuth Callback
    useEffect(() => {
        // Check for hash parameters (Client-side flow)
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1)); // remove #
            const accessToken = params.get('access_token');
            if (accessToken) {
                // Clear hash to clean URL
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

    return (
        <div className="min-h-screen bg-black text-gray-100 font-sans selection:bg-oura-purple selection:text-white">
            <Dashboard />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <UserProvider>
            <Router />
        </UserProvider>
    );
};

export default App;

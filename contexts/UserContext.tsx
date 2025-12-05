import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, AuthStatus, LeaderboardEntry } from '../types';
import { AUTH_URL } from '../constants';
import { ouraService } from '../services/ouraService';

interface UserContextType {
    profiles: UserProfile[];
    activeProfileId: string | null;
    activeProfile: UserProfile | null;
    setActiveProfileId: (id: string) => void;
    addProfile: (token: string) => Promise<void>;
    removeProfile: (id: string) => void;
    authStatus: AuthStatus;
    login: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [profiles, setProfiles] = useState<UserProfile[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('oura_profiles');
            return saved ? JSON.parse(saved) : [];
        }
        return [];
    });

    const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('active_profile_id');
        }
        return null;
    });

    const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.UNAUTHENTICATED);

    useEffect(() => {
        localStorage.setItem('oura_profiles', JSON.stringify(profiles));
    }, [profiles]);

    useEffect(() => {
        if (activeProfileId) {
            localStorage.setItem('active_profile_id', activeProfileId);
        } else {
            localStorage.removeItem('active_profile_id');
        }
    }, [activeProfileId]);

    const activeProfile = profiles.find(p => p.id === activeProfileId) || null;

    const login = () => {
        setAuthStatus(AuthStatus.LOADING);
        window.location.href = AUTH_URL;
    };

    const addProfile = async (token: string) => {
        setAuthStatus(AuthStatus.LOADING);
        try {
            // Fetch user details to identify them
            const personalInfo = await ouraService.getPersonalInfo(token);

            const newProfile: UserProfile = {
                ...personalInfo,
                token, // Store token with profile (NOTE: In prod, encrypt this or use HTTP-only cookies)
                lastUpdated: new Date().toISOString(),
            };

            setProfiles(prev => {
                const exists = prev.find(p => p.email === newProfile.email);
                if (exists) {
                    // Update existing
                    return prev.map(p => p.email === newProfile.email ? { ...newProfile, id: p.id } : p);
                }
                return [...prev, { ...newProfile, id: crypto.randomUUID() }];
            });

            // Auto-select the new profile
            // We need to find the ID we just assigned or the existing one
            // Ideally personalInfo has an ID, but Oura 'personal_info' endpoint usage needs verification.
            // Assuming email is unique key for now.

            setAuthStatus(AuthStatus.AUTHENTICATED);
        } catch (error) {
            console.error("Failed to add profile", error);
            setAuthStatus(AuthStatus.UNAUTHENTICATED);
            throw error;
        }
    };

    const removeProfile = (id: string) => {
        setProfiles(prev => prev.filter(p => p.id !== id));
        if (activeProfileId === id) {
            setActiveProfileId(null);
        }
    };

    return (
        <UserContext.Provider value={{
            profiles,
            activeProfileId,
            activeProfile,
            setActiveProfileId,
            addProfile,
            removeProfile,
            authStatus,
            login
        }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};

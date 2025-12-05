import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, AuthStatus, LeaderboardEntry } from '../types';
import { getAuthUrl } from '../constants';
import { ouraService } from '../services/ouraService';
import { firebaseService } from '../services/firebaseService';

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
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('active_profile_id');
        }
        return null;
    });

    const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.UNAUTHENTICATED);

    // Subscribe to Firebase profiles
    useEffect(() => {
        const unsubscribe = firebaseService.subscribeToProfiles((updatedProfiles) => {
            setProfiles(updatedProfiles);
        });
        return () => unsubscribe();
    }, []);

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
        window.location.href = getAuthUrl();
    };

    const addProfile = async (token: string) => {
        setAuthStatus(AuthStatus.LOADING);
        try {
            // Fetch user details to identify them
            const personalInfo = await ouraService.getPersonalInfo(token);

            // Check if profile already exists to get its ID, or create new one
            const existingProfile = profiles.find(p => p.email === personalInfo.email);
            const profileId = existingProfile ? existingProfile.id : crypto.randomUUID();

            const newProfile: UserProfile = {
                ...personalInfo,
                id: profileId,
                token,
                lastUpdated: new Date().toISOString(),
            };

            await firebaseService.saveProfile(newProfile);
            setAuthStatus(AuthStatus.AUTHENTICATED);
        } catch (error) {
            console.error("Failed to add profile", error);
            setAuthStatus(AuthStatus.UNAUTHENTICATED);
            throw error;
        }
    };

    const removeProfile = async (id: string) => {
        await firebaseService.deleteProfile(id);
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

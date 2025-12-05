
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LocalUserProfile } from '../types';

interface UserContextType {
    profiles: LocalUserProfile[];
    activeProfileId: string | null; // ID of the profile currently being viewed in Dashboard
    addProfile: (name: string, token: string) => void;
    removeProfile: (id: string) => void;
    setActiveProfileId: (id: string) => void;
    activeProfile: LocalUserProfile | undefined;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'oura_community_profiles';

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [profiles, setProfiles] = useState<LocalUserProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

    useEffect(() => {
        const savedProfiles = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedProfiles) {
            try {
                const parsed = JSON.parse(savedProfiles);
                setProfiles(parsed);
                if (parsed.length > 0) {
                    setActiveProfileId(parsed[0].id);
                }
            } catch (e) {
                console.error('Failed to parse profiles', e);
            }
        }
    }, []);

    useEffect(() => {
        if (profiles.length > 0) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profiles));
        }
    }, [profiles]);

    const addProfile = (name: string, token: string) => {
        const newProfile: LocalUserProfile = {
            id: crypto.randomUUID(),
            name,
            token,
        };
        setProfiles(prev => [...prev, newProfile]);
        if (!activeProfileId) {
            setActiveProfileId(newProfile.id);
        }
    };

    const removeProfile = (id: string) => {
        setProfiles(prev => prev.filter(p => p.id !== id));
        if (activeProfileId === id) {
            setActiveProfileId(null);
        }
    };

    const activeProfile = profiles.find(p => p.id === activeProfileId);

    return (
        <UserContext.Provider value={{
            profiles,
            activeProfileId,
            addProfile,
            removeProfile,
            setActiveProfileId,
            activeProfile
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

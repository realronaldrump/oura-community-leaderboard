import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { UserProfile, AuthStatus } from '../types';
import { createOAuthState, getAuthUrl, OAUTH_STATE_KEY, POST_AUTH_DESTINATION_KEY } from '../constants';
import { firebaseService } from '../services/firebaseService';
import { oauthService } from '../services/oauthService';
import {
    clearLaunchDashboardStats,
    clearLaunchProfile,
    readLaunchProfile,
    writeLaunchProfile,
} from '../services/launchCache';
import { sanitizeGrantedOuraScopes } from '../utils/ouraScopes';

interface AddProfileOptions {
    accessToken: string;
    refreshToken?: string | null;
    grantedScopes?: string[];
    expiresInSeconds?: number | null;
}

interface UserContextType {
    profiles: UserProfile[];
    activeProfileId: string | null;
    activeProfile: UserProfile | null;
    setActiveProfileId: (id: string | null) => void;
    clearActiveProfileSelection: () => void;
    addProfile: (options: AddProfileOptions) => Promise<UserProfile>;
    removeProfile: (id: string) => Promise<void>;
    updateProfile: (profile: Partial<UserProfile>) => Promise<void>;
    updateProfileById: (id: string, profile: Partial<UserProfile>) => Promise<void>;
    authStatus: AuthStatus;
    login: () => void;
    // New: Error and loading states
    firebaseError: string | null;
    isLoadingProfiles: boolean;
    retryFirebaseConnection: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const PROFILE_BOOTSTRAP_TIMEOUT_MS = 8_000;

const withBootstrapTimeout = <T,>(task: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
        reject(new Error('profile_bootstrap_timeout'));
    }, PROFILE_BOOTSTRAP_TIMEOUT_MS);

    task.then(
        (value) => {
            window.clearTimeout(timeout);
            resolve(value);
        },
        (error) => {
            window.clearTimeout(timeout);
            reject(error);
        }
    );
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('active_profile_id') || null;
        }
        return null;
    });
    const [profiles, setProfiles] = useState<UserProfile[]>(() => {
        if (typeof window === 'undefined') return [];
        const rememberedId = localStorage.getItem('active_profile_id') || null;
        const rememberedProfile = readLaunchProfile(rememberedId);
        return rememberedProfile ? [rememberedProfile] : [];
    });

    const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.UNAUTHENTICATED);

    // New: Firebase connection state
    const [firebaseError, setFirebaseError] = useState<string | null>(null);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const automaticRetryRef = useRef<number | null>(null);
    const profilesRef = useRef(profiles);
    useEffect(() => { profilesRef.current = profiles; }, [profiles]);

    // Restore the remembered profile with a direct REST-backed document read
    // before starting the all-profile realtime listener. This keeps a cold
    // WebChannel handshake from blocking the first dashboard paint. The rest
    // of the profile list is filled in behind the selected profile.
    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        setIsLoadingProfiles(true);
        setFirebaseError(null);

        const reportBootstrapError = (operation: string, error: unknown) => {
            if (cancelled) return;
            console.error(`Firebase ${operation} error:`, error);
            setIsLoadingProfiles(false);
            setFirebaseError('Reconnecting automatically.');
            if (automaticRetryRef.current == null) {
                automaticRetryRef.current = window.setTimeout(() => {
                    automaticRetryRef.current = null;
                    setRetryCount((current) => current + 1);
                }, 3_000);
            }
        };

        const applyProfiles = (updatedProfiles: UserProfile[]) => {
            if (cancelled) return;
            setProfiles(updatedProfiles);
            setIsLoadingProfiles(false);
            setFirebaseError(null);
        };

        const startProfileSubscription = () => {
            if (cancelled || unsubscribe) return;
            unsubscribe = firebaseService.subscribeToProfiles(
                (updatedProfiles) => {
                    applyProfiles(updatedProfiles);
                    if (
                        activeProfileId &&
                        !updatedProfiles.some((profile) => profile.id === activeProfileId)
                    ) {
                        setActiveProfileIdState(null);
                    }
                },
                (error) => reportBootstrapError('subscription', error)
            );
        };

        const bootstrapProfiles = async () => {
            if (!activeProfileId) {
                try {
                    const loadedProfiles = await withBootstrapTimeout(firebaseService.getProfiles());
                    applyProfiles(loadedProfiles);
                } catch (error) {
                    reportBootstrapError('profile fetch', error);
                }
                return;
            }

            try {
                const selectedProfile = await withBootstrapTimeout(
                    firebaseService.getProfile(activeProfileId)
                );
                if (cancelled) return;
                if (!selectedProfile) {
                    setActiveProfileIdState(null);
                    return;
                }

                setProfiles((current) => [
                    selectedProfile,
                    ...current.filter((profile) => profile.id !== selectedProfile.id),
                ]);
                setIsLoadingProfiles(false);
                setFirebaseError(null);

                // Populate peers through the faster one-shot transport. Realtime
                // updates begin only after this non-critical bootstrap finishes.
                try {
                    const loadedProfiles = await withBootstrapTimeout(firebaseService.getProfiles());
                    applyProfiles(loadedProfiles);
                } catch (error) {
                    reportBootstrapError('background profile fetch', error);
                } finally {
                    startProfileSubscription();
                }
            } catch (error) {
                reportBootstrapError('selected profile fetch', error);
                startProfileSubscription();
            }
        };

        void bootstrapProfiles();

        return () => {
            cancelled = true;
            unsubscribe?.();
            if (automaticRetryRef.current != null) {
                window.clearTimeout(automaticRetryRef.current);
                automaticRetryRef.current = null;
            }
        };
    }, [activeProfileId, retryCount]);

    const retryFirebaseConnection = useCallback(() => {
        setRetryCount(c => c + 1);
    }, []);

    const setActiveProfileId = useCallback((id: string | null) => {
        setActiveProfileIdState(id || null);
    }, []);

    const clearActiveProfileSelection = useCallback(() => {
        setActiveProfileIdState(null);
    }, []);

    useEffect(() => {
        if (activeProfileId) {
            localStorage.setItem('active_profile_id', activeProfileId);
        } else {
            localStorage.removeItem('active_profile_id');
        }
    }, [activeProfileId]);

    const activeProfile = profiles.find(p => p.id === activeProfileId) || null;

    useEffect(() => {
        if (activeProfile) writeLaunchProfile(activeProfile);
        else if (!activeProfileId) clearLaunchProfile();
    }, [activeProfile, activeProfileId]);

    const login = useCallback(() => {
        setAuthStatus(AuthStatus.LOADING);
        const state = createOAuthState();
        localStorage.setItem(OAUTH_STATE_KEY, state);
        if (typeof window !== 'undefined') {
            const destination = `${window.location.pathname}${window.location.search}`;
            localStorage.setItem(POST_AUTH_DESTINATION_KEY, destination);
        }
        window.location.href = getAuthUrl(state);
    }, []);

    const addProfile = useCallback(async (options: AddProfileOptions): Promise<UserProfile> => {
        setAuthStatus(AuthStatus.LOADING);
        try {
            const newProfile = await oauthService.saveProfileConnection({
                accessToken: options.accessToken,
                refreshToken: options.refreshToken || null,
                grantedScopes: sanitizeGrantedOuraScopes(options.grantedScopes),
                expiresInSeconds: options.expiresInSeconds ?? null,
            });
            setActiveProfileId(newProfile.id);
            setAuthStatus(AuthStatus.AUTHENTICATED);
            return newProfile;
        } catch (error) {
            console.error("Failed to add profile", error);
            setAuthStatus(AuthStatus.UNAUTHENTICATED);
            throw error;
        }
    }, [setActiveProfileId]);

    const removeProfile = useCallback(async (id: string) => {
        if (profilesRef.current.length <= 1) {
            throw new Error('Cannot remove the only remaining profile.');
        }
        // Server cleanup removes saved history, private OAuth credentials,
        // sync state, and the public profile as one managed lifecycle.
        await oauthService.removeProfileConnection(id);
        clearLaunchDashboardStats(id);
        if (activeProfileId === id) clearLaunchProfile();
        setActiveProfileIdState((current) => (current === id ? null : current));
    }, [activeProfileId]);

    const updateProfileById = useCallback(async (id: string, profileData: Partial<UserProfile>) => {
        const profileToUpdate = profilesRef.current.find(p => p.id === id);
        if (!profileToUpdate) return;

        // Patch only the fields the caller changed. Replacing a profile built
        // from a stale subscription snapshot can restore a consumed refresh
        // token after another tab has already rotated it.
        const profilePatch = {
            ...profileData,
            lastUpdated: new Date().toISOString()
        };

        await firebaseService.patchProfile(id, profilePatch);
    }, []);

    const updateProfile = useCallback(async (profileData: Partial<UserProfile>) => {
        if (!activeProfileId) return;
        await updateProfileById(activeProfileId, profileData);
    }, [activeProfileId, updateProfileById]);

    const contextValue = useMemo<UserContextType>(() => ({
        profiles,
        activeProfileId,
        activeProfile,
        setActiveProfileId,
        clearActiveProfileSelection,
        addProfile,
        removeProfile,
        updateProfile,
        updateProfileById,
        authStatus,
        login,
        firebaseError,
        isLoadingProfiles,
        retryFirebaseConnection
    }), [
        profiles,
        activeProfileId,
        activeProfile,
        setActiveProfileId,
        clearActiveProfileSelection,
        addProfile,
        removeProfile,
        updateProfile,
        updateProfileById,
        authStatus,
        login,
        firebaseError,
        isLoadingProfiles,
        retryFirebaseConnection
    ]);

    return (
        <UserContext.Provider value={contextValue}>
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

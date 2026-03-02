import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { UserProfile, AuthStatus } from '../types';
import { createOAuthState, getAuthUrl, OAUTH_STATE_KEY } from '../constants';
import { ouraService } from '../services/ouraService';
import { firebaseService } from '../services/firebaseService';
import { oauthService } from '../services/oauthService';

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
    addProfile: (options: AddProfileOptions) => Promise<void>;
    removeProfile: (id: string) => Promise<void>;
    updateProfile: (profile: Partial<UserProfile>) => Promise<void>;
    updateProfileById: (id: string, profile: Partial<UserProfile>) => Promise<void>;
    getAccessTokenForProfile: (profileId: string, options?: { forceRefresh?: boolean }) => Promise<string>;
    markProfileSyncSuccess: (profileId: string) => Promise<void>;
    markProfileSyncError: (profileId: string, error: unknown) => Promise<void>;
    authStatus: AuthStatus;
    login: () => void;
    // New: Error and loading states
    firebaseError: string | null;
    isLoadingProfiles: boolean;
    retryFirebaseConnection: () => void;
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

    // New: Firebase connection state
    const [firebaseError, setFirebaseError] = useState<string | null>(null);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const refreshInFlightRef = useRef(new Map<string, Promise<string>>());

    // Subscribe to Firebase profiles with error handling
    useEffect(() => {
        setIsLoadingProfiles(true);
        setFirebaseError(null);

        const unsubscribe = firebaseService.subscribeToProfiles(
            (updatedProfiles) => {
                setProfiles(updatedProfiles);
                setIsLoadingProfiles(false);
                setFirebaseError(null);
            },
            (error) => {
                console.error('Firebase subscription error:', error);
                setIsLoadingProfiles(false);
                // Keep error message friendly and non-technical
                setFirebaseError('Having trouble connecting. Tap to try again!');
            }
        );
        return () => unsubscribe();
    }, [retryCount]);

    const retryFirebaseConnection = useCallback(() => {
        setRetryCount(c => c + 1);
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
        const state = createOAuthState();
        localStorage.setItem(OAUTH_STATE_KEY, state);
        window.location.href = getAuthUrl(state);
    };

    const addProfile = async (options: AddProfileOptions) => {
        setAuthStatus(AuthStatus.LOADING);
        try {
            const { accessToken, refreshToken = null } = options;
            // Fetch user details to identify them
            const personalInfo = await ouraService.getPersonalInfo(accessToken);
            const ouraUserId =
                (personalInfo as unknown as { id?: string | number })?.id != null
                    ? String((personalInfo as unknown as { id?: string | number }).id)
                    : null;
            const normalizedEmail = personalInfo.email?.toLowerCase() || null;

            // Match by stable Oura user id first, then email as fallback.
            const existingProfile = profiles.find(
                (p) =>
                    (ouraUserId && p.ouraUserId === ouraUserId) ||
                    (normalizedEmail && p.email?.toLowerCase() === normalizedEmail)
            );
            const profileId = existingProfile ? existingProfile.id : crypto.randomUUID();
            const expiresInSeconds =
                typeof options.expiresInSeconds === 'number' && Number.isFinite(options.expiresInSeconds)
                    ? options.expiresInSeconds
                    : null;
            const tokenExpiresAt =
                expiresInSeconds && expiresInSeconds > 0
                    ? new Date(Date.now() + (expiresInSeconds * 1000)).toISOString()
                    : null;

            const newProfile: UserProfile = {
                ...existingProfile,
                ...personalInfo,
                id: profileId,
                ouraUserId: ouraUserId || existingProfile?.ouraUserId || null,
                email: normalizedEmail || existingProfile?.email || null,
                token: accessToken,
                refreshToken: refreshToken || existingProfile?.refreshToken || null,
                grantedScopes: options.grantedScopes?.length ? options.grantedScopes : existingProfile?.grantedScopes,
                tokenExpiresAt,
                lastSuccessfulSyncAt: existingProfile?.lastSuccessfulSyncAt || null,
                lastSyncError: null,
                lastSyncErrorAt: null,
                lastUpdated: new Date().toISOString(),
            };

            // Clear any cached unavailable-endpoint blacklists for the new token
            ouraService.clearUnavailableEndpoints(accessToken);

            await firebaseService.saveProfile(newProfile);
            setActiveProfileId(profileId);
            setAuthStatus(AuthStatus.AUTHENTICATED);
        } catch (error) {
            console.error("Failed to add profile", error);
            setAuthStatus(AuthStatus.UNAUTHENTICATED);
            throw error;
        }
    };

    const removeProfile = async (id: string) => {
        if (profiles.length <= 1) {
            throw new Error('Cannot remove the only remaining profile.');
        }
        await firebaseService.deleteProfile(id);
        if (activeProfileId === id) {
            setActiveProfileId(null);
        }
    };

    const updateProfileById = async (id: string, profileData: Partial<UserProfile>) => {
        const profileToUpdate = profiles.find(p => p.id === id);
        if (!profileToUpdate) return;

        const updatedProfile = {
            ...profileToUpdate,
            ...profileData,
            lastUpdated: new Date().toISOString()
        };

        await firebaseService.saveProfile(updatedProfile);
    };

    const updateProfile = async (profileData: Partial<UserProfile>) => {
        if (!activeProfileId) return;
        await updateProfileById(activeProfileId, profileData);
    };

    const isTokenExpiringSoon = (tokenExpiresAt?: string | null): boolean => {
        if (!tokenExpiresAt) return false;
        const expiresAtMs = new Date(tokenExpiresAt).getTime();
        if (Number.isNaN(expiresAtMs)) return false;
        return expiresAtMs - Date.now() <= 2 * 60 * 1000;
    };

    const refreshProfileAccessToken = useCallback(async (profile: UserProfile): Promise<string> => {
        if (!profile.refreshToken) {
            throw new Error('missing_refresh_token');
        }

        const refreshed = await oauthService.refreshAccessToken(profile.refreshToken);
        const expiresInSeconds =
            typeof refreshed.expiresInSeconds === 'number' && Number.isFinite(refreshed.expiresInSeconds)
                ? refreshed.expiresInSeconds
                : null;
        const tokenExpiresAt =
            expiresInSeconds && expiresInSeconds > 0
                ? new Date(Date.now() + (expiresInSeconds * 1000)).toISOString()
                : profile.tokenExpiresAt || null;

        const refreshedProfilePatch: Partial<UserProfile> = {
            token: refreshed.accessToken,
            refreshToken: refreshed.refreshToken || profile.refreshToken || null,
            grantedScopes: refreshed.grantedScopes?.length ? refreshed.grantedScopes : profile.grantedScopes,
            tokenExpiresAt,
            lastSyncError: null,
            lastSyncErrorAt: null,
            lastUpdated: new Date().toISOString(),
        };

        await firebaseService.patchProfile(profile.id, refreshedProfilePatch);
        return refreshed.accessToken;
    }, []);

    const markProfileSyncError = useCallback(async (profileId: string, error: unknown) => {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        const message = error instanceof Error ? error.message : 'Sync failed';
        const now = new Date().toISOString();
        await firebaseService.patchProfile(profileId, {
            lastSyncError: message,
            lastSyncErrorAt: now,
            lastUpdated: now,
        });
    }, [profiles]);

    const markProfileSyncSuccess = useCallback(async (profileId: string) => {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;

        const nowMs = Date.now();
        const lastSuccessMs = profile.lastSuccessfulSyncAt ? new Date(profile.lastSuccessfulSyncAt).getTime() : 0;
        const recentlyUpdated = lastSuccessMs && (nowMs - lastSuccessMs) < (15 * 60 * 1000);
        const shouldPersist = !recentlyUpdated || Boolean(profile.lastSyncError);
        if (!shouldPersist) return;

        const now = new Date(nowMs).toISOString();
        await firebaseService.patchProfile(profileId, {
            lastSuccessfulSyncAt: now,
            lastSyncError: null,
            lastSyncErrorAt: null,
            lastUpdated: now,
        });
    }, [profiles]);

    const getAccessTokenForProfile = useCallback(async (
        profileId: string,
        options?: { forceRefresh?: boolean }
    ): Promise<string> => {
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) {
            throw new Error(`Profile not found: ${profileId}`);
        }

        const needsRefresh = Boolean(options?.forceRefresh) || isTokenExpiringSoon(profile.tokenExpiresAt);
        if (!needsRefresh) {
            return profile.token;
        }

        const existingRefresh = refreshInFlightRef.current.get(profileId);
        if (existingRefresh) {
            return existingRefresh;
        }

        const refreshPromise = refreshProfileAccessToken(profile)
            .catch(async (error) => {
                await markProfileSyncError(profileId, error);
                throw error;
            })
            .finally(() => {
                refreshInFlightRef.current.delete(profileId);
            });

        refreshInFlightRef.current.set(profileId, refreshPromise);
        return refreshPromise;
    }, [profiles, refreshProfileAccessToken, markProfileSyncError]);

    return (
        <UserContext.Provider value={{
            profiles,
            activeProfileId,
            activeProfile,
            setActiveProfileId,
            addProfile,
            removeProfile,
            updateProfile,
            updateProfileById,
            getAccessTokenForProfile,
            markProfileSyncSuccess,
            markProfileSyncError,
            authStatus,
            login,
            firebaseError,
            isLoadingProfiles,
            retryFirebaseConnection
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

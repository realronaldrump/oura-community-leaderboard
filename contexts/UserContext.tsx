import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { UserProfile, AuthStatus } from '../types';
import { createOAuthState, getAuthUrl, OAUTH_STATE_KEY, POST_AUTH_DESTINATION_KEY } from '../constants';
import { ouraService } from '../services/ouraService';
import { firebaseService } from '../services/firebaseService';
import { oauthService } from '../services/oauthService';
import {
    createOuraTokenLifecycle,
    isReconnectRequiredError,
} from '../services/ouraTokenLifecycle';
import { deleteProfileStats } from '../services/firestoreStatsService';
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

const withCrossTabRefreshLock = <T,>(
    profileId: string,
    task: () => Promise<T>
): Promise<T> => {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
        return task();
    }

    return navigator.locks.request(`oura-token-refresh:${profileId}`, task);
};

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [activeProfileId, setActiveProfileIdState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('active_profile_id') || null;
        }
        return null;
    });

    const [authStatus, setAuthStatus] = useState<AuthStatus>(AuthStatus.UNAUTHENTICATED);

    // New: Firebase connection state
    const [firebaseError, setFirebaseError] = useState<string | null>(null);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const profilesRef = useRef(profiles);
    useEffect(() => { profilesRef.current = profiles; }, [profiles]);
    const tokenLifecycleRef = useRef<ReturnType<typeof createOuraTokenLifecycle> | null>(null);
    if (!tokenLifecycleRef.current) {
        tokenLifecycleRef.current = createOuraTokenLifecycle({
            loadProfile: firebaseService.getProfile,
            persistRotation: firebaseService.persistRotatedProfileTokens,
            refreshTokens: async (refreshToken) => {
                const refreshed = await oauthService.refreshAccessToken(refreshToken);
                return {
                    ...refreshed,
                    grantedScopes: sanitizeGrantedOuraScopes(refreshed.grantedScopes),
                };
            },
            withRefreshLock: withCrossTabRefreshLock,
        });
    }

    // The public profile chooser needs one snapshot, not an open realtime
    // listener. Start realtime updates only after a profile is active so the
    // welcome route stays lightweight and does not maintain idle listeners.
    useEffect(() => {
        setIsLoadingProfiles(true);
        setFirebaseError(null);

        if (!activeProfileId) {
            let cancelled = false;
            firebaseService.getProfiles()
                .then((loadedProfiles) => {
                    if (cancelled) return;
                    setProfiles(loadedProfiles);
                    setIsLoadingProfiles(false);
                })
                .catch((error) => {
                    if (cancelled) return;
                    console.error('Firebase profile fetch error:', error);
                    setIsLoadingProfiles(false);
                    setFirebaseError('Having trouble connecting. Tap to try again!');
                });

            return () => {
                cancelled = true;
            };
        }

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
            const { accessToken, refreshToken = null } = options;
            const grantedScopes = sanitizeGrantedOuraScopes(options.grantedScopes);
            // Fetch user details to identify them
            const personalInfo = await ouraService.getPersonalInfo(accessToken);
            const ouraUserId =
                (personalInfo as unknown as { id?: string | number })?.id != null
                    ? String((personalInfo as unknown as { id?: string | number }).id)
                    : null;
            const normalizedEmail = personalInfo.email?.toLowerCase() || null;

            // Match by stable Oura user id first, then email as fallback.
            // Use the ref if profiles are already loaded; otherwise fetch directly
            // from Firebase to avoid the race where the snapshot hasn't arrived yet.
            let currentProfiles = profilesRef.current;
            if (currentProfiles.length === 0) {
                // Failing open here can create a duplicate profile and split
                // one member's credential history. Abort and retry the safe
                // lookup instead of guessing that no profile exists.
                currentProfiles = await firebaseService.getProfiles();
            }
            const ouraUserIdStr = ouraUserId ? String(ouraUserId) : null;
            const existingProfile = currentProfiles.find(
                (p) => {
                    const existingIdStr = p.ouraUserId ? String(p.ouraUserId) : null;
                    return (ouraUserIdStr && existingIdStr === ouraUserIdStr) ||
                           (normalizedEmail && p.email?.toLowerCase() === normalizedEmail);
                }
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
            const resolvedGrantedScopes = grantedScopes.length > 0
                ? grantedScopes
                : existingProfile?.grantedScopes;

            const newProfile: UserProfile = {
                ...existingProfile,
                ...personalInfo,
                id: profileId,
                ouraUserId: ouraUserId || existingProfile?.ouraUserId || null,
                email: normalizedEmail || existingProfile?.email || null,
                token: accessToken,
                // A new authorization is one credential set. Never retain an
                // older refresh token when Oura omits the replacement.
                refreshToken: refreshToken || null,
                grantedScopes: resolvedGrantedScopes || [],
                tokenExpiresAt,
                lastSuccessfulSyncAt: existingProfile?.lastSuccessfulSyncAt || null,
                lastSyncError: null,
                lastSyncErrorAt: null,
                lastUpdated: new Date().toISOString(),
            };

            // Clear any cached unavailable-endpoint blacklists for the new token
            ouraService.clearUnavailableEndpoints(accessToken, profileId);

            await firebaseService.saveProfile(newProfile);
            setActiveProfileId(profileId);
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
        // Remove health history first. If profile deletion ran first and the
        // stats cleanup failed, the shared collection would retain orphaned
        // health data with no in-app way to retry the cleanup.
        await deleteProfileStats(id);
        await firebaseService.deleteProfile(id);
        setActiveProfileIdState((current) => (current === id ? null : current));
    }, []);

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

    const markProfileSyncError = useCallback(async (profileId: string, error: unknown) => {
        const profile = profilesRef.current.find((p) => p.id === profileId);
        if (!profile) return;

        const message = error instanceof Error ? error.message : '';
        const normalizedMessage = message.toLowerCase();
        const requiresConsent =
            normalizedMessage.includes('missing required oura consent') ||
            normalizedMessage.includes('missing oura consent scopes');
        if (!isReconnectRequiredError(error) && !requiresConsent) {
            // Transient Oura, network, Firestore, and rate-limit failures must
            // not become durable "reconnect" state. React Query retains the
            // previous successful data while a later retry can recover.
            return;
        }

        const now = new Date().toISOString();
        await firebaseService.patchProfile(profileId, {
            lastSyncError: message || 'oura_reconnect_required',
            lastSyncErrorAt: now,
            lastUpdated: now,
        });
    }, []);

    const markProfileSyncSuccess = useCallback(async (profileId: string) => {
        const profile = profilesRef.current.find((p) => p.id === profileId);
        if (!profile) return;

        // Always clear durable reconnect state after a successful pull. A
        // local subscription snapshot can lag another tab's error write, so
        // using it to skip this patch can leave a false reconnect prompt.
        const now = new Date().toISOString();
        await firebaseService.patchProfile(profileId, {
            lastSuccessfulSyncAt: now,
            lastSyncError: null,
            lastSyncErrorAt: null,
            lastUpdated: now,
        });
    }, []);

    const getAccessTokenForProfile = useCallback(async (
        profileId: string,
        options?: { forceRefresh?: boolean }
    ): Promise<string> => {
        const profile = profilesRef.current.find((p) => p.id === profileId);
        if (!profile) {
            throw new Error(`Profile not found: ${profileId}`);
        }

        try {
            const token = await tokenLifecycleRef.current!.getAccessToken(profile, options);
            if (token !== profile.token) {
                ouraService.clearUnavailableEndpoints(token, profile.id);
            }
            return token;
        } catch (error) {
            if (isReconnectRequiredError(error)) {
                await markProfileSyncError(profileId, error);
            }
            throw error;
        }
    }, [markProfileSyncError]);

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
        getAccessTokenForProfile,
        markProfileSyncSuccess,
        markProfileSyncError,
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
        getAccessTokenForProfile,
        markProfileSyncSuccess,
        markProfileSyncError,
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

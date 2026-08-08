import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { UserProfile } from '../types';
import { OuraTokenLifecycleError } from '../services/ouraTokenLifecycle';
import { UserProvider, useUser } from './UserContext';

const mocks = vi.hoisted(() => ({
    subscribeToProfiles: vi.fn(),
    getProfiles: vi.fn(),
    getProfile: vi.fn(),
    saveProfile: vi.fn(),
    patchProfile: vi.fn(),
    persistRotatedProfileTokens: vi.fn(),
    deleteProfile: vi.fn(),
    deleteProfileStats: vi.fn(),
    clearUnavailableEndpoints: vi.fn(),
    getPersonalInfo: vi.fn(),
    refreshAccessToken: vi.fn(),
}));

vi.mock('../services/firebaseService', () => ({
    firebaseService: {
        subscribeToProfiles: mocks.subscribeToProfiles,
        getProfiles: mocks.getProfiles,
        getProfile: mocks.getProfile,
        saveProfile: mocks.saveProfile,
        patchProfile: mocks.patchProfile,
        persistRotatedProfileTokens: mocks.persistRotatedProfileTokens,
        deleteProfile: mocks.deleteProfile,
    },
}));

vi.mock('../services/firestoreStatsService', () => ({
    deleteProfileStats: mocks.deleteProfileStats,
}));

vi.mock('../services/ouraService', () => ({
    ouraService: {
        clearUnavailableEndpoints: mocks.clearUnavailableEndpoints,
        getPersonalInfo: mocks.getPersonalInfo,
    },
}));

vi.mock('../services/oauthService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/oauthService')>();
    return {
        ...actual,
        oauthService: {
            ...actual.oauthService,
            refreshAccessToken: mocks.refreshAccessToken,
        },
    };
});

const profile: UserProfile = {
    id: 'profile-1',
    ouraUserId: 'oura-user-1',
    email: 'member@example.com',
    token: 'access-old',
    refreshToken: 'refresh-old',
    tokenExpiresAt: '2026-08-23T12:00:00.000Z',
    grantedScopes: ['daily', 'personal'],
    firstName: 'Before',
    lastSyncError: null,
};

describe('UserProvider profile/token boundaries', () => {
    let context: ReturnType<typeof useUser> | null = null;

    const CaptureContext = () => {
        context = useUser();
        return null;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        context = null;
        mocks.subscribeToProfiles.mockImplementation((onProfiles: (profiles: UserProfile[]) => void) => {
            onProfiles([{ ...profile }]);
            return () => {};
        });
        mocks.getProfile.mockResolvedValue({ ...profile });
        mocks.getProfiles.mockResolvedValue([{ ...profile }]);
        mocks.patchProfile.mockResolvedValue(undefined);
    });

    it('patches edited fields instead of replacing a stale profile containing old credentials', async () => {
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await act(async () => {
            await context!.updateProfileById(profile.id, { firstName: 'After' });
        });

        expect(mocks.patchProfile).toHaveBeenCalledWith(profile.id, {
            firstName: 'After',
            lastUpdated: expect.any(String),
        });
        expect(mocks.saveProfile).not.toHaveBeenCalled();
    });

    it('restores a remembered profile before the all-profile subscription emits', async () => {
        localStorage.setItem('active_profile_id', profile.id);
        let resolveProfiles: ((profiles: UserProfile[]) => void) | undefined;
        mocks.getProfiles.mockImplementation(() => new Promise((resolve) => {
            resolveProfiles = resolve;
        }));
        mocks.subscribeToProfiles.mockImplementation(() => () => {});

        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );

        await waitFor(() => expect(context?.activeProfile?.id).toBe(profile.id));

        expect(context?.profiles).toEqual([expect.objectContaining({ id: profile.id })]);
        expect(context?.isLoadingProfiles).toBe(false);
        expect(mocks.getProfile).toHaveBeenCalledWith(profile.id);
        expect(mocks.getProfiles).toHaveBeenCalledTimes(1);
        expect(mocks.subscribeToProfiles).not.toHaveBeenCalled();
        expect(mocks.getProfile.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.getProfiles.mock.invocationCallOrder[0]
        );

        resolveProfiles?.([{ ...profile }]);
        await waitFor(() => expect(mocks.subscribeToProfiles).toHaveBeenCalledTimes(1));
    });

    it('never carries an existing refresh token into a newly authorized credential set', async () => {
        mocks.getPersonalInfo.mockResolvedValue({
            id: 'oura-user-1',
            email: 'member@example.com',
            firstName: 'Member',
        });
        mocks.saveProfile.mockResolvedValue(undefined);
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await act(async () => {
            await context!.addProfile({
                accessToken: 'access-from-new-authorization',
                refreshToken: null,
                grantedScopes: ['daily', 'personal'],
                expiresInSeconds: 2_592_000,
            });
        });

        expect(mocks.saveProfile).toHaveBeenCalledWith(expect.objectContaining({
            id: profile.id,
            token: 'access-from-new-authorization',
            refreshToken: null,
        }));
    });

    it('omits unknown scopes when saving a legacy profile instead of writing Firestore undefined', async () => {
        const legacyProfile = { ...profile, grantedScopes: undefined };
        mocks.getProfiles.mockResolvedValueOnce([legacyProfile]);
        mocks.getPersonalInfo.mockResolvedValue({
            id: 'oura-user-1',
            email: 'member@example.com',
            firstName: 'Member',
        });
        mocks.saveProfile.mockResolvedValue(undefined);
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await act(async () => {
            await context!.addProfile({
                accessToken: 'access-from-new-authorization',
                refreshToken: 'refresh-from-new-authorization',
            });
        });

        const savedProfile = mocks.saveProfile.mock.calls[0][0];
        expect(savedProfile).toHaveProperty('grantedScopes', []);
        expect(Object.values(savedProfile)).not.toContain(undefined);
    });

    it('does not persist transient sync failures as reconnect-required profile state', async () => {
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await act(async () => {
            await context!.markProfileSyncError(profile.id, new Error('Critical data fetch failed: 503'));
        });

        expect(mocks.patchProfile).not.toHaveBeenCalled();
    });

    it('persists only a typed unrecoverable refresh rejection as reconnect-required state', async () => {
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await act(async () => {
            await context!.markProfileSyncError(
                profile.id,
                new OuraTokenLifecycleError('reconnect_required', 'invalid_grant', 400)
            );
        });

        expect(mocks.patchProfile).toHaveBeenCalledWith(profile.id, {
            lastSyncError: 'invalid_grant',
            lastSyncErrorAt: expect.any(String),
            lastUpdated: expect.any(String),
        });
    });

    it('always clears durable reconnect state after a successful pull, even from a recent stale snapshot', async () => {
        mocks.getProfiles.mockResolvedValueOnce([{
                ...profile,
                lastSuccessfulSyncAt: new Date().toISOString(),
                lastSyncError: null,
            }]);
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await act(async () => {
            await context!.markProfileSyncSuccess(profile.id);
        });

        expect(mocks.patchProfile).toHaveBeenCalledWith(profile.id, {
            lastSuccessfulSyncAt: expect.any(String),
            lastSyncError: null,
            lastSyncErrorAt: null,
            lastUpdated: expect.any(String),
        });
    });

    it('deletes stored health history before removing a profile record', async () => {
        const secondProfile = { ...profile, id: 'profile-2', ouraUserId: 'oura-user-2' };
        mocks.subscribeToProfiles.mockImplementation((onProfiles: (profiles: UserProfile[]) => void) => {
            onProfiles([{ ...profile }, secondProfile]);
            return () => {};
        });
        mocks.getProfiles.mockResolvedValueOnce([{ ...profile }, secondProfile]);
        mocks.deleteProfileStats.mockResolvedValue(undefined);
        mocks.deleteProfile.mockResolvedValue(undefined);

        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(2));

        await act(async () => {
            await context!.removeProfile(secondProfile.id);
        });

        expect(mocks.deleteProfileStats).toHaveBeenCalledWith(secondProfile.id);
        expect(mocks.deleteProfile).toHaveBeenCalledWith(secondProfile.id);
        expect(mocks.deleteProfileStats.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.deleteProfile.mock.invocationCallOrder[0]
        );
    });

    it('does not remove the only profile', async () => {
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await expect(context!.removeProfile(profile.id)).rejects.toThrow('only remaining profile');
        expect(mocks.deleteProfileStats).not.toHaveBeenCalled();
        expect(mocks.deleteProfile).not.toHaveBeenCalled();
    });
});

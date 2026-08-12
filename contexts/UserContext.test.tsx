import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import type { UserProfile } from '../types';
import { writeLaunchProfile } from '../services/launchCache';
import { UserProvider, useUser } from './UserContext';

const mocks = vi.hoisted(() => ({
    subscribeToProfiles: vi.fn(),
    getProfiles: vi.fn(),
    getProfile: vi.fn(),
    saveProfile: vi.fn(),
    patchProfile: vi.fn(),
    deleteProfile: vi.fn(),
    saveProfileConnection: vi.fn(),
    removeProfileConnection: vi.fn(),
}));

vi.mock('../services/firebaseService', () => ({
    firebaseService: {
        subscribeToProfiles: mocks.subscribeToProfiles,
        getProfiles: mocks.getProfiles,
        getProfile: mocks.getProfile,
        saveProfile: mocks.saveProfile,
        patchProfile: mocks.patchProfile,
        deleteProfile: mocks.deleteProfile,
    },
}));

vi.mock('../services/oauthService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/oauthService')>();
    return {
        ...actual,
        oauthService: {
            ...actual.oauthService,
            saveProfileConnection: mocks.saveProfileConnection,
            removeProfileConnection: mocks.removeProfileConnection,
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

    it('paints the remembered public profile without waiting for Firestore', () => {
        localStorage.setItem('active_profile_id', profile.id);
        writeLaunchProfile(profile);
        mocks.getProfile.mockImplementation(() => new Promise(() => undefined));
        mocks.getProfiles.mockImplementation(() => new Promise(() => undefined));
        mocks.subscribeToProfiles.mockImplementation(() => () => {});

        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );

        expect(context?.activeProfile).toMatchObject({ id: profile.id, firstName: 'Before' });
        expect(context?.activeProfile).not.toHaveProperty('token');
        expect(context?.activeProfile).not.toHaveProperty('refreshToken');
    });

    it('hands a newly authorized credential set to the server without writing it to public Firestore', async () => {
        mocks.saveProfileConnection.mockResolvedValue({
            id: profile.id,
            ouraUserId: profile.ouraUserId,
            email: profile.email,
            firstName: 'Member',
            grantedScopes: ['daily', 'personal'],
        });
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

        expect(mocks.saveProfileConnection).toHaveBeenCalledWith(expect.objectContaining({
            accessToken: 'access-from-new-authorization',
            refreshToken: null,
        }));
        expect(mocks.saveProfile).not.toHaveBeenCalled();
    });

    it('omits unknown scopes when saving a legacy profile instead of writing Firestore undefined', async () => {
        const legacyProfile = { ...profile, grantedScopes: undefined };
        mocks.getProfiles.mockResolvedValueOnce([legacyProfile]);
        mocks.saveProfileConnection.mockResolvedValue({
            id: profile.id,
            ouraUserId: profile.ouraUserId,
            email: profile.email,
            firstName: 'Member',
            grantedScopes: [],
        });
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

        expect(mocks.saveProfileConnection).toHaveBeenCalledWith(expect.objectContaining({
            grantedScopes: [],
        }));
    });

    it('asks the server to remove the profile and all private state', async () => {
        const secondProfile = { ...profile, id: 'profile-2', ouraUserId: 'oura-user-2' };
        mocks.subscribeToProfiles.mockImplementation((onProfiles: (profiles: UserProfile[]) => void) => {
            onProfiles([{ ...profile }, secondProfile]);
            return () => {};
        });
        mocks.getProfiles.mockResolvedValueOnce([{ ...profile }, secondProfile]);
        mocks.removeProfileConnection.mockResolvedValue(undefined);

        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(2));

        await act(async () => {
            await context!.removeProfile(secondProfile.id);
        });

        expect(mocks.removeProfileConnection).toHaveBeenCalledWith(secondProfile.id);
    });

    it('does not remove the only profile', async () => {
        render(
            <UserProvider>
                <CaptureContext />
            </UserProvider>
        );
        await waitFor(() => expect(context?.profiles).toHaveLength(1));

        await expect(context!.removeProfile(profile.id)).rejects.toThrow('only remaining profile');
        expect(mocks.removeProfileConnection).not.toHaveBeenCalled();
    });
});

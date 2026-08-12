import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useUser } from '../contexts/UserContext';
import { useCompetitionInvitePreview } from '../hooks/useCompetitions';
import { AuthStatus, type UserProfile } from '../types';
import Welcome from './Welcome';

vi.mock('../contexts/UserContext', () => ({
    useUser: vi.fn(),
}));

vi.mock('../hooks/useCompetitions', () => ({
    useCompetitionInvitePreview: vi.fn(),
}));

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    id: 'profile-1',
    firstName: 'Davis',
    lastName: 'Johnson',
    email: 'davis@example.com',
    token: 'token',
    lastSuccessfulSyncAt: '2026-07-24T15:50:00.000Z',
    lastSyncError: null,
    ...overrides,
});

const mockUserState = (overrides: Record<string, unknown> = {}) => ({
    profiles: [],
    activeProfileId: null,
    activeProfile: null,
    setActiveProfileId: vi.fn(),
    clearActiveProfileSelection: vi.fn(),
    addProfile: vi.fn(),
    removeProfile: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn(),
    updateProfileById: vi.fn(),
    getAccessTokenForProfile: vi.fn(),
    markProfileSyncSuccess: vi.fn(),
    markProfileSyncError: vi.fn(),
    authStatus: AuthStatus.UNAUTHENTICATED,
    login: vi.fn(),
    firebaseError: null,
    isLoadingProfiles: false,
    retryFirebaseConnection: vi.fn(),
    ...overrides,
});

beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.mocked(useUser).mockReturnValue(mockUserState() as ReturnType<typeof useUser>);
    vi.mocked(useCompetitionInvitePreview).mockReturnValue({
        preview: null,
        isLoading: false,
        error: null,
    });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('Welcome', () => {
    it('selects an existing profile without fetching dashboard data first', () => {
        const setActiveProfileId = vi.fn();
        vi.mocked(useUser).mockReturnValue(mockUserState({
            profiles: [profile()],
            setActiveProfileId,
        }) as ReturnType<typeof useUser>);

        render(<Welcome />);

        fireEvent.click(screen.getByRole('button', { name: /open dashboard/i }));
        expect(setActiveProfileId).toHaveBeenCalledWith('profile-1');
        expect(screen.queryByText(/last sync|sync recorded|connection needs attention|saved timestamps/i)).not.toBeInTheDocument();
    });

    it('shows competition context while preserving profile choice', () => {
        window.history.replaceState({}, '', '/join?competitionInvite=invite-123');
        vi.mocked(useCompetitionInvitePreview).mockReturnValue({
            preview: {
                invite: {
                    id: 'invite-1',
                    competitionId: 'competition-1',
                    token: 'invite-123',
                    createdByProfileId: 'profile-2',
                    createdAt: '2026-07-24T12:00:00.000Z',
                    expiresAt: null,
                    maxUses: null,
                    acceptedProfileIds: [],
                    status: 'active',
                },
                competition: {
                    id: 'competition-1',
                    title: 'Sleep Week',
                    description: 'Seven calm nights together.',
                    mode: 'friends',
                    format: 'goal',
                    status: 'scheduled',
                    createdByProfileId: 'profile-2',
                    createdAt: '2026-07-24T12:00:00.000Z',
                    updatedAt: '2026-07-24T12:00:00.000Z',
                    startDate: '2026-07-25',
                    endDate: '2026-07-31',
                    timeZone: 'America/Denver',
                    rules: [],
                    participants: [],
                    participantProfileIds: [],
                    inviteTokenIds: ['invite-1'],
                    templateId: null,
                },
            },
            isLoading: false,
            error: null,
        });

        render(<Welcome />);

        expect(screen.getByRole('heading', { name: /invited to sleep week/i })).toBeInTheDocument();
        expect(screen.getByText('Seven calm nights together.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /connect oura account/i })).toBeInTheDocument();
    });

    it('keeps destructive profile controls off the public profile chooser', () => {
        vi.mocked(useUser).mockReturnValue(mockUserState({
            profiles: [profile(), profile({ id: 'profile-2', firstName: 'Alex', email: 'alex@example.com' })],
        }) as ReturnType<typeof useUser>);

        render(<Welcome />);

        expect(screen.getAllByRole('button', { name: /open dashboard/i })).toHaveLength(2);
        expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });

    it('keeps profile connection recovery automatic and action-free', () => {
        vi.mocked(useUser).mockReturnValue(mockUserState({
            firebaseError: 'Having trouble connecting.',
        }) as ReturnType<typeof useUser>);

        render(<Welcome />);

        expect(screen.queryByRole('button', { name: /retry|refresh/i })).not.toBeInTheDocument();
        expect(screen.getByText(/reconnecting automatically/i)).toBeInTheDocument();
    });
});

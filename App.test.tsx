import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { UserProfile } from './types';
import App, { getSafeAppDestination } from './App';
import { OAUTH_STATE_KEY, POST_AUTH_DESTINATION_KEY } from './constants';

const mocks = vi.hoisted(() => ({
    dashboardModuleLoaded: vi.fn(),
    activeProfile: null as UserProfile | null,
    addProfile: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
    acceptCompetitionInviteToken: vi.fn(),
}));

vi.mock('./contexts/UserContext', () => ({
    UserProvider: ({ children }: { children: React.ReactNode }) => children,
    useUser: () => ({
        activeProfile: mocks.activeProfile,
        addProfile: mocks.addProfile,
    }),
}));

vi.mock('./pages/Welcome', () => ({
    default: () => <main>Welcome page</main>,
}));

vi.mock('./pages/Dashboard', () => {
    mocks.dashboardModuleLoaded();
    return {
        default: () => <main>Dashboard page</main>,
    };
});

vi.mock('./pages/Settings', () => ({
    default: () => <main>Settings page</main>,
}));

vi.mock('./services/oauthService', () => {
    class OAuthRequestError extends Error {
        code = 'mock_error';
        details = null;
    }

    return {
        OAuthRequestError,
        oauthService: {
            exchangeCodeForTokens: mocks.exchangeCodeForTokens,
        },
    };
});

vi.mock('./services/competitionService', () => ({
    competitionService: {
        acceptCompetitionInviteToken: mocks.acceptCompetitionInviteToken,
    },
}));

afterEach(() => {
    cleanup();
    mocks.activeProfile = null;
    mocks.addProfile.mockReset();
    mocks.exchangeCodeForTokens.mockReset();
    mocks.acceptCompetitionInviteToken.mockReset();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
});

describe('App route loading', () => {
    it('does not import Dashboard until an active profile is selected', async () => {
        const { rerender } = render(<App />);

        expect(screen.getByText('Welcome page')).toBeInTheDocument();
        expect(mocks.dashboardModuleLoaded).not.toHaveBeenCalled();

        mocks.activeProfile = {
            id: 'profile-1',
            firstName: 'Davis',
            token: 'token',
        };
        rerender(<App />);

        expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
        expect(mocks.dashboardModuleLoaded).toHaveBeenCalledTimes(1);
    });
});

describe('OAuth destination restoration', () => {
    const connectedProfile: UserProfile = {
        id: 'profile-1',
        firstName: 'Member',
        token: 'access-token',
    };

    it('accepts only known same-origin destinations', () => {
        expect(getSafeAppDestination('/trends/insights?insight=correlation')).toBe('/trends/insights?insight=correlation');
        expect(getSafeAppDestination('/leaderboard/compete')).toBe('/leaderboard/compete');
        expect(getSafeAppDestination('https://attacker.example/settings')).toBe('/');
        expect(getSafeAppDestination('/not-a-route')).toBe('/');
        expect(getSafeAppDestination('/join')).toBe('/');
        expect(getSafeAppDestination('/join?competitionInvite=invite-1')).toBe('/join?competitionInvite=invite-1');
    });

    it('restores the exact validated deep link after OAuth', async () => {
        localStorage.setItem(OAUTH_STATE_KEY, 'state-1');
        localStorage.setItem(POST_AUTH_DESTINATION_KEY, '/trends/insights?insight=correlation');
        window.history.replaceState({}, '', '/?code=code-1&state=state-1');
        mocks.exchangeCodeForTokens.mockResolvedValue({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            grantedScopes: ['daily'],
            expiresInSeconds: 3600,
        });
        mocks.addProfile.mockResolvedValue(connectedProfile);
        mocks.activeProfile = connectedProfile;

        render(<App />);

        await waitFor(() => {
            expect(window.location.pathname).toBe('/trends/insights');
            expect(window.location.search).toBe('?insight=correlation');
        });
    });

    it('clears and reports an empty OAuth callback instead of hanging', async () => {
        window.history.replaceState({}, '', '/?code=');

        render(<App />);

        expect(await screen.findByRole('dialog', { name: 'Authentication Unsuccessful' })).toBeInTheDocument();
        expect(window.location.search).toBe('');
        expect(mocks.exchangeCodeForTokens).not.toHaveBeenCalled();
    });

    it('keeps a failed competition invite available for a manual retry', async () => {
        localStorage.setItem(OAUTH_STATE_KEY, 'state-2');
        localStorage.setItem(POST_AUTH_DESTINATION_KEY, '/join?competitionInvite=invite-2');
        window.history.replaceState({}, '', '/?code=code-2&state=state-2');
        mocks.exchangeCodeForTokens.mockResolvedValue({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            grantedScopes: [],
            expiresInSeconds: 3600,
        });
        mocks.addProfile.mockResolvedValue(connectedProfile);
        mocks.acceptCompetitionInviteToken.mockRejectedValue(new Error('temporary failure'));
        mocks.activeProfile = connectedProfile;

        render(<App />);

        await waitFor(() => {
            expect(window.location.pathname).toBe('/leaderboard/compete');
            expect(window.location.search).toBe('?competitionInvite=invite-2');
        });
        expect(await screen.findByRole('dialog', { name: 'Invite Not Applied' })).toBeInTheDocument();
    });
});

import { buildPublicProfile } from '../api/profiles/connect';

describe('profile connection privacy boundary', () => {
    it('never carries legacy OAuth secrets into the public profile', () => {
        const profile = buildPublicProfile(
            'profile-1',
            {
                token: 'legacy-access',
                refreshToken: 'legacy-refresh',
                tokenExpiresAt: '2026-08-12T12:00:00.000Z',
                firstName: 'Existing',
            },
            { id: 'oura-1', email: 'MEMBER@example.com', firstName: 'Member' },
            'oura-1',
            ['daily', 'personal'],
            '2026-08-12T13:00:00.000Z'
        );

        expect(profile).toMatchObject({
            id: 'profile-1',
            ouraUserId: 'oura-1',
            email: 'member@example.com',
            grantedScopes: ['daily', 'personal'],
            lastSyncError: null,
        });
        expect(profile).not.toHaveProperty('token');
        expect(profile).not.toHaveProperty('refreshToken');
        expect(profile).not.toHaveProperty('tokenExpiresAt');
    });
});

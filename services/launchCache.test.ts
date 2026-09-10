import type { DailyStats, UserProfile } from '../types';
import {
    clearLaunchDashboardStats,
    clearLaunchProfile,
    readLaunchDashboardStats,
    readLaunchProfile,
    writeLaunchDashboardStats,
    writeLaunchProfile,
} from './launchCache';

const stats: DailyStats = {
    sleep: [], readiness: [], activity: [], session: [], spo2: [], stress: [], resilience: [],
};

describe('bounded launch cache', () => {
    beforeEach(() => { localStorage.clear(); vi.stubEnv('VITE_OURA_API_URL', ''); });
    afterEach(() => vi.unstubAllEnvs());

    it('retains cloud caches but never shows them in mini PC mode', () => {
        writeLaunchProfile({ id: 'same-id', firstName: 'Cloud' } as UserProfile);
        writeLaunchDashboardStats('same-id', stats);
        vi.stubEnv('VITE_OURA_API_URL', 'https://storage.example');
        expect(readLaunchProfile('same-id')).toBeNull();
        expect(readLaunchDashboardStats('same-id')).toBeNull();
        writeLaunchProfile({ id: 'same-id', firstName: 'Local' } as UserProfile);
        expect(readLaunchProfile('same-id')?.firstName).toBe('Local');
        clearLaunchProfile();
        vi.stubEnv('VITE_OURA_API_URL', '');
        expect(readLaunchProfile('same-id')?.firstName).toBe('Cloud');
        expect(readLaunchDashboardStats('same-id')).toEqual(stats);
    });

    it('remembers only public profile fields', () => {
        writeLaunchProfile({
            id: 'profile-1',
            ouraUserId: 'oura-1',
            email: 'member@example.com',
            token: 'access-secret',
            refreshToken: 'refresh-secret',
            tokenExpiresAt: '2026-08-13T00:00:00.000Z',
        } as UserProfile);

        expect(readLaunchProfile('profile-1')).toMatchObject({ id: 'profile-1', email: 'member@example.com' });
        expect(readLaunchProfile('profile-1')).not.toHaveProperty('token');
        expect(readLaunchProfile('profile-1')).not.toHaveProperty('refreshToken');
        expect(JSON.stringify(localStorage)).not.toContain('access-secret');
        expect(readLaunchProfile('another-profile')).toBeNull();
        clearLaunchProfile();
        expect(readLaunchProfile('profile-1')).toBeNull();
    });

    it('keeps compact dashboard data separate by profile', () => {
        writeLaunchDashboardStats('profile-1', stats);
        expect(readLaunchDashboardStats('profile-1')).toEqual(stats);
        expect(readLaunchDashboardStats('profile-2')).toBeNull();
        clearLaunchDashboardStats('profile-1');
        expect(readLaunchDashboardStats('profile-1')).toBeNull();
    });
});

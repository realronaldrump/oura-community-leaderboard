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
    beforeEach(() => localStorage.clear());

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

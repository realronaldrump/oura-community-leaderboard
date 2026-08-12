import type { DailyStats, UserProfile } from '../types';

const PROFILE_CACHE_KEY = 'oura-launch-profile-v1';
const DASHBOARD_CACHE_PREFIX = 'oura-launch-dashboard-v1:';

type CachedProfile = {
    schemaVersion: 1;
    profile: UserProfile;
};

type CachedDashboard = {
    schemaVersion: 1;
    profileId: string;
    data: DailyStats;
};

const storage = (): Storage | null => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
};

const parseRecord = (raw: string | null): Record<string, any> | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const isCompactDailyStats = (value: unknown): value is DailyStats => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return ['sleep', 'readiness', 'activity', 'session', 'spo2', 'stress', 'resilience']
        .every((key) => Array.isArray(candidate[key]));
};

export const readLaunchProfile = (activeProfileId: string | null): UserProfile | null => {
    if (!activeProfileId) return null;
    const cached = parseRecord(storage()?.getItem(PROFILE_CACHE_KEY) || null) as CachedProfile | null;
    return cached?.schemaVersion === 1 && cached.profile?.id === activeProfileId
        ? cached.profile
        : null;
};

export const writeLaunchProfile = (profile: UserProfile): void => {
    const {
        token: _token,
        refreshToken: _refreshToken,
        tokenExpiresAt: _tokenExpiresAt,
        ...publicProfile
    } = profile;
    try {
        storage()?.setItem(PROFILE_CACHE_KEY, JSON.stringify({
            schemaVersion: 1,
            profile: publicProfile,
        } satisfies CachedProfile));
    } catch {
        // Launch caching is opportunistic; Firestore remains authoritative.
    }
};

export const clearLaunchProfile = (): void => {
    try {
        storage()?.removeItem(PROFILE_CACHE_KEY);
    } catch {
        // Nothing else should fail because a device declined local storage.
    }
};

const dashboardKey = (profileId: string) => `${DASHBOARD_CACHE_PREFIX}${profileId}`;

export const readLaunchDashboardStats = (profileId: string): DailyStats | null => {
    const cached = parseRecord(storage()?.getItem(dashboardKey(profileId)) || null) as CachedDashboard | null;
    return cached?.schemaVersion === 1 && cached.profileId === profileId && isCompactDailyStats(cached.data)
        ? cached.data
        : null;
};

export const writeLaunchDashboardStats = (profileId: string, data: DailyStats): void => {
    try {
        storage()?.setItem(dashboardKey(profileId), JSON.stringify({
            schemaVersion: 1,
            profileId,
            data,
        } satisfies CachedDashboard));
    } catch {
        // The bounded Firestore snapshot still loads normally when storage is full.
    }
};

export const clearLaunchDashboardStats = (profileId: string): void => {
    try {
        storage()?.removeItem(dashboardKey(profileId));
    } catch {
        // Profile removal is server-owned and does not depend on this cleanup.
    }
};

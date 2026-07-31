import type { UserProfile } from '../types';

const RECONNECT_ERROR_CODES = new Set([
    'invalid_grant',
    'missing_refresh_token',
    'missing_rotated_refresh_token',
    'oura_reconnect_required',
]);

export const isPersistedReconnectError = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (RECONNECT_ERROR_CODES.has(normalized)) return true;

    return normalized.includes('missing required oura consent') ||
        normalized.includes('missing oura consent scopes');
};

export const profileRequiresReconnect = (
    profile: Pick<UserProfile, 'lastSyncError'>
): boolean => isPersistedReconnectError(profile.lastSyncError);

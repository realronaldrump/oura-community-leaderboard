import type { UserProfile } from '../types';
import { OAuthRequestError, type OAuthTokenResponse } from './oauthService';

const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
const UNKNOWN_EXPIRY_RECHECK_MS = 10 * 60 * 1000;
const DEFAULT_PERSISTENCE_ATTEMPTS = 3;
const PERSISTENCE_RETRY_BASE_MS = 100;
const CONCURRENT_ROTATION_RECHECK_ATTEMPTS = 4;
const CONCURRENT_ROTATION_RECHECK_BASE_MS = 125;

export type TokenLifecycleProfile = Pick<
    UserProfile,
    'id' | 'token' | 'refreshToken' | 'tokenExpiresAt' | 'grantedScopes'
>;

export type TokenRotationPatch = Pick<
    UserProfile,
    | 'token'
    | 'refreshToken'
    | 'tokenExpiresAt'
    | 'grantedScopes'
    | 'lastSyncError'
    | 'lastSyncErrorAt'
    | 'lastUpdated'
>;

export type TokenRotationResult = {
    status: 'updated' | 'conflict';
    profile: TokenLifecycleProfile;
};

export type TokenLifecycleErrorKind = 'retryable' | 'reconnect_required';

export class OuraTokenLifecycleError extends Error {
    readonly kind: TokenLifecycleErrorKind;
    readonly code: string;
    readonly status: number | null;

    constructor(kind: TokenLifecycleErrorKind, code: string, status: number | null = null) {
        super(code);
        this.name = 'OuraTokenLifecycleError';
        this.kind = kind;
        this.code = code;
        this.status = status;
    }
}

export const isReconnectRequiredError = (error: unknown): error is OuraTokenLifecycleError =>
    error instanceof OuraTokenLifecycleError && error.kind === 'reconnect_required';

export const isRetryableTokenLifecycleError = (error: unknown): error is OuraTokenLifecycleError =>
    error instanceof OuraTokenLifecycleError && error.kind === 'retryable';

type OuraTokenLifecycleDependencies = {
    loadProfile: (profileId: string) => Promise<TokenLifecycleProfile | null>;
    persistRotation: (
        profileId: string,
        expectedRefreshToken: string,
        patch: TokenRotationPatch
    ) => Promise<TokenRotationResult>;
    refreshTokens: (refreshToken: string) => Promise<OAuthTokenResponse>;
    withRefreshLock?: (profileId: string, task: () => Promise<string>) => Promise<string>;
    now?: () => number;
    random?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
    persistenceAttempts?: number;
};

type GetAccessTokenOptions = {
    forceRefresh?: boolean;
};

type PendingRotation = {
    expectedRefreshToken: string;
    patch: TokenRotationPatch;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getUpstreamOAuthCode = (details: unknown): string | null => {
    if (!isObject(details)) return null;
    if (typeof details.error === 'string') return details.error.toLowerCase();
    if (isObject(details.details) && typeof details.details.error === 'string') {
        return details.details.error.toLowerCase();
    }
    return null;
};

const classifyRefreshFailure = (error: unknown): OuraTokenLifecycleError => {
    if (error instanceof OuraTokenLifecycleError) return error;

    if (error instanceof OAuthRequestError) {
        const upstreamCode = getUpstreamOAuthCode(error.details) || error.code.toLowerCase();
        const reconnectRequired =
            error.code === 'missing_refresh_token' ||
            (upstreamCode === 'invalid_grant' && error.status === 400);

        if (reconnectRequired) {
            return new OuraTokenLifecycleError(
                'reconnect_required',
                upstreamCode || error.code,
                error.status
            );
        }

        return new OuraTokenLifecycleError('retryable', 'oura_refresh_retryable', error.status);
    }

    if (error instanceof Error && error.message === 'missing_refresh_token') {
        return new OuraTokenLifecycleError('reconnect_required', 'missing_refresh_token');
    }

    return new OuraTokenLifecycleError('retryable', 'oura_refresh_retryable');
};

const isTokenExpiringSoon = (profile: TokenLifecycleProfile, now: number): boolean => {
    if (!profile.tokenExpiresAt) return Boolean(profile.refreshToken);
    const expiresAtMs = new Date(profile.tokenExpiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) return Boolean(profile.refreshToken);
    return expiresAtMs - now <= TOKEN_REFRESH_SKEW_MS;
};

const hasNewerCredentials = (
    current: TokenLifecycleProfile | null,
    attempted: TokenLifecycleProfile
): boolean => Boolean(
    current?.token && (
        current.token !== attempted.token ||
        current.refreshToken !== attempted.refreshToken
    )
);

const createRotationPatch = (
    profile: TokenLifecycleProfile,
    refreshed: OAuthTokenResponse,
    now: number
): TokenRotationPatch => {
    const refreshToken = typeof refreshed.refreshToken === 'string'
        ? refreshed.refreshToken.trim()
        : '';
    if (!refreshToken || refreshToken === profile.refreshToken) {
        throw new OuraTokenLifecycleError('reconnect_required', 'missing_rotated_refresh_token');
    }

    const expiresInSeconds = typeof refreshed.expiresInSeconds === 'number' &&
        Number.isFinite(refreshed.expiresInSeconds) &&
        refreshed.expiresInSeconds > 0
        ? refreshed.expiresInSeconds
        : null;
    const grantedScopes = refreshed.grantedScopes.length > 0
        ? refreshed.grantedScopes
        : profile.grantedScopes?.length
            ? profile.grantedScopes
            : null;

    return {
        token: refreshed.accessToken,
        refreshToken,
        tokenExpiresAt: expiresInSeconds
            ? new Date(now + (expiresInSeconds * 1000)).toISOString()
            : new Date(now + UNKNOWN_EXPIRY_RECHECK_MS).toISOString(),
        ...(grantedScopes ? { grantedScopes } : {}),
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastUpdated: new Date(now).toISOString(),
    };
};

export const createOuraTokenLifecycle = (dependencies: OuraTokenLifecycleDependencies) => {
    const now = dependencies.now ?? Date.now;
    const random = dependencies.random ?? Math.random;
    const sleep = dependencies.sleep ?? ((milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const persistenceAttempts = Math.max(1, dependencies.persistenceAttempts ?? DEFAULT_PERSISTENCE_ATTEMPTS);
    const withRefreshLock = dependencies.withRefreshLock ??
        ((_profileId: string, task: () => Promise<string>) => task());
    const refreshInFlight = new Map<string, Promise<string>>();
    const pendingRotations = new Map<string, PendingRotation>();

    const persistRotation = async (
        profileId: string,
        expectedRefreshToken: string,
        patch: TokenRotationPatch
    ): Promise<TokenRotationResult> => {
        let lastError: unknown;
        for (let attempt = 0; attempt < persistenceAttempts; attempt += 1) {
            try {
                return await dependencies.persistRotation(profileId, expectedRefreshToken, patch);
            } catch (error) {
                lastError = error;
                if (attempt >= persistenceAttempts - 1) break;
                const exponentialDelay = PERSISTENCE_RETRY_BASE_MS * (2 ** attempt);
                const jitteredDelay = exponentialDelay + Math.floor(random() * exponentialDelay);
                await sleep(jitteredDelay);
            }
        }

        const current = await dependencies.loadProfile(profileId).catch(() => null);
        if (current?.refreshToken !== expectedRefreshToken && current?.token) {
            return { status: 'conflict', profile: current };
        }

        throw new OuraTokenLifecycleError(
            'retryable',
            lastError ? 'token_rotation_persistence_failed' : 'token_rotation_not_persisted'
        );
    };

    const recoverConcurrentRotation = async (
        profileId: string,
        attemptedProfile: TokenLifecycleProfile
    ): Promise<TokenLifecycleProfile | null> => {
        let lastReadSucceeded = false;

        for (let attempt = 0; attempt < CONCURRENT_ROTATION_RECHECK_ATTEMPTS; attempt += 1) {
            try {
                const current = await dependencies.loadProfile(profileId);
                lastReadSucceeded = true;
                if (current && hasNewerCredentials(current, attemptedProfile)) {
                    return current;
                }
            } catch {
                lastReadSucceeded = false;
            }

            if (attempt < CONCURRENT_ROTATION_RECHECK_ATTEMPTS - 1) {
                const exponentialDelay = CONCURRENT_ROTATION_RECHECK_BASE_MS * (2 ** attempt);
                const jitteredDelay = exponentialDelay + Math.floor(random() * exponentialDelay);
                await sleep(jitteredDelay);
            }
        }

        // If the final verification read failed, the rejection is ambiguous:
        // another caller may already have rotated the token. Keep the failure
        // retryable instead of persisting a false reconnect requirement.
        if (!lastReadSucceeded) {
            throw new OuraTokenLifecycleError('retryable', 'token_rotation_recovery_unavailable');
        }

        return null;
    };

    const refreshWithOptimisticRecovery = async (
        initialProfile: TokenLifecycleProfile,
        forceRefresh: boolean
    ): Promise<string> => {
        const latestProfile = await dependencies.loadProfile(initialProfile.id);
        if (!latestProfile) {
            throw new OuraTokenLifecycleError('retryable', 'profile_not_found');
        }

        if (hasNewerCredentials(latestProfile, initialProfile)) {
            return latestProfile.token;
        }

        if (!forceRefresh && !isTokenExpiringSoon(latestProfile, now())) {
            return latestProfile.token;
        }

        const attemptedRefreshToken = latestProfile.refreshToken?.trim();
        if (!attemptedRefreshToken) {
            throw new OuraTokenLifecycleError('reconnect_required', 'missing_refresh_token');
        }

        let refreshed: OAuthTokenResponse;
        try {
            refreshed = await dependencies.refreshTokens(attemptedRefreshToken);
        } catch (error) {
            const classified = classifyRefreshFailure(error);
            if (classified.kind === 'reconnect_required') {
                const recoveredProfile = await recoverConcurrentRotation(
                    initialProfile.id,
                    latestProfile
                );
                if (recoveredProfile) {
                    return recoveredProfile.token;
                }
            }
            throw classified;
        }

        if (!refreshed.accessToken || typeof refreshed.accessToken !== 'string') {
            throw new OuraTokenLifecycleError('retryable', 'invalid_refresh_response');
        }

        const patch = createRotationPatch(latestProfile, refreshed, now());
        let persisted: TokenRotationResult;
        try {
            persisted = await persistRotation(initialProfile.id, attemptedRefreshToken, patch);
        } catch (error) {
            if (isRetryableTokenLifecycleError(error)) {
                // Keep the only copy of the newly rotated single-use token in
                // memory and retry persistence on the next token request.
                pendingRotations.set(initialProfile.id, {
                    expectedRefreshToken: attemptedRefreshToken,
                    patch,
                });
                return patch.token;
            }
            throw error;
        }
        if (persisted.status === 'conflict') {
            if (!persisted.profile.token) {
                throw new OuraTokenLifecycleError('retryable', 'token_rotation_conflict');
            }
            return persisted.profile.token;
        }

        return patch.token;
    };

    const getAccessToken = async (
        profile: TokenLifecycleProfile,
        options: GetAccessTokenOptions = {}
    ): Promise<string> => {
        const forceRefresh = Boolean(options.forceRefresh);
        const pendingRotation = pendingRotations.get(profile.id);
        if (pendingRotation) {
            try {
                const persisted = await persistRotation(
                    profile.id,
                    pendingRotation.expectedRefreshToken,
                    pendingRotation.patch
                );
                pendingRotations.delete(profile.id);
                return persisted.profile.token;
            } catch (error) {
                if (forceRefresh || isTokenExpiringSoon({
                    ...profile,
                    ...pendingRotation.patch,
                }, now())) {
                    throw error;
                }
                return pendingRotation.patch.token;
            }
        }

        if (!forceRefresh && !isTokenExpiringSoon(profile, now())) {
            return profile.token;
        }

        const existingRefresh = refreshInFlight.get(profile.id);
        if (existingRefresh) return existingRefresh;

        const refreshPromise = withRefreshLock(
            profile.id,
            () => refreshWithOptimisticRecovery(profile, forceRefresh)
        )
            .finally(() => {
                refreshInFlight.delete(profile.id);
            });
        refreshInFlight.set(profile.id, refreshPromise);
        return refreshPromise;
    };

    return {
        getAccessToken,
    };
};

import { OAuthRequestError, OAuthTokenResponse } from './oauthService';
import {
    createOuraTokenLifecycle,
    isReconnectRequiredError,
    isRetryableTokenLifecycleError,
    TokenLifecycleProfile,
    TokenRotationPatch,
} from './ouraTokenLifecycle';

const expiresSoon = '2026-07-24T12:01:00.000Z';
const refreshedExpiry = '2026-08-23T12:00:00.000Z';

const createProfile = (overrides: Partial<TokenLifecycleProfile> = {}): TokenLifecycleProfile => ({
    id: 'profile-1',
    token: 'access-old',
    refreshToken: 'refresh-old',
    tokenExpiresAt: expiresSoon,
    grantedScopes: ['daily', 'personal'],
    ...overrides,
});

const createTokenResponse = (overrides: Partial<OAuthTokenResponse> = {}): OAuthTokenResponse => ({
    accessToken: 'access-new',
    refreshToken: 'refresh-new',
    expiresInSeconds: 30 * 24 * 60 * 60,
    grantedScopes: ['daily', 'personal'],
    tokenType: 'bearer',
    ...overrides,
});

const createSharedRepository = (initialProfile: TokenLifecycleProfile) => {
    let stored = { ...initialProfile };

    return {
        get stored() {
            return { ...stored };
        },
        replace(next: TokenLifecycleProfile) {
            stored = { ...next };
        },
        loadProfile: vi.fn(async () => ({ ...stored })),
        persistRotation: vi.fn(async (
            _profileId: string,
            expectedRefreshToken: string,
            patch: TokenRotationPatch
        ) => {
            if (stored.refreshToken !== expectedRefreshToken) {
                return { status: 'conflict' as const, profile: { ...stored } };
            }

            stored = { ...stored, ...patch };
            return { status: 'updated' as const, profile: { ...stored } };
        }),
    };
};

describe('Oura token lifecycle', () => {
    it('single-flights refreshes within one lifecycle instance and persists the rotated token', async () => {
        const repository = createSharedRepository(createProfile());
        let releaseRefresh!: (tokens: OAuthTokenResponse) => void;
        const refreshDeferred = new Promise<OAuthTokenResponse>((resolve) => {
            releaseRefresh = resolve;
        });
        const refreshTokens = vi.fn(() => refreshDeferred);
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens,
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        const first = lifecycle.getAccessToken(createProfile());
        const second = lifecycle.getAccessToken(createProfile());
        await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledTimes(1));

        releaseRefresh(createTokenResponse());

        await expect(Promise.all([first, second])).resolves.toEqual(['access-new', 'access-new']);
        expect(repository.stored).toMatchObject({
            token: 'access-new',
            refreshToken: 'refresh-new',
            tokenExpiresAt: refreshedExpiry,
        });
    });

    it('serializes independent lifecycle instances when a shared cross-tab lock is available', async () => {
        const repository = createSharedRepository(createProfile());
        let lockTail = Promise.resolve();
        const withRefreshLock = vi.fn(async (
            _profileId: string,
            task: () => Promise<string>
        ): Promise<string> => {
            const previous = lockTail;
            let releaseLock!: () => void;
            lockTail = new Promise<void>((resolve) => {
                releaseLock = resolve;
            });
            await previous;
            try {
                return await task();
            } finally {
                releaseLock();
            }
        });
        const refreshTokens = vi.fn(async () => createTokenResponse());
        const dependencies = {
            ...repository,
            refreshTokens,
            withRefreshLock,
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        };
        const firstTab = createOuraTokenLifecycle(dependencies);
        const secondTab = createOuraTokenLifecycle(dependencies);

        await expect(Promise.all([
            firstTab.getAccessToken(createProfile()),
            secondTab.getAccessToken(createProfile()),
        ])).resolves.toEqual(['access-new', 'access-new']);
        expect(refreshTokens).toHaveBeenCalledTimes(1);
        expect(withRefreshLock).toHaveBeenCalledTimes(2);
    });

    it('refreshes a legacy profile whose expiry is missing instead of treating it as non-expiring', async () => {
        const legacyProfile = createProfile({ tokenExpiresAt: null });
        const repository = createSharedRepository(legacyProfile);
        const refreshTokens = vi.fn(async () => createTokenResponse());
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens,
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        await expect(lifecycle.getAccessToken(legacyProfile)).resolves.toBe('access-new');
        expect(refreshTokens).toHaveBeenCalledTimes(1);
    });

    it('omits unknown optional scopes from a legacy rotation patch instead of sending Firestore undefined', async () => {
        const legacyProfile = createProfile({
            grantedScopes: undefined,
            tokenExpiresAt: null,
        });
        const repository = createSharedRepository(legacyProfile);
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => createTokenResponse({ grantedScopes: [] })),
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        await expect(lifecycle.getAccessToken(legacyProfile)).resolves.toBe('access-new');
        const persistedPatch = repository.persistRotation.mock.calls[0][2];
        expect(persistedPatch).not.toHaveProperty('grantedScopes');
        expect(Object.values(persistedPatch)).not.toContain(undefined);
    });

    it('recovers when another lifecycle instance consumes the same single-use refresh token first', async () => {
        const repository = createSharedRepository(createProfile());
        let releaseSecondCaller!: () => void;
        const secondCallerStarted = new Promise<void>((resolve) => {
            releaseSecondCaller = resolve;
        });
        let releaseRotationPersisted!: () => void;
        const rotationPersisted = new Promise<void>((resolve) => {
            releaseRotationPersisted = resolve;
        });
        const originalPersistRotation = repository.persistRotation;
        repository.persistRotation = vi.fn(async (...args: Parameters<typeof originalPersistRotation>) => {
            const result = await originalPersistRotation(...args);
            if (result.status === 'updated') releaseRotationPersisted();
            return result;
        });

        let refreshCalls = 0;
        const refreshTokens = vi.fn(async () => {
            refreshCalls += 1;
            if (refreshCalls === 1) {
                await secondCallerStarted;
                return createTokenResponse();
            }

            releaseSecondCaller();
            await rotationPersisted;
            throw new OAuthRequestError('refresh_failed', 400, {
                error: 'invalid_grant',
                error_description: 'Token already used or revoked.',
            });
        });
        const dependencies = {
            ...repository,
            refreshTokens,
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        };
        const firstTab = createOuraTokenLifecycle(dependencies);
        const secondTab = createOuraTokenLifecycle(dependencies);

        await expect(Promise.all([
            firstTab.getAccessToken(createProfile()),
            secondTab.getAccessToken(createProfile()),
        ])).resolves.toEqual(['access-new', 'access-new']);
        expect(refreshTokens).toHaveBeenCalledTimes(2);
        expect(repository.stored.refreshToken).toBe('refresh-new');
    });

    it('waits briefly for a winning caller to persist its rotation before requiring reconnect', async () => {
        const repository = createSharedRepository(createProfile());
        let releaseWinningRefresh!: () => void;
        const winningRefreshCanFinish = new Promise<void>((resolve) => {
            releaseWinningRefresh = resolve;
        });
        let releaseRotationPersisted!: () => void;
        const rotationPersisted = new Promise<void>((resolve) => {
            releaseRotationPersisted = resolve;
        });
        const originalPersistRotation = repository.persistRotation;
        repository.persistRotation = vi.fn(async (...args: Parameters<typeof originalPersistRotation>) => {
            const result = await originalPersistRotation(...args);
            if (result.status === 'updated') releaseRotationPersisted();
            return result;
        });

        let refreshCalls = 0;
        const refreshTokens = vi.fn(async () => {
            refreshCalls += 1;
            if (refreshCalls === 1) {
                await winningRefreshCanFinish;
                return createTokenResponse();
            }

            throw new OAuthRequestError('refresh_failed', 400, {
                error: 'invalid_grant',
                error_description: 'Token already used or revoked.',
            });
        });
        const sleep = vi.fn(async () => {
            releaseWinningRefresh();
            await rotationPersisted;
        });
        const dependencies = {
            ...repository,
            refreshTokens,
            sleep,
            random: () => 0,
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        };
        const winningTab = createOuraTokenLifecycle(dependencies);
        const losingTab = createOuraTokenLifecycle(dependencies);

        await expect(Promise.all([
            winningTab.getAccessToken(createProfile()),
            losingTab.getAccessToken(createProfile()),
        ])).resolves.toEqual(['access-new', 'access-new']);
        expect(sleep).toHaveBeenCalled();
        expect(repository.stored.refreshToken).toBe('refresh-new');
    });

    it('does not overwrite a newer rotation when compare-and-set reports a conflict', async () => {
        const repository = createSharedRepository(createProfile());
        repository.persistRotation = vi.fn(async () => ({
            status: 'conflict' as const,
            profile: createProfile({
                token: 'access-from-other-tab',
                refreshToken: 'refresh-from-other-tab',
                tokenExpiresAt: refreshedExpiry,
            }),
        }));
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => createTokenResponse()),
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        await expect(lifecycle.getAccessToken(createProfile())).resolves.toBe('access-from-other-tab');
    });

    it('retains a rotated credential in memory until transient persistence recovers', async () => {
        const repository = createSharedRepository(createProfile());
        repository.persistRotation
            .mockRejectedValueOnce(new Error('firestore unavailable'))
            .mockResolvedValueOnce({
                status: 'updated' as const,
                profile: createProfile({
                    token: 'access-new',
                    refreshToken: 'refresh-new',
                    tokenExpiresAt: refreshedExpiry,
                }),
            });
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => createTokenResponse()),
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
            persistenceAttempts: 1,
        });

        await expect(lifecycle.getAccessToken(createProfile())).resolves.toBe('access-new');
        await expect(lifecycle.getAccessToken(createProfile())).resolves.toBe('access-new');
        expect(repository.persistRotation).toHaveBeenCalledTimes(2);
    });

    it('classifies rate limits and server failures as retryable without requiring reconnect', async () => {
        const repository = createSharedRepository(createProfile());
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => {
                throw new OAuthRequestError('refresh_failed', 429, {
                    error: 'temporarily_unavailable',
                });
            }),
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        const error = await lifecycle.getAccessToken(createProfile()).catch((caught) => caught);
        expect(isRetryableTokenLifecycleError(error)).toBe(true);
        expect(isReconnectRequiredError(error)).toBe(false);
        expect(repository.stored.refreshToken).toBe('refresh-old');
    });

    it('does not treat an access-token invalid_token code as proof that the refresh token was revoked', async () => {
        const repository = createSharedRepository(createProfile());
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => {
                throw new OAuthRequestError('refresh_failed', 400, {
                    error: 'invalid_token',
                });
            }),
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        const error = await lifecycle.getAccessToken(createProfile()).catch((caught) => caught);
        expect(isRetryableTokenLifecycleError(error)).toBe(true);
        expect(isReconnectRequiredError(error)).toBe(false);
    });

    it('keeps an invalid_grant ambiguous when the post-rejection credential check is unavailable', async () => {
        const repository = createSharedRepository(createProfile());
        let loadCalls = 0;
        repository.loadProfile.mockImplementation(async () => {
            loadCalls += 1;
            if (loadCalls === 1) return createProfile();
            throw new Error('firestore unavailable');
        });
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => {
                throw new OAuthRequestError('refresh_failed', 400, {
                    error: 'invalid_grant',
                });
            }),
            sleep: async () => {},
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        const error = await lifecycle.getAccessToken(createProfile()).catch((caught) => caught);
        expect(isRetryableTokenLifecycleError(error)).toBe(true);
        expect(isReconnectRequiredError(error)).toBe(false);
    });

    it('requires reconnect only when Oura rejects the unchanged refresh token', async () => {
        const repository = createSharedRepository(createProfile());
        const lifecycle = createOuraTokenLifecycle({
            ...repository,
            refreshTokens: vi.fn(async () => {
                throw new OAuthRequestError('refresh_failed', 400, {
                    error: 'invalid_grant',
                });
            }),
            sleep: async () => {},
            now: () => new Date('2026-07-24T12:00:00.000Z').getTime(),
        });

        const error = await lifecycle.getAccessToken(createProfile()).catch((caught) => caught);
        expect(isReconnectRequiredError(error)).toBe(true);
        expect(isRetryableTokenLifecycleError(error)).toBe(false);
    });
});

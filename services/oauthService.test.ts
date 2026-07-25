import { OAuthRequestError, oauthService } from './oauthService';

describe('oauthService credential validation', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects an authorization-code exchange that omits the required refresh token', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            accessToken: 'access-new',
            refreshToken: null,
            expiresInSeconds: 2_592_000,
            grantedScopes: ['daily', 'personal'],
        }), { status: 200 })));

        const error = await oauthService.exchangeCodeForTokens('one-time-code')
            .catch((caught) => caught);

        expect(error).toBeInstanceOf(OAuthRequestError);
        expect(error).toMatchObject({
            code: 'invalid_token_response',
            status: 502,
            details: null,
        });
    });
});

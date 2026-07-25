import handler from '../api/oauth/refresh';

const createResponse = () => {
    let statusCode = 0;
    let body: Record<string, unknown> | null = null;
    const headers = new Map<string, string>();
    const response = {
        status(code: number) {
            statusCode = code;
            return response;
        },
        setHeader(name: string, value: string) {
            headers.set(name.toLowerCase(), value);
            return response;
        },
        send(raw: string) {
            body = JSON.parse(raw);
            return response;
        },
    };

    return {
        response,
        get statusCode() {
            return statusCode;
        },
        get body() {
            return body;
        },
        get headers() {
            return headers;
        },
    };
};

describe('/api/oauth/refresh', () => {
    beforeEach(() => {
        vi.stubEnv('OURA_CLIENT_SECRET', 'server-secret');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('returns and requires the newly rotated refresh token', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 2_592_000,
            token_type: 'bearer',
        }), { status: 200 })));
        const result = createResponse();

        await handler({
            method: 'POST',
            body: { refreshToken: 'refresh-old' },
        }, result.response);

        expect(result.statusCode).toBe(200);
        expect(result.body).toMatchObject({
            accessToken: 'access-new',
            refreshToken: 'refresh-new',
        });
        expect(result.headers.get('cache-control')).toBe('no-store');
        expect(result.headers.get('pragma')).toBe('no-cache');
    });

    it('never returns the consumed refresh token when Oura omits its replacement', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            access_token: 'access-new',
            expires_in: 2_592_000,
        }), { status: 200 })));
        const result = createResponse();

        await handler({
            method: 'POST',
            body: { refreshToken: 'refresh-old' },
        }, result.response);

        expect(result.statusCode).toBe(200);
        expect(result.body).toMatchObject({
            accessToken: 'access-new',
            refreshToken: null,
        });
    });

    it('keeps OAuth rejection evidence while stripping any token-shaped upstream fields', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            status: 400,
            error: 'invalid_grant',
            error_description: 'Token already used or revoked.',
            access_token: 'must-not-leak',
            refresh_token: 'must-not-leak',
        }), { status: 400 })));
        const result = createResponse();

        await handler({
            method: 'POST',
            body: { refreshToken: 'refresh-old' },
        }, result.response);

        expect(result.statusCode).toBe(400);
        expect(result.body).toEqual({
            error: 'refresh_failed',
            details: {
                status: 400,
                error: 'invalid_grant',
                error_description: 'Token already used or revoked.',
            },
        });
    });
});

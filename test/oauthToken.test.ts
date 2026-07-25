import handler from '../api/oauth/token';

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

describe('/api/oauth/token', () => {
    beforeEach(() => {
        vi.stubEnv('OURA_CLIENT_SECRET', 'server-secret');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('marks token-bearing responses as non-cacheable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 2_592_000,
            token_type: 'bearer',
        }), { status: 200 })));
        const result = createResponse();

        await handler({
            method: 'POST',
            body: {
                code: 'one-time-code',
                redirectUri: 'https://example.com/callback',
            },
        }, result.response);

        expect(result.statusCode).toBe(200);
        expect(result.body).toMatchObject({
            accessToken: 'access-new',
            refreshToken: 'refresh-new',
        });
        expect(result.headers.get('cache-control')).toBe('no-store');
        expect(result.headers.get('pragma')).toBe('no-cache');
    });
});

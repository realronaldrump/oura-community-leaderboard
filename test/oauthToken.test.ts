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

    it('reports an unreachable token endpoint without retrying the one-time code', async () => {
        const fetchMock = vi.fn(async () => {
            throw new TypeError('fetch failed: connect ECONNREFUSED');
        });
        vi.stubGlobal('fetch', fetchMock);
        const result = createResponse();

        await handler({
            method: 'POST',
            body: { code: 'one-time-code', redirectUri: 'https://example.com/callback' },
        }, result.response);

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(result.statusCode).toBe(502);
        expect(result.body).toEqual({ error: 'server_error', details: 'oura_token_endpoint_unavailable' });
    });

    it('never echoes unexpected internal error messages', async () => {
        const result = createResponse();
        const request = {
            method: 'POST',
            get body(): never {
                throw new Error('internal detail: /srv/secrets/config.json');
            },
        };

        await handler(request, result.response);

        expect(result.statusCode).toBe(500);
        expect(result.body).toEqual({ error: 'server_error', details: 'unexpected_error' });
        expect(JSON.stringify(result.body)).not.toContain('secrets');
    });
});

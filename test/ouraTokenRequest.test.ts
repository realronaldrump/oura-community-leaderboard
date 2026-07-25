import { postOuraTokenRequest, sanitizeOuraTokenError } from '../api/_lib/ouraTokenRequest';

const jsonResponse = (status: number, payload: Record<string, unknown>, headers?: HeadersInit) =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });

describe('postOuraTokenRequest', () => {
    it('strips access and refresh tokens from client-visible upstream errors', () => {
        expect(sanitizeOuraTokenError({
            status: 400,
            error: 'invalid_grant',
            access_token: 'must-not-leak',
            refresh_token: 'must-not-leak',
        })).toEqual({
            status: 400,
            error: 'invalid_grant',
        });
    });

    it('redacts credentials embedded inside allowed OAuth error fields', () => {
        const sanitized = sanitizeOuraTokenError({
            status: 400,
            error: 'invalid_grant',
            error_description: 'Bearer bearer-secret access_token=access-secret refresh_token: refresh-secret',
        });

        expect(sanitized.error).toBe('invalid_grant');
        expect(JSON.stringify(sanitized)).not.toContain('bearer-secret');
        expect(JSON.stringify(sanitized)).not.toContain('access-secret');
        expect(JSON.stringify(sanitized)).not.toContain('refresh-secret');
        expect(sanitized.error_description).toContain('[redacted]');
    });

    it('redacts client secrets and authorization codes from allowed free text and URLs', () => {
        const sanitized = sanitizeOuraTokenError({
            error: 'temporarily_unavailable',
            detail: 'client_secret="server-only-secret" authorization_code: one-time-code',
            error_uri: 'https://errors.example.test/oauth?client-secret=query-secret&code=query-code',
        });

        expect(sanitized.error).toBe('temporarily_unavailable');
        expect(JSON.stringify(sanitized)).not.toContain('server-only-secret');
        expect(JSON.stringify(sanitized)).not.toContain('one-time-code');
        expect(JSON.stringify(sanitized)).not.toContain('query-secret');
        expect(JSON.stringify(sanitized)).not.toContain('query-code');
        expect(sanitized.error_uri).toContain('https://errors.example.test/oauth?');
    });

    it('redacts unlabeled opaque and JWT-shaped credentials from allowed free text', () => {
        const opaqueCredential = 'a9f45c830b27441ca7363bea91d1e0865a2213896ed84834';
        const jwtCredential = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvdXJhLXVzZXIifQ.signature-secret-material';
        const sanitized = sanitizeOuraTokenError({
            error: 'invalid_grant',
            title: `Request rejected (${opaqueCredential})`,
            error_description: `The submitted credential was ${jwtCredential}`,
        });

        expect(sanitized.error).toBe('invalid_grant');
        expect(JSON.stringify(sanitized)).not.toContain(opaqueCredential);
        expect(JSON.stringify(sanitized)).not.toContain(jwtCredential);
        expect(sanitized.title).toBe('Request rejected ([redacted])');
        expect(sanitized.error_description).toContain('[redacted]');
    });

    it('redacts encoded and JSON-shaped credentials without erasing useful OAuth prose', () => {
        const sanitized = sanitizeOuraTokenError({
            error: 'invalid_grant',
            title: 'The authorization code expired before it could be exchanged.',
            detail: 'Upstream returned {"id_token":"id-secret","token":"generic-secret","credential":"opaque-secret"}',
            error_uri: 'https://errors.example.test/oauth?client_secret%3Dencoded-secret%26code%3Dencoded-code',
        });

        expect(sanitized.error).toBe('invalid_grant');
        expect(sanitized.title).toBe('The authorization code expired before it could be exchanged.');
        expect(JSON.stringify(sanitized)).not.toContain('id-secret');
        expect(JSON.stringify(sanitized)).not.toContain('generic-secret');
        expect(JSON.stringify(sanitized)).not.toContain('opaque-secret');
        expect(JSON.stringify(sanitized)).not.toContain('encoded-secret');
        expect(JSON.stringify(sanitized)).not.toContain('encoded-code');
    });

    it('does not replay a one-time grant after a retryable upstream response', async () => {
        const fetchImpl = vi.fn(async () =>
            jsonResponse(429, { error: 'temporarily_unavailable' }, { 'Retry-After': '2' })
        );

        const result = await postOuraTokenRequest(new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: 'refresh-old',
        }), {
            fetchImpl,
        });

        expect(result).toMatchObject({
            ok: false,
            status: 429,
            payload: { error: 'temporarily_unavailable' },
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not replay a one-time grant after an ambiguous transport failure', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('socket closed');
        });

        await expect(postOuraTokenRequest(new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: 'refresh-old',
        }), {
            fetchImpl,
        })).rejects.toThrow('oura_token_endpoint_unavailable');

        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});

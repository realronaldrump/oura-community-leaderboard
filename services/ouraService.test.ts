import { getOuraRetryDelayMs, ouraService, sanitizeOuraErrorDetail } from './ouraService';

describe('Oura data retry policy', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('honors Retry-After with bounded jitter', () => {
        expect(getOuraRetryDelayMs(0, '2', 0, () => 0.5)).toBe(2125);
    });

    it('uses exponential backoff with jitter when Retry-After is absent', () => {
        expect(getOuraRetryDelayMs(0, null, 0, () => 0.5)).toBe(1125);
        expect(getOuraRetryDelayMs(1, null, 0, () => 0.5)).toBe(2250);
    });

    it('redacts credential-shaped material from structured upstream detail', () => {
        const detail = sanitizeOuraErrorDetail(
            'Bearer access-token-secret-prefix-that-must-not-leak access_token=another-secret-token-value'
        );

        expect(detail).not.toContain('access-token-secret-prefix');
        expect(detail).not.toContain('another-secret-token-value');
        expect(detail).toContain('[redacted]');
    });

    it('retries the post-exchange personal-info GET after a transient rate limit', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'rate_limited' }), {
                status: 429,
                headers: { 'Retry-After': '0' },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                id: 'oura-user-1',
                email: 'member@example.com',
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(ouraService.getPersonalInfo('access-token')).resolves.toMatchObject({
            id: 'oura-user-1',
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('never persists or logs an access-token prefix as an endpoint availability key', async () => {
        const accessToken = 'access-token-secret-prefix-that-must-not-leak';
        localStorage.clear();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'not_found',
        }), { status: 404 })));

        await ouraService.getDailySpO2(
            accessToken,
            '2026-07-23',
            '2026-07-24'
        );

        expect(localStorage.getItem('oura_unavailable_endpoints_v5') || '').not.toContain(accessToken.slice(0, 20));
        expect(JSON.stringify(warn.mock.calls)).not.toContain(accessToken.slice(0, 20));
    });
});

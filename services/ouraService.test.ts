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

    it('fetches every heart-rate window requested for a full-history range', async () => {
        const fetchMock = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify({
            data: [],
            next_token: null,
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await ouraService.getHeartRate(
            'access-token',
            '2026-01-01',
            '2026-03-15',
            { availabilityKey: 'profile-1' },
        );

        const requestedUrls = fetchMock.mock.calls.map(([url]) => decodeURIComponent(String(url)));
        expect(requestedUrls).toHaveLength(3);
        expect(requestedUrls[0]).toContain('start_datetime=2026-01-01T00:00:00');
        expect(requestedUrls.at(-1)).toContain('end_datetime=2026-03-15T23:59:59');
    });

    it('fetches ring battery history from the current Oura collection', async () => {
        const fetchMock = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify({
            data: [{
                timestamp: '2026-03-15T12:00:00Z',
                timestamp_unix: 1_773_573_600_000,
                level: 74,
                charging: false,
                in_charger: false,
            }],
            next_token: null,
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(ouraService.getRingBatteryLevel(
            'access-token',
            '2026-03-01',
            '2026-03-15',
            { availabilityKey: 'profile-1' },
        )).resolves.toEqual([
            expect.objectContaining({ level: 74 }),
        ]);

        expect(decodeURIComponent(String(fetchMock.mock.calls[0][0])))
            .toContain('/ring_battery_level?start_datetime=2026-03-01T00:00:00');
    });

    it('records an optional endpoint scope denial without aborting the rest of a sync', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            detail: 'Not authorized access: missing scope daily',
        }), { status: 401 })));

        await expect(ouraService.getDailyStress(
            'access-token',
            '2026-03-01',
            '2026-03-02',
            { availabilityKey: 'scope-denial-profile' },
        )).resolves.toEqual([]);

        expect(ouraService.getEndpointDiagnostic(
            'access-token',
            'daily_stress',
            'scope-denial-profile',
        )).toMatchObject({ code: 'missing_scope', status: 401 });
    });
});

const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const REQUEST_TIMEOUT_MS = 15_000;

export type OuraTokenRequestResult = {
    ok: boolean;
    status: number;
    payload: any;
};

type OuraTokenRequestOptions = {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
};

const sanitizeOuraTokenErrorText = (value: string): string => value
    .replace(/\bbearer\s+["']?[^\s,;}&"']+/gi, 'Bearer [redacted]')
    .replace(
        /\b((?:(?:access|refresh|id|oauth)[\s_-]?)?token|client[\s_-]?secret|credentials?|authorization[\s_-]?code|auth[\s_-]?code|code)["']?\s*(?:=|:)\s*["']?[^\s,;}&"']+/gi,
        '$1=[redacted]'
    )
    .replace(
        /(^|[?&]|%26)((?:(?:access|refresh|id|oauth)[_-]?)?token|client[_-]?secret|credentials?|authorization[_-]?code|auth[_-]?code|code)%3[da](?:%22)?[^%\s,;}&"']+/gi,
        '$1$2=[redacted]'
    )
    .replace(/\b[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]{8,}){2,}\b/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_~+=-]{32,}\b/g, '[redacted]');

export const sanitizeOuraTokenError = (payload: unknown): Record<string, unknown> => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const record = payload as Record<string, unknown>;
    const allowedKeys = [
        'status',
        'title',
        'detail',
        'error',
        'error_description',
        'error_uri',
    ];
    return Object.fromEntries(
        allowedKeys
            .filter((key) => ['string', 'number'].includes(typeof record[key]))
            .map((key) => [
                key,
                typeof record[key] === 'string'
                    ? sanitizeOuraTokenErrorText(record[key])
                    : record[key],
            ])
    );
};

const parsePayload = async (response: Response): Promise<any> => {
    const raw = await response.text();
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return { raw };
    }
};

export const postOuraTokenRequest = async (
    tokenBody: URLSearchParams,
    options: OuraTokenRequestOptions = {}
): Promise<OuraTokenRequestResult> => {
    const fetchImpl = options.fetchImpl ?? fetch;
    const timeoutMs = Math.max(1, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(OURA_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenBody.toString(),
            signal: controller.signal,
        });
        return {
            ok: response.ok,
            status: response.status,
            payload: await parsePayload(response),
        };
    } catch (error) {
        // Authorization codes and Oura refresh tokens are one-time grants. A
        // timeout can happen after Oura has consumed the grant, so replaying
        // it here risks discarding the only rotated credential. Data pulls use
        // bounded jittered retries; token grants deliberately use one attempt.
        const timedOut = error instanceof Error && error.name === 'AbortError';
        throw new Error(
            timedOut ? 'oura_token_endpoint_timeout' : 'oura_token_endpoint_unavailable',
            { cause: error }
        );
    } finally {
        clearTimeout(timeout);
    }
};

import { REDIRECT_URI } from '../constants';

export interface OAuthTokenResponse {
    accessToken: string;
    refreshToken: string | null;
    expiresInSeconds: number | null;
    grantedScopes: string[];
    tokenType?: string | null;
}

export class OAuthRequestError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details: unknown;

    constructor(code: string, status: number, details: unknown, message?: string) {
        super(message || code);
        this.name = 'OAuthRequestError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

const parseResponseBody = async (response: Response): Promise<Record<string, unknown>> => {
    const raw = await response.text();
    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { raw };
    } catch {
        return { raw };
    }
};

const postJson = async <T>(url: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
        const errorCode = typeof payload.error === 'string' ? payload.error : 'request_failed';
        throw new OAuthRequestError(errorCode, response.status, payload.details ?? payload);
    }
    return payload as T;
};

export const oauthService = {
    exchangeCodeForTokens: async (code: string, redirectUri: string = REDIRECT_URI): Promise<OAuthTokenResponse> => {
        const payload = await postJson<OAuthTokenResponse>('/api/oauth/token', { code, redirectUri });
        if (!payload?.accessToken || typeof payload.accessToken !== 'string') {
            throw new OAuthRequestError(
                'invalid_token_response',
                502,
                payload,
                'OAuth token response missing accessToken.'
            );
        }
        return payload;
    },

    refreshAccessToken: async (refreshToken: string): Promise<OAuthTokenResponse> => {
        const payload = await postJson<OAuthTokenResponse>('/api/oauth/refresh', { refreshToken });
        if (!payload?.accessToken || typeof payload.accessToken !== 'string') {
            throw new OAuthRequestError(
                'invalid_refresh_response',
                502,
                payload,
                'OAuth refresh response missing accessToken.'
            );
        }
        return payload;
    },
};

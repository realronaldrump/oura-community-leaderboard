import { REDIRECT_URI } from '../constants';

export interface OAuthTokenResponse {
    accessToken: string;
    refreshToken: string | null;
    expiresInSeconds: number | null;
    grantedScopes: string[];
    tokenType?: string | null;
}

const postJson = async <T>(url: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const details = payload?.details ? ` (${JSON.stringify(payload.details)})` : '';
        throw new Error(`${payload?.error || 'request_failed'}${details}`);
    }
    return payload as T;
};

export const oauthService = {
    exchangeCodeForTokens: async (code: string, redirectUri: string = REDIRECT_URI): Promise<OAuthTokenResponse> => {
        return postJson<OAuthTokenResponse>('/api/oauth/token', { code, redirectUri });
    },

    refreshAccessToken: async (refreshToken: string): Promise<OAuthTokenResponse> => {
        return postJson<OAuthTokenResponse>('/api/oauth/refresh', { refreshToken });
    },
};

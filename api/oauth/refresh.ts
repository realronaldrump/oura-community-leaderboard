import { postOuraTokenRequest, sanitizeOuraTokenError } from '../_lib/ouraTokenRequest.js';

const DEFAULT_OURA_CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

const getOAuthConfig = (): { clientId: string; clientSecret: string } | null => {
    const clientId =
        process.env.OURA_CLIENT_ID?.trim() ||
        process.env.VITE_OURA_CLIENT_ID?.trim() ||
        DEFAULT_OURA_CLIENT_ID;
    const clientSecret = process.env.OURA_CLIENT_SECRET?.trim() || '';

    if (!clientSecret) {
        return null;
    }

    return { clientId, clientSecret };
};

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.send(JSON.stringify(payload));
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
    }

    try {
        const config = getOAuthConfig();
        if (!config) {
            sendJson(res, 500, {
                error: 'missing_oauth_config',
                details: 'Set OURA_CLIENT_SECRET in the server environment (OURA_CLIENT_ID is optional).',
            });
            return;
        }

        const { clientId, clientSecret } = config;
        const { refreshToken } = req.body || {};

        if (!refreshToken || typeof refreshToken !== 'string') {
            sendJson(res, 400, { error: 'missing_refresh_token' });
            return;
        }

        const tokenBody = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        });

        const tokenResponse = await postOuraTokenRequest(tokenBody);
        const tokenJson = tokenResponse.payload;

        if (!tokenResponse.ok) {
            sendJson(res, tokenResponse.status, {
                error: 'refresh_failed',
                details: sanitizeOuraTokenError(tokenJson),
            });
            return;
        }

        sendJson(res, 200, {
            accessToken: tokenJson.access_token || null,
            refreshToken: tokenJson.refresh_token || null,
            expiresInSeconds: tokenJson.expires_in || null,
            grantedScopes: typeof tokenJson.scope === 'string'
                ? tokenJson.scope.split(/[ ,]+/).map((s: string) => s.trim()).filter(Boolean)
                : [],
            tokenType: tokenJson.token_type || null,
        });
    } catch (error: any) {
        sendJson(res, 500, {
            error: 'server_error',
            details: error?.message || 'Unexpected error refreshing OAuth token.',
        });
    }
}

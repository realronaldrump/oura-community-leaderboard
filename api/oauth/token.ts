const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

const getOAuthConfig = (): { clientId: string; clientSecret: string } | null => {
    const clientId = process.env.OURA_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.OURA_CLIENT_SECRET?.trim() || '';

    if (!clientId || !clientSecret) {
        return null;
    }

    return { clientId, clientSecret };
};

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(payload));
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
                details: 'Set OURA_CLIENT_ID and OURA_CLIENT_SECRET in the server environment.',
            });
            return;
        }

        const { clientId, clientSecret } = config;
        const { code, redirectUri } = req.body || {};
        const effectiveRedirectUri = redirectUri || process.env.OURA_REDIRECT_URI;

        if (!code || typeof code !== 'string') {
            sendJson(res, 400, { error: 'missing_code' });
            return;
        }

        if (!effectiveRedirectUri || typeof effectiveRedirectUri !== 'string') {
            sendJson(res, 400, { error: 'missing_redirect_uri' });
            return;
        }

        const tokenBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: effectiveRedirectUri,
            client_id: clientId,
            client_secret: clientSecret,
        });

        const tokenResponse = await fetch(OURA_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokenBody.toString(),
        });

        const raw = await tokenResponse.text();
        let tokenJson: any = {};
        try {
            tokenJson = raw ? JSON.parse(raw) : {};
        } catch {
            tokenJson = { raw };
        }

        if (!tokenResponse.ok) {
            sendJson(res, tokenResponse.status, {
                error: 'token_exchange_failed',
                details: tokenJson,
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
            details: error?.message || 'Unexpected error exchanging OAuth code.',
        });
    }
}

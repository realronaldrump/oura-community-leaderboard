const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

const getOAuthConfig = () => {
    const clientId = process.env.OURA_CLIENT_ID;
    const clientSecret = process.env.OURA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Missing OURA_CLIENT_ID or OURA_CLIENT_SECRET environment variable.');
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
        const { clientId, clientSecret } = getOAuthConfig();
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
                error: 'refresh_failed',
                details: tokenJson,
            });
            return;
        }

        sendJson(res, 200, {
            accessToken: tokenJson.access_token || null,
            refreshToken: tokenJson.refresh_token || refreshToken,
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

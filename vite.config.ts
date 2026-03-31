import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

const sendJson = (res: ServerResponse, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk: Buffer | string) => {
      raw += chunk.toString();
      if (raw.length > 1_000_000) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          resolve(parsed as Record<string, unknown>);
          return;
        }
      } catch {
        // Fall through to invalid json error.
      }

      reject(new Error('invalid_json'));
    });

    req.on('error', reject);
  });

const parseScopes = (scope: unknown): string[] =>
  typeof scope === 'string'
    ? scope.split(/[ ,]+/).map((s) => s.trim()).filter(Boolean)
    : [];

const mapOAuthTokenResponse = (tokenJson: any, fallbackRefreshToken: string | null = null) => ({
  accessToken: tokenJson?.access_token || null,
  refreshToken: tokenJson?.refresh_token || fallbackRefreshToken,
  expiresInSeconds: tokenJson?.expires_in || null,
  grantedScopes: parseScopes(tokenJson?.scope),
  tokenType: tokenJson?.token_type || null,
});

const postToOuraTokenApi = async (tokenBody: URLSearchParams): Promise<{ ok: boolean; status: number; payload: any }> => {
  const response = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenBody.toString(),
  });

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

const createDevOAuthPlugin = (env: Record<string, string>): Plugin => ({
  name: 'dev-oura-oauth-routes',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = (req.url || '').split('?')[0];
      if (pathname !== '/api/oauth/token' && pathname !== '/api/oauth/refresh') {
        next();
        return;
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }

      const clientId = env.OURA_CLIENT_ID;
      const clientSecret = env.OURA_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        sendJson(res, 500, {
          error: 'missing_oauth_config',
          details: 'Set OURA_CLIENT_ID and OURA_CLIENT_SECRET in your local environment.',
        });
        return;
      }

      let requestBody: Record<string, unknown>;
      try {
        requestBody = await readJsonBody(req);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid_json';
        sendJson(res, 400, { error: message === 'payload_too_large' ? 'payload_too_large' : 'invalid_json' });
        return;
      }

      try {
        if (pathname === '/api/oauth/token') {
          const code = typeof requestBody.code === 'string' ? requestBody.code : '';
          const redirectUriInput = typeof requestBody.redirectUri === 'string' ? requestBody.redirectUri : '';
          const effectiveRedirectUri = redirectUriInput || env.OURA_REDIRECT_URI;

          if (!code) {
            sendJson(res, 400, { error: 'missing_code' });
            return;
          }

          if (!effectiveRedirectUri) {
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

          const tokenResponse = await postToOuraTokenApi(tokenBody);
          if (!tokenResponse.ok) {
            sendJson(res, tokenResponse.status, {
              error: 'token_exchange_failed',
              details: tokenResponse.payload,
            });
            return;
          }

          sendJson(res, 200, mapOAuthTokenResponse(tokenResponse.payload));
          return;
        }

        const refreshToken = typeof requestBody.refreshToken === 'string' ? requestBody.refreshToken : '';
        if (!refreshToken) {
          sendJson(res, 400, { error: 'missing_refresh_token' });
          return;
        }

        const tokenBody = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        });

        const tokenResponse = await postToOuraTokenApi(tokenBody);
        if (!tokenResponse.ok) {
          sendJson(res, tokenResponse.status, {
            error: 'refresh_failed',
            details: tokenResponse.payload,
          });
          return;
        }

        sendJson(res, 200, mapOAuthTokenResponse(tokenResponse.payload, refreshToken));
      } catch (error) {
        sendJson(res, 500, {
          error: 'server_error',
          details: error instanceof Error ? error.message : 'Unexpected OAuth proxy error.',
        });
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/oura': {
          target: 'https://api.ouraring.com/v2/usercollection',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/oura/, ''),
        },
      },
    },
    plugins: [
      react(),
      createDevOAuthPlugin(env),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['**/*.{test,spec}.{ts,tsx}'],
    }
  };
});

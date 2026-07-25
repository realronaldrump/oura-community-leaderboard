import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { postOuraTokenRequest, sanitizeOuraTokenError } from './api/_lib/ouraTokenRequest';

const DEFAULT_OURA_CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

const sendJson = (res: ServerResponse, status: number, payload: Record<string, unknown>) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
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

const mapOAuthTokenResponse = (tokenJson: any) => ({
  accessToken: tokenJson?.access_token || null,
  refreshToken: tokenJson?.refresh_token || null,
  expiresInSeconds: tokenJson?.expires_in || null,
  grantedScopes: parseScopes(tokenJson?.scope),
  tokenType: tokenJson?.token_type || null,
});

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

      const clientId = env.OURA_CLIENT_ID || env.VITE_OURA_CLIENT_ID || DEFAULT_OURA_CLIENT_ID;
      const clientSecret = env.OURA_CLIENT_SECRET;
      if (!clientSecret) {
        sendJson(res, 500, {
          error: 'missing_oauth_config',
          details: 'Set OURA_CLIENT_SECRET in your local environment (OURA_CLIENT_ID is optional).',
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

          const tokenResponse = await postOuraTokenRequest(tokenBody);
          if (!tokenResponse.ok) {
            sendJson(res, tokenResponse.status, {
              error: 'token_exchange_failed',
              details: sanitizeOuraTokenError(tokenResponse.payload),
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

        const tokenResponse = await postOuraTokenRequest(tokenBody);
        if (!tokenResponse.ok) {
          sendJson(res, tokenResponse.status, {
            error: 'refresh_failed',
            details: sanitizeOuraTokenError(tokenResponse.payload),
          });
          return;
        }

        sendJson(res, 200, mapOAuthTokenResponse(tokenResponse.payload));
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
    build: {
      // Split the big vendor libraries into their own cacheable chunks so a
      // release of app code does not force mobile clients to redownload them.
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) return undefined;
            // Firebase has no React dependency, so it can be split without
            // creating circular chunk-initialization issues. The React/recharts
            // graph must stay together with its CJS interop helpers.
            if (id.includes('firebase')) return 'vendor-firebase';
            return undefined;
          },
        },
      },
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

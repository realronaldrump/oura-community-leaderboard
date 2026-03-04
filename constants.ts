
export const CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

export const REDIRECT_URI = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
export const OAUTH_STATE_KEY = 'oura_oauth_state_v1';

/**
 * Leave scopes unspecified by default so Oura can present all currently available
 * scopes for consent. This prevents stale hardcoded scope lists from blocking
 * newly added data routes.
 */
const REQUESTED_SCOPES: string[] = [];

// Dynamically determine the redirect URI based on the current environment.
export const getAuthUrl = (state: string) => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state,
  });
  if (REQUESTED_SCOPES.length > 0) {
    params.set('scope', REQUESTED_SCOPES.join(' '));
  }
  return `https://cloud.ouraring.com/oauth/authorize?${params.toString()}`;
};

export const createOAuthState = (): string => {
  const randomPart = Math.random().toString(36).slice(2, 12);
  const timestampPart = Date.now().toString(36);
  return `${timestampPart}.${randomPart}`;
};

export const API_BASE_URL = '/api/oura';

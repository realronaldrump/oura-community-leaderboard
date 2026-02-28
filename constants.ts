
export const CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

export const REDIRECT_URI = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

const REQUESTED_SCOPES = [
  'email',
  'personal',
  'daily',
  'heartrate',
  'tag',
  'workout',
  'session',
  'spo2',
];

// Dynamically determine the redirect URI based on the current environment.
export const getAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: REQUESTED_SCOPES.join(' '),
  });
  return `https://cloud.ouraring.com/oauth/authorize?${params.toString()}`;
};

export const AUTH_URL = getAuthUrl();

export const API_BASE_URL = '/api';

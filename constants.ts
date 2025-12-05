
export const CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

// Dynamically determine the redirect URI based on the current environment.
// This ensures the app works on localhost or any deployed URL without hardcoding.
const getCurrentUrl = () => {
  if (typeof window === 'undefined') return '';
  // Remove hash and query params to get the base URL
  const url = window.location.href.split('#')[0].split('?')[0];
  // Ensure strict matching with Oura Console (usually expects no trailing slash unless registered with one)
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const REDIRECT_URI = getCurrentUrl();

export const AUTH_URL = `https://cloud.ouraring.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=email+personal+daily+heartrate+tag+workout+session+spo2+ring_configuration+stress+heart_health`;

export const API_BASE_URL = '/api';

export const MOCK_FRIENDS = [
  { id: 'm1', name: 'Sarah J.', avatar: 'https://picsum.photos/40/40?random=1' },
  { id: 'm2', name: 'Mike T.', avatar: 'https://picsum.photos/40/40?random=2' },
  { id: 'm3', name: 'Jessica L.', avatar: 'https://picsum.photos/40/40?random=3' },
  { id: 'm4', name: 'David B.', avatar: 'https://picsum.photos/40/40?random=4' },
  { id: 'm5', name: 'Emma W.', avatar: 'https://picsum.photos/40/40?random=5' },
];

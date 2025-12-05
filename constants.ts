
export const CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

// Dynamically determine the redirect URI based on the current environment.
// This ensures the app works on localhost or any deployed URL without hardcoding.
export const REDIRECT_URI = 'https://2kc3uwk9jxitt6bammrycm6ebsp88ulnfjti1mmnuxt726mvev-h839267052.scf.usercontent.goog/b56084fa-3a7a-44a0-bf5c-bb8c5fe5ca1d';

export const AUTH_URL = `https://cloud.ouraring.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=email+personal+daily+heartrate+tag+workout+session+spo2+ring_configuration+stress+heart_health`;

export const API_BASE_URL = '/api';

export const MOCK_FRIENDS = [
  { id: 'm1', name: 'Sarah J.', avatar: 'https://picsum.photos/40/40?random=1' },
  { id: 'm2', name: 'Mike T.', avatar: 'https://picsum.photos/40/40?random=2' },
  { id: 'm3', name: 'Jessica L.', avatar: 'https://picsum.photos/40/40?random=3' },
  { id: 'm4', name: 'David B.', avatar: 'https://picsum.photos/40/40?random=4' },
  { id: 'm5', name: 'Emma W.', avatar: 'https://picsum.photos/40/40?random=5' },
];

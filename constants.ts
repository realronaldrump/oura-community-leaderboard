
export const CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';

// Dynamically determine the redirect URI based on the current environment.
export const getAuthUrl = () => {
  const redirectUri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `https://cloud.ouraring.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email+personal+daily+heartrate+tag+workout+session+spo2+ring_configuration+stress+heart_health`;
};

export const API_BASE_URL = '/api';

export const MOCK_FRIENDS = [
  { id: 'm1', name: 'Sarah J.', avatar: 'https://picsum.photos/40/40?random=1' },
  { id: 'm2', name: 'Mike T.', avatar: 'https://picsum.photos/40/40?random=2' },
  { id: 'm3', name: 'Jessica L.', avatar: 'https://picsum.photos/40/40?random=3' },
  { id: 'm4', name: 'David B.', avatar: 'https://picsum.photos/40/40?random=4' },
  { id: 'm5', name: 'Emma W.', avatar: 'https://picsum.photos/40/40?random=5' },
];

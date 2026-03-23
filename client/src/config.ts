const rawApiUrl = import.meta.env.VITE_API_URL?.trim();
const DEPLOY_BACKEND_FALLBACK = 'https://noni-jam-server.onrender.com';

const explicitApiUrl = rawApiUrl
  ? (/^https?:\/\//i.test(rawApiUrl) ? rawApiUrl : `https://${rawApiUrl}`).replace(/\/+$/, '')
  : '';

function inferBackendUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const { protocol, hostname, origin, port } = window.location;

  // In Vite dev we serve the UI on 5173 and the API on 3001 by default.
  if (port === '5173') {
    return `${protocol}//${hostname}:3001`;
  }

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  ) {
    return origin.replace(/\/+$/, '');
  }

  // Production deploys use a separate backend service on Render.
  return DEPLOY_BACKEND_FALLBACK;
}

export const BACKEND_URL = explicitApiUrl || inferBackendUrl();

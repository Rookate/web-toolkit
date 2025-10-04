// Example client setup for Next.js (App Router).
// Copy this file into your Next project (e.g., src/lib/api.ts) and adjust baseUrl.

import { createFetchClient } from '../../../dist/index.js';

export const api = createFetchClient({
  baseUrl: 'https://jsonplaceholder.typicode.com',
  timeout: 8000,
  retry: true,
  baseHeaders: async () => ({
    // Example: include auth header if you have a session/token
    // Authorization: `Bearer ${await getSessionToken()}`
  })
});

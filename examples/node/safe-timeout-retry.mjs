// Safe helpers, timeout, and retry example.
// Run: npm run build && node examples/node/safe-timeout-retry.mjs

import { createFetchClient, isFetchClientError } from '../../dist/index.js';

const api = createFetchClient({
  baseUrl: 'https://httpstat.us',
  retry: { retries: 2 },
  timeout: 3000
});

const main = async () => {
  // Safe call: no throw on HTTP error; you get { ok: false, error }
  const res = await api.safeJson('/503');
  if (!res.ok) {
    if (isFetchClientError(res.error)) {
      console.log('HTTP error status:', res.error.status);
    } else {
      console.log('Network/abort error:', String(res.error));
    }
  } else {
    console.log('Unexpected success:', res.data);
  }

  // Timeout + retry override per call
  const timed = await api.safeText('/200?sleep=5000', { timeout: 1000, retry: false });
  console.log('Timeout result ok?', timed.ok);
};

main().catch((e) => {
  console.error('Example error:', e);
  process.exit(1);
});

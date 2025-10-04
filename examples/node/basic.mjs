// Basic example: GET with query params, POST with JSON body.
// Run: npm run build && node examples/node/basic.mjs

import { createFetchClient } from '../../dist/index.js';

const api = createFetchClient({
  baseUrl: 'https://jsonplaceholder.typicode.com',
  retry: true,
  timeout: 8000
});

const main = async () => {
  const todos = await api.get('/todos', { query: { _limit: 3 } });
  console.log('First 3 todos:', todos);

  const created = await api.post('/posts', {
    json: { title: 'foo', body: 'bar', userId: 1 }
  });
  console.log('Created:', created);
};

main().catch((e) => {
  console.error('Example error:', e);
  process.exit(1);
});

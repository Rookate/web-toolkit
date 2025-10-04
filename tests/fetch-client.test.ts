import { describe, it, expect } from 'vitest';
import { createFetchClient, FetchClientError, isFetchClientError } from '../src/index';

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init
  });

describe('fetch-client basics', () => {
  it('returns undefined for 204 with json parser', async () => {
    const client = createFetchClient({
      baseUrl: 'http://localhost',
      fetchImplementation: async () => new Response(null, { status: 204 })
    });
    const res = await client.json('/no-content');
    expect(res).toBeUndefined();
  });

  it('throws FetchClientError on non-ok when throwOnHttpError=true (default)', async () => {
    const client = createFetchClient({
      baseUrl: 'http://localhost',
      fetchImplementation: async () => jsonResponse({ message: 'bad' }, { status: 400 })
    });
    await expect(client.json('/bad')).rejects.toBeInstanceOf(FetchClientError);
  });

  it('safeJson returns ok:false on HTTP error', async () => {
    const client = createFetchClient({
      baseUrl: 'http://localhost',
      fetchImplementation: async () => jsonResponse({ err: 'bad' }, { status: 500 })
    });
    const res = await client.safeJson('/err');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(isFetchClientError(res.error)).toBe(true);
    }
  });
});

describe('retry and timeout', () => {
  it('retries on configured status codes and eventually succeeds', async () => {
    let calls = 0;
    const fetchImplementation: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) return new Response('service unavailable', { status: 503 });
      return jsonResponse({ ok: true }, { status: 200 });
    };

    const client = createFetchClient({ baseUrl: 'http://localhost', fetchImplementation });
    const data = await client.json<{ ok: boolean }>('/try', {
      retry: {
        retries: 1,
        statusCodes: [503],
        methods: ['GET'],
        factor: 1,
        minDelay: 1,
        maxDelay: 1,
        jitter: 0,
        respectRetryAfterHeader: false
      }
    });
    expect(data.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('aborts on timeout', async () => {
    const fetchImplementation: typeof fetch = async (_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          // Simulate fetch abort behaviour
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };

    const client = createFetchClient({ baseUrl: 'http://localhost', fetchImplementation });
    await expect(client.json('/hang', { timeout: 5, retry: false })).rejects.toThrow();

    const safe = await client.safeJson('/hang', { timeout: 5, retry: false });
    expect(safe.ok).toBe(false);
  });
});

describe('validation', () => {
  it('uses a validator function', async () => {
    const client = createFetchClient({
      baseUrl: 'http://localhost',
      fetchImplementation: async () => jsonResponse({ id: 1, title: 'ok' })
    });
    const data = await client.json<{ id: number; title: string }>('/x', {
      validate: (d: unknown) => {
        const o = d as any;
        if (typeof o?.id !== 'number' || typeof o?.title !== 'string') throw new Error('invalid');
        return o as { id: number; title: string };
      }
    });
    expect(data.id).toBe(1);
  });
});

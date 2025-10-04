export type SearchParamValue = string | number | boolean | null | undefined;
export type SearchParams = Record<string, SearchParamValue | SearchParamValue[]>;

export type ResponseParser<T> =
  | 'json'
  | 'text'
  | 'blob'
  | 'arrayBuffer'
  | ((response: Response) => Promise<T>);

export type SchemaLike<T> = { parse: (data: unknown) => T };
export type Validator<T> = ((data: unknown) => T) | SchemaLike<T>;
export type AnyValidator = Validator<unknown>;

export interface RetryOptions {
  // Number of retry attempts after the initial try (2 => 3 total tries)
  retries: number;
  // HTTP status codes that should be retried when response is not ok
  statusCodes: number[];
  // Limit retries to specific HTTP methods (e.g., GET/HEAD by default)
  methods: string[];
  // Exponential backoff settings
  factor: number; // growth factor per attempt
  minDelay: number; // initial delay in ms
  maxDelay: number; // cap delay in ms
  jitter: number; // 0..1 percentage jitter
  // Honor Retry-After header for 429/503 when present
  respectRetryAfterHeader: boolean;
}

export interface FetchRequestOptions extends RequestInit {
  query?: SearchParams;
  parseAs?: ResponseParser<unknown>;
  throwOnHttpError?: boolean;
  // Abort after X ms (applies to whole request including retries)
  timeout?: number;
  // Retry policy for this request. true uses defaults, number overrides retries count,
  // object merges with defaults, false disables retries.
  retry?: boolean | number | Partial<RetryOptions>;
  // Provide a JSON body and auto-set content-type header
  json?: unknown;
  // Optional runtime validation of the parsed payload (e.g., Zod schema)
  validate?: AnyValidator;
}

export interface FetchClientConfig {
  baseUrl?: string;
  baseHeaders?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  defaultQuery?: SearchParams;
  defaultOptions?: RequestInit;
  fetchImplementation?: typeof fetch;
  throwOnHttpError?: boolean;
  // Default timeout and retry policy (overridable per request)
  timeout?: number;
  retry?: boolean | number | Partial<RetryOptions>;
  beforeRequest?: (
    url: string,
    init: RequestInit & { url: string }
  ) => void | Promise<void>;
  afterResponse?: (response: Response) => void | Promise<void>;
}

export class FetchClientError extends Error {
  readonly response: Response;
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, response: Response, data: unknown) {
    super(message);
    this.name = 'FetchClientError';
    this.response = response;
    this.status = response.status;
    this.data = data;
  }
}

export type FetchResult<T> =
  | { ok: true; data: T; response: Response }
  | { ok: false; error: unknown; response?: Response };

export interface FetchClient {
  request(input: string | URL, options?: FetchRequestOptions): Promise<Response>;
  json<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
  text(input: string | URL, options?: FetchRequestOptions): Promise<string>;
  blob(input: string | URL, options?: FetchRequestOptions): Promise<Blob>;
  arrayBuffer(input: string | URL, options?: FetchRequestOptions): Promise<ArrayBuffer>;
  withConfig(overrides: Partial<FetchClientConfig>): FetchClient;
  // Safe result helpers (no throw on HTTP)
  safeJson?<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<T>>;
  safeText?(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<string>>;
  safeBlob?(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<Blob>>;
  safeArrayBuffer?(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<ArrayBuffer>>;
  // Convenience verbs (JSON by default)
  get?<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
  post?<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
  put?<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
  patch?<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
  del?<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toSearchParams = (params: SearchParams | undefined): URLSearchParams | undefined => {
  if (!params) {
    return undefined;
  }

  const searchParams = new URLSearchParams();

  const appendValue = (key: string, value: SearchParamValue) => {
    if (value === undefined || value === null) {
      return;
    }

    searchParams.append(key, String(value));
  };

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => appendValue(key, item));
      return;
    }

    appendValue(key, value);
  });

  return searchParams;
};

const resolveUrl = (
  input: string | URL,
  baseUrl?: string,
  query?: SearchParams,
  defaultQuery?: SearchParams
): string => {
  const url = new URL(String(input), baseUrl);

  const finalDefault = toSearchParams(defaultQuery);
  if (finalDefault) {
    finalDefault.forEach((value, key) => {
      if (!url.searchParams.has(key)) {
        url.searchParams.append(key, value);
      }
    });
  }

  const finalQuery = toSearchParams(query);
  if (finalQuery) {
    finalQuery.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
  }

  return url.toString();
};

const mergeHeaders = async (
  baseHeaders: FetchClientConfig['baseHeaders'],
  defaultHeaders: HeadersInit | undefined,
  requestHeaders: HeadersInit | undefined
): Promise<HeadersInit | undefined> => {
  const initial =
    typeof baseHeaders === 'function' ? await baseHeaders() : baseHeaders;

  if (!initial && !defaultHeaders && !requestHeaders) {
    return undefined;
  }

  const headers = new Headers(initial ?? {});

  if (defaultHeaders) {
    new Headers(defaultHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
};

const parseResponse = async <T>(
  response: Response,
  parser: ResponseParser<T> | undefined
): Promise<T> => {
  const noContent = response.status === 204 || response.status === 205;

  if (!parser || parser === 'json') {
    if (noContent) {
      return undefined as unknown as T;
    }
    const raw = await response.text();
    if (!raw || raw.trim().length === 0) {
      return undefined as unknown as T;
    }
    return JSON.parse(raw) as T;
  }

  if (parser === 'text') {
    return (await response.text()) as unknown as T;
  }

  if (parser === 'blob') {
    return (await response.blob()) as unknown as T;
  }

  if (parser === 'arrayBuffer') {
    return (await response.arrayBuffer()) as unknown as T;
  }

  return (parser as (response: Response) => Promise<T>)(response);
};

const parseErrorPayload = async (response: Response): Promise<unknown> => {
  const cloned = response.clone();
  try {
    const contentType = cloned.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await cloned.json();
    }

    return await cloned.text();
  } catch (error) {
    return undefined;
  }
};

const sanitizeRequestInit = (
  requestOptions: FetchRequestOptions | undefined
): RequestInit => {
  if (!requestOptions) {
    return {};
  }

  const {
    query: _query,
    parseAs: _parseAs,
    throwOnHttpError: _throwOnHttpError,
    timeout: _timeout,
    retry: _retry,
    json: _json,
    ...rest
  } =
    requestOptions;

  return rest;
};

const mergeRequestInit = (
  defaultOptions: RequestInit | undefined,
  requestOptions: FetchRequestOptions | undefined,
  headers: HeadersInit | undefined
): RequestInit => ({
  ...(defaultOptions ?? {}),
  ...sanitizeRequestInit(requestOptions),
  headers
});

export const createFetchClient = (config: FetchClientConfig = {}): FetchClient => {
  const {
    baseUrl,
    baseHeaders,
    defaultQuery,
    defaultOptions,
    fetchImplementation,
    throwOnHttpError = true,
    timeout: defaultTimeout,
    retry: defaultRetry,
    beforeRequest,
    afterResponse
  } = config;

  // ---- Retry helpers ----
  const DEFAULT_RETRY: RetryOptions = {
    retries: 2,
    statusCodes: [408, 425, 429, 500, 502, 503, 504],
    methods: ['GET', 'HEAD'],
    factor: 2,
    minDelay: 300,
    maxDelay: 2000,
    jitter: 0.25,
    respectRetryAfterHeader: true
  };

  const normalizeMethod = (m: string | undefined) => (m ? m.toUpperCase() : 'GET');

  const resolveRetry = (
    method: string | undefined,
    reqRetry: FetchRequestOptions['retry']
  ): RetryOptions | undefined => {
    const source = typeof reqRetry === 'undefined' ? defaultRetry : reqRetry;
    if (!source) return undefined; // false or undefined
    let base: RetryOptions = { ...DEFAULT_RETRY };
    if (typeof source === 'number') {
      base.retries = source;
    } else if (source === true) {
      // keep defaults
    } else {
      base = { ...base, ...source };
    }
    const finalMethod = normalizeMethod(method);
    if (base.methods.length && !base.methods.includes(finalMethod)) {
      // method not allowed for retry
      return undefined;
    }
    return base;
  };

  const parseRetryAfter = (response: Response): number | undefined => {
    const ra = response.headers.get('retry-after');
    if (!ra) return undefined;
    const secs = Number(ra);
    if (!Number.isNaN(secs)) return Math.max(0, secs * 1000);
    const date = new Date(ra).getTime();
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return undefined;
  };

  const backoffDelay = (attempt: number, retry: RetryOptions): number => {
    const raw = Math.min(
      retry.maxDelay,
      retry.minDelay * Math.pow(retry.factor, Math.max(0, attempt - 1))
    );
    if (!retry.jitter) return raw;
    const jitter = raw * retry.jitter;
    const min = raw - jitter;
    const max = raw + jitter;
    return Math.floor(min + Math.random() * (max - min));
  };

  const isAbortError = (err: unknown): boolean => {
    return (
      (err as any)?.name === 'AbortError' ||
      (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
    );
  };

  const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const t = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });

  const composeSignal = (
    baseSignal: AbortSignal | undefined,
    timeoutMs: number | undefined
  ): { signal: AbortSignal | undefined; cleanup: () => void } => {
    if (!baseSignal && !timeoutMs) return { signal: undefined, cleanup: () => {} };
    const controller = new AbortController();
    let timeoutId: any;
    const onAbort = () => controller.abort(baseSignal?.reason);
    if (baseSignal) baseSignal.addEventListener('abort', onAbort);
    if (timeoutMs && timeoutMs > 0) timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      cleanup: () => {
        if (baseSignal) baseSignal.removeEventListener('abort', onAbort);
        if (timeoutId) clearTimeout(timeoutId);
      }
    };
  };

  const requestWithRetry = async (
    url: string,
    init: RequestInit,
    effectiveTimeout?: number,
    retryPolicy?: RetryOptions
  ): Promise<Response> => {
    const fetchFn = fetchImplementation ?? fetch;
    if (!fetchFn) {
      throw new Error('No fetch implementation available in this environment.');
    }

    const { signal: userSignal } = init;
    const { signal, cleanup } = composeSignal((userSignal ?? undefined) as AbortSignal | undefined, effectiveTimeout ?? defaultTimeout);
    const baseInit = { ...init, signal };

    let lastError: unknown;
    const totalAttempts = (retryPolicy?.retries ?? 0) + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        await beforeRequest?.(url, { ...baseInit, url });
        const res = await fetchFn(url, baseInit);
        await afterResponse?.(res);

        if (!retryPolicy) {
          cleanup();
          return res;
        }

        // If not ok, decide whether to retry
        if (!res.ok) {
          const code = res.status;
          const shouldRetry = retryPolicy.statusCodes.includes(code);
          if (shouldRetry && attempt < totalAttempts) {
            const retryAfter = retryPolicy.respectRetryAfterHeader ? parseRetryAfter(res) : undefined;
            const delay = retryAfter ?? backoffDelay(attempt, retryPolicy);
            await sleep(delay, (baseInit.signal ?? undefined) as AbortSignal | undefined);
            continue;
          }
        }

        cleanup();
        return res;
      } catch (err) {
        lastError = err;
        if (isAbortError(err)) {
          cleanup();
          throw err; // do not retry aborted
        }
        if (!retryPolicy || attempt >= totalAttempts) {
          cleanup();
          throw err;
        }
        // network or other error: backoff then retry
        const delay = backoffDelay(attempt, retryPolicy);
        await sleep(delay, (baseInit.signal ?? undefined) as AbortSignal | undefined);
      }
    }

    // Should not reach here normally
    cleanup();
    throw lastError ?? new Error('Request failed');
  };

  const fetcher = async <T>(
    input: string | URL,
    options?: FetchRequestOptions,
    parser?: ResponseParser<T>
  ): Promise<T> => {
    const url = resolveUrl(input, baseUrl, options?.query, defaultQuery);
    const headers = await mergeHeaders(baseHeaders, defaultOptions?.headers, options?.headers);
    const finalInit = mergeRequestInit(defaultOptions, options, headers);
    // JSON body convenience
    if (typeof options?.json !== 'undefined') {
      const h = new Headers(headers ?? {});
      if (!h.has('content-type')) {
        h.set('content-type', 'application/json');
      }
      finalInit.headers = h;
      finalInit.body = JSON.stringify(options.json);
      finalInit.method = finalInit.method ?? 'POST';
    }

    const retryPolicy = resolveRetry(finalInit.method, options?.retry);
    const response = await requestWithRetry(url, finalInit, options?.timeout, retryPolicy);

    const shouldThrow = options?.throwOnHttpError ?? throwOnHttpError;
    if (shouldThrow && !response.ok) {
      const payload = await parseErrorPayload(response);
      throw new FetchClientError(
        `Request failed with status ${response.status} (${response.statusText})`,
        response,
        payload
      );
    }

    const parsed = await parseResponse(response, (parser ?? options?.parseAs) as ResponseParser<T> | undefined);
    const v = options?.validate as Validator<T> | undefined;
    if (!v) return parsed as T;
    if (typeof v === 'function') return v(parsed as unknown) as T;
    if (v && typeof (v as any).parse === 'function') return (v as SchemaLike<T>).parse(parsed as unknown);
    return parsed as T;
  };

  const request: FetchClient['request'] = async (input, options) => {
    const url = resolveUrl(input, baseUrl, options?.query, defaultQuery);
    const headers = await mergeHeaders(baseHeaders, defaultOptions?.headers, options?.headers);
    const finalInit = mergeRequestInit(defaultOptions, options, headers);

    if (typeof options?.json !== 'undefined') {
      const h = new Headers(headers ?? {});
      if (!h.has('content-type')) {
        h.set('content-type', 'application/json');
      }
      finalInit.headers = h;
      finalInit.body = JSON.stringify(options.json);
      finalInit.method = finalInit.method ?? 'POST';
    }

    const retryPolicy = resolveRetry(finalInit.method, options?.retry);
    const response = await requestWithRetry(url, finalInit, options?.timeout, retryPolicy);

    const shouldThrow = options?.throwOnHttpError ?? throwOnHttpError;

    if (shouldThrow && !response.ok) {
      const payload = await parseErrorPayload(response);
      throw new FetchClientError(
        `Request failed with status ${response.status} (${response.statusText})`,
        response,
        payload
      );
    }

    return response;
  };

  const safe = async <T>(
    input: string | URL,
    options?: FetchRequestOptions,
    parser?: ResponseParser<T>
  ): Promise<FetchResult<T>> => {
    try {
      const res = await request(input, { ...options, throwOnHttpError: false });
      if (!res.ok) {
        const payload = await parseErrorPayload(res);
        return {
          ok: false,
          error: new FetchClientError(
            `Request failed with status ${res.status} (${res.statusText})`,
            res,
            payload
          ),
          response: res
        };
      }
      const parsed = await parseResponse(res, (parser ?? options?.parseAs) as ResponseParser<T> | undefined);
      const v = options?.validate as Validator<T> | undefined;
      const data = !v
        ? (parsed as T)
        : typeof v === 'function'
          ? (v(parsed as unknown) as T)
          : (v as SchemaLike<T>).parse(parsed as unknown);
      return { ok: true, data: data as T, response: res };
    } catch (err) {
      return { ok: false, error: err };
    }
  };

  const client: FetchClient & {
    safeJson<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<T>>;
    safeText(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<string>>;
    safeBlob(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<Blob>>;
    safeArrayBuffer(input: string | URL, options?: FetchRequestOptions): Promise<FetchResult<ArrayBuffer>>;
    get<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
    post<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
    put<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
    patch<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
    del<T = unknown>(input: string | URL, options?: FetchRequestOptions): Promise<T>;
  } = {
    request,
    json: (input, options) => fetcher(input, options, 'json'),
    text: (input, options) => fetcher(input, options, 'text'),
    blob: (input, options) => fetcher(input, options, 'blob'),
    arrayBuffer: (input, options) => fetcher(input, options, 'arrayBuffer'),
    safeJson: (input, options) => safe(input, options, 'json'),
    safeText: (input, options) => safe(input, options, 'text'),
    safeBlob: (input, options) => safe(input, options, 'blob'),
    safeArrayBuffer: (input, options) => safe(input, options, 'arrayBuffer'),
    get: (input, options) => fetcher(input, { ...options, method: 'GET' }, 'json'),
    post: (input, options) => fetcher(input, { ...options, method: options?.method ?? 'POST' }, 'json'),
    put: (input, options) => fetcher(input, { ...options, method: 'PUT' }, 'json'),
    patch: (input, options) => fetcher(input, { ...options, method: 'PATCH' }, 'json'),
    del: (input, options) => fetcher(input, { ...options, method: 'DELETE' }, 'json'),
    withConfig: (overrides) =>
      createFetchClient({
        ...config,
        ...overrides,
        defaultOptions: {
          ...(config.defaultOptions ?? {}),
          ...(overrides?.defaultOptions ?? {})
        },
        defaultQuery: {
          ...(config.defaultQuery ?? {}),
          ...(overrides?.defaultQuery ?? {})
        }
      })
  };

  return client;
};

export const createJsonFetcher = (
  config: FetchClientConfig = {}
): (<T = unknown>(input: string | URL, options?: FetchRequestOptions) => Promise<T>) => {
  const client = createFetchClient(config);
  return client.json;
};

export const isFetchClientError = (error: unknown): error is FetchClientError =>
  error instanceof FetchClientError;

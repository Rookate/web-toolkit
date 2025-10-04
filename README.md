# @rokat/web-toolkit

Petit toolkit pour standardiser `fetch` dans tes apps (Next.js, Node ou navigateur).
Fonctionnalités: erreurs typées, gestion des query params, retry avec backoff, timeout/abort,
helpers “safe” sans try/catch, validation (Zod ou fonction), et raccourcis HTTP (GET/POST...).

## Installation

```bash
npm install @rokat/web-toolkit
```

En dev local (sans publier): `npm pack` dans ce repo, puis `npm install <chemin>/xxx.tgz` dans ton app.

## Démarrage rapide

```ts
import { createFetchClient } from '@rokat/web-toolkit';

const api = createFetchClient({
  baseUrl: 'https://api.example.com',
  timeout: 8000,
  retry: true,
  baseHeaders: async () => ({
    Authorization: `Bearer ${await getSessionToken()}`
  }),
  defaultQuery: { locale: 'fr' }
});

// GET JSON, fusionne query: /todos?locale=fr&completed=true
const todos = await api.get<Todo[]>('/todos', { query: { completed: true } });

// POST JSON pratique (Content-Type auto et méthode POST par défaut)
const created = await api.post<Todo>('/todos', { json: { title: 'Test' } });
```

Voir d’autres cas d’usage dans `examples/`.

## API

### createFetchClient(config)

Crée un client avec des options globales.

- `baseUrl?: string` — préfixe les chemins relatifs.
- `baseHeaders?: HeadersInit | () => HeadersInit | Promise<HeadersInit>` — en-têtes partagés (auth token async ok).
- `defaultQuery?: Record<string, string | number | boolean | null | undefined | (..[])>` — query params par défaut (fusionnés).
- `defaultOptions?: RequestInit` — options RequestInit par défaut (méthode, credentials, etc.).
- `throwOnHttpError?: boolean` — `true` par défaut, lève `FetchClientError` si `!response.ok`.
- `timeout?: number` — timeout global en ms (Cancelable via AbortController aussi).
- `retry?: boolean | number | Partial<RetryOptions>` — politique de retry par défaut.
- `beforeRequest?(url, init)` — hook avant l’appel (logging, tracing).
- `afterResponse?(res)` — hook après réponse (metrics, refresh token…)

Types utiles exportés: `FetchClientConfig`, `FetchRequestOptions`, `RetryOptions`.

### FetchRequestOptions (par appel)

- `query?: Record<...>` — fusionne dans l’URL finale.
- `parseAs?: 'json' | 'text' | 'blob' | 'arrayBuffer' | (res => Promise<T>)` — parser (par défaut `json`).
- `throwOnHttpError?: boolean` — override local du comportement global.
- `timeout?: number` — timeout spécifique à l’appel.
- `retry?: boolean | number | Partial<RetryOptions>` — retry spécifique.
- `json?: unknown` — sérialise en JSON, ajoute `Content-Type` si absent, méthode par défaut `POST`.
- `validate?: Validator<T> | SchemaLike<T>` — validation runtime (ex: Zod). Si invalide, l’appel échoue.

### Méthodes du client

- `request(input, options)` — renvoie `Response` (pas de parsing).
- `json<T>(input, options)` — parse JSON (204 → `undefined`).
- `text(input, options)` — parse texte.
- `blob(input, options)` — parse Blob.
- `arrayBuffer(input, options)` — parse ArrayBuffer.
- Raccourcis JSON: `get/post/put/patch/del<T>(input, options)`.
- Safe (pas de try/catch): `safeJson/safeText/safeBlob/safeArrayBuffer` renvoient `{ ok, data|error, response? }`.
- `withConfig(overrides)` — crée un nouveau client basé sur celui courant (merge des defaults).

### Gestion des erreurs

- HTTP non-OK (4xx/5xx) → `FetchClientError` si `throwOnHttpError: true`.
- `FetchClientError` expose `status`, `response` et un `data` parsé (JSON si possible sinon texte).
- Type guard: `isFetchClientError(err)`.

### Timeout, Abort, Retry

- `timeout` annule automatiquement la requête après X ms (y compris durant les retries).
- Abort manuel: `const c = new AbortController(); api.json('/x',{signal:c.signal}); c.abort()`.
- Retry par défaut (si activé): méthodes `GET/HEAD` sur statuts transitoires `408,429,500,502,503,504`.
- Backoff exponentiel avec jitter + prise en compte de `Retry-After` (429/503) si présent.

### Validation (Zod ou fonction)

```ts
import { z } from 'zod';

const Todo = z.object({ id: z.number(), title: z.string(), completed: z.boolean() });

// Valide et restreint le type
const todo = await api.json<z.infer<typeof Todo>>('/todos/1', { validate: Todo });

// Fonction custom
const user = await api.json<User>('/me', {
  validate: (data) => {
    if (!data || typeof data !== 'object' || typeof (data as any).id !== 'string') {
      throw new Error('Invalid user shape');
    }
    return data as User;
  }
});

// En mode safe
const res = await api.safeJson<z.infer<typeof Todo>>('/todos/1', { validate: Todo });
```

### Statuts 204/205

- `json` renvoie `undefined` si pas de contenu, sans erreur.
- `text` renvoie `''` si vide.
- `blob/arrayBuffer` renvoient des structures vides.

## Exemples supplémentaires

#### En-têtes d’auth dynamiques

```ts
const api = createFetchClient({
  baseUrl: 'https://api.example.com',
  baseHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` })
});
```

#### Abort + retry

```ts
const controller = new AbortController();
const p = api.get('/slow', { timeout: 3000, retry: { retries: 3 }, signal: controller.signal });
controller.abort();
```

#### Changement local de config

```ts
const apiFr = api.withConfig({ defaultQuery: { locale: 'fr' } });
const apiEn = api.withConfig({ defaultQuery: { locale: 'en' } });
```

## Publication et CI

- Privé par défaut (`publishConfig.access=restricted`). Publie avec `npm publish` après `npm version ...`.
- CI (`.github/workflows/ci.yml`): build + `npm pack --dry-run` sur push/PR.
- Release (`.github/workflows/release.yml`): publie sur tag `vX.Y.Z` (nécessite `NPM_TOKEN`).

## Références de code

- Client et types: `src/fetch-client.ts:264`
- Erreur typée: `src/fetch-client.ts:63`
- Safe helpers: `src/fetch-client.ts:508`
- Validation (option `validate`): `src/fetch-client.ts:468`

# Examples

This folder contains small, runnable snippets showing how to use `@rokat/web-toolkit`.

Note: these examples import the built output from `dist/` for convenience.

- Build the package first: `npm run build`
- Then run node examples with: `node examples/node/<file>.mjs`

For Next.js, these are illustrative files you can copy into your app router project.

## Layout

- `examples/node/basic.mjs`: simple GET/POST, query params, JSON body
- `examples/node/safe-timeout-retry.mjs`: safe helpers, timeout, retry
- `examples/next/app/api.ts`: client instance for Next app
- `examples/next/app/page.tsx`: server component using the client
- `examples/next/components/ClientComponent.tsx`: client component using the client

# Platform Examples

## Deno

`examples/deno/main.ts` uses `Deno.serve` and the Fetch-standard adapter:

```bash
deno run --allow-net examples/deno/main.ts
```

The checked contract is also available with `npm run deno:check`. See
`examples/deno/README.md` for runtime limitations.

## Cloudflare Workers

`examples/cloudflare/worker.ts` exports the Workers `fetch` object contract. The adapter uses only Web APIs, does not require Node globals, and forwards
`env` and `ctx` to the route context. Its local contract is covered by
`npm test`; deployment bindings remain platform-specific.

## Full-stack framework fixtures

The repository also contains runnable framework-native HTTP fixtures:

| Framework | Entry point | Bridge |
| --- | --- | --- |
| Astro | `examples/astro/src/pages/api/nelysia.ts` | `APIContext.request` → Fetch handler |
| Next.js | `examples/nextjs/app/api/nelysia/route.ts` | App Router method exports → Fetch handler |
| Nuxt/Nitro | `examples/nuxt/server/api/nelysia.ts` | H3 `toWebRequest(event)` → Fetch handler |
| SvelteKit | `examples/sveltekit/src/routes/api/nelysia/+server.ts` | `RequestEvent.request` → Fetch handler |
| TanStack Start | `examples/tanstack-start/src/routes/api/nelysia.ts` | server `{ request }` → Fetch handler |

Each fixture has its own `package.json` and can be started with `npm install &&
npm run dev` from its directory. After installing all five fixtures, run
`npm run framework:check` from the repository root. This command performs a
production build and a live `GET /api/nelysia` smoke request for every fixture.

## Current limits

The shared contract covers HTTP `Request`/`Response` behavior. WebSocket
upgrades, SSR, caching, cookie/streaming policy, platform observability, and
deployment bindings remain framework/platform-specific; the supported Node/Bun
WebSocket contract is tested separately.

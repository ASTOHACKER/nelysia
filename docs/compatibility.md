# Compatibility Matrix

This matrix records verified behavior in the current workspace. It is intentionally narrower than a promise of support for every version of a runtime.

| Capability | Node 26.8.1 | Bun 1.4.0 |
| --- | --- | --- |
| HTTP routing | verified | verified |
| JSON body parsing | verified | verified |
| Validation and hooks | verified | verified |
| Native Response | verified | verified |
| ReadableStream response | verified | verified |
| WebSocket upgrade | verified | verified |
| OpenAPI document | verified | verified |
| Generated build target | verified | verified |
| Request ID propagation | verified | verified |
| Multipart `FormData`/`File` upload | verified | verified |
| Typed redacted logger plugin | verified | verified |
| Deadline timeout plugin | verified | verified |

The Fetch-standard adapter is verified with the Request/Response contract and is
the base for Deno, Cloudflare Workers, Vercel, Astro, Next.js, SvelteKit, and
TanStack Start integrations. Nuxt/Nitro uses H3's `toWebRequest(event)` bridge
to produce the same contract.

## Full-stack fixture matrix

| Fixture | Framework boundary | Runtime verification |
| --- | --- | --- |
| `examples/astro` | Astro `APIContext.request` and endpoint methods | build + live `GET /api/nelysia` smoke |
| `examples/nextjs` | App Router route-method exports | build + live `GET /api/nelysia` smoke |
| `examples/nuxt` | H3/Nitro event converted by `toWebRequest` | Nitro build + live `GET /api/nelysia` smoke |
| `examples/sveltekit` | SvelteKit `RequestEvent.request` | build + live `GET /api/nelysia` smoke |
| `examples/tanstack-start` | TanStack Start server route `{ request }` | build + live `GET /api/nelysia` smoke |

Install each fixture's dependencies and run `npm run framework:check` from the
repository root. The check owns the dev-server process, verifies status/body,
and cleans up after every fixture. Framework-specific SSR, caching, WebSocket,
cookie/streaming, and deployment bindings remain outside this shared HTTP
contract.

## Verification Commands

```bash
npm run typecheck
npm test
bun test
npm run soak
npm run release:check
npm run framework:check
npm run package:imports
npm run deployment:smoke
npm run soak:1m
npm run soak:10m
```

The v0.5 soak runner reports exact request count, failures, runtime errors,
throughput, periodic heap/RSS samples, and before/after deltas. Heap/RSS delta
is a signal for investigation, not a garbage-collection-proof leak measurement.

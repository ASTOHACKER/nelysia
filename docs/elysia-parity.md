# Elysia Feature Parity Roadmap

This is a prioritised roadmap based on Elysia's public documentation. Nelysia should match the useful developer experience, not copy implementation details or claims.

## Core API

| Area | Nelysia status | Priority |
| --- | --- | --- |
| Chainable routes | Implemented (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD, ALL) | P0 |
| Static response handlers | Implemented (`getStatic()`, zero-context optimization) | P0 |
| `listen()` ergonomic API | Implemented (Unified Bun & Node callback with ServerInfo in v0.1.4) | P0 |
| Params/query/body context | Implemented (Proxy destructuring, `set`, `store`, shorthands in v0.1.2–v0.1.4) | P0 |
| HEAD/OPTIONS/405 semantics | Implemented (Automatic 405 + Allow headers + OPTIONS 204) | P0 |
| Lifecycle hooks | Implemented (`onRequest`, `onParse`, `onTransform`, `onBeforeHandle`, `onAfterHandle`, `mapResponse`, `onError`, `onAfterResponse`) | P0 |
| Error handling | Implemented (`onError`, `HttpError`, status code mapping) | P0 |
| Custom 404 handler | Implemented (`notFound()` in v0.1.3+) | P0 |
| Cookies | Implemented (`cookies`, `setCookie`, `deleteCookie` in v0.1.4) | P1 |
| WebSocket | Implemented (Native Bun & Node WebSocket) | P1 |
| Streaming | Implemented (Native Response and ReadableStream support) | P1 |

## Type Integrity

| Area | Nelysia status | Priority |
| --- | --- | --- |
| Path parameter inference | Basic / Parsed in Context params | P0 |
| Schema body validation | Implemented (`t.Object`, standard schemas) | P0 |
| Schema composition | Implemented (`Array`, `Union`, `Intersect`, `Partial`, `Pick`, `Omit`, `Enum`, `Nullable`) | P1 |
| Params/query/header schemas | Implemented (Runtime validation) | P0 |
| Response schemas | Implemented (Runtime validation & serialization) | P1 |
| Standard Schema adapters | Implemented (Zod, Valibot, ArkType Standard Schema v1) | P1 |
| Typed error/status outcomes | Implemented (`HttpError`, `set.status`) | P1 |
| Type-level test suite | Implemented (`npm run typecheck`, 0 errors) | P0 |

## Composition

| Area | Nelysia status | Priority |
| --- | --- | --- |
| Plugins | Implemented (`use()` composition) | P0 |
| Plugin encapsulation | Implemented (Hook inheritance and mounting boundary) | P0 |
| Route grouping | Implemented (`group(prefix, callback)` in v0.1.3+) | P0 |
| Context extension | Implemented (`state`, `decorate`, `derive`, `resolve`, `context.store`) | P1 |
| Macros | Implemented (route policy macros) | P1 |
| Models and guards | Implemented (named model references, route/group guards) | P1 |
| Mounting/sub-apps | Implemented (Nelysia instances and Web Standard fetch handlers) | P1 |
| Async/lazy modules | Implemented (`use(Promise)`, `app.modules`) | P1 |
| Lifecycle scopes | Implemented (local, scoped, global before-handle hooks) | P1 |
| Built-in plugins | Implemented (`cors`, `securityHeaders`, `staticDirectory`, `rateLimit`, `compression`) | P0 |

## Tooling and Ecosystem

| Area | Nelysia status | Priority |
| --- | --- | --- |
| CLI dev/build/generate | Implemented (`nelysia inspect`, `nelysia build`, `nelysia generate feature`) | P0 |
| Route/compiler inspector | Implemented (`npm run inspect`) | P0 |
| OpenAPI & Swagger UI | Implemented (`openapi()`, `openapiUi()`, `swaggerUi()`, route metadata) | P1 |
| OpenTelemetry | Implemented (`otlpHttpExporter`, telemetry callbacks) | P1 |
| Trace/server timing | Implemented via OpenTelemetry & lifecycle hooks | P1 |
| Eden-like typed client | Implemented (`@narudom96/nelysia/client`) | P1 |
| Unit-test helpers | Implemented (direct handler & fetch testing) | P1 |
| Documentation | Comprehensive Bilingual Docs (TH/EN) & Portal | P0 |

## Integrations

These should be adapters or official examples, not dependencies in `core`:

- Node.js
- Deno
- Cloudflare Workers
- Vercel
- Astro
- Next.js
- Nuxt
- SvelteKit
- TanStack Start
- Expo
- Drizzle
- Prisma
- Better Auth
- GraphQL

## Implementation Order

1. Complete HTTP semantics and lifecycle contracts.
2. Add params/query/header/response schemas and type-level tests.
3. Add plugins, encapsulation, context extension, and error handlers.
4. Add OpenAPI and typed client generation.
5. Add observability, WebSocket, streaming, and deployment adapters.
6. Add integrations and tutorials after the contracts stabilize.

Performance work must remain gated by differential tests. A feature is not complete until its reference and compiled paths have identical observable behavior.

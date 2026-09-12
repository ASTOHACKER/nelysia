# Elysia Feature Parity Roadmap

This is a prioritised roadmap based on Elysia's public documentation. Nelysia should match the useful developer experience, not copy implementation details or claims.

## Core API

| Area | Nelysia status | Priority |
| --- | --- | --- |
| Chainable routes | Partial | P0 |
| Static response handlers | `getStatic()` only | P0 |
| `listen()` ergonomic API | Missing | P0 |
| Params/query/body context | Partial | P0 |
| HEAD/OPTIONS/405 semantics | Implemented | P0 |
| Lifecycle hooks | Before/after/error hooks | P0 |
| Error handling | `onError()` plus adapter fallback | P0 |
| Cookies | Basic parse/set-cookie support | P1 |
| WebSocket | Missing | P1 |
| Streaming | Native Response and ReadableStream support | P1 |

## Type Integrity

| Area | Nelysia status | Priority |
| --- | --- | --- |
| Path parameter inference | Missing | P0 |
| Schema body validation | Basic | P0 |
| Params/query/header schemas | Basic runtime validation | P0 |
| Response schemas | Basic runtime validation | P1 |
| Standard Schema adapters | Basic adapter | P1 |
| Typed error/status outcomes | Missing | P1 |
| Type-level test suite | Basic | P0 |

## Composition

| Area | Nelysia status | Priority |
| --- | --- | --- |
| Plugins | Basic `use()` composition | P0 |
| Plugin encapsulation | Missing | P0 |
| Context extension | Missing | P1 |
| Macros | Missing | P1 |
| Mounting/sub-apps | Basic `mount()` | P1 |
| Lifecycle ordering contract | Basic | P0 |

## Tooling and Ecosystem

| Area | Nelysia status | Priority |
| --- | --- | --- |
| CLI dev/build | MVP | P0 |
| Route/compiler inspector | MVP | P0 |
| OpenAPI | Basic document generation | P1 |
| OpenTelemetry | Pluggable telemetry callbacks; exporter pending | P1 |
| Trace/server timing | Missing | P1 |
| Eden-like typed client | Basic fetch client | P1 |
| Unit-test helpers | Basic direct handler tests | P1 |
| AI/tutorial documentation | Missing | P2 |

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
- AI SDK
- GraphQL

## Implementation Order

1. Complete HTTP semantics and lifecycle contracts.
2. Add params/query/header/response schemas and type-level tests.
3. Add plugins, encapsulation, context extension, and error handlers.
4. Add OpenAPI and typed client generation.
5. Add observability, WebSocket, streaming, and deployment adapters.
6. Add integrations and tutorials after the contracts stabilize.

Performance work must remain gated by differential tests. A feature is not complete until its reference and compiled paths have identical observable behavior.

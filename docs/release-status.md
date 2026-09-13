# Release Status

This file is the finite progress board for work after v0.1. A checkbox is marked complete only when code, tests, and a runnable example exist.

## v0.2 Production Expansion

- [x] WebSocket contract and Bun adapter
- [x] WebSocket Node adapter
- [x] Basic sub-app mounting
- [x] Plugin encapsulation and lifecycle isolation
- [x] Request telemetry callbacks
- [x] OpenTelemetry-compatible span exporter contract
- [x] Request ID propagation
- [x] Cookie parsing and response cookies
- [x] Trusted proxy and secure-cookie policy
- [x] Compression plugin
- [x] Static file plugin MVP
- [x] Rate-limit plugin
- [x] Native Response and streaming
- [x] Basic graceful server close
- [x] Connection draining under active load
- [x] Compatibility matrix
- [x] Memory and soak test runner
- [x] OpenAPI document plugin
- [x] OpenAPI UI
- [x] Generated client route types MVP

## v0.3 Compiler Platform

- [x] Target-specific build artifacts and standalone build manifest/diagnostic contract
- [x] Standalone static/params-only server artifact MVP
- [x] Standalone Bun/Node server for the supported static and params-only GET subset
- [ ] Arbitrary source-to-source code generation (explicitly deferred)
- [x] Generated Bun server without generic router import (supported subset)
- [x] Generated Node server without generic router import (supported subset)
- [x] Generated route matcher
- [x] Generated validator source MVP
- [x] Generated serializer source MVP
- [x] Unsupported-pattern diagnostics MVP
- [x] Source-map artifact MVP
- [x] Content-addressed compiler cache manifest
- [x] Reproducible generated output and content-addressed manifest cache
- [x] Conservative fallback path
- [x] Compiler inspection MVP

## v0.4 Ecosystem

- [x] Deno Fetch adapter and checked example
- [x] Cloudflare Worker Fetch adapter
- [x] Vercel Fetch adapter
- [x] Astro example MVP (Fetch contract; not full framework integration)
- [x] Next.js example MVP (Fetch contract; not full framework integration)
- [x] Nuxt example MVP (Fetch contract; not full framework integration)
- [x] SvelteKit example MVP (Fetch contract; not full framework integration)
- [x] TanStack Start example MVP (Fetch contract; not full framework integration)
- [x] Drizzle SQLite integration
- [x] Prisma SQLite example with generated client and Node smoke test
- [x] Better Auth route integration contract
- [x] GraphQL integration
- [x] Migration guides for Express, Fastify, and Elysia
- [x] npm package dry-run verification

The shared Fetch-standard adapter contract is implemented and tested; platform-specific adapters remain unchecked until their deployment examples and smoke tests exist.

The aggregate verification command is `npm run release:check`.

## Release Gates

Each release requires:

1. A documented public contract.
2. A working example.
3. Node/Bun or target-specific conformance tests.
4. Differential tests where compiler behavior is involved.
5. Typecheck and security audit passing.
6. Documentation that states limitations and runtime support.

The project does not declare v0.2, v0.3, or v0.4 complete while unchecked items remain in that release.

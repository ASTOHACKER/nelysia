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
- [x] Standalone Bun/Node source-to-source server for safely embeddable route handlers and schema definitions
- [x] Standalone source-to-source generation for embeddable handlers and schema definitions, with explicit fallback diagnostics for opaque/platform-dependent patterns
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
- [x] Astro framework fixture with native endpoint methods and HTTP smoke
- [x] Next.js App Router fixture with native route methods and HTTP smoke
- [x] Nuxt/Nitro fixture with H3 request conversion and HTTP smoke
- [x] SvelteKit fixture with native endpoint methods and HTTP smoke
- [x] TanStack Start fixture with native server route handlers and HTTP smoke
- [x] Drizzle SQLite integration
- [x] Prisma SQLite example with generated client and Node smoke test
- [x] Better Auth route integration contract
- [x] GraphQL integration
- [x] Migration guides for Express, Fastify, and Elysia
- [x] npm package dry-run verification

The shared Fetch-standard adapter contract is implemented and tested; platform-specific adapters are verified through maintained local examples and smoke tests, with deployment-specific limitations documented.

## v0.4 Hardening follow-ups

- [x] Framework-native method/event bridges for Astro, Next.js, Nuxt/Nitro, SvelteKit, and TanStack Start
- [x] Typed-client negative compile-time coverage and direct `tsc` compilation of generated clients
- [x] Status-specific response schemas in runtime validation and OpenAPI
- [x] Circular model-definition diagnostics
- [x] Standard Schema metadata and built-in schema conformance coverage
- [x] Extended lifecycle failure matrix and mounted error ownership
- [x] Fresh package export imports verified independently with Node, Bun, and Deno (`npm run package:imports`)
- [x] Current `oha` benchmark report recorded in `docs/benchmark-oha-2026-09-14.md`

The five framework examples are runnable fixtures with framework-specific package manifests,
native route wiring, production builds, and live development-server smoke checks. Run
`npm run framework:check` from the repository root after installing each fixture's dependencies;
the command builds and requests `/api/nelysia` through Astro, Next.js, Nuxt/Nitro, SvelteKit,
and TanStack Start.

The aggregate core/package verification command is `npm run release:check`.
Run `npm run framework:check` as the ecosystem gate after installing the five
fixture dependencies.

## v0.4.0 verification record (2026-09-14)

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` |
| Node tests | PASS | 139/139 |
| Bun tests | PASS | 139/139 |
| Package build | PASS | `npm run package:build` |
| Fresh package exports | PASS | 17/17 on Node, Bun, and Deno |
| Soak | PASS | 20,000 requests, 0 failures |
| Documentation | PASS | 17 public exports checked |
| Security audit | PASS | 0 vulnerabilities |
| Framework fixtures | PASS | 5/5 build + live HTTP smoke |

The current `oha` snapshot used `oha 1.16.0`, concurrency 50, 3 seconds per
sample, 10 rounds, and zero failures. Median throughput was Bun static
95,173 req/s, Bun dynamic 83,855 req/s, Node JSON 27,451 req/s, and Node
dynamic 40,919 req/s. The report also preserves the preceding run sets so the
short-run variance is visible. The detailed peer comparison and same-runner
trend check are in [`docs/benchmark-oha-2026-09-14.md`](./benchmark-oha-2026-09-14.md).

## Release Gates

Each release requires:

1. A documented public contract.
2. A working example.
3. Node/Bun or target-specific conformance tests.
4. Differential tests where compiler behavior is involved.
5. Typecheck and security audit passing.
6. Documentation that states limitations and runtime support.

The project does not declare v0.2, v0.3, or v0.4 complete while unchecked items remain in that release. Arbitrary transformation of every possible TypeScript closure is intentionally outside the compiler contract; unsupported patterns must use the documented fallback diagnostics.

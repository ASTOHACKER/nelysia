# Nelysia P2 Roadmap

This is the historical milestone plan. The v0.2–v0.4 implementation status
and the historical v0.5.1 release gates are maintained in
[`docs/release-status.md`](./release-status.md); do not use this roadmap alone
as a current checklist.

P2 starts after the v0.1 Definition of Done. It is split into finite releases so advanced work does not destabilize the completed core.

## v0.2 Production Expansion

### Scope

- WebSocket contract for Bun and Node adapters
- Full plugin encapsulation and sub-app lifecycle isolation
- Mount prefixes with inherited hooks and schemas
- OpenTelemetry exporter integration
- Structured logging and request IDs
- Compression and static-file plugins
- Rate limiting plugin contract
- Secure cookie and trusted-proxy configuration
- Graceful shutdown with connection draining
- Memory, soak, concurrency, and compatibility test suites
- OpenAPI UI plugin
- Generated client types from route metadata

### Exit Criteria

```text
WebSocket conformance passes on supported runtimes
Plugin isolation tests pass
24-hour soak has no unbounded memory growth
Shutdown drains active requests
OpenTelemetry spans are exportable
OpenAPI UI serves the generated document
Generated client type tests pass
```

## v0.3 Compiler Platform

### Scope

- Standalone source-to-source route code generation
- Generated Bun and Node handlers without generic runtime dispatch
- Static route and parameter matcher generation
- Generated schema validators
- Generated response serializers
- Build-time unsupported-pattern diagnostics
- Source maps for generated code
- Compiler cache and reproducible builds
- Differential testing for every compiler pass
- Compiler inspector with optimization reasons

### Exit Criteria

```text
dist/server runs without importing the development router
Generated output passes the complete reference conformance suite
Unsupported source patterns produce diagnostics or explicit fallback
Build output is reproducible
Generated validators and serializers have reference parity
Compiler regression benchmark is enforced in CI
```

## v0.4 Ecosystem

### Scope

- Deno adapter
- Cloudflare Worker adapter
- Vercel adapter
- Astro, Next.js, Nuxt, SvelteKit, and TanStack Start examples
- Drizzle and Prisma examples
- Better Auth integration
- GraphQL integration
- Migration guides from Elysia, Fastify, and Express

### Exit Criteria

Each integration must have a maintained example, a smoke test, documented runtime limitations, and a version compatibility policy.

## Non-Goals

Nelysia will not build its own database, ORM, HTTP parser, package manager, or frontend framework. P2 integrates with established projects instead.

## Release Rule

Only one release milestone is active at a time. A milestone is complete only when its exit criteria and verification commands pass. New ideas go into a later release rather than expanding the active milestone.

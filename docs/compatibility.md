# Compatibility Matrix

This matrix records the v1.2.0 compatibility contract and the workspace checks
currently available. It is intentionally narrower than a promise of support
for every version of a runtime.

| Capability | Node 26.8.2 | Bun 1.4.0 |
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
| Session, roles, and permission contracts | verified | verified |
| CSRF protection and cache/ETag contracts | verified | verified |
| Health/readiness checks | verified | verified |

The Fetch-standard adapter is verified with the Request/Response contract and is
the base for Deno, Cloudflare Workers, Vercel, Astro, Next.js, SvelteKit, and
TanStack Start integrations. Nuxt/Nitro uses H3's `toWebRequest(event)` bridge
to produce the same contract.

## Runtime Win Matrix status

The current release line is evidence-first. Bun has a separate three-seed
runtime-parity artifact, but that legacy verifier is not the full release gate:

| Runtime/axis | Current evidence | Win Matrix status |
| --- | --- | --- |
| Bun throughput and latency | `app.listen()`, 3 seeds, 2 routes, 5s × 5, concurrency 50 | `BLOCKED`: generic workloads are below the new 100% Elysia throughput floor |
| Node throughput | Contract and short adapter evidence | `PENDING`: Fastify and raw-Node release matrix not recorded |
| Fetch / Deno / Cloudflare / Vercel | Shared Fetch contract and fixture smoke | `PENDING`: latency and startup baselines not recorded |
| RSS / heap / long-running | Soak runner and memory instrumentation exist | `PENDING`: clean-baseline comparison and 24-hour run not recorded |

The machine-readable source is
[`benchmark-win-matrix-2026-09-16.json`](./benchmark-win-matrix-2026-09-16.json),
and the verifier is `npm run benchmark:verify:win-matrix`. Until every axis is
`PASS`, the workspace status is `BLOCKED` / `NO PERFORMANCE CLAIM`.

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
npm run framework:check
npm run package:imports
npm run package:consumer
npm run integrations:smoke
npm run deployment:smoke
npm run soak:1m
npm run soak:10m
npm run benchmark:verify:win-matrix
# The single release command is intentionally fail-closed while blockers remain:
npm run release:check:win-matrix
```

The v0.5 soak runner reports exact request count, failures, runtime errors,
throughput, periodic heap/RSS samples, and before/after deltas. Heap/RSS delta
is a signal for investigation, not a garbage-collection-proof leak measurement.

## Release evidence status

The core `oha` load report, JWT security matrix, Bun route fast-path report, and
1M/10M soak report are recorded in the repository's `docs/` directory. The
fresh post-roadmap 1M/10M rerun is recorded in
[`soak-roadmap-rerun-2026-09-14.md`](./soak-roadmap-rerun-2026-09-14.md). The
separate 24-hour soak is intentionally deferred and has not been run; therefore
this matrix does not make a production-readiness claim.

The v1.0.0 release historically introduced the post-v0.5.1 typed context, JWT
DX, compiler specialization, and production subpaths `session`, `roles`,
`csrf`, `cache`, and `health`. The current v1.2.0 line preserves that contract;
the unreleased runtime win-matrix work remains documented in
[`release-status.md`](./release-status.md); the v0.5.1 tag remains immutable.

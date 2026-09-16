# Release Status

This file is the finite progress board for work after v0.1. A checkbox is marked complete only when code, tests, and a runnable example exist.

> Current package: `1.2.2`. The `v0.5.1`, `v0.6.0`, `v1.0.0`, `v1.1.0`,
> `v1.2.0`, `v1.2.1`, and `v1.2.2` tags/releases are immutable. The Win Matrix gates
> below remain evidence blockers, not a performance claim.

## v1.2.2 Current GitHub Release

- [x] Documentation-truth patch on the v1.2.x line with no runtime code changes
- [x] Archived/historical labels, stale version strings, broken ToC anchors, and insecure doc patterns fixed
- [x] Quickstart examples use consumer imports with documented prerequisites
- [x] Node/Bun tests, typecheck, package build/imports, packed consumer, framework/integration smoke, and docs check recorded for the release
- [x] GitHub release/tag `v1.2.2` created
- [ ] npm publication when the registry account is ready
- [ ] 24-hour soak before any production-readiness announcement

The immutable `v1.2.2` GitHub release contains the documentation-truth fixes.
The Win Matrix remains `BLOCKED` / `NO PERFORMANCE CLAIM` and the 24-hour
soak remains deferred, same as v1.2.1.

## v1.2.1 Historical Release

- [x] Generic Bun route-preflight reuse shipped as an additive runtime fix
- [x] Immutable execution plans, shared sync/async executor, Win Matrix verifier, and documentation truth pass included
- [x] Node/Bun tests, typecheck, package build/imports, packed consumer, framework/integration smoke, and docs check recorded for the release
- [x] GitHub release/tag `v1.2.1` created
- [ ] npm publication when the registry account is ready
- [ ] 24-hour soak before any production-readiness announcement

The immutable `v1.2.1` GitHub release contains the implementation and release
gates, but does not claim that the Win Matrix has passed. Its benchmark numbers
remain evidence for the stated host/workload and are not universal performance
claims.

## Next Workspace — Win Matrix Completion (Unreleased)

- [x] Immutable execution plans, conservative context inference, and shared sync/async executor are implemented in the current workspace
- [x] Bun three-seed parity evidence is recorded with zero failures and zero status/body mismatches
- [ ] Hybrid AOT dispatcher reaches the full Bun, Node, Fetch, memory, latency, and stability gates
- [ ] Node and Fetch throughput/latency matrix is recorded against its declared baselines
- [ ] 25 package exports, five framework fixtures, and integration smoke are attached to the same workspace evidence set
- [ ] 24-hour soak records zero failures, zero unhandled errors, and stable RSS/heap
- [ ] Documentation truth checker reports no current-version contradiction

Until every unchecked item in this section passes, the workspace status is
`BLOCKED` / `NO PERFORMANCE CLAIM`; it must not be described as production-ready
or as universally faster than Elysia.

### Win Matrix acceptance status

| Axis | Release gate | Current status |
| --- | --- | --- |
| Bun throughput | zero-arg, params, generic JSON and generic dynamic median RPS ≥ Elysia `2.0.0-exp.60` | `BLOCKED` — generic evidence is 97.4% / 98.4% |
| Bun latency | p95/p99 no worse than Elysia by more than 2% | `BLOCKED` — generic latency is outside the full gate |
| Node throughput | ≥ Fastify and within 2% of raw Node | `PENDING` — release matrix not recorded |
| Fetch / Edge | correctness, latency and startup baseline | `PENDING` — baseline artifact not recorded |
| Memory | no RSS/heap regression and no soak growth | `PENDING` — clean baseline and soak comparison not recorded |
| Correctness | zero failures/status mismatches/body mismatches on every runtime and seed | `PARTIAL` — Bun evidence is clean; cross-runtime matrix is pending |
| Stability | at least 3 seeds with ≤10% spread | `PARTIAL` — Bun evidence passes; cross-runtime matrix is pending |
| Lifecycle | hooks, auth, schemas, errors, mounts, WebSocket, HEAD/OPTIONS/405, cleanup | `PENDING` — release-gate evidence bundle not recorded |
| Ecosystem | package exports 25/25, framework fixtures 5/5, integration smoke | `PENDING` — not attached to this manifest |
| Long-running | 24-hour soak, zero failures/unhandled errors, no abnormal memory growth | `PENDING` — not run |
| DX | typecheck, tests, typed client, OpenAPI, CLI, consumer, docs | `PENDING` — release command is intentionally fail-closed |

The checked-in manifest and fail-closed verifier are
[`benchmark-win-matrix-2026-09-16.json`](./benchmark-win-matrix-2026-09-16.json)
and `npm run benchmark:verify:win-matrix`.

## v1.2.0 Historical Release

- [x] Generic Bun route-preflight reuse shipped as an additive runtime fix
- [x] GitHub release/tag `v1.2.0` created
- [ ] 24-hour soak before any production-readiness announcement

The v1.2.0 benchmark evidence is retained as historical evidence; v1.2.1 is
a historical release and v1.2.2 is the current GitHub release.

## v1.1.0 Historical Release

- [x] Runtime correctness, adapter parity, compiler safety, package reliability, and Bun stabilization changes included
- [x] Node/Bun tests, typecheck, package build/imports, packed consumer, framework/deployment smoke, docs check, audit, and `git diff --check`
- [x] Three pinned-CPU Bun baseline sets recorded with zero functional failures
- [ ] Bun zero-arg/object performance parity gate within ±2% across three consecutive sets; status is `no-performance-claim`
- [x] Package version bumped to `1.1.0`
- [x] Annotated Git tag `v1.1.0` and GitHub Release created
- [ ] npm publication when the registry account is ready
- [ ] 24-hour soak before any production-readiness announcement

The v1.1.0 release does not claim a speedup or parity with Elysia. The strict
performance gate remains open because the recorded runner showed variance and
one set exceeded the ±2% threshold.

## v1.0 Historical Release

- [x] v0.6–v0.9 implementation gates and API-freeze prerequisites passed
- [x] Public v1.0 contract frozen for routing, context, options, schema, auth, plugins, lifecycle, errors, server, inject, and client
- [x] Node/Bun tests 181/181, typecheck, package build, imports 25/25, deployment/framework smoke, benchmark/runtime evidence, and 1M/10M soak
- [x] `npm run docs:check`, API-freeze checklist, security audit, and `git diff --check`
- [x] Package version bumped to `1.0.0` (historical release)
- [x] Annotated Git tag `v1.0.0` and GitHub Release created
- [ ] npm publication when the registry account is ready
- [ ] 24-hour soak before any production-readiness announcement

The v0.7–v0.9 work was delivered as part of the single `v1.0.0` release; separate
milestone tags are not required. The 24-hour soak remains intentionally deferred.

## v1.1.x Historical Worktree Notes

- [x] v1.1.0 request preflight: route/mount match and auth/guards run before body parsing
- [x] Shared bounded Web body parser with case-insensitive JSON and `application/*+json`
- [x] Bun/Fetch/Node body, native Response, static replay, compression, health and error-path fixes
- [x] Node relative dynamic matching, stream backpressure/disconnect cancellation and WebSocket rejection handling
- [x] Standalone safety diagnostics for non-replayable static values and runtime-only application options
- [x] v1.1 correctness tests: Node `189/189`, Bun `189/189`
- [x] Package build/imports, packed consumer, deployment smoke `5/5`, framework fixtures `5/5`, docs check and audit
- [x] Short all-framework evidence with the same `oha 1.16.0` runner; Bun/Node machine-readable JSON recorded
- [ ] Bun zero-arg/object stability gate: the prior 5s × 3 canonical run was within `±2%`, but the pinned 5s × 5 follow-up baseline was `-2.57%`; three consecutive passing sets are not established and the stabilization report records `no-performance-claim`
- [x] v1.1.0 package version bump, commit, tag, and GitHub Release completed; npm publication remains separate
- [x] 1M/10M soak evidence for v1.1.1 ([soak-v11-2026-09-16.md](./soak-v11-2026-09-16.md)); 24-hour soak remains deferred

The v1.1.0 historical source was package version `1.1.0`; its latest short benchmark
is in [`benchmark-runtime-v11-2026-09-16.md`](./benchmark-runtime-v11-2026-09-16.md)
with raw results in the two `benchmark-runtime-v11-*-latest.json` files.

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

## v0.6 Historical Workspace Gate

The historical package line was `0.6.0`. The following checks are retained as
evidence for the v0.6 implementation slice; the public release at that time was
`v1.0.0`.

- [x] Strict public types, typed macros, auth registry, state/decorate storage, and lifecycle scope tests
- [x] Unified route metadata, provider registration, auth/role/permission semantics, and compatibility tests
- [x] Typed inject/client, response/error helpers, server controls, compiler diagnostics, CLI, and module contracts
- [x] Node tests 181/181 and Bun tests 181/181
- [x] `npm run typecheck`, `npm run package:build`, and `npm run package:tarball`
- [x] `npm run package:imports` — Node/Bun/Deno 25/25 each
- [x] Deployment smoke 5/5 and framework fixtures 5/5
- [x] Short benchmark, runtime contract, 1M/10M soak, docs check, security audit, and `git diff --check`
- [x] v0.7, v0.8, and v0.9 workspace release gates pass
- [x] v0.7, v0.8, and v0.9 gates incorporated into the `v1.0.0` release; separate milestone tags are not required
- [x] v1.0 workspace API freeze and final evidence review

The individual checks above pass on the recorded host. The combined command is
`npm run release:check:v06`; it intentionally excludes the deferred 24-hour soak.
The latest combined run completed successfully on 2026-09-15 (Asia/Bangkok),
including the fresh short matrix, runtime contract check, and 1M/10M request-count
soaks.
The milestone commands are `release:check:v07`, `release:check:v08`,
`release:check:v09`, and `release:check:v1`; they validate the release evidence
but do not create separate milestone tags.

The historical v1.0 release-line verification gate is `npm run release:check:v1`.
It includes the type/test, package/tarball/import, deployment, framework,
benchmark, 1M/10M soak, Deno, documentation, audit, and diff checks; it does
not invoke the deferred 24-hour soak. The v0.6 command remains available as
historical compatibility. The older `release:check` and
`release:check:v05` commands remain available for historical compatibility.

After the latest additive macro-composition, typed path-parameter, generated
schema adapter, adapter coverage, and wildcard client changes, the full Node/Bun
test suites were rerun at 181/181, with typecheck, package build, documentation check, and
`git diff --check` passing again.

## v0.5 Performance, Compiler, and Production Readiness

- [x] Internal JWT route-guard registry with strict HS256 verification
- [x] Optional JWT issuer/audience enforcement and security correctness matrix
- [x] Deterministic generated validator fast path with generic fallback
- [x] Generated serializer contract and route-scoped compiler diagnostics
- [x] Release benchmark command (`oha`, 30 seconds × 7 samples)
- [x] Staged soak runner with request targets, duration mode, runtime errors, and heap/RSS samples
- [x] `@narudom96/nelysia/upload` multipart/storage contract
- [x] `@narudom96/nelysia/logger` redacted typed logger contract
- [x] `@narudom96/nelysia/timeout` deadline and 504 contract
- [x] 25 package exports checked on Node, Bun, and Deno
- [x] Node, Bun, Deno, Cloudflare, and Vercel deployment smoke command
- [x] Existing five framework fixtures retained as deployment smoke coverage
- [x] 30s × 7 core Bun/Node release benchmark evidence recorded
- [x] 30s × 7 JWT public/protected security benchmark evidence recorded
- [x] 1M and 10M soak reports recorded on the release candidate
- [ ] 24-hour soak report recorded before production-readiness announcement
- [x] v0.5.0 feature set shipped in the backward-compatible v0.5.1 GitHub Release/tarball; no separate v0.5.0 tag was created
- [ ] npm publication after registry account is available

The technical implementation is present in the current workspace, but unchecked
evidence items are release gates rather than claims that have already passed.
The detailed commands and limitations are in [`v0.5-release-gates.md`](./v0.5-release-gates.md).
The completed local soak evidence is in [`soak-v05-2026-09-14.md`](./soak-v05-2026-09-14.md).
The post-roadmap 1M/10M rerun is in [`soak-roadmap-rerun-2026-09-14.md`](./soak-roadmap-rerun-2026-09-14.md).
The post-roadmap benchmark smoke is in [`benchmark-roadmap-smoke-2026-09-14.md`](./benchmark-roadmap-smoke-2026-09-14.md).
The completed core load evidence is in [`benchmark-oha-v05-2026-09-14.md`](./benchmark-oha-v05-2026-09-14.md).
The completed JWT security benchmark evidence is in [`benchmark-jwt-v05-2026-09-14.md`](./benchmark-jwt-v05-2026-09-14.md).

The 24-hour soak is intentionally deferred and has not been run yet. The
technical evidence above does not constitute a production-readiness
announcement until that separate gate is completed.

## v0.5.1 Bun route-compiled patch

- [x] Static function routes are indexed in `staticFunctionMap` and classify as `static-sync`
- [x] `.getStatic()` remains the separate `static-prebuilt` tier
- [x] Zero-argument handlers execute without request context allocation
- [x] Native `Response`, `ReadableStream`, response metadata, and errors execute once
- [x] Node and Fetch adapters preserve the specialized route contract
- [x] Single-route and multi-route three-tier Bun benchmark fixtures are available
- [x] Dispatcher, parity, fallback, and no-double-execution tests are covered
- [x] 30s × 7 route benchmark evidence recorded for both route sets
- [x] v0.5.1 GitHub tag/release and package tarball created after the patch gate passed

No v0.5.0 tag was created or moved; the v0.5.1 patch tag is immutable. The route benchmark gate is
tracked separately in [`benchmark-route-fast-path-v051-2026-09-14.md`](./benchmark-route-fast-path-v051-2026-09-14.md)
and does not make a universal claim against Raw Bun, Elysia, or historical runners.
The JWT evidence gate is recorded in [`benchmark-jwt-v05-2026-09-14.md`](./benchmark-jwt-v05-2026-09-14.md).

## Roadmap after v0.5.1

The next work is tracked in [`roadmap-v1.md`](./roadmap-v1.md) (with the
implementation history in [`roadmap-after-v051.md`](./roadmap-after-v051.md))
and remains additive. The current worktree includes the following foundations;
they are not a new release claim until their milestone gates pass:

- [x] Strict default generic and typo-resistant public route/context types
- [x] Typed macro keys and route-aware `injectTyped()`/`createClient<typeof app>()`
- [x] Separate canonical state/decorations with v0.x compatibility mirrors
- [x] Lifecycle scope, lazy module, explicit OPTIONS, response/error DX coverage
- [x] `session`, `roles`, `csrf`, `cache`, and `health` package subpaths
- [x] CLI `routes`, `doctor`, `create`, and `dev` commands
- [x] Compiler `COMPILED`/`SPECIALIZED`/`GENERIC` diagnostics and fallback reasons
- [x] Unified route metadata with provider-first auth/rate-limit/cache/timeout registration
- [x] Shallow group inheritance, explicit `false` overrides, and normalized route metadata
- [x] Deterministic schema IR with route/field fallback diagnostics
- [x] Short performance verification command with 1/10/100/500 route counts and memory samples
- [x] Runtime contract gate: 1,000 fuzz cases, `app.inject()`, `listen(0) → fetch()`, and 10k/50k/100k memory bursts with zero failures
- [x] Short performance matrix: 32 workload/configuration combinations, zero failures, with median/min/max, p95/p99, heap/RSS and environment evidence
- [x] Fresh 1M/10M soak rerun after current changes: zero failures/runtime errors and successful process exit
- [x] `release:check:v07`, `release:check:v08`, and `release:check:v09` pass for the current workspace slice (these do not create milestone tags or releases)
- [x] v0.7–v0.9 gates incorporated into the `v1.0.0` release; separate milestone tags are not required
- [ ] Future 30m/1h/6h/24-hour evidence, if production-evidence work is approved later (not a historical v1.0 gate)

The current package is `1.2.2`; the existing v0.5.1/v0.6.0/v1.0.0/v1.1.0/v1.2.0/v1.2.1
tags remain immutable. The v1.0.0 release contains the frozen API contract.
No production-readiness announcement is made for the deferred 24-hour soak gate.

## Archived v0.4.0 verification record (2026-09-14)

The following table is retained for historical traceability. It is superseded
by the historical v0.5.1 release evidence above.

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

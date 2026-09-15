# Changelog

All notable changes to Nelysia are documented here. Benchmark figures are
release evidence for the stated host and workload, not universal performance
claims.

## [1.2.0] — 2026-09-16

The generic Bun path (`app.handle()` / `createBunHandler()`) reuses a matching
route preflight result instead of matching the same request a second time. A
mismatch falls back to the normal matcher. Auth, request hooks, body parsing,
schema validation, lifecycle hooks, and error handling are unchanged.

### Verification status

Node/Bun tests (191/191), typecheck, short regression matrix (32/32 workloads,
0 failures), runtime contract gate (1,000 fuzz cases, 0 mismatches, bursts to
100k with 0 failures), and fresh oha-short evidence (Bun public `app.listen()`
inside the ±2% single-run parity window; Node adapter −5 to −9% vs Raw Node,
kept as regression baseline) passed on the recorded host. The strict
three-seed stability gate is still required to lift `no-performance-claim`.
The 24-hour soak remains deferred.

## [1.1.0] — 2026-09-16

This release contains the additive runtime-correctness, adapter-parity,
compiler-safety, package-reliability, and Bun stabilization work after
`v1.0.0`.

### Verification status

Node/Bun tests, typecheck, package build/imports, packed consumer, framework and
deployment smoke, documentation checks, audit, and `git diff --check` passed.
The Bun stabilization evidence has zero functional failures, but the strict
three-set performance gate did not pass; this release makes **no performance
parity or speedup claim**. The 24-hour soak remains deferred and production
readiness is not declared. npm publication remains separate from this GitHub
Release.

## [1.0.0] — 2026-09-15

This release freezes the Nelysia public API after the v0.6–v0.9 workspace gates
passed. It includes the typed context and route contracts, provider-based auth
and metadata, conservative compiler lanes, production modules, CLI tooling,
runtime adapters, and the complete v1.0 documentation set.

### Verification status

Node/Bun tests (181/181), typecheck, package build/imports (25/25 on
Node/Bun/Deno), framework/deployment smoke, compiler/runtime evidence, fuzz and
memory-burst checks, 1M/10M soak, documentation check, API-freeze checklist,
security audit, and `git diff --check` passed on the recorded host.

The 24-hour soak remains intentionally deferred and this release does not make
a production-readiness claim based on that unrun gate. npm publication remains
separate from this GitHub Release.

## [0.6.0] — 2026-09-15

This release adds the post-v0.5.1 typed DX, lifecycle, compiler diagnostics,
CLI, and production-module foundations. The v0.5.1 tag remains immutable.

### Added

- Strict public context/route types, typed macro keys, route-aware inject
  inference, and `createClient<typeof app>()` inference.
- Canonical `context.store` and decoration storage separation with v0.x
  compatibility mirrors, lifecycle scope coverage, lazy modules, and explicit
  OPTIONS precedence.
- Public execution-lane diagnostics: `COMPILED`, `SPECIALIZED`, and `GENERIC`.
- CLI commands `routes`, `doctor`, `create`, and `dev`.
- Production subpaths for `session`, `roles`, `csrf`, `cache`, and `health`.
- Fresh 1M/10M soak evidence with zero functional failures.
- Executable CLI smoke coverage for `inspect`, `routes`, `doctor`, `generate`,
  `create`, `build`, `client`, and `dev`.
- Composition now preserves registered macro definitions and runtime hooks across
  `use()`, `mount()`, `group()`, and `guard()`; conflicting mounted definitions
  fail with an explicit diagnostic.

### Verification status

Node/Bun tests, typecheck, package build/imports, deployment smoke (5/5),
framework smoke (5/5), documentation check (25 exports), and security audit
pass. The 24-hour soak remains intentionally deferred; this release makes no
production-readiness claim for that deferred gate.

### Fixes after the initial workspace pass

- Standalone generated servers now preserve body-first `response(body,
  { status, headers })` semantics.
- Static literal `Response` and `ReadableStream` values stay on the direct
  specialized lane instead of being JSON-serialized accidentally.
- Compiled Bun responses preserve the configured `x-request-id` policy.
- `permissions.require()` now produces a typed HTTP `403` denial, and JWT
  verification rejects non-object payloads and malformed registered claims.
- Route-aware `injectTyped()` now accepts typed `params` for `:name` and `*`
  patterns while preserving explicit-path injection.

## [0.5.1] — 2026-09-14

The current GitHub Release package. The v0.5.0 feature set is included, along
with the Bun compiled-route regression fix.

### Added

- `staticFunctionMap` and the `static-sync` fast path for supported zero-argument
  `.get()` handlers.
- Separate `static-prebuilt` classification for `.getStatic()` routes.
- Matched single-route and multi-route Bun route benchmark fixtures.
- Strict JWT route-guard behavior and optional issuer/audience checks.
- Release evidence reports for core load, JWT security, route fast paths, and
  1M/10M request-count soaks.

### Fixed

- Static function routes no longer fall through to the generic dispatcher.
- Native `Response`, streams, status/headers, and handler errors are handled
  once without re-running the handler.

### Evidence and status

- [Core load benchmark](docs/benchmark-oha-v05-2026-09-14.md)
- [JWT security benchmark](docs/benchmark-jwt-v05-2026-09-14.md)
- [Bun route fast-path benchmark](docs/benchmark-route-fast-path-v051-2026-09-14.md)
- [1M/10M soak report](docs/soak-v05-2026-09-14.md)
- GitHub artifact: [v0.5.1 Release](https://github.com/ASTOHACKER/nelysia/releases/tag/v0.5.1)

The 24-hour soak is intentionally deferred and has not been run. Npm
publication is pending registry-account availability; the GitHub tarball is the
current installation artifact.

## [0.5.0] — feature line

The backward-compatible v0.5 feature line introduced the compiler validator
and serializer subset, JWT route guards, upload/logger/timeout subpaths,
deployment smoke coverage, release benchmark commands, and staged soak runner.
Its current shipped artifact is `0.5.1`, which contains the patch release above.

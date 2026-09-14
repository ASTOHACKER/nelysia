# Changelog

All notable changes to Nelysia are documented here. Benchmark figures are
release evidence for the stated host and workload, not universal performance
claims.

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

### Verification status

Node/Bun tests, typecheck, package build/imports, deployment smoke (5/5),
framework smoke (5/5), documentation check (25 exports), and security audit
pass. The 24-hour soak remains intentionally deferred; this release makes no
production-readiness claim for that deferred gate.

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

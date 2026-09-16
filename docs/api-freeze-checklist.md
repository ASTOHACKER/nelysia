# Nelysia v1.0 API Freeze Checklist

> **Archived — v1.0 checklist, not current.** Current package คือ `v1.2.1`; ดูสถานะปัจจุบันที่ [release-status.md](./release-status.md).

สถานะ: **v1.0 public contract frozen** — ตรวจครบหลัง v0.6–v0.9 gates
ผ่านแล้ว และ release `v1.0.0` ถูกสร้างจาก commit ที่ตรวจสอบแล้ว; tag เดิมยัง immutable

## Contract ที่ต้อง freeze

- [x] Routing: method, static/dynamic params, wildcard, trailing slash, 404/405/HEAD/OPTIONS
- [x] Context: `store`, decorations, `derive`, `resolve`, `signal`, cookies, response helpers
- [x] Route Options: schemas, normalized metadata, inheritance, provider errors, macro keys
- [x] Schema: built-in subset, Standard Schema fallback, validation status/output shape
- [x] Auth: registry, JWT/session providers, optional auth, roles/permissions, strict claims
- [x] Plugins: function, instance, Promise, lazy loading, mount/group and lifecycle scope
- [x] Lifecycle: request/parse/transform/guard/handler/after/error/after-response ordering
- [x] Errors: `HttpError`, `error(status, body)`, native `Response`, stream and fallback behavior
- [x] Server: Bun/Node/Fetch adapters, `ServerInfo`, `stop()`, graceful shutdown
- [x] Inject: typed and untyped overloads, route-aware inputs, status-specific responses
- [x] Client: `createClient<typeof app>()`, `createTypedClient<RouteMap>()`, errors and query policy

## Freeze prerequisites

- [x] v0.6 gate remains green after the final additive changes
- [x] v0.7 typed metadata/auth/client/inject tests and release evidence pass
- [x] v0.8 compiler parity, fallback diagnostics, fuzz and performance regression checks pass
- [x] v0.9 module, CLI, package, deployment and executable-example checks pass
- [x] README, documentation map, Thai/English reference, migration and release notes agree
- [x] All 25 exports, generated declarations and compatibility examples are verified
- [x] Security audit and `git diff --check` pass
- [x] Deprecation notices exist for legacy auth and compatibility aliases

## Freeze policy

After `v1.0`:

- `1.0.x` fixes bugs and security issues only.
- New capabilities are additive within `1.x`.
- Breaking changes require `2.0`.
- Do not announce production readiness from implementation alone; use the recorded
  technical evidence and explicitly state which long-running evidence was deferred.

The authoritative roadmap is [`roadmap-v1.md`](./roadmap-v1.md), while this file
tracks the freeze decision and its evidence checklist.

## Freeze evidence

Recorded on `2026-09-15` (Asia/Bangkok). The final workspace gate
`npm run release:check:v1` passed, including the v0.9 package/deployment checks,
Node/Bun tests, short performance matrix, runtime contract, 1M/10M request-count
soak, documentation check, security audit, and `git diff --check`. The deferred
24-hour soak is intentionally outside this v1.0 workspace gate. The package
line is now `1.0.0`; the `v1.0.0` tag/release is the public release of this frozen contract.

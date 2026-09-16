# Nelysia Runtime Parity Design

## Goal

Recover generic request throughput while preserving Nelysia's existing public API and adapter semantics. The first gate is Bun; Fetch and Node consume the same internal execution boundary.

## Design

Route records remain public and unchanged. A private `Map` stores an immutable execution plan per route and is cleared whenever route/context composition changes. Plans classify a route as `minimal`, `specialized`, or `generic` and carry conservative context needs plus precomputed lifecycle arrays. Literal member access can be specialized when proven safe; dynamic/opaque context access, dynamic composition, telemetry, mount, provider, or unsupported feature selects the generic reference path.

The runtime boundary returns `ResponseData | Promise<ResponseData>`. Public `handle()` and `preflight()` remain Promise APIs, while adapters can call the internal boundary directly. Synchronous handlers and hooks stay synchronous until a thenable is observed; declared-async functions use the asynchronous continuation. Context construction always uses the existing literal shape. Sparse materialization is limited to proven specialized routes; unknown access receives the full context.

Compiled dispatch remains first priority. The new executor owns only routes that are safe to specialize and falls back to the reference implementation for mounts, status negotiation, body parsing, schemas, telemetry, and other behavior that cannot be proven equivalent.

For Bun, a native request lane can bypass adapter preflight when all request/parse/guard stages are statically empty. It preserves the adapter-generated request ID and uses shared response headers for context-free JSON responses; Fetch and Node keep their portable response paths.

## Invariants

- Lifecycle order and response/error normalization remain unchanged.
- Thenables are detected on every invocation, including sync-classified functions.
- Plan caches clear on route or context composition changes.
- No new public `RouteRecord` field or public method signature is introduced.
- Existing dirty-tree benchmark and integration work is preserved.

## Verification

Differential tests cover lifecycle ordering, context inference, invalidation, sync/async/thenable behavior, schemas, auth, response helpers, errors, mounts, and request IDs. Bun benchmark verification reports correctness, compiled parity, generic parity, stability, and memory as separate evidence.

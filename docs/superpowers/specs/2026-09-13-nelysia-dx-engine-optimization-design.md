# Nelysia v0.1.2 DX & Engine Optimization Design Spec

## Executive Summary
This design specification defines core developer experience (DX) and plugin enhancements for `@narudom96/nelysia`, transitioning the framework from a high-performance raw engine into an ergonomic, modern, and developer-friendly full-stack backend tool.

## Goals & Non-Goals
- **Goals:**
  - Provide plain object property access on `context.query` (e.g. `const { category } = query;`) while preserving 100% backward compatibility with `URLSearchParams` methods (`query.get()`).
  - Introduce `context.set` with `set.status` and `set.headers`, enabling handlers to set HTTP status codes (such as `201 Created`) while returning body data directly.
  - Automatically preserve and propagate `HttpError.status` through error handlers instead of falling back to 500 when handlers do not return an explicit `ResponseData`.
  - Add `staticDirectory(options)` plugin to `@narudom96/nelysia/plugins` for secure, path-normalized static folder serving.
  - Upgrade OpenAPI generation to inspect and document StandardSchema definitions.
  - Maintain 100% pass rate across all existing unit, integration, and benchmark test suites.
  - Bump framework version to `0.1.2` and rebuild distribution assets.
- **Non-Goals:**
  - Breaking existing `context.response(status, body, headers)` APIs.
  - Rewriting the AOT compiler dispatch table architecture.

## Technical Design

### 1. Ergonomic `context.query`
`context.query` will be wrapped in a JavaScript `Proxy` over `URLSearchParams`:
- Known `URLSearchParams` prototype properties and methods (`get`, `has`, `set`, `entries`, `keys`, `values`, `forEach`, `toString`, `Symbol.iterator`) are bound and delegated directly.
- Unknown properties `prop` return `target.get(String(prop)) ?? undefined`.
- Type definition:
  ```typescript
  export type ParsedQuery = URLSearchParams & Record<string, string | undefined>;
  ```
- Developers can destructure:
  ```typescript
  app.get("/products", ({ query }) => {
    const { category, search } = query; // Works cleanly!
    const legacy = query.get("category"); // Still works 100%!
  });
  ```

### 2. Ergonomic `context.set`
`Context` gains a `set` property:
```typescript
export interface ResponseSetContext {
  status?: number;
  headers: Record<string, string>;
}
```
When a handler returns a raw object or primitive:
- If `context.set.status` is set (e.g. `set.status = 201`), the resulting `ResponseData.status` adopts this status.
- Any headers in `context.set.headers` are merged into the response headers.
- If the handler returns a `ResponseData` explicitly via `response(status, body)`, explicit values take precedence.

### 3. Default Error Status Preservation
In `packages/core/src/app.ts`:
- When an error is caught during route execution:
  ```typescript
  const errorStatus = error instanceof HttpError ? error.status : 500;
  context.set.status = errorStatus;
  ```
- If user error handlers return an object without a `responseMarker`, or if no error handler matches, the framework automatically formats the error response using `errorStatus` rather than 500.

### 4. `staticDirectory` Plugin
Exported from `packages/plugins/src/index.ts`:
```typescript
export interface StaticDirectoryOptions {
  prefix?: string;
  root: string;
  index?: string;
}

export function staticDirectory(options: StaticDirectoryOptions): (app: Nelysia) => Nelysia;
```
Features:
- Validates that normalized requested path resides within `root` (guards against directory traversal attacks `../`).
- Serves default index file (e.g., `index.html`) when path matches a directory or root.
- Detects MIME types and attaches proper `Content-Type`.
- Returns HTTP 404 for missing or out-of-bounds files.

### 5. OpenAPI Enhancements
- Enhance `definition(schema)` in `packages/openapi/src/index.ts` to inspect schema properties when present on StandardSchema instances (such as Zod object shapes), falling back gracefully.

## Verification Plan
1. Unit tests in `tests/core.test.ts` verifying:
   - `context.query` destructuring and `URLSearchParams` compatibility.
   - `context.set.status` and `context.set.headers`.
   - Error status mapping for `HttpError`.
2. Integration test for `staticDirectory` in `tests/core.test.ts`.
3. Complete regression run with `npm test` and `bun test`.
4. Run `npm run package:build` and verify package contents.

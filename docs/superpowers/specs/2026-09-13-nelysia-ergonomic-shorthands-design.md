# Nelysia Ergonomic Shorthands Design Specification

**Date**: 2026-09-13  
**Status**: Approved / In Progress  
**Author**: Antigravity & DeepMind Advanced Agentic Coding Team  
**Target Release**: Nelysia v0.1.4  

## 1. Executive Summary

This specification addresses the four developer experience (DX) friction points identified during real-world framework usage:
1. **Response Shorthands (`context.html`, `context.redirect`, `context.text`, `context.json`)**: Eliminates manually assembling HTTP headers and status objects for common content types and redirects.
2. **First-Class Server Startup Callback (`app.listen(port, callback)`)**: Unifies Bun and Node.js server startup with automatic AOT compilation on Bun and consistent `{ port, hostname, url, server }` metadata passed to the callback.
3. **Cookie Deletion Helper (`context.deleteCookie(name, options)`)**: Provides an intuitive API to revoke and expire cookies without requiring manual `maxAge: 0` calculation.
4. **Header Fluent Setter (`context.header(name, value)`)**: Allows developers to set response headers functionally alongside object mutation.

---

## 2. Detailed Technical Design

### 2.1 Response Shorthands on `Context`

Add the following methods to `Context` in `packages/core/src/types.ts`:
```typescript
export interface Context {
  // ... existing fields ...
  html(body: string, status?: number): ResponseData
  text(body: string, status?: number): ResponseData
  json(body: unknown, status?: number): ResponseData
  redirect(url: string, status?: number): ResponseData
  header(name: string, value: string): this
  deleteCookie(name: string, options?: CookieOptions): void
}
```

#### Behavior & Semantics:
- `context.html(body, status = 200)`:
  Returns `context.response(status, body, { "content-type": "text/html; charset=utf-8" })`.
- `context.text(body, status = 200)`:
  Returns `context.response(status, body, { "content-type": "text/plain; charset=utf-8" })`.
- `context.json(body, status = 200)`:
  Returns `context.response(status, body, { "content-type": "application/json; charset=utf-8" })`.
- `context.redirect(url, status = 302)`:
  Returns `context.response(status, undefined, { location: url })`.
- `context.header(name, value)`:
  Sets `context.set.headers[name.toLowerCase()] = value` and returns `context` for method chaining.
- `context.deleteCookie(name, options)`:
  Calls `context.setCookie(name, "", { ...options, maxAge: 0, path: options?.path ?? "/" })`.

Parity must be preserved across both `packages/core/src/app.ts` (`createContext`) and `packages/compiler/src/index.ts` (`runGeneric`).

---

### 2.2 Unified `app.listen(port, callback)`

#### Signature:
```typescript
export interface ServerInfo {
  port: number
  hostname: string
  url: string
  server: unknown
}

listen(
  port: number | { port: number; hostname?: string },
  callback?: (info: ServerInfo) => void
): unknown
```

#### Behavior:
- **On Bun**:
  - Automatically compiles the route graph with `createCompiledBunHandler(this)`.
  - Invokes `Bun.serve({ port: actualPort, hostname, fetch: handler })`.
  - Calculates `info: ServerInfo = { port: server.port, hostname: server.hostname ?? "localhost", url: `http://${server.hostname ?? "localhost"}:${server.port}`, server }`.
  - Invokes `callback(info)` if provided.
  - Returns `server`.
- **On Node.js**:
  - Creates the HTTP server via `createNodeServer(this)`.
  - Calls `server.listen(actualPort, hostname, () => { ... })`.
  - Inside the listening listener:
    - Resolves address `const addr = server.address()`.
    - Constructs `info: ServerInfo = { port: addr.port, hostname, url: `http://${hostname}:${addr.port}`, server }`.
    - Invokes `callback(info)` if provided.
  - Returns `server`.

---

## 3. Verification & Testing Plan

1. **Unit Tests (`tests/core.test.ts`)**:
   - Verify `context.html` returns content-type `text/html; charset=utf-8` and body.
   - Verify `context.redirect` returns status 302 and `location` header.
   - Verify `context.deleteCookie` sets `set-cookie` with `max-age=0`.
   - Verify `context.header` mutates outgoing response headers.
   - Verify `app.listen` invokes callback with `{ port, url }` on both runtimes.
2. **Real-World Verification (`C:\Users\Computer_BSc\Desktop\XX`)**:
   - Upgrade `XX` dependency to `v0.1.4`.
   - Refactor `src/app.ts` to use `context.html(...)` and `context.header(...)`.
   - Refactor `src/index.ts` to use clean one-liner `app.listen(port, (info) => console.log(...))`.
   - Run all 14 tests in `XX` on Node.js and Bun.

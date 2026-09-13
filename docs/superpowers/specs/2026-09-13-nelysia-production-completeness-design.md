# Nelysia Production Completeness Design Specification

**Date**: 2026-09-13  
**Status**: Draft / Proposed  
**Author**: Antigravity & DeepMind Advanced Agentic Coding Team  
**Target Release**: Nelysia v0.1.3  

## 1. Executive Summary

Based on an architectural gap analysis comparing Nelysia against modern state-of-the-art TypeScript web frameworks (Elysia, Hono, Fastify), this specification defines the implementation of seven mission-critical features required for production microservices:
1. **CORS Plugin (`cors`)**: Full Cross-Origin Resource Sharing middleware supporting preflight `OPTIONS` requests, credentials, configurable origins, and exposed headers.
2. **Route Grouping (`app.group`)**: Ergonomic lambda-based route prefixes (`app.group("/api/v1", (api) => { ... })`) with recursive hook and middleware inheritance.
3. **Context State Store (`context.store`)**: Strongly-typed and flexible request-scoped key-value storage for passing authentication payloads, database transactions, and trace contexts between hooks and handlers.
4. **Custom Not Found Handler (`app.notFound`)**: Application-level override for unmatched routes (HTTP 404) supporting custom JSON, HTML, or redirection.
5. **Security Headers Plugin (`securityHeaders`)**: Defense-in-depth HTTP response headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `HSTS`, `Permissions-Policy`).
6. **Interactive Swagger UI (`swaggerUi`)**: Live interactive API documentation interface alongside Redoc, supporting in-browser test requests ("Try it out").
7. **OpenAPI Route Metadata**: First-class support for `summary`, `description`, and `tags` in `RouteOptions` mapped directly to OpenAPI 3.1 operations.

---

## 2. Detailed Technical Design

### 2.1 Route Grouping (`app.group`)

#### Problem:
Currently, grouping routes requires instantiating a standalone `Nelysia` instance and manually calling `parent.mount(prefix, child)`. This creates unnecessary boilerplate for multi-versioned or modular APIs.

#### Solution:
Add `app.group(prefix: string, callback: (app: Nelysia) => void): this` to `Nelysia` class:
```typescript
app.group("/api/v1", (v1) => {
  v1.get("/users", () => users);
  v1.post("/users", createUser);
});
```

#### Inheritance Semantics:
- The child `Nelysia` inherits parent configuration (`bodyLimit`, `trustedProxy`, `secureCookies`, `requestIdEnabled`, `telemetry`).
- `mount()` is enhanced so that any parent hooks (`this.hooks`, `this.afterHooks`, `this.errorHandlers`) already registered on the parent are prepended to the child's routes upon mounting:
  `hooks: [...this.hooks, ...route.hooks]`
  `afterHooks: [...this.afterHooks, ...route.afterHooks]`
  `errorHandlers: [...this.errorHandlers, ...route.errorHandlers]`
- Child hooks registered inside the `callback` apply only to the routes registered within that group.

---

### 2.2 Context State Store (`context.store`)

#### Problem:
`Context` currently defines `request`, `requestId`, `clientIp`, `params`, `query`, `set`, `body`, `headers`, `cookies`. When an authentication middleware validates a JWT, it cannot attach the decoded user or session to `context` without TypeScript compilation errors or unsafe property hacking.

#### Solution:
Add `store: Record<string, unknown>` to `Context` interface:
```typescript
export interface Context {
  // ... existing fields ...
  store: Record<string, unknown>
}
```
- Initialized to an empty object `{}` per request in both `handle()` (Node / generic engine) and `compiler` (Bun AOT dispatcher fallback).
- Middleware can assign arbitrary properties: `context.store.user = session.user`.
- Handlers can access state cleanly: `app.get("/me", ({ store }) => store.user)`.

---

### 2.3 Custom Not Found Handler (`app.notFound`)

#### Problem:
Unmatched routes currently return a hardcoded 404 `{ error: "Not Found" }`. Applications cannot serve branded 404 pages or standardized enterprise error schemas.

#### Solution:
Add `app.notFound(handler: Handler): this` to `Nelysia`:
```typescript
app.notFound(({ request, response }) => {
  return response(404, { code: "RESOURCE_NOT_FOUND", path: request.url });
});
```
- When dynamic route lookup yields no match and method is not `OPTIONS`, if `this.notFoundHandler` is registered:
  - Construct `Context` and execute `this.notFoundHandler(context)`.
  - If a plain object or string is returned without an explicit status, default the response status to 404.
  - If no custom handler is registered, fallback to existing 404 behavior.

---

### 2.4 CORS Plugin (`cors`)

#### Location:
`packages/plugins/src/index.ts`

#### API:
```typescript
export interface CorsOptions {
  origin?: string | string[] | boolean | ((origin: string, context: Context) => boolean | string)
  methods?: string | string[]
  allowedHeaders?: string | string[]
  exposedHeaders?: string | string[]
  credentials?: boolean
  maxAge?: number
}

export function cors(options?: CorsOptions): (app: Nelysia) => Nelysia
```

#### Preflight & Response Integration:
- In `app.handle(request)`:
  - When `method === "OPTIONS"`:
    - If `Origin` and `Access-Control-Request-Method` are present, execute `onBeforeHandle` hooks. If a hook returns a response (like CORS 204 with headers), return that response immediately instead of the bare 204/404 allow contract.
- Normal requests (`GET`, `POST`, etc.):
  - `onBeforeHandle` or `onAfterHandle` injects `Access-Control-Allow-Origin`, `Vary: Origin`, and credential headers as configured.

---

### 2.5 Security Headers Plugin (`securityHeaders`)

#### Location:
`packages/plugins/src/index.ts`

#### API:
```typescript
export interface SecurityHeadersOptions {
  xContentTypeOptions?: boolean // Default true -> "nosniff"
  xFrameOptions?: "DENY" | "SAMEORIGIN" | false // Default "SAMEORIGIN"
  xXSSProtection?: boolean // Default true -> "0"
  referrerPolicy?: string | false // Default "no-referrer"
  strictTransportSecurity?: string | false // Default "max-age=15552000; includeSubDomains"
  crossOriginOpenerPolicy?: string | false // Default "same-origin"
  crossOriginResourcePolicy?: string | false // Default "same-origin"
}

export function securityHeaders(options?: SecurityHeadersOptions): (app: Nelysia) => Nelysia
```
Applies headers via `onAfterHandle` on all outgoing responses.

---

### 2.6 Interactive Swagger UI (`swaggerUi`)

#### Location:
`packages/openapi/src/index.ts`

#### API:
```typescript
export interface SwaggerUiOptions {
  path?: string // default "/swagger"
  specPath?: string // default "/openapi.json"
  title?: string // default "Nelysia Swagger UI"
}

export function swaggerUi(options?: SwaggerUiOptions): (app: Nelysia) => Nelysia
```
Serves modern Swagger UI bundle from CDN with live interactive execution against API endpoints.

---

### 2.7 OpenAPI Route Metadata (`summary`, `description`, `tags`)

#### Updates:
In `packages/core/src/types.ts`:
```typescript
export interface RouteOptions {
  summary?: string
  description?: string
  tags?: string[]
  // ... existing schema options
}
```
In `packages/openapi/src/index.ts`:
Map `route.summary`, `route.description`, and `route.tags` into OpenAPI Operation objects under `paths[route.path][route.method.toLowerCase()]`.

---

## 3. Verification & Testing Strategy

1. **Automated Unit Tests (`tests/core.test.ts`)**:
   - Test `app.group()` with prefixing, route isolation, and hook inheritance.
   - Test `context.store` mutation in before hook and retrieval in handler.
   - Test `app.notFound()` with custom status and payload.
   - Test `cors()` plugin with preflight `OPTIONS` and standard `GET` requests.
   - Test `securityHeaders()` plugin with default and customized headers.
   - Test `swaggerUi()` HTML generation.
   - Test `generateOpenAPI` with `summary`, `description`, and `tags`.
2. **Dual-Runtime Parity**:
   - `npm test` on Node.js 22+.
   - `bun test` on Bun.
   - `tsc --noEmit` type checking.
3. **Build Integrity**:
   - `npm run package:build` produces complete `dist-package/`.

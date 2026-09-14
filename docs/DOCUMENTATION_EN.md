# Nelysia: Comprehensive Technical Documentation

> **Version:** 0.6.0 (Current package and GitHub Release)
> **Target Runtimes:** Bun 1.4+, Node.js 22+, and Web Fetch Standard (Vercel, Cloudflare, Deno)  
> **Language:** TypeScript / JavaScript (ESM)

Use the [Documentation Map](./README.md) to choose the right guide, status
page, or benchmark report.

The post-v0.5.1 additive work is included in the v0.6.0 release. Remaining
future work is documented in
[`roadmap-after-v051.md`](./roadmap-after-v051.md). The current worktree also
exports production contracts from `@narudom96/nelysia/session`,
`@narudom96/nelysia/roles`, `@narudom96/nelysia/csrf`,
`@narudom96/nelysia/cache`, and `@narudom96/nelysia/health`; these remain on the
v0.6.0 package line.

Runnable examples: [basic](../examples/hello/index.ts),
[JWT](../examples/jwt/index.ts), [upload](../examples/upload/index.ts), and
[typed client](../examples/typed-client/client.ts).

---

## Table of Contents

1. [Introduction & Architecture](#1-introduction--architecture)
2. [Installation & Prerequisites](#2-installation--prerequisites)
3. [Quick Start](#3-quick-start)
4. [Core Application (`Nelysia`)](#4-core-application-nelysia)
   - [Configuration Options](#configuration-options)
   - [HTTP Routing Methods](#http-routing-methods)
   - [Route Grouping (`group`)](#route-grouping-group)
   - [Custom 404 Handler (`notFound`)](#custom-404-handler-notfound)
   - [Sub-App Mounting (`mount`)](#sub-app-mounting-mount)
   - [Unified Server Listener (`listen`)](#unified-server-listener-listen)
   - [Plugin Mechanics (`use`) and Lifecycle Scope](#plugin-mechanics-use-and-lifecycle-scope)
5. [The Request Context (`Context`)](#5-the-request-context-context)
   - [Context Properties & Interface](#context-properties--interface)
   - [Query Parameters via Proxy Destructuring](#query-parameters-via-proxy-destructuring)
   - [Response Mutation with `context.set`](#response-mutation-with-contextset)
   - [Request State Sharing with `context.store`](#request-state-sharing-with-contextstore)
   - [Response Shorthands (`html`, `text`, `json`, `redirect`)](#response-shorthands)
   - [Cookies Management & `deleteCookie`](#cookies-management)
   - [Returning Custom Responses](#returning-custom-responses)
6. [Schema Validation & Type Safety](#6-schema-validation--type-safety)
   - [Built-in Schema Builder (`t`)](#built-in-schema-builder-t)
   - [Standard Schema Integration (Zod, Valibot, ArkType)](#standard-schema-integration-zod-valibot-arktype)
   - [Strict TypeScript Contracts](#strict-typescript-contracts)
   - [Validation Points](#validation-points)
7. [Lifecycle Hooks & Error Handling](#7-lifecycle-hooks--error-handling)
   - [`onBeforeHandle`](#onbeforehandle)
   - [`onAfterHandle`](#onafterhandle)
   - [`onError` & `HttpError`](#onerror--httperror)
   - [Execution Flow Diagram](#execution-flow-diagram)
   - [Graceful Shutdown (`gracefulShutdown`)](#graceful-shutdown-gracefulshutdown)
8. [WebSocket Support](#8-websocket-support)
   - [Handler Contract](#handler-contract)
   - [Bun and Node Implementations](#bun-and-node-implementations)
9. [Plugins Ecosystem](#9-plugins-ecosystem)
   - [CORS Security (`cors`)](#cors-security-cors)
   - [OWASP Security Headers (`securityHeaders`)](#owasp-security-headers-securityheaders)
   - [Static Directory Serving (`staticDirectory`)](#static-directory-serving-staticdirectory)
   - [Rate Limiting (`rateLimit`)](#rate-limiting-ratelimit)
   - [Static File Serving (`staticFile`)](#static-file-serving-staticfile)
   - [HTTP Compression (`compression`)](#http-compression-compression)
   - [Production Subpaths](#production-subpaths)
10. [OpenAPI 3.1 & Redoc / Swagger UI](#10-openapi-31--redoc--swagger-ui)
    - [Generating OpenAPI Specification & Route Metadata](#generating-openapi-specification--route-metadata)
    - [Serving OpenAPI JSON Endpoint](#serving-openapi-json-endpoint)
    - [Interactive Documentation UIs (`openapiUi` & `swaggerUi`)](#interactive-documentation-uis-openapiui--swaggerui)
    - [Standard Schema Extraction](#standard-schema-extraction)
    - [Client Type Generation (`generateClientTypes`)](#client-type-generation-generateclienttypes)
11. [Observability & OpenTelemetry](#11-observability--opentelemetry)
    - [Telemetry Callbacks](#telemetry-callbacks)
    - [OTLP HTTP Exporter (`otlpHttpExporter`)](#otlp-http-exporter-otlphttpexporter)
12. [GraphQL Integration](#12-graphql-integration)
13. [Database Integrations (Drizzle & Prisma)](#13-database-integrations-drizzle--prisma)
14. [Authentication with Better Auth](#14-authentication-with-better-auth)
15. [Client SDK (`@narudom96/nelysia/client`)](#15-client-sdk-narudom96nelysiaclient)
16. [Compiler Platform & CLI](#16-compiler-platform--cli)
17. [Supported Runtimes & Adapters](#17-supported-runtimes--adapters)
18. [Full-Stack Framework Integrations](#18-full-stack-framework-integrations)
    - [Next.js App Router](#nextjs-app-router)
    - [Nuxt](#nuxt)
    - [SvelteKit](#sveltekit)
    - [Astro](#astro)
    - [TanStack Start](#tanstack-start)
19. [Benchmarking & Soak Testing](#19-benchmarking--soak-testing)
20. [Migration Guides](#20-migration-guides)
21. [Performance Tuning Guide](#21-performance-tuning-guide)
22. [Production Deployment Checklist](#22-production-deployment-checklist)
23. [Troubleshooting & FAQ](#23-troubleshooting--faq)

---

## 1. Introduction & Architecture

**Nelysia** is a high-performance, compiler-first TypeScript backend framework designed for the modern JavaScript runtime ecosystem. It delivers an ergonomic, chainable API (reminiscent of Elysia) while incorporating ahead-of-time (AOT) static route analysis, conservative runtime specialization, and direct native execution across Bun and Node.js.

---

### The 10 Superpowers of Nelysia (Why Nelysia Wins)

#### 1. 3-Lane AOT Execution Model
Nelysia analyzes every route before the first request arrives and assigns one of
three public execution lanes:
- **`COMPILED`**: proven routes use internal subtiers such as `static-prebuilt` (`getStatic()`) and `static-sync` (supported zero-argument `.get()`).
- **`SPECIALIZED`**: param routes like `/users/:id` extract parameters directly from the URL buffer.
- **`GENERIC`**: complex routes with middleware, schema validation, body parsing, or unsupported behavior use the full pipeline.

Result: every request uses only the power it actually needs.

#### 2. 95,173 req/s — Raw Bun parity snapshot
The recorded 10-round compatibility snapshot measured **95,173 req/s** for Bun static JSON at 50
concurrent workers, versus **95,306 req/s** for raw `Bun.serve`, with zero failed
requests. The benchmark report retains the preceding run sets and explains the
short-run variance; the older TechEmpower plaintext snapshot uses a different
harness.

#### 3. V8 Stays in Fast Lane
Frameworks that use `.decorate('db', db)` continuously mutate the object's hidden class, which forces V8 to exit its fast Inline Cache (IC) mode and de-optimize. Nelysia fixes this: context shape never changes. Use `context.store` for shared state and the JIT stays monomorphic at peak speed — forever.

#### 4. Node.js + Bun, No Polyfills
Both runtimes are first-class — not an afterthought:
- **Node.js 22+**: Native `node:http`, run TypeScript with zero build step via `--experimental-strip-types`.
- **Bun 1.4+**: Native `Bun.serve`, full SIMD byte parsing and zero-copy I/O.

No shims, no wrappers, no compatibility tax.

#### 5. Multi-Core — No PM2 Needed
Call `serveClustered(app, { instances: 'max' })` and every CPU core pitches in automatically. Graceful drain on shutdown — existing connections finish cleanly before the process exits. No PM2, no Docker Swarm required.

#### 6. Zod, Valibot, ArkType — Just Plug In
Built-in zero-dep `t` schema builder included out of the box. Or bring the schema library you already use — Standard Schema v1 means **Zod**, **Valibot**, and **ArkType** work natively without extra plugins, bridges, or runtime adapter overhead.

#### 7. API Docs at `/docs`, Auto-Generated
Routes and schemas are automatically converted into a live **OpenAPI 3.1** spec. Both **Redoc** and **Swagger UI** are bundled and accessible at `/docs` — open your browser, test your API, zero config.

#### 8. Frontend Autocomplete, Typo-Free
`@narudom96/nelysia/client` mirrors every route, param, request body, and response type to your frontend with full IDE autocomplete. If it compiles, the endpoint exists and the types match — no runtime surprises.

#### 9. Security Suite Out of the Box
All built-in, one import each:
- `cors()`: Automated preflight `OPTIONS` and security headers.
- `securityHeaders()`: Defense-in-depth OWASP-compliant headers.
- `rateLimit()`: Sliding-window memory rate limiter with Retry-After support.
- `staticDirectory()`: Fast static file server with path traversal protection.
- `compression()`: Automatic Gzip and Deflate response negotiation.

#### 10. Cloud Runtime Integrations
- **Database & Auth**: Ready-to-use recipes for **Drizzle ORM**, **Prisma**, and **Better Auth**.
- **Serverless & Edge**: One-step deployment to Cloudflare Workers, Vercel Edge, and Deno with unified Fetch handler adapters.

---


## 2. Installation & Prerequisites

### Requirements

- **Node.js**: `v22.0.0` or higher (uses native `--experimental-strip-types`)
- **Bun**: `v1.4.0` or higher (optional, for ultra-fast Bun execution)
- **TypeScript**: `v5.0+`

### Package Exports

Sources live in `packages/*/src/*.ts`. Running `npm run package:build` emits compiled JavaScript plus type declarations into `dist-package/`, which is what `package.json` exports point at:

The published compiler helpers are available from `@narudom96/nelysia/compiler`, and the Bun server adapter is available from `@narudom96/nelysia/runtime-bun`.

```json
{
  "exports": {
    ".": "./dist-package/packages/core/src/index.js",
    "./plugins": "./dist-package/packages/plugins/src/index.js",
    "./observability": "./dist-package/packages/observability/src/index.js",
    "./runtime-fetch": "./dist-package/packages/runtime-fetch/src/server.js",
    "./runtime-node": "./dist-package/packages/runtime-node/src/server.js",
    "./runtime-bun": "./dist-package/packages/runtime-bun/src/server.js",
    "./runtime-node-cluster": "./dist-package/packages/runtime-node/src/cluster.js",
    "./graphql": "./dist-package/packages/integrations-graphql/src/index.js",
    "./drizzle": "./dist-package/packages/integrations-drizzle/src/index.js",
    "./prisma": "./dist-package/packages/integrations-prisma/src/index.js",
    "./better-auth": "./dist-package/packages/integrations-better-auth/src/index.js",
    "./runtime-vercel": "./dist-package/packages/runtime-vercel/src/index.js",
    "./runtime-cloudflare": "./dist-package/packages/runtime-cloudflare/src/index.js",
    "./compiler": "./dist-package/packages/compiler/src/index.js",
    "./openapi": "./dist-package/packages/openapi/src/index.js",
    "./client": "./dist-package/packages/client/src/index.js",
    "./jwt": "./dist-package/packages/jwt/src/index.js",
    "./upload": "./dist-package/packages/upload/src/index.js",
    "./logger": "./dist-package/packages/logger/src/index.js",
    "./timeout": "./dist-package/packages/timeout/src/index.js",
    "./session": "./dist-package/packages/session/src/index.js",
    "./roles": "./dist-package/packages/roles/src/index.js",
    "./csrf": "./dist-package/packages/csrf/src/index.js",
    "./cache": "./dist-package/packages/cache/src/index.js",
    "./health": "./dist-package/packages/health/src/index.js"
  }
}
```

> While developing inside this monorepo, import from source paths directly, e.g. `../../packages/core/src/index.ts`.

---

## 3. Quick Start

For production applications, organize code by feature. See [Feature Modules and Composition](./feature-modules.md) for the recommended module, service, model, plugin, and testing boundaries.

### 1. Create your application (`src/app.ts`)

Always export the `app` instance so the compiler and CLI can inspect and build your service without prematurely starting the HTTP listener.

```ts
import { Nelysia } from "@narudom96/nelysia"

export const app = new Nelysia()
  .get("/", ({ html }) => html("<h1>Hello from Nelysia v0.5.1!</h1>"))
  .get("/users/:id", ({ params, query }) => ({
    id: params.id,
    filter: query.filter ?? "default",
    timestamp: Date.now()
  }))

// Listen directly with server info callback
if (import.meta.main || process.env.NODE_ENV !== "test") {
  app.listen(3000, ({ port, url }) => {
    console.log(`Nelysia server running at ${url} (port ${port})`)
  })
}
```

### 2. Run with Node.js or Bun

```bash
# Running with Node.js 22+
node --experimental-strip-types src/app.ts

# Running with Bun
bun run src/app.ts
```

### 3. Test HTTP Endpoints

```bash
curl http://localhost:3000/
# Output: <h1>Hello from Nelysia v0.5.1!</h1>

curl "http://localhost:3000/users/42?filter=active"
# Output: {"id":"42","filter":"active","timestamp":1726180000000}
```

---

## 4. Core Application (`Nelysia`)

### Configuration Options

Instantiate Nelysia with optional engine settings:

```ts
import { Nelysia } from "@narudom96/nelysia"

const app = new Nelysia({
  // Maximum allowed body payload in bytes (default: 1,048,576 = 1 MB)
  bodyLimit: 5 * 1024 * 1024, // 5 MB

  // Trust X-Forwarded-For header for clientIp resolution (default: false)
  trustedProxy: true,

  // Force Secure attribute on all setCookie calls (default: false)
  secureCookies: true,

  // Request-ID handling (default: true). When true, the request ID is resolved
  // from `requestId`, the `x-request-id` header, or a deterministic fallback,
  // and echoed back as the `x-request-id` response header. Set to false for an
  // Elysia-like fast path that skips request-ID generation entirely (recommended
  // for benchmarks and ID-less services).
  requestId: false,

  // Global telemetry callbacks
  telemetry: {
    onRequest(context) { console.log(`Incoming: ${context.request.method} ${context.request.url}`) },
    onResponse(context, response) { console.log(`Finished: ${response.status}`) },
    onError(context, error) { console.error(`Error:`, error) }
  }
})
```

### HTTP Routing Methods

Nelysia provides chainable registration methods:

- `app.get(path, handler | value, options?)`
- `app.getStatic(path, staticValue)` — Registers an explicitly static, context-free response
- `app.post(path, handler, options?)`
- `app.put(path, handler, options?)`
- `app.patch(path, handler, options?)`
- `app.delete(path, handler, options?)`
- `app.head(path, handler, options?)`
- `app.options(path, handler, options?)`
- `app.all(path, handler, options?)` — Registers one handler for every HTTP method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)
- `app.route(method, path, handler, options?)`

> **OPTIONS behavior:** an explicit `app.options(path, handler)` runs first. If no
> explicit OPTIONS route exists, a matching path receives automatic `204` with an
> `Allow` header listing registered methods (plus `HEAD` for `GET` routes); an
> unmatched path answers `404`.

```ts
app
  // Direct value without handler closure (optimized for zero-allocation compiled path)
  .getStatic("/version", { version: "1.0.0", env: "production" })

  // Handler returning JSON object
  .post("/items", async ({ body }) => {
    return { created: true, item: body }
  })

  // One handler for all methods (ideal for external auth handlers)
  .all("/api/auth/*", async (context) => {
    return auth.handler(new Request(context.request.url, {
      method: context.request.method,
      headers: context.request.headers
    }))
  })
```

### Wildcard Routes (`*`)

A path ending in `/*` captures every sub-path beneath its prefix; the remainder is available as `params["*"]`:

```ts
app.get("/files/*", ({ params }) => {
  return { rest: params["*"] } // GET /files/a/b.txt -> { rest: "a/b.txt" }
})
```

> Wildcards are only allowed as the final path segment. Wildcard routes are always classified `GENERIC` and served through the generic runtime.

### Route Grouping (`group`)

In v0.1.3+, Nelysia introduces `app.group(prefix, callback)` for structuring routes into logical hierarchies. Groups automatically inherit global configuration while isolating group-specific lifecycle hooks (such as authentication or validation) so they never leak into sibling routes:

```ts
app.group("/api/v1", (api) => {
  // Scoped hook: runs only for routes within /api/v1
  api.onBeforeHandle(({ headers, response }) => {
    if (!headers.get("authorization")) {
      return response(401, { error: "Missing authorization token for API v1" })
    }
  })

  api.get("/users", () => [{ id: "1", name: "Alice" }])
  api.get("/posts", () => [{ id: "101", title: "Announcing Nelysia" }])
})

// Public route: outside the group, no authorization hook applied
app.get("/health", () => ({ status: "ok" }))
```

### Custom 404 Handler (`notFound`)

In v0.1.3+, you can define a custom fallback handler for requests that match no registered route using `app.notFound(handler)`:

```ts
app.notFound(({ request, response }) => {
  return response(404, {
    error: "Not Found",
    path: request.url,
    method: request.method,
    timestamp: Date.now()
  })
})
```

Or combine it with `context.html()` for custom error pages:

```ts
app.notFound(({ html }) => html("<h1>404 - Page Not Found</h1>", 404))
```

### Sub-App Mounting (`mount`)

Encapsulate modular route groups into separate `Nelysia` instances and mount them under distinct URL prefixes:

```ts
const apiV1 = new Nelysia()
  .get("/status", () => ({ status: "operational" }))
  .get("/users", () => [{ id: "1", name: "Alice" }])

const app = new Nelysia()
  .mount("/api/v1", apiV1)

// Endpoints available:
// GET /api/v1/status
// GET /api/v1/users
```

### Unified Server Listener (`listen`)

In v0.1.4+, `app.listen()` provides a uniform API across both Bun and Node.js runtimes. When passed a callback, it receives a normalized `ServerInfo` object:

```ts
interface ServerInfo {
  port: number        // Actually bound listening port
  hostname: string    // Bound hostname (e.g. "localhost")
  url: string         // Full accessible base URL (e.g. "http://localhost:3000")
  server: unknown     // Native server handle (Bun.serve or Node.js http.Server)
  stop(): void | Promise<void> // Normalized graceful stop helper
}
```

Usage examples:

```ts
// 1. Simple port listening with callback
app.listen(3000, ({ port, url }) => {
    console.log(`Server listening on ${url} (port ${port})`)
})

// 2. Specific host and port binding
app.listen({ port: 8080, hostname: "0.0.0.0" }, ({ url }) => {
    console.log(`Server bound to all network interfaces at ${url}`)
})
```

### Plugin Mechanics (`use`) and Lifecycle Scope

For plugin callbacks, `use()` accepts a function `(app) => app | void`:

```ts
// A plugin is a config factory returning (app) => app
const myPlugin = (opts: { tag: string }) => (app: Nelysia) =>
  app.onBeforeHandle(({ headers, response }) => {
    if (!headers.has("x-tag")) return response(401, { error: opts.tag })
  })

app.use(myPlugin({ tag: "missing-tag" }))
```

For routing modules, prefer `.mount(prefix, subApp)` or
`.mountLazy(prefix, loader)`. The legacy `.use(subApp)` form remains supported
so existing applications remain backward-compatible.

Scope rules to remember:
- Hooks added to the parent (before or after `mount` or `group`) apply to all of the parent's own routes — including routes registered earlier (backfill).
- Child routes registered via `mount` or `group` carry their own `before/after/error` lifecycle with them: no leaking to siblings, and parent hooks added later do not retroactively apply to them.
- A duplicate method+path during mount throws `Duplicate route`.
- No deduplication — calling `use()` twice registers the plugin twice.

Lifecycle scope is available on every lifecycle family. `local` stays with the
owning module, `scoped` follows that module's mounted subtree, and `global`
propagates to the whole application. The default scope keeps the existing
instance behavior for backward compatibility. `.lazy()` defers its loader until
the application module boundary is awaited; `.mountLazy(prefix, loader)` does
the same for a prefixed child app. `.use(Promise)` remains supported.

```ts
const app = new Nelysia()
  .onBeforeHandle({ as: "global" }, () => undefined)
  .lazy(() => import("./feature.ts").then(({ app }) => app))
  .mountLazy("/admin", () => import("./admin.ts").then(({ app }) => app))
```

### Zero-Port Testing with `app.inject()`

Nelysia provides built-in `app.inject()` for executing in-memory HTTP requests without binding a network socket, ideal for fast unit and integration tests:

```ts
const res = await app.inject({
  method: "GET",
  path: "/users/42",
  query: { filter: "active" }
})

console.log(res.statusCode) // 200
console.log(await res.json()) // { id: "42", filter: "active" }
console.log(await res.text()) // Text content
console.log(await res.bytes()) // Uint8Array
```

For a typed application, `inject()` checks the route map and
`injectTyped()` provides path-specific response inference:

```ts
const typed = new Nelysia()
  .get("/users/:id", ({ params }) => ({ id: params.id }))

const response = await typed.injectTyped({ method: "GET", path: "/users/42" })
const user = await response.json() // { id: string }
```

Use `injectUntyped()` only as an explicit escape hatch for dynamic tests that
intentionally do not use route-map inference.

---

## 5. The Request Context (`Context`)

Every route handler receives an isolated, request-scoped `Context` object. In v0.1.4+, the Context API offers full ergonomic parity with modern backend frameworks while maintaining zero overhead on optimized paths:

```ts
interface Context {
  request: RequestData                     // Low-level request details
  requestId: string                        // Unique UUID / X-Request-ID
  clientIp?: string                        // Remote socket IP or X-Forwarded-For (with trustedProxy)
  params: Record<string, string>           // Decoded route parameters (:id)
  query: ParsedQuery                       // Proxy object supporting both .get() and direct destructuring
  set: ResponseSetContext                  // Mutable response status and header overrides
  store: Record<string, unknown>           // Request-scoped state storage shared across hooks
  body: unknown                            // Parsed JSON body or raw payload
  headers: Headers                         // Web Standard Request Headers
  cookies: Record<string, string>          // Parsed incoming cookies
  auth?: unknown                           // Auth payload; typed by an auth plugin
  signal: AbortSignal                      // Request/deadline cancellation signal
  logger?: Logger                          // Added by the logger plugin
  files?: Record<string, UploadedFile[]>   // Added by the upload plugin
  setCookie(name: string, value: string, options?: CookieOptions): void
  deleteCookie(name: string, options?: CookieOptions): void
  response(body: unknown, options?: ResponseOptions): ResponseData
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
  html(body: string, status?: number): ResponseData
  text(body: string, status?: number): ResponseData
  json(body: unknown, status?: number | ResponseOptions): ResponseData
  redirect(url: string, status?: number): ResponseData
  header(name: string, value: string): this
}
```

### Query Parameters via Proxy Destructuring

In v0.1.2+, `context.query` is wrapped in a high-performance Proxy that supports two paradigms simultaneously:

1. **Direct Object Property & Destructuring Access:**
   ```ts
   app.get("/search", ({ query }) => {
     const { q, page = "1", limit = "20" } = query
     return { results: [], query: q, page: Number(page), limit: Number(limit) }
   })
   ```
2. **Standard `URLSearchParams` Methods:**
   ```ts
   app.get("/filter", ({ query }) => {
     if (query.has("tag")) {
       return { tag: query.get("tag") }
     }
     return { tag: null }
   })
   ```
3. **Repeated Query Keys as Arrays:**
   When queries repeat (e.g. `?category=electronics&category=audio`), `query.category` cleanly returns `["electronics", "audio"]`.

### Response Mutation with `context.set`

Handlers can mutate the HTTP status code and response headers directly using `context.set`, without having to wrap the return payload in a helper function:

```ts
app.post("/users", ({ body, set }) => {
  set.status = 201 // Sets HTTP 201 Created
  set.headers["x-created-by"] = "nelysia"
  set.headers["x-version"] = "1.0.0"

  return { success: true, user: body }
})
```

### Request State Sharing with `context.store`

In v0.1.3+, `context.store` provides a per-request dictionary for sharing state across lifecycle hooks (`onBeforeHandle`, handler, `onAfterHandle`):

```ts
// Verify bearer token and attach user to store
app.onBeforeHandle(({ headers, store, response }) => {
  const token = headers.get("authorization")
  if (!token) return response(401, { error: "Missing authorization token" })

  store.currentUser = { id: "u123", role: "admin" }
})

// Retrieve currentUser from store in downstream handler
app.get("/me", ({ store }) => {
  return { user: store.currentUser }
})
```

### Response Shorthands

In v0.1.4+, Nelysia provides dedicated shorthands to return strongly typed responses with preconfigured `Content-Type` headers:

- `html(body, status = 200)`: Returns HTML with `Content-Type: text/html; charset=utf-8`
- `text(body, status = 200)`: Returns plaintext with `Content-Type: text/plain; charset=utf-8`
- `json(body, status = 200)`: Returns serialized JSON with `Content-Type: application/json; charset=utf-8`
- `redirect(url, status = 302)`: Returns an HTTP redirect with the `Location` header (status can be 301, 302, 307, etc.)
- `header(name, value)`: Chainable helper for appending headers to the response

```ts
app
  .get("/landing", ({ html }) => html("<h1>Welcome to Nelysia v0.5.1</h1>"))
  .get("/robots.txt", ({ text }) => text("User-agent: *\nDisallow: /private"))
  .get("/old-path", ({ redirect }) => redirect("/new-path", 301))
  .get("/api/ping", (ctx) => {
    return ctx.header("x-server", "nelysia").json({ pong: true })
  })
```

### Cookies Management & `deleteCookie`

Read, write, and invalidate HTTP cookies with security-compliant options:

```ts
app.get("/auth/login", ({ cookies, setCookie }) => {
  const currentSession = cookies.sessionId

  // Set response cookie
  setCookie("sessionId", "token_abc123", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400 // 1 day
  })

  return { message: "Authenticated", priorSession: currentSession ?? null }
})

app.post("/auth/logout", ({ deleteCookie }) => {
  // Clear cookie by expiring immediately
  deleteCookie("sessionId", { path: "/" })
  return { message: "Logged out successfully" }
})
```

### Returning Custom Responses

Handlers can return:
1. **Plain objects / primitives**: Automatically formatted as JSON or text with `200 OK` (or `set.status`).
2. **Response Shorthands**: `context.html()`, `context.text()`, `context.json()`, `context.redirect()`.
3. **`context.response(status, body, headers)`**: Explicit status code and additional headers.
4. **Native `Response`**: Complete control over Web API `Response`.
5. **`ReadableStream`**: Direct chunked streaming.

```ts
app.get("/custom", ({ response }) => {
  return response(201, { success: true }, { "x-custom-header": "NelysiaEngine" })
})

app.get("/stream", () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("Chunk 1\n"))
      controller.enqueue(new TextEncoder().encode("Chunk 2\n"))
      controller.close()
    }
  })
  return new Response(stream, { headers: { "content-type": "text/plain" } })
})
```

The body-first response form is additive and keeps the positional form valid:

```ts
import { error } from "@narudom96/nelysia"

app.get("/created", ({ response }) => response(
  { created: true },
  { status: 201, headers: { "x-source": "nelysia" } }
))

app.get("/missing", () => {
  throw error(404, { code: "NOT_FOUND" })
})
```

---

## 6. Schema Validation & Type Safety

### Built-in Schema Builder (`t`)

Nelysia provides a zero-dependency schema builder `t`:

```ts
import { Nelysia, t } from "@narudom96/nelysia"

const UserSchema = t.Object({
  name: t.String(),
  age: t.Number(),
  isActive: t.Boolean()
})

const app = new Nelysia().post("/users", ({ body }) => {
  // body is validated: { name: string, age: number, isActive: boolean }
  return { status: "created", user: body }
}, {
  body: UserSchema
})
```

### Standard Schema Integration (Zod, Valibot, ArkType)

Nelysia natively supports the **Standard Schema (v1)** specification. Libraries supporting `~standard` (such as Zod 3.24+, Valibot, and ArkType) can be plugged in directly:

```ts
import { z } from "zod"
import { Nelysia } from "@narudom96/nelysia"

const CreatePost = z.object({
  title: z.string().min(3),
  tags: z.array(z.string())
})

const app = new Nelysia().post("/posts", ({ body }) => {
  return { post: body }
}, {
  body: CreatePost
})
```

### Strict TypeScript Contracts

The public `Nelysia` generics default to `{}` instead of `any`. `Context` and
`RouteOptions` intentionally do not have a broad index signature, so misspelled
fields fail at compile time. Macro keys are added to route options only after
the macro is declared:

```ts
const app = new Nelysia()
  .macro({ cache: { beforeHandle: () => undefined } })
  .get("/users", () => [], { cache: true })

app.get("/strict", () => "ok", {
  // @ts-expect-error: `parmas` is not a declared route option
  parmas: {}
})
```

Authentication packages extend the `AuthStrategyRegistry` through module
augmentation. The JWT package registers `jwt`, so `auth: "jwt"`, `auth: true`,
and the object form `{ strategy: "jwt" }` are typed and supported. Arbitrary
legacy strategy strings remain accepted for v0.x compatibility but are
deprecated.

`derive()` and `resolve()` are retained as sync/async context-extension aliases:

```ts
const app = new Nelysia()
  .derive(() => ({ requestStartedAt: Date.now() }))
  .resolve(async ({ requestStartedAt }) => ({
    elapsedAtResolve: Date.now() - requestStartedAt
  }))

app.get("/timing", ({ requestStartedAt, elapsedAtResolve }) => ({
  requestStartedAt,
  elapsedAtResolve
}))
```

### Validation Points

You can independently validate 5 distinct request/response targets on any route:

```ts
app.post("/items/:id", ({ params, query, body }) => ({ params, query, body }), {
  params: t.Object({ id: t.String() }),
  query: t.Object({ filter: t.String() }),
  headers: t.Object({ authorization: t.String() }),
  body: t.Object({ title: t.String() }),
  response: t.Object({ title: t.String() }) // Validates outgoing payload
})
```

Any validation violation automatically aborts execution with `HTTP 400 Bad Request` and returns `{ error: "<field> must be <expected>" }`.

---

## 7. Lifecycle Hooks & Error Handling

Nelysia executes requests through a deterministic, ordered pipeline.

```
Incoming Request
       │
       ▼
[Route Resolution & Body Parsing]
       │
       ▼
[Schema Validation (params, query, headers, body)]
       │
       ▼
[onBeforeHandle Hooks] ──► (Returns Response? ──► Terminate early)
       │
       ▼
[Route Handler Execution]
       │
       ▼
[Response Schema Validation]
       │
       ▼
[onAfterHandle Hooks]
       │
       ▼
[Telemetry onResponse & exportSpan]
       │
       ▼
Outgoing Response
```

### `onBeforeHandle`

Executes before route handler. Return a `context.response(...)` to short-circuit the request (ideal for Authentication / Guards):

```ts
app.onBeforeHandle(({ headers, response }) => {
  const token = headers.get("authorization")
  if (!token) {
    return response(401, { error: "Missing authorization token" })
  }
})
```

### `onAfterHandle`

Executes after the handler succeeds. Inspects or transforms the resulting response (used by compression and audit logging):

```ts
app.onAfterHandle((context, response) => {
  response.headers.set("x-response-time", `${Date.now()}`)
})
```

### `onError` & `HttpError`

Catch and transform runtime errors into consistent client responses:

```ts
import { Nelysia, HttpError } from "@narudom96/nelysia"

const app = new Nelysia()
  .onError((error, context) => {
    if (error instanceof HttpError) {
      return context.response(error.status, { error: error.message })
    }
    console.error("Unhandled exception:", error)
    return context.response(500, { error: "Internal Server Error" })
  })
  .get("/protected", () => {
    throw new HttpError(403, "Forbidden Access")
  })
```

### Graceful Shutdown (`gracefulShutdown`)

Gracefully terminate servers during deployments or SIGINT / SIGTERM signals:

```ts
import { gracefulShutdown } from "@narudom96/nelysia"

const server = app.listen(3000)

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...")
  await gracefulShutdown(server, 5000) // 5s timeout
  process.exit(0)
})
```

### Multi-process serving (`serveClustered`, Node.js)

Scale past one core by forking one worker per CPU. Every worker builds its own
app instance (and its own compiled dispatcher) via the factory:

```ts
import { serveClustered } from "@narudom96/nelysia/runtime-node-cluster"
import { Nelysia } from "@narudom96/nelysia"

serveClustered(() => new Nelysia({ requestId: false }).get("/json", () => ({ ok: true })), {
  port: 3000,          // shared across workers by the OS
  workers: 4,          // defaults to available parallelism
  respawn: true,       // fork a replacement when a worker dies (default)
})
```

Returns the worker's `Server`, or `undefined` in the primary process.
See `examples/cluster/server.ts`.

---

## 8. WebSocket Support

Nelysia provides first-class, cross-runtime WebSocket capabilities.

### Registration & Lifecycle Handlers

```ts
app.websocket("/ws/chat", {
  open(socket) {
    console.log("Client connected")
    socket.send(JSON.stringify({ event: "welcome" }))
  },
  message(socket, message) {
    console.log("Received:", message)
    socket.send(`Echo: ${message}`)
  },
  close(socket, code, reason) {
    console.log(`Connection closed: ${code} - ${reason}`)
  },
  error(socket, error) {
    console.error("WebSocket error:", error)
  }
})
```

### Runtime Integration

- **Bun**: Upgraded natively inside `Bun.serve({ websocket: ... })` with zero overhead.
- **Node.js**: Automatically integrates with `ws` (`WebSocketServer`) via HTTP upgrade listeners.

---

## 9. Plugins Ecosystem

Plugins in Nelysia are composable functions that accept the `app` instance.

### CORS Security (`cors`)

In v0.1.3+, Nelysia includes a native, high-performance CORS plugin that automatically handles preflight `OPTIONS` requests with HTTP 204:

```ts
import { cors } from "@narudom96/nelysia/plugins"

app.use(cors({
  // Allowed origins: string, string[], boolean, or custom callback
  origin: ["http://localhost:3000", "https://frontend.example.com"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["x-request-id"],
  credentials: true,
  maxAge: 86400 // Cache preflight response for 24 hours
}))
```

- **Zero-Handler Preflight**: Preflight `OPTIONS` requests are intercepted immediately and respond with `204 No Content` and appropriate CORS headers without reaching your route handlers.
- **Dynamic Origin Resolution**: When using `origin: (origin, context) => boolean | string`, you can validate origins dynamically against database allowlists or tenant configs.

### OWASP Security Headers (`securityHeaders`)

In v0.1.3+, the `securityHeaders()` plugin hardens your application against common web attacks following OWASP guidelines:

```ts
import { securityHeaders } from "@narudom96/nelysia/plugins"

app.use(securityHeaders({
  xContentTypeOptions: true,                                      // X-Content-Type-Options: nosniff
  xFrameOptions: "SAMEORIGIN",                                    // Prevent Clickjacking (or "DENY")
  xXSSProtection: true,                                           // X-XSS-Protection: 0 (modern standard)
  referrerPolicy: "no-referrer",                                  // Referrer-Policy
  strictTransportSecurity: "max-age=15552000; includeSubDomains", // HSTS
  crossOriginOpenerPolicy: "same-origin",                         // COOP
  crossOriginResourcePolicy: "same-origin"                        // CORP
}))
```

### Static Directory Serving (`staticDirectory`)

In v0.1.2+, serve an entire directory of static assets with built-in MIME type resolution and directory traversal protections:

```ts
import { staticDirectory } from "@narudom96/nelysia/plugins"

// Serves all files from ./public under the /static/* URL path
app.use(staticDirectory({
  prefix: "/static",       // URL prefix (defaults to "")
  root: "./public",         // Root filesystem directory
  index: "index.html"      // Directory index file fallback
}))
```

- **Traversal Defense**: Automatically rejects attempts to traverse out of the root directory (`..`).
- **Comprehensive MIME Mapping**: Supports `html`, `css`, `js`, `json`, `svg`, `png`, `jpg`, `webp`, `woff2`, `wasm`, and more.

### Rate Limiting (`rateLimit`)

In-memory sliding/fixed window rate limiting with standard `Retry-After` headers and `429 Too Many Requests`:

```ts
import { rateLimit } from "@narudom96/nelysia/plugins"

app.use(rateLimit({
  limit: 100,           // Max 100 requests
  windowMs: 60 * 1000,  // Per 1 minute window
  key: (ctx) => ctx.clientIp || "unknown" // Custom identifier
}))
```

### Static File Serving (`staticFile`)

Efficiently serve individual local static assets with automatic MIME detection:

```ts
import { staticFile } from "@narudom96/nelysia/plugins"

app.use(staticFile("/favicon.ico", "./public/favicon.ico"))
app.use(staticFile("/robots.txt", "./public/robots.txt"))
```

### HTTP Compression (`compression`)

Automatically gzips response bodies if requested by client `Accept-Encoding: gzip`:

```ts
import { compression } from "@narudom96/nelysia/plugins"

app.use(compression({
  threshold: 1024 // Only compress bodies larger than 1KB
}))
```

### Production Subpaths

These composable modules are opt-in; an application that does not call the
plugin does not allocate their stores or install their hooks.

```ts
import { session } from "@narudom96/nelysia/session"
import { roles, requireRole } from "@narudom96/nelysia/roles"
import { csrf } from "@narudom96/nelysia/csrf"
import { cache } from "@narudom96/nelysia/cache"
import { health } from "@narudom96/nelysia/health"
import { logger } from "@narudom96/nelysia/logger"
import { timeout } from "@narudom96/nelysia/timeout"
import { upload } from "@narudom96/nelysia/upload"

const app = new Nelysia()
  .use(session<{ userId: string }>({ ttlSeconds: 3600 }))
  .use(roles({
    resolveRoles: ({ auth }) => {
      const role = (auth as { role?: string } | undefined)?.role
      return role ? [role] : []
    },
    permissions: { "users:read": ["admin"] }
  }))
  .use(csrf())
  .use(cache({ ttlMs: 30_000 }))
  .use(logger({ level: "info" }))
  .use(timeout({ timeoutMs: 5_000 }))
  .use(health({ checks: { database: async () => true } }))
  .use(upload({ maxFileSize: 2 * 1024 * 1024, maxFiles: 1 }))
  .onBeforeHandle(requireRole("admin"))
  .post("/upload", ({ files }) => files, {
    // Multipart parsing produces Web `FormData`/`File` values.
  })
```

Contracts and limitations:

- `session()` exposes `context.session.get/set/destroy`; the default memory
  store is process-local. Use a custom `SessionStore` for multi-process or
  distributed deployments.
- `roles()` exposes typed `context.permissions`; `requireRole()` returns a
  `403` response when no required role is present.
- `csrf()` issues a cookie on safe methods and checks the configured header on
  unsafe methods. Use `exclude()` for explicitly public endpoints.
- `cache()` caches successful `GET` responses, adds weak ETags, and returns
  `304` for a matching `If-None-Match`. Native `Response` and streams are not
  cached by this in-memory contract.
- `health()` exposes `/health` and `/ready` by default, runs named checks, and
  returns a degraded status or `503` readiness response when appropriate.
- `upload()` accepts Web `FormData`/`File`, limits file size/count/fields, and
  supports memory, disk, or custom storage adapters. Storage failures invoke
  cleanup for already stored files.
- `logger()` exposes typed `context.logger`, configurable levels/sinks, and
  redacts authorization, cookie, secret, token, password, and API-key fields
  by default. Sink failures never change the request result.
- `timeout()` exposes a request deadline through `context.signal` and defaults
  to `504`. It clears timers on every completion path and cannot interrupt
  synchronous JavaScript that is already running.

---

## 10. OpenAPI 3.1 & Redoc / Swagger UI

Nelysia inspects route schemas and builds fully compliant OpenAPI 3.1 specifications automatically, complete with rich route metadata.

### Generating OpenAPI Specification & Route Metadata

In v0.1.3+, attach descriptive `summary`, `description`, and `tags` to route options. The OpenAPI generator embeds these into the generated specification:

```ts
import { Nelysia, t } from "@narudom96/nelysia"
import { openapi, openapiUi, swaggerUi } from "@narudom96/nelysia/openapi"

const app = new Nelysia()
  .get("/users", () => [{ id: "1", name: "Alice" }], {
    summary: "List all users",
    description: "Returns active accounts with pagination parameters",
    tags: ["Users"],
    response: t.Array(t.Object({ id: t.String(), name: t.String() }))
  })
  .use(openapi({
    title: "Production E-Commerce API",
    version: "1.0.0",
    path: "/openapi.json"
  }))
```

For endpoints with multiple documented statuses, use `responses`. The existing `response` option remains the contract for status `200`; status keys may be numbers or strings, and named models become OpenAPI `$ref`s:

```ts
app.post("/users", ({ response }) => response(201, { id: "1" }), {
  responses: {
    201: "User",
    422: t.Object({ error: t.String() })
  }
})
```

### Interactive Documentation UIs (`openapiUi` & `swaggerUi`)

Serve your preferred interactive UI documentation with zero external build step:

```ts
// 1. Redoc UI: Clean, modern documentation reading experience
app.use(openapiUi({
  path: "/docs",
  specPath: "/openapi.json",
  title: "API Reference (Redoc)"
}))

// 2. Swagger UI: Interactive sandbox for testing endpoints live in the browser
app.use(swaggerUi({
  path: "/swagger",
  specPath: "/openapi.json",
  title: "API Explorer (Swagger UI)"
}))
```

Visiting `http://localhost:3000/swagger` opens Swagger UI, while `http://localhost:3000/docs` displays Redoc.

### Standard Schema Extraction

When route inputs/outputs are defined using Standard Schema v1 (e.g. Zod, Valibot, ArkType), Nelysia automatically extracts these schema definitions into the OpenAPI components dictionary without duplicating validation code.
```

Visit `http://localhost:3000/docs` to view documentation in browser.

### Client Type Generation

Generate TypeScript type declarations for client applications:

```ts
import { generateClientTypes } from "@narudom96/nelysia/openapi"

const typeDefinitions = generateClientTypes(app)
// Outputs a compilable route map:
// export interface NelysiaRoutes {
//   "GET /users/:id": { response: User }
//   "POST /users": { response: User }
// }
```

Use the generated map to constrain paths and infer response values:

```ts
import { createTypedClient } from "@narudom96/nelysia/client"
import type { NelysiaRoutes } from "./nelysia-routes"

const api = createTypedClient<NelysiaRoutes>("http://localhost:3000")
const result = await api.get("/users/1")
```

For reproducible generated files, use the CLI. It imports the entry module,
awaits `app.modules`, and never binds a server port:

```sh
nelysia client src/app.ts --out src/generated/nelysia-client.ts
nelysia client src/app.ts --out src/generated/nelysia-client.ts --force
```

---

## 11. Observability & OpenTelemetry

Nelysia offers built-in distributed tracing and telemetry.

### OTLP HTTP Exporter (`otlpHttpExporter`)

Send spans directly to OpenTelemetry collectors (e.g. Jaeger, Grafana Tempo, Honeycomb):

```ts
import { otlpHttpExporter } from "@narudom96/nelysia/observability"

const app = new Nelysia({
  telemetry: {
    ...otlpHttpExporter({
      url: "http://localhost:4318/v1/traces",
      serviceName: "nelysia-backend",
      headers: { "Authorization": "Bearer token" }
    })
  }
})
```

Every span contains:
- `http.request.id`: Unique request ID
- `http.request.method`: GET, POST, etc.
- `http.route`: The matched route pattern
- `http.response.status_code`: 200, 404, 500
- `durationMs`: Wall-clock latency with sub-millisecond precision

For phase-level observability, provide `telemetry.onEvent`. It receives `request.start`, `route.matched`, `parse`, `handler`, `response`, `error`, and `after.response` events with the request ID, route, status when available, and elapsed duration. Event observer failures are isolated from application responses.

---

## 12. GraphQL Integration

Run GraphQL APIs natively within Nelysia via `graphqlPlugin`:

```ts
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "graphql"
import { graphqlPlugin } from "@narudom96/nelysia/graphql"

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: {
      hello: {
        type: GraphQLString,
        resolve: () => "World from Nelysia GraphQL!"
      }
    }
  })
})

app.use(graphqlPlugin({
  schema,
  path: "/graphql",
  context: (ctx) => ({ user: ctx.headers.get("authorization") })
}))
```

Execute GraphQL queries:

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ hello }"}'
```

POST to `/graphql` with `{ query, variables?, operationName? }`. A missing `query` returns `400 { errors: [...] }`, and `graphql-js` results are normalized to plain JSON before responding.

---

## 13. Database Integrations (Drizzle & Prisma)

### Drizzle ORM (`@narudom96/nelysia/drizzle`)

```ts
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { drizzleRoute } from "@narudom96/nelysia/drizzle"

const sqlite = new Database("app.db")
const db = drizzle(sqlite)
const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull()
})

app.use(drizzleRoute({
  db,
  path: "/users",
  query: (client) => client.select().from(users)
}))
// GET /users -> [{ id: 1, name: "Ada" }, ...]
```

> Limitation: avoid `better-sqlite3` on Bun (its native binding is unstable there) — use a Bun-native driver or run on Node.js.

### Prisma (`@narudom96/nelysia/prisma`)

```ts
import { PrismaClient } from "@prisma/client"
import { prismaRoute } from "@narudom96/nelysia/prisma"

const prisma = new PrismaClient()

app.use(prismaRoute({
  db: prisma,
  path: "/users",
  query: (client) => client.user.findMany()
}))
```

Prepare Prisma (see `examples/prisma/`):

```bash
npm run prisma:generate   # generate the client from examples/prisma/schema.prisma
npm run prisma:smoke      # push the schema to SQLite and run a real smoke test
```

---

## 14. Authentication (JWT & Better Auth)

### 14.1 Official JWT Module (`@narudom96/nelysia/jwt`)

Nelysia includes an official, zero-dependency JWT authentication module built directly on top of the **Native Web Crypto API (HMAC-SHA256)** adhering to the principle of **Pay Only For What You Use**:
- **0 Auth Overhead**: Routes without `{ auth: "jwt" }` incur zero authentication overhead—the authorization header is never inspected.
- **Fast-Verify Path**: Routes configured with `{ auth: "jwt" }` verify tokens against pre-imported `CryptoKey` instances in microseconds.
- **Auto 401 Rejection**: Malformed, missing, or expired tokens immediately return `401 Unauthorized`.
- **Strict algorithm policy**: Only `HS256` is accepted; `none`, algorithm-confusion, malformed-segment, invalid-signature, and invalid-JSON tokens are rejected.
- **Optional claim checks**: `issuer` and `audience` can be configured without changing default behavior when omitted. `exp` and `nbf` are enforced when present.

```ts
import { Nelysia } from "@narudom96/nelysia"
import { jwt, signJwt, verifyJwt } from "@narudom96/nelysia/jwt"

const app = new Nelysia()
  .use(jwt({
    secret: process.env.JWT_SECRET || "super-secret-key",
    expiresIn: 3600 // 1 hour expiration in seconds
  }))
  // 1. Public route: Zero auth overhead
  .get("/public", () => ({ status: "open" }))

  // 2. Protected route: access verified payload via context.auth
  .get("/profile", ({ auth }) => ({
    status: "authenticated",
    user: auth
  }), { auth: "jwt" })

  // 3. Login endpoint: generate tokens with signJwt
  .post("/login", async ({ body }) => {
    const token = await signJwt({ sub: "user-123", role: "admin" }, process.env.JWT_SECRET!, { expiresIn: 3600 })
    return { token }
  })
```

### 14.2 Authentication with Better Auth (`@narudom96/nelysia/better-auth`)

`betterAuthPlugin` bridges Better Auth into Nelysia through a catch-all route (`app.all`), so every Better Auth endpoint (`sign-in`, `sign-up`, `session`, …) works under one prefix:

```ts
import { betterAuth } from "better-auth"
import { betterAuthPlugin } from "@narudom96/nelysia/better-auth"

const auth = betterAuth({
  database: /* your adapter (drizzle/prisma/kysely) */,
  emailAndPassword: { enabled: true }
})

app.use(betterAuthPlugin(auth)) // default prefix: /api/auth
```

- Custom prefix: `betterAuthPlugin(auth, "/auth")`
- Method, headers, and body are forwarded to `auth.handler` untouched, and its `Response` (including `Set-Cookie`) is returned unmodified
- You install and configure `better-auth` yourself (database, secret, trusted origins) — this plugin is only the bridge

JWT claims can be typed without changing the runtime contract:

```ts
type Claims = { sub: string; role: "admin" | "user" }
const secured = new Nelysia()
  .use(jwt<Claims>({ secret: process.env.JWT_SECRET! }))
  .get("/me", ({ auth, jwt }) => ({ subject: auth?.sub }), { auth: "jwt" })
```

---

## 15. Client SDK (`@narudom96/nelysia/client`)

A lightweight, type-friendly client for invoking Nelysia endpoints:

```ts
import { createClient } from "@narudom96/nelysia/client"

const client = createClient("http://localhost:3000")

// GET request
const { data, error } = await client.get<{ id: string }>("/users/42")

if (error) {
  console.error(`HTTP ${error.status}:`, error.body)
} else {
  console.log("User:", data?.id)
}

// POST request
await client.post("/users", { name: "John Doe", age: 30 })
```

For route-aware inference, pass the application type directly:

```ts
const typedClient = createClient<typeof app>("http://localhost:3000")
const result = await typedClient.get("/users/42")
// path, params, body, query, headers, response, and errors are inferred
```

`createTypedClient<RouteMap>()` remains available for generated or manually
declared route maps.

---

## 16. Compiler Platform & CLI

Nelysia includes an ahead-of-time compiler and CLI tool: `nelysia`.

### Route Classification

The compiler assigns every route to one of three public execution lanes:
1. **`COMPILED`**: internal subtiers include `static-prebuilt` and `static-sync`; plain values, strings, bytes, native `Response`, and streams preserve their documented result contract.
2. **`SPECIALIZED`**: Known route structure where only parameter decoding is needed.
3. **`GENERIC`**: Route uses dynamic hooks, schemas, cookies, custom serialization, or opaque handlers; unsupported compiler cases fall back here with diagnostics.

### Inspecting Route Analysis

```bash
nelysia inspect ./src/app.ts
```

Example Output:
```text
GET /health
  Execution: static-prebuilt
  Reason: Explicit static response
GET /json
  Execution: static-sync
  Reason: Zero-argument handler; static function map
GET /users/:id
  Execution: SPECIALIZED
  Reason: Static route metadata; context retained
POST /submit
  Execution: GENERIC
  Reason: Hooks, parameters, or opaque handler retained
```

### Compiling Deployable Artifacts

```bash
# Build for Bun
nelysia build ./src/app.ts --target bun

# Build for Node.js
nelysia build ./src/app.ts --target node
```

Additional DX commands:

```bash
nelysia routes ./src/app.ts   # method, path, public lane, compiler reason
nelysia doctor ./src/app.ts   # runtime, TypeScript, exports, duplicates
nelysia create my-api         # scaffold a project
nelysia dev ./src/app.ts --port 3000
```

### Standalone Generation

When route handlers, lifecycle functions, and schema definitions can be embedded safely, the compiler emits a standalone source-to-source server with no development-router import. It supports all HTTP methods, path parameters, wildcard matching, request parsing, validation, response serialization, headers, HEAD, OPTIONS, 405, and route error handling. Patterns that cannot be embedded safely fall back to the adapter entrypoint with an explicit diagnostic naming their method, path, and reason. Stable route diagnostic codes include `NELY101` unsupported method, `NELY102` request lifecycle, `NELY103` response lifecycle, `NELY104` schema validation, `NELY105` opaque handler, and `NELY106`–`NELY111` for context, module, native response, streaming, WebSocket, and runtime dependency exclusions.

> Deliberate limit: handlers that depend on unavailable runtime closures, platform objects, or opaque integrations remain on the generic fallback path.

### Adapter Dispatcher (Default Fast Path)

Even without a standalone build, the Node, Bun, and Fetch adapters serve hook-free `GET` routes through the shared compiled dispatcher (`packages/compiler/src/dispatcher.ts`): O(1) static hits with pre-serialized payloads, per-method dynamic lookup with a single pathname split, prefix matching for `/users/:id`-style routes, and generated validation for deterministic built-in params/query/header/response schemas. Hooks, body schemas, Standard Schema/custom behavior, other methods, and telemetry fall through to the generic router. The manifest records this with `dispatcher: true`, `NELY002` generated-schema diagnostics, and an `NELY003` coverage diagnostic.

### Build Outputs

Build outputs:
- `dist/server.bun.ts` (or `dist/server.node.ts`): Optimized entrypoint.
- `dist/server.bun.ts.map` (or `dist/server.node.ts.map`): Source map of the artifact.
- `dist/manifest.json`: Target, artifact, route analyses, diagnostics (`NELY001`/`NELY003` plus reason codes `NELY101`–`NELY111`), `generation` (`standalone`|`adapter`), `dispatcher` (fast-path coverage flag), `reproducible: true`, and content-addressed `cacheKey`.
- `.nelysia-cache/<hash>.json`: Content-addressed build cache.

### Deploying with Docker

A production-ready `Dockerfile` ships at the repository root (Node 22-slim, prod dependencies only, prebuilt `dist/server.node.ts`, `HEALTHCHECK` on `/`, non-root user):

```bash
docker build -t nelysia:local .
docker run --rm -p 3000:3000 -e PORT=3000 nelysia:local
```

### Client Type Generation (`generateClientTypes`)

```ts
import { generateClientTypes } from "@narudom96/nelysia/openapi"

console.log(generateClientTypes(app))
// export interface NelysiaRoutes {
//   GET "/users": { response: unknown }
//   ...
// }
```

---

## 17. Supported Runtimes & Adapters

Nelysia runs anywhere modern JavaScript executes:

| Feature | Bun 1.4+ | Node.js 22+ | Standard Fetch (Deno/Edge) | Vercel | Cloudflare | Deno |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| HTTP Routing | Yes | Yes | Yes | Yes | Yes | Yes |
| JSON Body Parsing | Yes | Yes | Yes | Yes | Yes | Yes |
| Route Validation | Yes | Yes | Yes | Yes | Yes | Yes |
| Native Streams | Yes | Yes | Yes | Yes | Yes | Yes |
| WebSockets | Yes (native) | Yes (`ws`) | Optional | No | Optional | Optional |
| AOT Compiler Optimization | Yes | Yes | Yes | Yes | Yes | Yes |

### Vercel (`@narudom96/nelysia/runtime-vercel`)

```ts
import { createVercelHandler } from "@narudom96/nelysia/runtime-vercel"

export default createVercelHandler(app)
```

### Cloudflare Workers (`@narudom96/nelysia/runtime-cloudflare`)

```ts
import { createCloudflareWorker } from "@narudom96/nelysia/runtime-cloudflare"

export default createCloudflareWorker(app) // { fetch(request, env, ctx) }
```

Web APIs only — no Node globals required (see `examples/cloudflare/worker.ts`).

### Deno

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"

Deno.serve(createFetchHandler(app))
```

Verify the contract with `npm run deno:check` (see `examples/deno/main.ts`).

### Universal Fetch Adapter

To mount Nelysia into any Web Standards runtime:

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "./app.ts"

const handler = createFetchHandler(app)

export default {
  fetch(request: Request) {
    return handler(request)
  }
}
```

---

## 18. Full-Stack Framework Integrations

Nelysia integrates seamlessly into popular full-stack frameworks via `createFetchHandler` (see `examples/*` and `tests/framework-examples.test.ts`):

### Next.js (App Router Route Handler)

`app/api/nelysia/route.ts`:
```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

const handler = createFetchHandler(app)

export const GET = (request: Request) => handler(request)
export const POST = (request: Request) => handler(request)
export const PUT = (request: Request) => handler(request)
export const DELETE = (request: Request) => handler(request)
```

### Nuxt (`server/api/[...].ts`)

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "~/server/app"
import { defineEventHandler, toWebRequest } from "h3"

const handler = createFetchHandler(app)

export default defineEventHandler((event) => {
  return handler(toWebRequest(event))
})
```

### SvelteKit (`src/routes/api/nelysia/+server.ts`)

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "$lib/server/app"

const fetchHandler = createFetchHandler(app)

// SvelteKit passes a Request inside its RequestEvent.
export const GET = ({ request }: { request: Request }) => fetchHandler(request)
```

### Astro (`src/pages/api/nelysia.ts`)

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

const fetchHandler = createFetchHandler(app)
// Astro passes APIContext; forward its Web-standard Request explicitly.
export const GET = ({ request }: { request: Request }) => fetchHandler(request)
```

### TanStack Start (`src/routes/api/nelysia.ts`)

```ts
import { createFileRoute } from "@tanstack/react-router"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

const fetchHandler = createFetchHandler(app)
export const Route = createFileRoute("/api/nelysia")({
  server: { handlers: { GET: ({ request }) => fetchHandler(request) } }
})
```

### Running the framework fixtures

Each maintained example is a runnable fixture with its own framework manifest:

| Framework | Fixture | Native bridge | Verification |
| :--- | :--- | :--- | :--- |
| Astro | `examples/astro` | Endpoint methods receive `APIContext.request` | Production build + live HTTP smoke |
| Next.js | `examples/nextjs` | App Router exports `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS` | Production build + live HTTP smoke |
| Nuxt/Nitro | `examples/nuxt` | H3 `toWebRequest(event)` converts Node/Nitro events | Nitro build + live HTTP smoke |
| SvelteKit | `examples/sveltekit` | `RequestEvent.request` | Production build + live HTTP smoke |
| TanStack Start | `examples/tanstack-start` | Server route handlers receive `{ request }` | Production build + live HTTP smoke |

Install dependencies in each fixture, then run the aggregate ecosystem gate:

```bash
for fixture in astro nextjs nuxt sveltekit tanstack-start; do
  (cd "examples/$fixture" && npm install)
done
npm run framework:check
```

The gate builds every fixture and requests `GET /api/nelysia` from its live
development server. The framework bridge is intentionally limited to the
Fetch `Request`/`Response` contract; caching, SSR, WebSocket upgrades, cookies,
streaming policy, and deployment-specific bindings remain framework or platform
configuration concerns.

---

## 19. Benchmarking & Soak Testing

Nelysia includes automated micro-benchmarks and memory soak runners.

### v0.5.0 production contracts (shipped in package v0.5.1)

The v0.5.0 workspace adds strict HS256 JWT route guards, deterministic generated
validation for the supported built-in schema subset, and three same-package
subpaths: `@narudom96/nelysia/upload`, `@narudom96/nelysia/logger`, and
`@narudom96/nelysia/timeout`. Unsupported Standard Schema transforms, custom
runtime behavior, native responses, and streams remain on the generic path.
See [`v0.5-release-gates.md`](./v0.5-release-gates.md) for the release evidence
commands and the distinction between implemented code and completed soak evidence.

### v0.5.1 Bun route-compiled patch

The patch adds a compiled dispatcher index for static function routes. A
zero-argument `.get()` handler is classified as `static-sync`, while `.getStatic()`
remains `static-prebuilt`; params-only routes use the specialized dynamic tier and
unsupported results fall back to the generic runtime. Native `Response` values,
streams, and handler errors are returned or adapted once. Reproduce the matched
single-route and multi-route evidence with `BENCH_ROUTE_SET=single` or `multi` and
`npm run benchmark:oha:route:release`. The patch report is
[`benchmark-route-fast-path-v051-2026-09-14.md`](./benchmark-route-fast-path-v051-2026-09-14.md).

### Running Benchmarks

```bash
# TechEmpower Round 22 Benchmark Suite (Plaintext & JSON across concurrency 50-500)
npm run benchmark:teb

# Verify 100% compliance with TechEmpower specifications
npm run benchmark:teb:verify

# JWT Authentication Benchmark (Nelysia vs Elysia vs Hono)
npm run benchmark:jwt

# Release security evidence: public/protected and invalid-token matrix (30s × 7)
npm run benchmark:jwt:release

# Full Load Test with oha (Bun + Node.js)
npm run benchmark:oha
npm run benchmark:oha:bun
npm run benchmark:oha:node
npm run benchmark:oha:release
# If the default base port 4321 is occupied:
BENCH_PORT=4341 npm run benchmark:oha

# Router scale (generic-path lookup cost vs table size)
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=100 node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts
```

### Recorded compatibility snapshot — 10-round run (2026-09-14)

Each workload used `oha 1.16.0`, 50 concurrent workers, 3 seconds per sample,
10 rounds, and zero failed requests. These values are a historical compatibility
snapshot retained separately from the v0.5.1 release evidence. The snapshot
host was an AMD Ryzen 5 5600 (6 cores / 12 threads), with Bun 1.4.0 and
Node.js v26.8.1; the dedicated release reports use Node.js v26.8.2.

| Node workload | Raw Node | Nelysia | Fastify | Express |
| :--- | ---: | ---: | ---: | ---: |
| JSON (`GET /json`) | 47,572 req/s | 27,451 req/s | 38,879 req/s | 21,130 req/s |
| Dynamic params (`GET /users/:id`) | 47,607 req/s | 40,919 req/s | 38,846 req/s | 20,527 req/s |

| Bun workload | Raw Bun | Nelysia | Elysia | Other baseline |
| :--- | ---: | ---: | ---: | :--- |
| Static JSON (`GET /json`) | 95,306 req/s | 95,173 req/s | 76,062 req/s | Route Compiled 44,153 |
| Dynamic params (`GET /users/:id`) | 82,904 req/s | 83,855 req/s | 82,816 req/s | Standard Bun 41,945 |

Interpretation: in the 10-round run, Bun static Nelysia was effectively tied
with raw Bun (-0.1%) and 25.1% above Elysia; Bun dynamic was 1.1% above raw Bun
and 1.3% above Elysia. Node dynamic was 14.0% below raw Node but 5.3% above
Fastify, while Node JSON was 42.3% below raw Node. These are local directional
observations, not universal framework rankings. Full command output and environment notes are recorded in
[`docs/benchmark-oha-2026-09-14.md`](./benchmark-oha-2026-09-14.md).

The completed v0.5 release evidence is recorded in
[`benchmark-oha-v05-2026-09-14.md`](./benchmark-oha-v05-2026-09-14.md),
[`benchmark-jwt-v05-2026-09-14.md`](./benchmark-jwt-v05-2026-09-14.md), and
[`benchmark-route-fast-path-v051-2026-09-14.md`](./benchmark-route-fast-path-v051-2026-09-14.md).
The original 1M and 10M request-count soak evidence is in
[`soak-v05-2026-09-14.md`](./soak-v05-2026-09-14.md), with the fresh post-roadmap
rerun in [`soak-roadmap-rerun-2026-09-14.md`](./soak-roadmap-rerun-2026-09-14.md).
The 24-hour soak is a
separate production-readiness gate and is intentionally deferred.

### Historical TechEmpower snapshot

The older TechEmpower Round 22 snapshot (100,471 req/s plaintext and 99,103
req/s JSON) remains available in the historical documentation. It used a
different benchmark harness and should not be compared arithmetically with the
latest table above. Use the same-runner comparison in the current report when
checking directional progress.

### Running Soak Tests

The soak test hammers static (`/health`) and dynamic (`/users/:id` on a 200-route
table) paths to verify memory stability and detect heap/RSS drift:

```bash
npm run soak
npm run soak:1m
npm run soak:10m
# Separate production-readiness gate; intentionally deferred for now
npm run soak:24h
# Longer run (e.g. multi-minute soak with 1M requests over 200 routes)
SOAK_ITERATIONS=1000000 SOAK_ROUTES=200 npm run soak
```

Output highlights:
- Total iterations completed
- Error counts
- Average throughput (RPS)
- Heap memory delta ($\Delta$ Heap) and RSS delta ($\Delta$ RSS)

---

## 20. Migration Guides

### From Express

```ts
// Express
const express = require("express")
const app = express()
app.get("/users/:id", (req, res) => res.json({ id: req.params.id }))
app.listen(3000)

// Nelysia
import { Nelysia } from "@narudom96/nelysia"
const app = new Nelysia()
  .get("/users/:id", ({ params }) => ({ id: params.id }))
app.listen(3000)
```
*Key difference: In Nelysia, handlers return values directly instead of invoking `res.send()` or `res.json()`.*

### From Fastify

```ts
// Fastify
fastify.post("/users", {
  schema: { body: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }
}, async (req, reply) => req.body)

// Nelysia
import { Nelysia, t } from "@narudom96/nelysia"
const app = new Nelysia()
  .post("/users", ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })
```

### From Elysia

Nelysia was designed with a familiar chainable DX inspired by Elysia, but introduces key architectural distinctions for AOT compiler specialization, V8 Monomorphic shape stability, and native zero-polyfill dual-runtime (Node.js & Bun) performance.

#### Syntax & Architecture Comparison Matrix (Elysia vs Nelysia)

| Feature / Pattern | ElysiaJS | Nelysia | Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **State Injection** | `app.state('k', v)`<br>`app.decorate('db', db)`<br>→ `({ db, store }) => ...` | `context.store`<br>→ `({ store }) => { store.db = ... }` | Elysia mutates context object shapes, causing V8 Inline Cache de-optimizations. Nelysia preserves stable object shapes for peak V8 monomorphic execution. |
| **Sub-Apps** | `app.use(subApp)` | `app.mount('/prefix', subApp)` | Recommended separation: use `mount()` for prefixed routing trees and `use()` for plugins; legacy `use(subApp)` remains supported for compatibility. |
| **Route Grouping** | `app.group('/v1', (app) => ...)` | `app.group('/v1', (group) => ...)` | Identical DX. Nested groups inherit parent lifecycle hooks (`onBeforeHandle`, etc.). |
| **Guards / Macros** | `.guard({ ... })`<br>`.macro({ ... })` | `app.group(prefix, (g) => { g.onBeforeHandle(...) })` | Explicit group hooks maintain predictable AOT dispatch compiler analysis. |
| **Static Endpoints** | Generic dynamic handler `app.get('/ping', () => 'pong')` | `app.getStatic('/ping', 'pong')` or supported zero-argument `.get('/ping', () => 'pong')` | `getStatic()` is `static-prebuilt`; supported zero-argument `.get()` is `static-sync` through `staticFunctionMap`. Unsupported results fall back to generic execution. |
| **Node.js Support** | Bun-first; requires `@bogeychan/elysia-polyfill` on Node.js | Native Node.js 22+ (`node:http`) & Bun 1.4+ (`Bun.serve`) | First-class citizen on both platforms with 0 polyfill overhead. |
| **Multi-Core Scaling** | Requires external cluster manager (PM2) | `serveClustered(app, { port, instances: 'max' })` | Native Node.js cluster fork management built-in with graceful shutdown. |
| **Schema Validation** | TypeBox (`t`) | Built-in `t` + **Standard Schema v1** (Zod, Valibot, ArkType) | Universal schema support without extra bridge plugins. |
| **Cookies** | `({ cookie: { session } }) => ...` (Proxy) | `({ cookies, setCookie, deleteCookie }) => ...` | Clean explicit helper API, eliminating proxy overhead. |

#### Code Migration Examples

##### 1. Mounting Sub-Apps vs Plugins

```ts
// ❌ Elysia: Overloaded use() for both plugins and sub-apps
import { Elysia } from 'elysia'
const userRoutes = new Elysia({ prefix: '/users' }).get('/', () => ['Alice', 'Bob'])
const app = new Elysia().use(userRoutes)

// ✅ Nelysia: Explicit mount() for sub-apps, use() for plugins
import { Nelysia } from '@narudom96/nelysia'
const userRoutes = new Nelysia().get('/', () => ['Alice', 'Bob'])
const app = new Nelysia()
  .mount('/users', userRoutes) // mounts to /users
```

##### 2. Context State & Decorators

```ts
// ❌ Elysia: Decorating properties directly on context object
const app = new Elysia()
  .decorate('db', database)
  .get('/items', ({ db }) => db.findAll())

// ✅ Nelysia: Access via context.store (V8 Monomorphic Safe)
const app = new Nelysia()
  .onBeforeHandle(({ store }) => {
    store.db = database
  })
  .get('/items', ({ store }) => store.db.findAll())
```

##### 3. Route Groups & Protected Scopes

```ts
// Elysia
app.group('/admin', (app) =>
  app.guard({ beforeHandle: checkAuth }, (app) =>
    app.get('/dashboard', () => ({ secret: true }))
  )
)

// Nelysia
app.group('/admin', (admin) => {
  admin.onBeforeHandle(checkAuth)
  admin.get('/dashboard', () => ({ secret: true }))
})
```

##### 4. Constant / Static Endpoints

```ts
// Elysia: Evaluated through standard handler pipeline
app.get('/health', () => ({ status: 'ok' }))

// Nelysia: Zero-overhead AOT pre-serialized bytes
app.getStatic('/health', { status: 'ok' })
```

---


## 21. Performance Tuning Guide

Hot routes should land on the compiled fast path. The rules are simple:

1. **Prefer `getStatic()` for constant responses** — the body is serialized once at startup and served as prebuilt bytes (`Response.clone()` on Bun/Fetch, `Buffer` + `content-length` on Node).
2. **Use supported zero-argument `.get()` for computed static-sync responses** — the handler uses `staticFunctionMap` and avoids request-context allocation; unsupported return behavior falls back to generic execution.
3. **Keep hot dynamic handlers params-only** — `({ params }) => …` skips query/cookie/header parsing. As soon as a handler destructures `query`, `headers`, or `cookies`, it runs on the generic path (correct, just slower).
4. **Keep hooks and schemas off hot routes** — any `onBeforeHandle`/`onAfterHandle`/`onError` or `body`/`params`/`query`/`headers`/`response` schema excludes the route from the dispatcher.
5. **Use `GET` for cacheable reads** — only `GET` routes are compiled; `HEAD` reuses the `GET` route through the generic path.
6. **Disable what you don't use** — `new Nelysia({ requestId: false })` skips per-request UUID generation and the `x-request-id` header; no `telemetry` means no `performance.now()` timing.

Verify with the inspector and the router-scale runner:

```bash
npm run inspect -- ./src/app.ts
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts
```

Per-request cost ranking (most to least expensive): JSON body parsing → schema validation → UUID request IDs → cookie parsing → query parsing → dynamic lookup → static lookup. Measure with `benchmarks/router-scale.ts` on your own hardware — dev-machine numbers are directional only.

---

## 22. Production Deployment Checklist

- [x] `npm run release:check:v05` passes for the non-24-hour release gates (typecheck + Node/Bun tests + package/import/deployment checks + 1M/10M soak + Deno check + audit).
- [x] `npm run framework:check` passes after installing the five framework fixtures.
- [ ] Check dispatcher coverage: build and read `NELY003` in `dist/manifest.json` — hot routes should be on the fast path.
- [ ] Set `bodyLimit` for your largest payload; keep `trustedProxy: false` unless you control the proxy.
- [ ] Expose a `/health` endpoint and wire `gracefulShutdown(server, timeout)` on `SIGTERM`.
- [ ] Scale with `serveClustered()` (Node) or platform autoscaling; confirm `PORT` env wiring.
- [ ] Deploy via the provided `Dockerfile` (`docker build -t nelysia:local .`) or the release tarball.
- [ ] Run the separate 24-hour soak on production-like hardware before announcing production readiness; it is intentionally deferred.

---

## 23. Troubleshooting & FAQ

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `400 Malformed JSON body` | Request body is not valid JSON | Fix the client payload or accept text |
| `400 <path> must be …` | Schema validation failed | Check the failing field in the message |
| `413 Request body is too large` | Body exceeds `bodyLimit` (default 1 MB) | Raise `bodyLimit` or reject earlier |
| `404 Not Found` | No route matches the path | Check `npm run inspect` output |
| `405 Method Not Allowed` | Path exists, method doesn't | Read the `Allow` header for valid methods |
| `OPTIONS` handler does not run | An explicit handler runs first; otherwise the automatic `204` + `Allow` fallback is used | Register `.options(path, handler)` when custom preflight behavior is required |
| `EADDRINUSE` on `listen` | Port already taken (e.g. another dev server) | Set `PORT` env or free the port |
| WebSocket upgrade fails / socket destroyed | No `websocket()` route for the path, or missing `upgrade` header | Register `app.websocket(path, …)` first |
| Benchmark numbers swing wildly | Dev-machine noise (background load, power saving) | Use a quiet Linux box, dedicated load generator, 10-round medians |
| Slow with many routes | Old versions scanned all routes per request | Upgrade: current versions use per-method single-pass lookup |

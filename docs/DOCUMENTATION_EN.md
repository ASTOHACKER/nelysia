# Nelysia: Comprehensive Technical Documentation

> **Version:** 0.1.0 (MVP Complete)  
> **Target Runtimes:** Bun 1.4+, Node.js 22+, and Web Fetch Standard (Vercel, Cloudflare, Deno)  
> **Language:** TypeScript / JavaScript (ESM)

---

## Table of Contents

1. [Introduction & Architecture](#1-introduction--architecture)
2. [Installation & Prerequisites](#2-installation--prerequisites)
3. [Quick Start](#3-quick-start)
4. [Core Application (`Nelysia`)](#4-core-application-nelysia)
   - [Configuration Options](#configuration-options)
   - [HTTP Routing Methods](#http-routing-methods)
   - [Route Options & Schemas](#route-options--schemas)
   - [Sub-App Mounting (`mount`)](#sub-app-mounting-mount)
5. [The Request Context (`Context`)](#5-the-request-context-context)
   - [Context Properties](#context-properties)
   - [Request IDs & IP Resolution](#request-ids--ip-resolution)
   - [Cookies Management](#cookies-management)
   - [Returning Custom Responses](#returning-custom-responses)
6. [Schema Validation & Type Safety](#6-schema-validation--type-safety)
   - [Built-in Schema Builder (`t`)](#built-in-schema-builder-t)
   - [Standard Schema Integration (Zod, Valibot, ArkType)](#standard-schema-integration-zod-valibot-arktype)
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
   - [Plugin Structure (`use`)](#plugin-structure-use)
   - [Rate Limiting (`rateLimit`)](#rate-limiting-ratelimit)
   - [Static File Serving (`staticFile`)](#static-file-serving-staticfile)
   - [HTTP Compression (`compression`)](#http-compression-compression)
10. [OpenAPI 3.1 & Redoc UI](#10-openapi-31--redoc-ui)
    - [Generating OpenAPI Specification](#generating-openapi-specification)
    - [Serving OpenAPI JSON Endpoint](#serving-openapi-json-endpoint)
    - [Interactive Documentation UI (`openapiUi`)](#interactive-documentation-ui-openapiui)
    - [Client Type Generation (`generateClientTypes`)](#client-type-generation-generateclienttypes)
11. [Observability & OpenTelemetry](#11-observability--opentelemetry)
    - [Telemetry Callbacks](#telemetry-callbacks)
    - [OTLP HTTP Exporter (`otlpHttpExporter`)](#otlp-http-exporter-otlphttpexporter)
12. [GraphQL Integration](#12-graphql-integration)
13. [Database Integrations (Drizzle & Prisma)](#13-database-integrations-drizzle--prisma)
14. [Authentication with Better Auth](#14-authentication-with-better-auth)
15. [AI SDK Integration](#15-ai-sdk-integration)
16. [Client SDK (`@nelysia/client`)](#16-client-sdk-nelysiaclient)
14. [Compiler Platform & CLI](#14-compiler-platform--cli)
    - [Route Classification: Compiled vs Specialized vs Generic](#route-classification-compiled-vs-specialized-vs-generic)
    - [CLI Commands (`inspect`, `build`)](#cli-commands-inspect-build)
    - [Build Manifest & Content-Addressed Cache](#build-manifest--content-addressed-cache)
15. [Supported Runtimes & Adapters](#15-supported-runtimes--adapters)
    - [Bun Runtime](#bun-runtime)
    - [Node.js Runtime](#nodejs-runtime)
    - [Fetch Standard Adapter](#fetch-standard-adapter)
    - [Vercel Serverless Functions](#vercel-serverless-functions)
17. [Compiler Platform & CLI](#17-compiler-platform--cli)
18. [Supported Runtimes & Adapters](#18-supported-runtimes--adapters)
19. [Full-Stack Framework Integrations](#19-full-stack-framework-integrations)
    - [Next.js App Router](#nextjs-app-router)
    - [Nuxt](#nuxt)
    - [SvelteKit](#sveltekit)
    - [Astro](#astro)
    - [TanStack Start](#tanstack-start)
20. [Benchmarking & Soak Testing](#20-benchmarking--soak-testing)
21. [Migration Guides](#21-migration-guides)

---

## 1. Introduction & Architecture

**Nelysia** is a high-performance, compiler-first TypeScript backend framework designed for the modern JavaScript runtime ecosystem. It delivers an ergonomic, chainable API (reminiscent of Elysia) while incorporating ahead-of-time (AOT) static route analysis, conservative runtime specialization, and direct native execution across Bun and Node.js.

### Core Philosophy

1. **Compiler-First Specialization**:
   Instead of running all routes through an identical generic pipeline at runtime, Nelysia analyzes route declarations. Routes that are pure static values bypass context allocations entirely (`compiled`). Parameter-only routes bypass cookie/query parsing (`specialized`). Highly dynamic routes fall back safely to the full pipeline (`generic`).
2. **Deterministic Route Resolution**:
   Static routes are indexed via `Map` lookups ($O(1)$). Parameter routes are evaluated deterministically. Missing methods on existing routes return HTTP `405 Method Not Allowed` with the `Allow` header automatically populated. Preflight `OPTIONS` and bodyless `HEAD` methods are handled natively.
3. **Web Standards Compatibility**:
   Built atop standard `Request`, `Response`, `Headers`, and `ReadableStream` primitives, making Nelysia universally adaptable to Bun, Node.js (via adapters), Cloudflare Workers, Vercel, and Deno.

---

## 2. Installation & Prerequisites

### Requirements

- **Node.js**: `v22.0.0` or higher (uses native `--experimental-strip-types`)
- **Bun**: `v1.4.0` or higher (optional, for ultra-fast Bun execution)
- **TypeScript**: `v5.0+`

### Package Exports

Sources live in `packages/*/src/*.ts`. Running `npm run package:build` emits compiled JavaScript plus type declarations into `dist-package/`, which is what `package.json` exports point at:

```json
{
  "exports": {
    ".": "./dist-package/packages/core/src/index.js",
    "./plugins": "./dist-package/packages/plugins/src/index.js",
    "./observability": "./dist-package/packages/observability/src/index.js",
    "./runtime-fetch": "./dist-package/packages/runtime-fetch/src/server.js",
    "./graphql": "./dist-package/packages/integrations-graphql/src/index.js",
    "./drizzle": "./dist-package/packages/integrations-drizzle/src/index.js",
    "./prisma": "./dist-package/packages/integrations-prisma/src/index.js",
    "./better-auth": "./dist-package/packages/integrations-better-auth/src/index.js",
    "./runtime-vercel": "./dist-package/packages/runtime-vercel/src/index.js",
    "./runtime-cloudflare": "./dist-package/packages/runtime-cloudflare/src/index.js",
    "./compiler": "./dist-package/packages/compiler/src/index.js",
    "./openapi": "./dist-package/packages/openapi/src/index.js",
    "./client": "./dist-package/packages/client/src/index.js"
  }
}
```

> While developing inside this monorepo, import from source paths directly, e.g. `../../packages/core/src/index.ts`.

---

## 3. Quick Start

### 1. Create your application (`src/app.ts`)

Always export the `app` instance so the compiler and CLI can inspect and build your service without prematurely starting the HTTP listener.

```ts
import { Nelysia } from "@narudom96/nelysia"

export const app = new Nelysia()
  .get("/", () => "Hello from Nelysia!")
  .get("/users/:id", ({ params }) => ({
    id: params.id,
    timestamp: Date.now()
  }))

// Listen directly if running as standalone
if (import.meta.main || process.env.NODE_ENV !== "test") {
  app.listen(3000)
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
# Output: Hello from Nelysia!

curl http://localhost:3000/users/42
# Output: {"id":"42","timestamp":1726180000000}
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

> **OPTIONS behavior:** an `OPTIONS` request never reaches a route handler. When any
> route matches the path, Nelysia answers `204` with an `Allow` header listing the
> registered methods (plus `HEAD` for `GET` routes); otherwise it answers `404`.
> Registering `app.options(path, handler)` is accepted but the handler is not invoked.

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

### Sub-App Mounting (`mount`)

Encapsulate modular route groups and mount them under distinct URL prefixes:

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

### Plugin Mechanics (`use`) and Lifecycle Scope

`use()` accepts only a function `(app) => app | void` — there is no instance-as-plugin, no `decorate`/`state`, and no `guard`/`group` as in Elysia:

```ts
// A plugin is a config factory returning (app) => app
const myPlugin = (opts: { tag: string }) => (app: Nelysia) =>
  app.onBeforeHandle(({ headers, response }) => {
    if (!headers.has("x-tag")) return response(401, { error: opts.tag })
  })

app.use(myPlugin({ tag: "missing-tag" }))
```

Scope rules to remember:
- Hooks added to the parent (before or after `mount`) apply to all of the parent's own routes — including routes registered earlier (backfill)
- Mounted child routes carry the child's own `before/after/error` lifecycle with them: no leaking to siblings, and later parent hooks never backfill onto them
- A duplicate method+path during mount throws `Duplicate route`
- No deduplication — calling `use()` twice registers twice

---

## 5. The Request Context (`Context`)

Every route handler receives an isolated, request-scoped `Context` object:

```ts
interface Context {
  request: RequestData                     // Low-level request details
  requestId: string                        // Unique UUID / X-Request-ID
  clientIp?: string                        // Remote socket IP or X-Forwarded-For
  params: Record<string, string>           // Decoded route params
  query: URLSearchParams                   // Parsed query parameters
  body: unknown                            // Parsed JSON body or raw string
  headers: Headers                         // Web Standard Request Headers
  cookies: Record<string, string>          // Parsed incoming cookies
  setCookie(name: string, value: string, options?: CookieOptions): void
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
}
```

### Context Properties

```ts
app.get("/search/:category", ({ params, query, headers, clientIp, requestId }) => {
  const category = params.category // e.g. "books"
  const term = query.get("q")      // e.g. "typescript"
  const userAgent = headers.get("user-agent")

  return {
    requestId,
    clientIp,
    category,
    term,
    userAgent
  }
})
```

### Cookies Management

Read and write HTTP cookies with standard attributes:

```ts
app.get("/auth/login", ({ cookies, setCookie, response }) => {
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
```

### Returning Custom Responses

Handlers can return:
1. **Plain objects / primitives**: Automatically formatted as JSON or text with `200 OK`.
2. **`context.response(status, body, headers)`**: Explicit status code and additional headers.
3. **Native `Response`**: Complete control over Web API `Response`.
4. **`ReadableStream`**: Direct chunked streaming.

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

Efficiently serve local static assets with automatic MIME detection:

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

---

## 10. OpenAPI 3.1 & Redoc UI

Nelysia inspects route schemas and builds fully compliant OpenAPI 3.1 specifications automatically.

### Enabling OpenAPI & Interactive Documentation

```ts
import { openapi, openapiUi } from "@narudom96/nelysia/openapi"

app
  // Serves JSON spec at /openapi.json
  .use(openapi({
    title: "E-Commerce Service API",
    version: "1.0.0",
    path: "/openapi.json"
  }))
  
  // Serves interactive Redoc documentation at /docs
  .use(openapiUi({
    path: "/docs",
    specPath: "/openapi.json",
    title: "API Reference"
  }))
```

Visit `http://localhost:3000/docs` to view documentation in browser.

### Client Type Generation

Generate TypeScript type declarations for client applications:

```ts
import { generateClientTypes } from "@narudom96/nelysia/openapi"

const typeDefinitions = generateClientTypes(app)
// Outputs:
// export interface NelysiaRoutes {
//   GET "/users/:id": { response: unknown }
//   POST "/users": { response: unknown }
// }
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

## 14. Authentication with Better Auth

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

---

## 15. AI SDK Integration

Call Vercel AI SDK `generateText` inside a route via an injectable helper (see `examples/ai-sdk/app.ts`):

```ts
import { generateText, type LanguageModel } from "ai"
import { Nelysia } from "@narudom96/nelysia"

export function createAiSdkApp(model: LanguageModel): Nelysia {
  return new Nelysia().post("/ai", async ({ body, response }) => {
    if (!body || typeof body !== "object" || typeof (body as any).prompt !== "string") {
      return response(400, { error: "Expected a JSON body with a string prompt" })
    }
    const { text } = await generateText({ model, prompt: (body as any).prompt })
    return { text }
  })
}
```

```bash
npm run ai:example
curl -X POST http://localhost:3001/ai \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hello"}'
# {"text":"Deterministic AI SDK response"}
```

The checked-in example uses `MockLanguageModelV3` from `ai/test`, so it needs no network or credentials. For production, pass a real provider model into `createAiSdkApp`; streaming, tool calling, and API keys remain the application's responsibility.

---

## 16. Client SDK (`@nelysia/client`)

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

---

## 17. Compiler Platform & CLI

Nelysia includes an ahead-of-time compiler and CLI tool: `nelysia`.

### Route Classification

The compiler classifies every route into three execution tiers:
1. **`COMPILED`**: Static route with context-free value or zero context dependency. Maximum possible throughput.
2. **`SPECIALIZED`**: Known route structure where only parameter decoding is needed.
3. **`GENERIC`**: Route uses dynamic hooks, schemas, cookies, or opaque handlers.

### Inspecting Route Analysis

```bash
nelysia inspect ./src/app.ts
```

Example Output:
```text
GET /
  Execution: COMPILED
  Reason: Explicit static response
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

### Standalone Generation (Supported Subset)

When every route is a static value or a params-only GET handler (`({ params }) => …`) with no hooks, schemas, or telemetry, the compiler embeds the route table and handlers directly into the artifact — no generic router import. Static bodies are pre-serialized and served via `Response.clone()`; `/users/:id`-style routes match by prefix and extract the param straight from the URL. Anything else falls back to the adapter entrypoint with an explicit `NELY002` diagnostic naming its method and path.

> Deliberate limit: arbitrary source-to-source transformation of all TypeScript patterns is not supported — see `docs/release-status.md`.

### Compiling Deployable Artifacts

Build outputs:
- `dist/server.bun.ts` (or `dist/server.node.ts`): Optimized entrypoint.
- `dist/server.bun.ts.map` (or `dist/server.node.ts.map`): Source map of the artifact.
- `dist/manifest.json`: Target, artifact, route analyses, diagnostics (`NELY001`/`NELY002`), `generation` (`standalone`|`adapter`), `reproducible: true`, and content-addressed `cacheKey`.
- `.nelysia-cache/<hash>.json`: Content-addressed build cache.

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

## 18. Supported Runtimes & Adapters

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

## 19. Full-Stack Framework Integrations

Nelysia integrates seamlessly into popular full-stack frameworks via `createFetchHandler` (see `examples/*` and `tests/framework-examples.test.ts`):

### Next.js (App Router Route Handler)

`app/api/[[...slug]]/route.ts`:
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

// Astro's endpoint method can use a Fetch-standard handler directly.
export const GET = createFetchHandler(app)
```

### TanStack Start (`src/routes/api/nelysia.ts`)

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

// Export the Fetch boundary for a TanStack Start server route to call.
export const fetchHandler = createFetchHandler(app)
```

---

## 20. Benchmarking & Soak Testing

Nelysia includes automated micro-benchmarks and memory soak runners.

### Running Benchmarks

```bash
# Benchmark on Node.js
npm run benchmark

# Benchmark on Bun (static GET /json)
npm run benchmark:bun

# Benchmark on Bun (dynamic GET /users/:id)
BENCH_CASE=dynamic npm run benchmark:bun
```

Configure runs with environment variables (default repeats: 3):

```bash
BENCH_DURATION_MS=3000 BENCH_CONCURRENCY=10 BENCH_REPEATS=10 npm run benchmark:bun
```

### Latest Results (10 Rounds, Concurrency 10, 0 Failures)

Full data: `docs/benchmark-10-rounds.md`.

| Bun workload | Nelysia | Elysia | Raw Bun |
| :--- | ---: | ---: | ---: |
| Static `GET /json` | **30,618 req/s** (0.33 ms) | 28,615 req/s (0.35 ms) | 29,625 req/s |
| Dynamic `GET /users/:id` | **28,991 req/s** (0.34 ms) | 28,125 req/s (0.35 ms) | 29,587 req/s |

> Local measurements only — not a universal performance claim. Re-run on target hardware before deployment decisions.

### Running Soak Tests

The soak test runs thousands of simulated requests to verify memory stability and detect potential heap leaks:

```bash
npm run soak
```

Output highlights:
- Total iterations completed
- Error counts
- Average throughput (RPS)
- Heap memory delta ($\Delta$ Heap)

---

## 21. Migration Guides

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

Nelysia adopts the familiar chainable design of Elysia, making migration nearly 1:1, while providing native Node.js support alongside Bun and compiler inspection.

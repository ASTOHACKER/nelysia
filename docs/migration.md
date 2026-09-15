# Migration Guides

## From Express

```ts
// Express
app.get("/users/:id", (request, response) => response.json({ id: request.params.id }))

// Nelysia
const app = new Nelysia().get("/users/:id", ({ params }) => ({ id: params.id }))
```

Nelysia handlers return values instead of calling `response.json`. Use `context.response(status, body)` for explicit status and headers.

## From Fastify

```ts
const app = new Nelysia()
  .post("/users", ({ body }) => body, { body: t.Object({ name: t.String() }) })
```

Fastify schemas map to Nelysia route options. Validation runs before the handler and the same schema metadata feeds OpenAPI.

## From Elysia

Nelysia was designed with a familiar chainable DX inspired by Elysia, but with key architectural distinctions for AOT optimization, V8 Monomorphic shape stability, and zero-polyfill dual-runtime (Node.js & Bun) performance.

### Quick Syntax & Architecture Comparison

| Feature / Pattern | ElysiaJS | Nelysia | Why Nelysia Differs |
| :--- | :--- | :--- | :--- |
| **State Injection** | `app.state('k', v)`<br>`app.decorate('db', db)`<br>→ `({ db, store }) => ...` | `context.store`<br>→ `({ store }) => { store.db = ... }` | Dynamic context object mutation breaks V8 hidden classes (Inline Cache de-optimization). `store` preserves monomorphic shapes. |
| **Sub-Apps** | `app.use(subApp)` | `app.mount('/prefix', subApp)` | Recommended separation: use `mount()` for prefixed routing trees and `use()` for plugins; legacy `use(subApp)` remains supported for compatibility. |
| **Route Grouping** | `app.group('/v1', (app) => ...)` | `app.group('/v1', (group) => ...)` | Identical DX. Group inherits parent lifecycle hooks (`onBeforeHandle`, etc.). |
| **Guards / Macros** | `.guard({ ... })`<br>`.macro({ ... })` | `app.group(prefix, (g) => { g.onBeforeHandle(...) })` | Explicit lifecycle hooks ensure predictable AOT dispatch compiler paths. |
| **Static Routes** | Generic handler `app.get('/ping', () => 'pong')` | `app.getStatic('/ping', 'pong')` or `app.get('/ping', () => 'pong')` | `getStatic()` is **`static-prebuilt`** (serialized once). A supported zero-argument `.get()` is **`static-sync`** and skips request-context allocation; unsupported handlers fall back to generic execution. |
| **Node.js Support** | Bun-first; requires `@bogeychan/elysia-polyfill` on Node.js | Native Node.js 22+ (`node:http`) + native Bun (`Bun.serve`) | Zero polyfill overhead. First-class citizen on both platforms. |
| **Multi-Core Scaling** | Requires external cluster manager (PM2) | `serveClustered(app, { port, instances: 'max' })` | Built-in Node.js cluster fork manager with graceful shutdown. |
| **Schema Validation** | TypeBox (`t`) | Built-in `t` + Standard Schema v1 (Zod, Valibot, ArkType) | Universal schema support without extra bridge plugins. |
| **TypeScript Contracts** | Framework-specific route inference | Default generics start at `{}`; `Context`/`RouteOptions` reject unknown keys and declared macros are typed | Typos such as `parmas`, `boddy`, or `jwtt` fail at compile time instead of silently widening the route contract. |
| **Cookies** | `({ cookie: { session } }) => ...` | `({ cookies, setCookie, deleteCookie }) => ...` | Simple explicit helpers, zero magic proxies. |
| **Responses** | `set.status = 201` / `return value` | `response(body, { status, headers })` or positional `response(status, body, headers)` | Both forms are supported; native `Response` and streams pass through. |
| **Errors** | `throw error(...)` / framework error helpers | `throw error(404, { message: "Not found" })` | Status and structured body stay together through the error lifecycle. |
| **Testing** | `app.handle()` / `inject()` | `app.inject()` plus route-aware `app.injectTyped()` | Method, path, request fields, and response JSON can be inferred from the route map. |
| **Typed Client** | Eden-style client or generated types | `createClient<typeof app>(baseUrl)` or `createTypedClient<RouteMap>()` | Path, params, body, query, headers, response, and error contracts are checked. |
| **JWT** | Plugin-specific `derive` / `beforeHandle` wiring | `.use(jwt<Claims>(...))` with `{ auth: "jwt" }` | Public routes skip auth work; protected routes expose typed `context.auth`. |
| **Server Metadata** | Runtime-specific server handle | `listen(..., ({ url, stop }) => ...)` | `ServerInfo.stop()` is normalized while the native `server` remains available. |
| **Lazy Modules** | Promise/plugin conventions vary | `.lazy(loader)` / `.mountLazy(prefix, loader)` | Explicit lazy forms are additive; `.use(Promise)` remains compatible. |
| **OPTIONS** | Framework/router-dependent fallback | Explicit `.options()` handler runs first; otherwise automatic `204 + Allow` | Makes preflight and custom OPTIONS behavior deterministic. |

### Code Migration Examples

#### 1. Mounting Sub-Apps vs Plugins

```ts
// ❌ Elysia: Overloaded use() for both plugins and sub-apps
import { Elysia } from 'elysia'
const users = new Elysia({ prefix: '/users' }).get('/', () => [])
const app = new Elysia()
  .use(users)

// ✅ Nelysia: Explicit mount() for sub-apps, use() for plugins
import { Nelysia } from '@narudom96/nelysia'
const users = new Nelysia().get('/', () => [])
const app = new Nelysia()
  .mount('/users', users) // mounts under /users
```

Nelysia still accepts `.use(subApp)` for existing applications, but `mount()` makes
the routing boundary and prefix explicit. Use `.use()` for plugin callbacks and
`.mount()` (or `.mountLazy()`) for sub-app routing trees.

#### 2. Context State & Decorators

```ts
// ❌ Elysia: Injected properties on context argument
app.decorate('db', database)
app.get('/items', ({ db }) => db.getItems())

// ✅ Nelysia: Access via context.store (V8 Monomorphic Safe)
app.onBeforeHandle(({ store }) => {
  store.db = database
})
app.get('/items', ({ store }) => store.db.getItems())
```

#### 3. Route Groups & Protected Scopes

```ts
// Elysia
app.group('/admin', (app) => 
  app.guard({ beforeHandle: authCheck }, (app) => 
    app.get('/dashboard', () => 'secret')
  )
)

// Nelysia
app.group('/admin', (admin) => {
  admin.onBeforeHandle(authCheck)
  admin.get('/dashboard', () => 'secret')
})
```

#### 4. Constant / Static Endpoints

```ts
// Elysia: Runs through normal handler pipeline
app.get('/health', () => ({ status: 'ok' }))

// Nelysia: Explicit prebuilt bytes (`static-prebuilt`)
app.getStatic('/health', { status: 'ok' })

// Nelysia: zero-argument handler (`static-sync` when the result is supported)
app.get('/health', () => ({ status: 'ok' }))
```

#### 5. Response and error helpers

```ts
import { Nelysia, error } from '@narudom96/nelysia'

const app = new Nelysia()
  // Body-first form; the old positional form remains valid:
  .get('/created', ({ response }) => response(
    { created: true },
    { status: 201, headers: { 'x-source': 'nelysia' } }
  ))
  .get('/missing', () => {
    throw error(404, { code: 'NOT_FOUND' })
  })
```

#### 6. Typed inject and client

```ts
import { Nelysia } from '@narudom96/nelysia'
import { createClient } from '@narudom96/nelysia/client'

const app = new Nelysia()
  .get('/users/:id', ({ params }) => ({ id: params.id }))

// Route-aware request and response inference:
const response = await app.injectTyped({ method: 'GET', path: '/users/42' })
const user = await response.json() // { id: string }

// Or pass the route pattern and let inject expand its typed params:
const expanded = await app.injectTyped({
  method: 'GET',
  path: '/users/:id',
  params: { id: '42' }
})

// The app itself can provide the same route map to the client:
const client = createClient<typeof app>('https://api.example.test')
const result = await client.get('/users/42')
```

`inject()` is route-aware for typed applications. Use the explicit
`injectUntyped()` escape hatch when a dynamic test intentionally does not use a
route map. `createTypedClient<RouteMap>()` remains available for generated or
manually declared maps.

#### 7. JWT, lazy modules, and server lifecycle

```ts
import { jwt } from '@narudom96/nelysia/jwt'

type Claims = { sub: string; role: 'admin' | 'user' }
const app = new Nelysia()
  .use(jwt<Claims>({ secret: process.env.JWT_SECRET! }))
  .get('/public', () => 'open')
  .get('/me', ({ auth, jwt }) => ({ subject: auth?.sub }), { auth: 'jwt' })
  .mountLazy('/reports', async () => import('./reports.ts').then((module) => module.app))

app.listen(3000, ({ url, stop }) => {
  console.log(`Listening at ${url}`)
  // await stop() during graceful shutdown
})
```

`auth: 'jwt'` is the compatibility spelling; registered strategy names and
boolean/object auth options remain supported. Explicit `.options('/path',
handler)` takes precedence over the automatic `204` response. Lifecycle hooks
can be marked `{ as: 'local' | 'scoped' | 'global' }` to control module and
subtree inheritance.

`derive()` and `resolve()` remain sync/async context-extension aliases. The JWT
package augments the typed `AuthStrategyRegistry` with the `jwt` strategy;
arbitrary legacy strategy strings remain accepted but are deprecated.

## Compatibility Rule

Migration examples describe the supported Nelysia contract. They do not promise that framework-specific middleware, decorators, or plugins can be copied without adaptation.

## Post-v0.5.1 additive APIs

The next roadmap keeps the v0.5.1 tag immutable and adds typed/context and
operational APIs before any future breaking release. Production concerns are
available as separate subpaths: `@narudom96/nelysia/session`,
`@narudom96/nelysia/roles`, `@narudom96/nelysia/csrf`,
`@narudom96/nelysia/cache`, and `@narudom96/nelysia/health`. See
[`roadmap-after-v051.md`](./roadmap-after-v051.md) for the milestone gates and
the explicit decision to defer the 24-hour soak.

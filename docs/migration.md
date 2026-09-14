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
| **Sub-Apps** | `app.use(subApp)` | `app.mount('/prefix', subApp)` | Clean separation: `use()` is strictly for plugin functions `(app) => app \| void`; `mount()` is for routing trees. |
| **Route Grouping** | `app.group('/v1', (app) => ...)` | `app.group('/v1', (group) => ...)` | Identical DX. Group inherits parent lifecycle hooks (`onBeforeHandle`, etc.). |
| **Guards / Macros** | `.guard({ ... })`<br>`.macro({ ... })` | `app.group(prefix, (g) => { g.onBeforeHandle(...) })` | Explicit lifecycle hooks ensure predictable AOT dispatch compiler paths. |
| **Static Routes** | Generic handler `app.get('/ping', () => 'pong')` | `app.getStatic('/ping', 'pong')` or `app.get('/ping', () => 'pong')` | `getStatic()` is **`static-prebuilt`** (serialized once). A supported zero-argument `.get()` is **`static-sync`** and skips request-context allocation; unsupported handlers fall back to generic execution. |
| **Node.js Support** | Bun-first; requires `@bogeychan/elysia-polyfill` on Node.js | Native Node.js 22+ (`node:http`) + native Bun (`Bun.serve`) | Zero polyfill overhead. First-class citizen on both platforms. |
| **Multi-Core Scaling** | Requires external cluster manager (PM2) | `serveClustered(app, { port, instances: 'max' })` | Built-in Node.js cluster fork manager with graceful shutdown. |
| **Schema Validation** | TypeBox (`t`) | Built-in `t` + Standard Schema v1 (Zod, Valibot, ArkType) | Universal schema support without extra bridge plugins. |
| **Cookies** | `({ cookie: { session } }) => ...` | `({ cookies, setCookie, deleteCookie }) => ...` | Simple explicit helpers, zero magic proxies. |

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

## Compatibility Rule

Migration examples describe the supported Nelysia contract. They do not promise that framework-specific middleware, decorators, or plugins can be copied without adaptation.

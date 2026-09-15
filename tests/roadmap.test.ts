import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia, error, t, type InjectResponseStatusesFor } from "../packages/core/src/index.ts"
import { compile, createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { createClient } from "../packages/client/src/index.ts"
import { jwt, signJwt, type JwtPayload } from "../packages/jwt/src/index.ts"
import { cache } from "../packages/cache/src/index.ts"
import { csrf } from "../packages/csrf/src/index.ts"
import { health } from "../packages/health/src/index.ts"
import { roles, requireRole } from "../packages/roles/src/index.ts"
import { session } from "../packages/session/src/index.ts"
import { rateLimit } from "../packages/plugins/src/index.ts"
import { timeout } from "../packages/timeout/src/index.ts"

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2) ? true : false
type Expect<Value extends true> = Value

const typedRouteApp = new Nelysia()
  .get("/users/:id", ({ params }) => ({ id: params.id, name: "Ada" }))
  .post("/users", ({ body }) => body, { body: t.Object({ name: t.String() }) })
type TypedRoutes = typeof typedRouteApp extends Nelysia<any, infer Routes, any> ? Routes : never
type _TypedResponse = Expect<Equal<TypedRoutes["GET /users/:id"]["response"], { id: string; name: string }>>

const inferredClient = createClient<typeof typedRouteApp>("https://api.example.test")
function inferredClientTypeChecks() {
  void inferredClient.get("/users/123")
  void inferredClient.post("/users", { name: "Ada" })
  // @ts-expect-error createClient derives known path contracts from typeof app
  void inferredClient.get("/missing")
  // @ts-expect-error body schema is enforced by the inferred client
  void inferredClient.post("/users", { displayName: "Ada" })
}
void inferredClientTypeChecks

async function routeAwareInjectTypeChecks() {
  const response = await typedRouteApp.inject({ method: "GET", path: "/users/42" })
  const body = await response.json()
  type _RouteAwareInjectResponse = Expect<Equal<typeof body, { id: string; name: string }>>
  void (null as unknown as _RouteAwareInjectResponse)
  // @ts-expect-error route-aware inject rejects paths absent from the route map
  await typedRouteApp.inject({ method: "GET", path: "/missing" })
}
void routeAwareInjectTypeChecks

const paramsInjectApp = new Nelysia()
  .get("/profiles/:id", ({ params }) => ({ id: params.id }), { params: t.Object({ id: t.String() }) })
  .get("/assets/*", ({ params }) => ({ asset: params["*"] }))
async function paramsInjectTypeChecks() {
  const response = await paramsInjectApp.injectTyped({ method: "GET", path: "/profiles/:id", params: { id: "42" } })
  const body = await response.json()
  type _ParamsInjectResponse = Expect<Equal<typeof body, { id: string }>>
  void (null as unknown as _ParamsInjectResponse)
  // @ts-expect-error route-aware inject rejects unknown path parameter keys
  await paramsInjectApp.injectTyped({ method: "GET", path: "/profiles/:id", params: { profileId: "42" } })
  const asset = await paramsInjectApp.injectTyped({ method: "GET", path: "/assets/*", params: { "*": "docs/readme.md" } })
  const assetBody = await asset.json()
  type _WildcardInjectResponse = Expect<Equal<typeof assetBody, { asset: string }>>
  void (null as unknown as _WildcardInjectResponse)
}
void paramsInjectTypeChecks

const macroApp = new Nelysia()
  .macro({ authenticated: { beforeHandle: () => undefined } })
  .get("/macro", () => "ok", { authenticated: true })
// @ts-expect-error only registered macro keys are accepted
macroApp.get("/macro-typo", () => "ok", { authenticted: true })

const composedMacroApp = new Nelysia()
  .macro({ authenticated: { beforeHandle: () => undefined } })
  .use((app) => app.get("/plugin", () => "ok"))
  .group("/v1", (group) => group.get("/group", () => "ok"))
  .guard({}, (guard) => guard.get("/guard", () => "ok"))
// @ts-expect-error composition must preserve macro keys declared on the parent
composedMacroApp.get("/composed-typo", () => "ok", { authenticted: true })
void composedMacroApp

const voidCompositionMacroApp = new Nelysia()
  .macro({ authenticated: { beforeHandle: () => undefined } })
  .group("/void", (group) => {
    group.get("/group", () => "ok", { authenticated: true })
  })
  .guard({}, (guard) => {
    guard.get("/guard", () => "ok", { authenticated: true })
  })
void voidCompositionMacroApp

const strictContextApp = new Nelysia().get("/strict", ({ params }) => params)
void strictContextApp
// @ts-expect-error Context intentionally has no broad index signature
new Nelysia().get("/typo", ({ parmas }) => parmas)

test("mounted modules preserve macro definitions for later parent routes", async () => {
  const child = new Nelysia()
    .macro({ tagged: { beforeHandle: ({ header }) => { header("x-macro", "yes") } } })
    .get("/child", () => "child", { tagged: true })

  const app = new Nelysia()
    .mount("/api", child)
    .get("/parent", () => "parent", { tagged: true })

  const childResponse = await app.inject({ method: "GET", path: "/api/child" })
  const parentResponse = await app.inject({ method: "GET", path: "/parent" })
  assert.equal(childResponse.headers.get("x-macro"), "yes")
  assert.equal(parentResponse.headers.get("x-macro"), "yes")
})

test("inject expands typed path parameters without changing existing path behavior", async () => {
  const expanded = await paramsInjectApp.injectTyped({ method: "GET", path: "/profiles/:id", params: { id: "a/b" } })
  const explicit = await paramsInjectApp.injectTyped({ method: "GET", path: "/profiles/explicit" })
  assert.deepEqual(expanded.body, { id: "a/b" })
  assert.deepEqual(explicit.body, { id: "explicit" })
  const wildcard = await paramsInjectApp.injectTyped({ method: "GET", path: "/assets/*", params: { "*": "docs/readme.md" } })
  assert.deepEqual(wildcard.body, { asset: "docs/readme.md" })
})

test("mount rejects conflicting macro definitions", () => {
  const parent = new Nelysia()
    .macro({ tagged: { beforeHandle: () => undefined } })
  const child = new Nelysia()
    .macro({ tagged: { beforeHandle: () => undefined } })

  assert.throws(() => parent.mount("/api", child), /Conflicting macro definition: tagged/)
})

const jwtTypeApp = new Nelysia()
  .use(jwt<{ sub: string; role: "admin" | "user" }>({ secret: "test-secret-123456" }))
  .get("/me", ({ auth }) => ({ subject: auth.sub, role: auth.role }), { auth: "jwt" })
void jwtTypeApp

const statusTypeApp = new Nelysia()
  .get("/created", () => ({ id: "order-1" }), { response: { 201: t.Object({ id: t.String() }) } })
type StatusRoutes = typeof statusTypeApp extends Nelysia<any, infer Routes, any> ? Routes : never
type _StatusResponse = Expect<StatusRoutes["GET /created"]["response"] extends { id: string } ? true : false>
type _StatusMapKeys = Expect<Equal<keyof StatusRoutes["GET /created"]["responses"], "201" | 201>>
type _StatusMapValueShape = Expect<StatusRoutes["GET /created"]["responses"][201] extends { id: string } ? true : false>
type _InjectStatusKeys = Expect<Equal<keyof InjectResponseStatusesFor<StatusRoutes, { method: "GET"; path: "/created" }>, "201" | 201>>
type _InjectStatusValueShape = Expect<InjectResponseStatusesFor<StatusRoutes, { method: "GET"; path: "/created" }>[201] extends { id: string } ? true : false>
void (null as unknown as _StatusResponse)

async function statusInjectTypeChecks() {
  const response = await statusTypeApp.inject({ method: "GET", path: "/created" })
  const body = await response.json(201)
  type _StatusInjectResponse = Expect<Equal<typeof body, { id: string }>>
  void (null as unknown as _StatusInjectResponse)
  // @ts-expect-error the route did not document this response status
  await response.json(500)
  const typedResponse = await statusTypeApp.injectTyped({ method: "GET", path: "/created" })
  const typedBody = await typedResponse.json(201)
  type _TypedStatusInjectResponse = Expect<Equal<typeof typedBody, { id: string }>>
  void (null as unknown as _TypedStatusInjectResponse)
  // @ts-expect-error the typed route did not document this response status
  await typedResponse.json(500)
}
void statusInjectTypeChecks

test("typed inject validates a route map and infers response json", async () => {
  const response = await typedRouteApp.injectTyped({ method: "GET", path: "/users/42" })
  const body = await response.json()
  assert.deepEqual(body, { id: "42", name: "Ada" })
  type _InjectResponse = Expect<Equal<typeof body, { id: string; name: string }>>
  void (null as unknown as _InjectResponse)
})

test("named auth strategies fail fast when their provider is missing", () => {
  assert.throws(() => new Nelysia().get("/missing-auth", () => "nope", { auth: "jwt" }), /No auth provider registered/)
})

test("route metadata activates registered feature providers without double execution", async () => {
  let cachedRuns = 0
  const app = new Nelysia({ requestId: false })
    .use(rateLimit({ limit: 10, windowMs: 60_000 }))
    .use(cache({ ttlMs: 1_000 }))
    .use(timeout({ timeoutMs: 1_000 }))
    .get("/cached", () => ({ value: ++cachedRuns }), { cache: true })
    .get("/limited", () => "ok", { rateLimit: "1/m" })
    .get("/slow", async ({ signal }) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return signal.aborted ? "aborted" : "done"
    }, { timeout: 5 })
  const first = await app.inject({ method: "GET", path: "/cached" })
  const second = await app.inject({ method: "GET", path: "/cached" })
  assert.deepEqual(second.body, first.body)
  assert.equal(cachedRuns, 1)
  assert.equal((await app.inject({ method: "GET", path: "/limited" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/limited" })).status, 429)
  assert.equal((await app.inject({ method: "GET", path: "/slow" })).status, 504)
})

test("group metadata inherits with nearest-route precedence", async () => {
  const app = new Nelysia({ requestId: false })
    .use(rateLimit({ limit: 100, windowMs: 60_000 }))
    .group("/api", { rateLimit: "1/m" }, (group) => {
      group.get("/inherited", () => "ok")
      group.get("/override", () => "ok", { rateLimit: "2/m" })
      group.get("/disabled", () => "ok", { rateLimit: false })
    })
  assert.equal((await app.inject({ method: "GET", path: "/api/inherited" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/api/inherited" })).status, 429)
  assert.equal((await app.inject({ method: "GET", path: "/api/override" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/api/override" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/api/override" })).status, 429)
  assert.equal((await app.inject({ method: "GET", path: "/api/disabled" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/api/disabled" })).status, 200)
})

test("application metadata inherits through groups and preserves nearest overrides", async () => {
  const seen: unknown[] = []
  const app = new Nelysia({
    requestId: false,
    routeOptions: {
      rateLimit: "3/m",
      features: { audit: { application: true } }
    }
  })
    .registerRouteFeature("audit", {
      beforeHandle(value) {
        return () => { seen.push(value) }
      }
    })
    .use(rateLimit({ limit: 100, windowMs: 60_000 }))
    .group("/api", {
      rateLimit: "2/m",
      features: { audit: { group: true } }
    }, (group) => {
      group.get("/inherited", () => "inherited")
      group.get("/override", () => "override", {
        rateLimit: "1/m",
        features: { audit: { route: true } }
      })
      group.get("/disabled", () => "disabled", {
        rateLimit: false,
        features: { audit: false }
      })
    })

  const inherited = app.graph.routes.find((route) => route.path === "/api/inherited")
  const override = app.graph.routes.find((route) => route.path === "/api/override")
  const disabled = app.graph.routes.find((route) => route.path === "/api/disabled")
  assert.deepEqual(inherited?.metadata?.features.audit, { application: true, group: true })
  assert.equal(inherited?.metadata?.rateLimit, "2/m")
  assert.deepEqual(override?.metadata?.features.audit, { application: true, group: true, route: true })
  assert.equal(override?.metadata?.rateLimit, "1/m")
  assert.equal(disabled?.metadata?.features.audit, false)
  assert.equal(disabled?.metadata?.rateLimit, false)

  assert.equal((await app.inject({ method: "GET", path: "/api/inherited" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/api/override" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/api/disabled" })).status, 200)
  assert.deepEqual(seen, [
    { application: true, group: true },
    { application: true, group: true, route: true }
  ])
})

test("route metadata is normalized and custom providers fail fast", () => {
  const app = new Nelysia()
  assert.throws(() => app.get("/custom", () => "nope", { features: { audit: true } }), /No route feature provider registered.*audit/)

  const providerApp = new Nelysia()
    .registerRouteFeature("audit", { beforeHandle: () => () => undefined })
    .get("/custom", () => "ok", { features: { audit: { sampleRate: 1 } } })
  const route = providerApp.graph.routes[0]
  assert.deepEqual(route.metadata?.features, { audit: { sampleRate: 1 } })
})

test("state and decoration storage have separate canonical views", async () => {
  let decorationReads = 0
  const app = new Nelysia()
    .state("count", 3)
    .decorate("service", () => { decorationReads++; return "users" }, { enumerable: false, lazy: true })
    .get("/context", ({ store, service }) => ({ count: store.count, service, keys: Object.keys({ store, service }) }))
  const result = await app.inject({ method: "GET", path: "/context" })
  assert.deepEqual(result.body, { count: 3, service: "users", keys: ["store", "service"] })
  assert.equal(decorationReads, 1)
})

test("body-first response and error helpers preserve status, headers, and body", async () => {
  const app = new Nelysia()
    .get("/created", ({ response }) => response({ created: true }, { status: 201, headers: { "x-test": "yes" } }))
    .get("/number", ({ response }) => response(42, { status: 202 }))
    .get("/missing", () => error(404, { message: "missing" }))
  const created = await app.inject({ method: "GET", path: "/created" })
  assert.equal(created.status, 201)
  assert.equal(created.headers.get("x-test"), "yes")
  assert.deepEqual(created.body, { created: true })
  const number = await app.inject({ method: "GET", path: "/number" })
  assert.equal(number.status, 202)
  assert.equal(number.body, 42)
  const missing = await app.inject({ method: "GET", path: "/missing" })
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { message: "missing" })
})

test("explicit OPTIONS handlers run before automatic OPTIONS", async () => {
  let called = 0
  const app = new Nelysia()
    .get("/explicit", () => "get")
    .options("/explicit", () => { called++; return new Response("custom", { status: 200, headers: { allow: "custom" } }) })
  const response = await app.inject({ method: "OPTIONS", path: "/explicit" })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "custom")
  assert.equal(called, 1)
  const automatic = await new Nelysia().get("/automatic", () => "ok").injectUntyped({ method: "OPTIONS", path: "/automatic" })
  assert.equal(automatic.status, 204)
  assert.match(automatic.headers.get("allow") ?? "", /GET/)
})

test("lazy plugin loaders do not execute until the module boundary is awaited", async () => {
  let loaded = false
  const app = new Nelysia().lazy(() => {
    loaded = true
    return (instance: Nelysia) => instance.get("/lazy", () => "ready")
  })
  assert.equal(loaded, false)
  assert.equal((await app.injectUntyped({ method: "GET", path: "/lazy" })).body, "ready")
  assert.equal(loaded, true)
})

test("public JWT routes stay compiled while protected routes keep the guard", async () => {
  const app = new Nelysia({ requestId: false })
    .use(jwt({ secret: "test-secret-123456" }))
    .get("/public", () => "ok")
    .get("/private", ({ auth }) => ({ sub: auth?.sub }), { auth: "jwt" })
  const compiled = compile(app)
  assert.equal(compiled.analyses.find((route) => route.path === "/public")?.lane, "COMPILED")
  assert.equal(compiled.analyses.find((route) => route.path === "/private")?.lane, "GENERIC")
  const handler = createCompiledBunHandler(app)
  assert.equal(await (await handler(new Request("http://localhost/public"))).text(), "ok")
  assert.equal((await handler(new Request("http://localhost/private"))).status, 401)
})

test("generated GET schemas execute on the specialized adapter path and preserve 400 fallback", async () => {
  const app = new Nelysia({ requestId: false })
    .get("/search", ({ query }) => ({ value: query.q }), {
      query: t.Object({ q: t.String() }),
      response: t.Object({ value: t.String() })
    })
  const analysis = compile(app).analyses.find((route) => route.path === "/search")
  assert.equal(analysis?.lane, "SPECIALIZED")
  assert.match(analysis?.reason ?? "", /generated schema/i)

  const handler = createCompiledBunHandler(app)
  const valid = await handler(new Request("http://localhost/search?q=ready"))
  assert.equal(valid.status, 200)
  assert.deepEqual(await valid.json(), { value: "ready" })

  const invalid = await handler(new Request("http://localhost/search"))
  assert.equal(invalid.status, 400)
  assert.match(await invalid.text(), /required/)
})

test("protected zero-arg handlers cannot bypass the auth lane", async () => {
  const app = new Nelysia({ requestId: false })
    .use(jwt({ secret: "zero-arg-auth-secret-123456" }))
    .get("/private", () => "secret", { auth: "jwt" })
  const compiled = compile(app)
  assert.equal(compiled.analyses[0]?.lane, "GENERIC")
  const handler = createCompiledBunHandler(app)
  const response = await handler(new Request("http://localhost/private"))
  assert.equal(response.status, 401)
})

test("JWT route metadata narrows auth and enforces role/permission policy", async () => {
  const secret = "route-policy-secret-123456"
  const app = new Nelysia({ requestId: false })
    .use(jwt<{ sub: string; role: string; permissions: string[] }>({ secret }))
    .get("/admin", ({ auth }) => ({ sub: auth.sub }), {
      auth: { strategy: "jwt", role: "admin", permissions: ["users:read"] }
    })
  assert.equal((await app.inject({ method: "GET", path: "/admin" })).status, 401)
  const user = await signJwt({ sub: "u1", role: "user", permissions: ["users:read"] }, secret)
  assert.equal((await app.inject({ method: "GET", path: "/admin", headers: { authorization: `Bearer ${user}` } })).status, 403)
  const admin = await signJwt({ sub: "u2", role: "admin", permissions: ["users:read"] }, secret)
  const valid = await app.inject({ method: "GET", path: "/admin", headers: { authorization: `Bearer ${admin}` } })
  assert.equal(valid.status, 200)
  assert.deepEqual(valid.body, { sub: "u2" })
})

test("route role and permission metadata sees the registered roles resolver", async () => {
  const secret = "roles-provider-secret-123456"
  const app = new Nelysia({ requestId: false })
    .use(jwt<{ sub: string; role: string }>({ secret }))
    .use(roles({
      resolveRoles: ({ auth }) => {
        const role = (auth as { role?: string } | undefined)?.role
        return role === undefined ? [] : [role]
      },
      permissions: { "orders:read": ["admin"] }
    }))
    .get("/orders", ({ permissions }) => ({ allowed: permissions.can("orders:read") }), {
      auth: { strategy: "jwt", role: "admin", permissions: ["orders:read"] }
    })

  assert.equal((await app.inject({ method: "GET", path: "/orders" })).status, 401)
  const user = await signJwt({ sub: "u1", role: "user" }, secret)
  assert.equal((await app.inject({ method: "GET", path: "/orders", headers: { authorization: `Bearer ${user}` } })).status, 403)
  const admin = await signJwt({ sub: "u2", role: "admin" }, secret)
  const response = await app.inject({ method: "GET", path: "/orders", headers: { authorization: `Bearer ${admin}` } })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { allowed: true })
})

test("optional auth accepts anonymous requests but rejects invalid credentials", async () => {
  const secret = "optional-auth-secret-123456"
  const app = new Nelysia({ requestId: false })
    .use(jwt<{ sub: string }>({ secret }))
    .get("/optional", ({ auth }) => ({ sub: auth?.sub ?? null }), { auth: "optional" })
  assert.deepEqual((await app.inject({ method: "GET", path: "/optional" })).body, { sub: null })
  assert.equal((await app.inject({ method: "GET", path: "/optional", headers: { authorization: "Bearer invalid.token" } })).status, 401)
  const token = await signJwt({ sub: "u3" }, secret)
  assert.deepEqual((await app.inject({ method: "GET", path: "/optional", headers: { authorization: `Bearer ${token}` } })).body, { sub: "u3" })
})

test("session, roles, CSRF, cache, and health modules expose functional contracts", async () => {
  const sessionApp = new Nelysia()
    .use(session<{ userId: string }>({ ttlSeconds: 60 }))
    .get("/login", async ({ session }) => ({ id: await session.set({ userId: "u1" }) }))
    .get("/me", async ({ session }) => await session.get())
  const login = await sessionApp.inject({ method: "GET", path: "/login" })
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0]
  assert.ok(cookie)
  const me = await sessionApp.inject({ method: "GET", path: "/me", headers: { cookie: cookie! } })
  assert.deepEqual(me.body, { userId: "u1" })

  const roleApp = new Nelysia()
    .use(roles({ resolveRoles: ({ auth }) => {
      const role = (auth as { role?: string } | undefined)?.role
      return role ? [role] : []
    }, permissions: { "users:read": ["admin"] } }))
    .onBeforeHandle(requireRole("admin"))
    .get("/admin", ({ permissions }) => ({ canRead: permissions.can("users:read") }))
  assert.equal((await roleApp.inject({ method: "GET", path: "/admin" })).status, 403)

  const requireApp = new Nelysia()
    .use(roles({ resolveRoles: () => ["user"] }))
    .get("/require", ({ permissions }) => { permissions.require("admin"); return "ok" })
  assert.equal((await requireApp.inject({ method: "GET", path: "/require" })).status, 403)

  const csrfApp = new Nelysia().use(csrf()).get("/form", () => "form").post("/form", () => "saved")
  const form = await csrfApp.inject({ method: "GET", path: "/form" })
  const csrfCookie = form.headers.get("set-cookie")?.split(";", 1)[0]
  const csrfToken = csrfCookie?.split("=", 2)[1]
  assert.equal((await csrfApp.inject({ method: "POST", path: "/form", headers: { cookie: csrfCookie! } })).status, 403)
  assert.equal((await csrfApp.inject({ method: "POST", path: "/form", headers: { cookie: csrfCookie!, "x-csrf-token": csrfToken! } })).status, 200)

  let runs = 0
  const cached = new Nelysia().use(cache({ ttlMs: 1000 })).get("/value", () => ({ value: ++runs }))
  const first = await cached.inject({ method: "GET", path: "/value" })
  const second = await cached.inject({ method: "GET", path: "/value" })
  assert.deepEqual(second.body, first.body)
  assert.equal(runs, 1)
  const notModified = await cached.inject({ method: "GET", path: "/value", headers: { "if-none-match": first.headers.get("etag")! } })
  assert.equal(notModified.status, 304)

  const healthy = new Nelysia().use(health({ checks: { database: () => true } }))
  assert.deepEqual((await healthy.inject({ method: "GET", path: "/health" })).body, { status: "ok", checks: { database: true } })

  const degraded = new Nelysia().use(health({ checks: { database: () => ({ ok: false, reason: "offline" }) } }))
  assert.deepEqual((await degraded.inject({ method: "GET", path: "/health" })).body, { status: "degraded", checks: { database: { ok: false, reason: "offline" } } })
})

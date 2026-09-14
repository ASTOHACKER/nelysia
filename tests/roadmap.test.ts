import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia, error, t } from "../packages/core/src/index.ts"
import { compile, createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { createClient } from "../packages/client/src/index.ts"
import { jwt, type JwtPayload } from "../packages/jwt/src/index.ts"
import { cache } from "../packages/cache/src/index.ts"
import { csrf } from "../packages/csrf/src/index.ts"
import { health } from "../packages/health/src/index.ts"
import { roles, requireRole } from "../packages/roles/src/index.ts"
import { session } from "../packages/session/src/index.ts"

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

const macroApp = new Nelysia()
  .macro({ authenticated: { beforeHandle: () => undefined } })
  .get("/macro", () => "ok", { authenticated: true })
// @ts-expect-error only registered macro keys are accepted
macroApp.get("/macro-typo", () => "ok", { authenticted: true })

const strictContextApp = new Nelysia().get("/strict", ({ params }) => params)
void strictContextApp
// @ts-expect-error Context intentionally has no broad index signature
new Nelysia().get("/typo", ({ parmas }) => parmas)

const jwtTypeApp = new Nelysia()
  .use(jwt<{ sub: string; role: "admin" | "user" }>({ secret: "test-secret-123456" }))
  .get("/me", ({ auth }) => ({ subject: auth?.sub, role: auth?.role }), { auth: "jwt" })
jwtTypeApp.get("/legacy-auth", () => "nope", { auth: "jwtt" })

test("typed inject validates a route map and infers response json", async () => {
  const response = await typedRouteApp.injectTyped({ method: "GET", path: "/users/42" })
  const body = await response.json()
  assert.deepEqual(body, { id: "42", name: "Ada" })
  type _InjectResponse = Expect<Equal<typeof body, { id: string; name: string }>>
  void (null as unknown as _InjectResponse)
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
})

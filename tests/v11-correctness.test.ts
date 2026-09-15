import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia } from "../packages/core/src/index.ts"
import { jwt } from "../packages/jwt/src/index.ts"
import { createBunHandler } from "../packages/runtime-bun/src/handler.ts"
import { createFetchHandler } from "../packages/runtime-fetch/src/server.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"
import { matchSingleDynamicUrl } from "../packages/compiler/src/dispatcher.ts"
import { compression } from "../packages/plugins/src/index.ts"
import { health } from "../packages/health/src/index.ts"

test("Bun parses bodies without content-length and supports case-insensitive +json", async () => {
  const app = new Nelysia().post("/body", ({ body }) => body)
  const handler = createBunHandler(app)
  const upper = await handler(new Request("http://local/body", { method: "POST", headers: { "content-type": "Application/JSON" }, body: JSON.stringify({ ok: true }) }))
  assert.deepEqual(await upper.json(), { ok: true })
  const vendor = await handler(new Request("http://local/body", { method: "POST", headers: { "content-type": "application/vnd.api+json" }, body: JSON.stringify({ vendor: true }) }))
  assert.deepEqual(await vendor.json(), { vendor: true })
})

test("all adapters run auth before consuming a protected body", async (t) => {
  const app = new Nelysia().use(jwt({ secret: "v11-secret" })).post("/protected", ({ body }) => body, { auth: "jwt" })
  const malformed = new Request("http://local/protected", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })
  assert.equal((await createBunHandler(app)(malformed)).status, 401)
  const fetchRequest = new Request("http://local/protected", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })
  assert.equal((await createFetchHandler(app)(fetchRequest)).status, 401)
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const nodeResponse = await fetch(`http://127.0.0.1:${address.port}/protected`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })
  assert.equal(nodeResponse.status, 401)
})

test("Fetch mounts win over compiled route lookup", async () => {
  const app = new Nelysia()
    .mount("/api", (request) => new Response(`mounted:${new URL(request.url).pathname}`, { status: 202 }))
    .get("/api/health", () => "route")
  const response = await createFetchHandler(app)(new Request("http://local/api/health"))
  assert.equal(response.status, 202)
  assert.equal(await response.text(), "mounted:/api/health")
})

test("static native responses can be requested repeatedly", async () => {
  const app = new Nelysia({ requestId: false }).getStatic("/native", new Response("ok", { status: 201, headers: { "x-native": "yes" } }))
  const handler = createBunHandler(app)
  for (let index = 0; index < 2; index++) {
    const response = await handler(new Request("http://local/native"))
    assert.equal(response.status, 201)
    assert.equal(response.headers.get("x-native"), "yes")
    assert.equal(await response.text(), "ok")
  }
})

test("relative single dynamic URLs are matched without a URL allocation", () => {
  const entry = { prefixFast: { prefix: "/users/", paramName: "id" } }
  assert.deepEqual(matchSingleDynamicUrl(entry, "/users/42?x=1"), { id: "42" })
  assert.deepEqual(matchSingleDynamicUrl(entry, "http://localhost/users/42"), { id: "42" })
})

test("compression honors q=0 and preserves content type/vary", async () => {
  const app = new Nelysia().get("/data", () => ({ hello: "world" })).onAfterHandle((_context, result) => { result.headers.set("vary", "Origin") }).use(compression())
  const refused = await app.inject({ method: "GET", path: "/data", headers: { "accept-encoding": "gzip;q=0" } })
  assert.equal(refused.headers.get("content-encoding"), null)
  const accepted = await app.inject({ method: "GET", path: "/data", headers: { "accept-encoding": "gzip" } })
  assert.equal(accepted.headers.get("content-encoding"), "gzip")
  assert.match(accepted.headers.get("content-type") ?? "", /application\/json/)
  assert.match(accepted.headers.get("vary") ?? "", /Accept-Encoding/i)
  assert.match(accepted.headers.get("vary") ?? "", /Origin/i)
})

test("readiness returns 503 and health errors are redacted by default", async () => {
  const app = new Nelysia().use(health({ checks: { database: () => { throw new Error("postgres://user:secret") } } }))
  const healthResponse = await app.inject({ method: "GET", path: "/health" })
  assert.deepEqual(healthResponse.body, { status: "degraded", checks: { database: { ok: false } } })
  const readyResponse = await app.inject({ method: "GET", path: "/ready" })
  assert.equal(readyResponse.status, 503)
  assert.doesNotMatch(JSON.stringify(readyResponse.body), /secret/)
})

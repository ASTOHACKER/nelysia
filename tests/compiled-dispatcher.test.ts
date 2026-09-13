import { test } from "node:test"
import assert from "node:assert/strict"
import { Nelysia, t } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { compileDispatcher, lookupCompiled } from "../packages/compiler/src/dispatcher.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"
import { createFetchHandler } from "../packages/runtime-fetch/src/server.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"

function buildApp(): Nelysia {
  return new Nelysia({ requestId: false })
    .getStatic("/json", { ok: true })
    .get("/text", "hello")
    .get("/users/:id", ({ params }) => ({ id: params.id }))
    .get("/multi/:a/:b", ({ params }) => ({ a: params.a, b: params.b }))
    .get("/full/:id", ({ params, query }) => ({ id: params.id, q: query.get("q") }))
    .post("/users", ({ body }) => body)
}

const cases = [
  "GET http://localhost/json",
  "GET http://localhost/json/",
  "GET http://localhost/text",
  "GET http://localhost/users/42",
  "GET http://localhost/users/42/",
  "GET http://localhost/users/hello%20world",
  "GET http://localhost/multi/1/2",
  "GET http://localhost/full/7?q=x",
  "GET http://localhost/nope",
  "POST http://localhost/json",
  "POST http://localhost/users",
  "OPTIONS http://localhost/json",
  "HEAD http://localhost/json",
]

test("compiled Bun handler matches generic execution (status + body)", async () => {
  const app = buildApp()
  const compiled = createCompiledBunHandler(app)
  const generic = createBunHandler(app)
  for (const item of cases) {
    const [method, url] = item.split(" ")
    const [fast, slow] = await Promise.all([compiled(new Request(url, { method })), generic(new Request(url, { method }))])
    assert.equal(fast.status, slow.status, `${item} status`)
    assert.equal(await fast.text(), await slow.text(), `${item} body`)
  }
})

test("dispatcher groups dynamics per method and keeps statics O(1)", async () => {
  const own = buildApp()
  const d = compileDispatcher(own)
  assert.equal(d.staticMap.get("/json")?.route.path, "/json")
  assert.equal(d.staticMap.get("/text")?.route.path, "/text")
  const found = lookupCompiled(d, "/users/42")
  assert.equal(found?.kind, "params")
  assert.deepEqual((found as { params: unknown }).params, { id: "42" })
  assert.equal(lookupCompiled(d, "/nope"), undefined)
})

test("hooked and schema routes fall back to generic execution", async () => {
  const app = buildApp()
    .onBeforeHandle(() => {})
    .get("/hooked", () => "hooked")
  const withSchema = new Nelysia({ requestId: false }).get("/v/:id", ({ params }) => params, {
    params: t.Object({ id: t.String() }),
  })
  for (const candidate of [app, withSchema]) {
    const compiled = createCompiledBunHandler(candidate)
    const generic = createBunHandler(candidate)
    const path = candidate === app ? "/hooked" : "/v/1"
    const [fast, slow] = await Promise.all([
      compiled(new Request(`http://localhost${path}`)),
      generic(new Request(`http://localhost${path}`)),
    ])
    assert.equal(fast.status, slow.status)
    assert.equal(await fast.text(), await slow.text())
  }
})

test("single non-serialized static route no longer matches every path", async () => {
  const app = new Nelysia({ requestId: false }).get("/only", () => "x")
  const handler = createCompiledBunHandler(app)
  assert.equal((await handler(new Request("http://localhost/only"))).status, 200)
  assert.equal((await handler(new Request("http://localhost/other"))).status, 404)
})

test("compiled Node server matches generic execution over HTTP", async (t) => {
  const hooked = new Nelysia().onBeforeHandle(() => {}).get("/hooked", () => "hooked")
  const app = new Nelysia()
    .getStatic("/json", { ok: true })
    .get("/text", "hello")
    .get("/users/:id", ({ params }) => ({ id: params.id }))
    .post("/users", ({ body }) => body)
    .mount("/", hooked)
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const url = `http://127.0.0.1:${address.port}`

  // Fast paths: static-prebuilt, static-prebuilt(value), params.
  const json = await fetch(`${url}/json`)
  assert.equal(json.status, 200)
  assert.deepEqual(await json.json(), { ok: true })
  assert.match(json.headers.get("content-type") ?? "", /application\/json/)
  assert.match(json.headers.get("x-request-id") ?? "", /^.+$/)

  const text = await fetch(`${url}/text`)
  assert.equal(await text.text(), "hello")
  assert.match(text.headers.get("content-type") ?? "", /text\/plain/)

  const user = await fetch(`${url}/users/42`)
  assert.deepEqual(await user.json(), { id: "42" })

  // Generic fallbacks: hooks, POST body, 404/405/OPTIONS, HEAD.
  assert.equal((await fetch(`${url}/hooked`)).status, 200)
  const posted = await fetch(`${url}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada" }),
  })
  assert.deepEqual(await posted.json(), { name: "Ada" })
  assert.equal((await fetch(`${url}/nope`)).status, 404)
  assert.equal((await fetch(`${url}/json`, { method: "POST" })).status, 405)
  assert.equal((await fetch(`${url}/json`, { method: "OPTIONS" })).status, 204)
  const head = await fetch(`${url}/json`, { method: "HEAD" })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), "")
})

test("compiled Node server skips request IDs when disabled", async (t) => {
  const app = new Nelysia({ requestId: false }).getStatic("/json", { ok: true })
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/json`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("x-request-id"), null)
  assert.deepEqual(await response.json(), { ok: true })
})

test("compiled Fetch handler matches generic execution", async () => {
  const app = new Nelysia()
    .getStatic("/json", { ok: true })
    .get("/users/:id", ({ params }) => ({ id: params.id }))
    .post("/users", ({ body }) => body)
  const handler = createFetchHandler(app)
  const json = await handler(new Request("http://localhost/json"))
  assert.equal(json.status, 200)
  assert.deepEqual(await json.json(), { ok: true })
  assert.match(json.headers.get("content-type") ?? "", /application\/json/)
  assert.match(json.headers.get("x-request-id") ?? "", /^req-/)

  const echoed = await handler(new Request("http://localhost/json", { headers: { "x-request-id": "edge-1" } }))
  assert.equal(echoed.headers.get("x-request-id"), "edge-1")

  const user = await handler(new Request("http://localhost/users/42"))
  assert.deepEqual(await user.json(), { id: "42" })

  const posted = await handler(new Request("http://localhost/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada" }),
  }))
  assert.deepEqual(await posted.json(), { name: "Ada" })
  assert.equal((await handler(new Request("http://localhost/nope"))).status, 404)
})

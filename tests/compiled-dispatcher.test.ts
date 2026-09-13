import { test } from "node:test"
import assert from "node:assert/strict"
import { Nelysia, t } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { compileDispatcher, lookupCompiled } from "../packages/compiler/src/dispatcher.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"

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

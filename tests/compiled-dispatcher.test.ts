import { test } from "node:test"
import assert from "node:assert/strict"
import { Nelysia, t } from "../packages/core/src/index.ts"
import { compile, createCompiledBunHandler, generateBuildArtifact } from "../packages/compiler/src/index.ts"
import { compileDispatcher, createGeneratedValidator, lookupCompiled } from "../packages/compiler/src/dispatcher.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"
import { createFetchHandler } from "../packages/runtime-fetch/src/server.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"

function buildApp(): Nelysia<any, any, any> {
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

test("multi-route zero-arg static functions use static-sync without context allocation", async () => {
  let receivedArguments = -1
  const app = new Nelysia({ requestId: false })
    .get("/json", function () {
      receivedArguments = arguments.length
      return { message: "hello", value: 42 }
    })
    .get("/users/:id", ({ params }) => ({ id: params.id }))
  const dispatcher = compileDispatcher(app)
  assert.equal(dispatcher.staticFunctionMap.get("/json")?.route.path, "/json")
  assert.equal(lookupCompiled(dispatcher, "/json")?.kind, "static-sync")
  assert.equal(lookupCompiled(dispatcher, "/json/")?.kind, "static-sync")

  const response = await createCompiledBunHandler(app)(new Request("http://localhost/json"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { message: "hello", value: 42 })
  assert.equal(receivedArguments, 0)
})

test("zero-arg static function fast path preserves async, native, stream, and error results", async () => {
  let errorCalls = 0
  const app = new Nelysia({ requestId: false })
    .get("/async", async () => ({ ok: true }))
    .get("/text", () => "hello")
    .get("/bytes", () => new TextEncoder().encode("bytes"))
    .get("/native", () => new Response("native", { status: 201, headers: { "x-native": "yes" } }))
    .get("/stream", () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("stream"))
        controller.close()
      }
    })))
    .get("/error", () => {
      errorCalls++
      throw new Error("boom")
    })
  const handler = createCompiledBunHandler(app)

  const asyncResponse = await handler(new Request("http://localhost/async"))
  assert.deepEqual(await asyncResponse.json(), { ok: true })
  assert.equal(await (await handler(new Request("http://localhost/text"))).text(), "hello")
  assert.equal(await (await handler(new Request("http://localhost/bytes"))).text(), "bytes")
  const native = await handler(new Request("http://localhost/native"))
  assert.equal(native.status, 201)
  assert.equal(native.headers.get("x-native"), "yes")
  assert.equal(await native.text(), "native")
  const stream = await handler(new Request("http://localhost/stream"))
  assert.equal(await stream.text(), "stream")
  const error = await handler(new Request("http://localhost/error"))
  assert.equal(error.status, 500)
  assert.match(await error.text(), /Internal Server Error/)
  assert.equal(errorCalls, 1)
})

test("hooked routes fall back while deterministic schema routes use generated validation", async () => {
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

test("generated query and response schemas preserve validation parity", async () => {
  const app = new Nelysia({ requestId: false })
    .get("/search", ({ query }) => ({ term: query.term }), {
      query: t.Object({ term: t.String() }),
      response: t.Object({ term: t.String() })
    })
  const dispatcher = compileDispatcher(app)
  assert.equal(dispatcher.routes.length, 1)
  assert.ok(dispatcher.routes[0].generated?.query)
  assert.ok(dispatcher.routes[0].generated?.response)

  const compiled = createCompiledBunHandler(app)
  const valid = await compiled(new Request("http://localhost/search?term=ok"))
  assert.equal(valid.status, 200)
  assert.deepEqual(await valid.json(), { term: "ok" })
  const invalid = await compiled(new Request("http://localhost/search"))
  assert.equal(invalid.status, 400)
  assert.match(await invalid.text(), /body\.term is required|body\.term must be string/)

  const artifact = generateBuildArtifact({ entry: "./app.ts", target: "bun", compiled: compile(app) })
  assert.ok(artifact.manifest.diagnostics.some((diagnostic) => diagnostic.code === "NELY002"))
})

test("generated allOf validators preserve merged object output and safe keys", () => {
  const schema = t.Intersect([
    t.Object({ id: t.String() }),
    t.Object({ role: t.String() })
  ])
  const generated = createGeneratedValidator(schema.definition!)
  assert.deepEqual(generated.validate({ id: "1", role: "admin" }), { id: "1", role: "admin" })
})

test("extended application lifecycle disables compiled fast paths", async () => {
  const app = new Nelysia({ requestId: false })
    .onRequest((_request) => new Response("intercepted", { status: 202 }))
    .getStatic("/hot", "should-not-run")
  const handler = createCompiledBunHandler(app)
  const response = await handler(new Request("http://localhost/hot"))
  assert.equal(response.status, 202)
  assert.equal(await response.text(), "intercepted")
})

test("mounted response lifecycle hooks force compiled parity fallback", async () => {
  const child = new Nelysia().mapResponse((_context, response) => ({ wrapped: response.body })).get("/value", () => "value")
  const app = new Nelysia({ requestId: false }).mount("/feature", child)
  const compiled = createCompiledBunHandler(app)
  const generic = createBunHandler(app)
  const [fast, slow] = await Promise.all([
    compiled(new Request("http://localhost/feature/value")),
    generic(new Request("http://localhost/feature/value"))
  ])
  const [fastBody, slowBody] = await Promise.all([fast.text(), slow.text()])
  assert.equal(fastBody, slowBody)
  assert.deepEqual(JSON.parse(fastBody), { wrapped: "value" })
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

test("Node and Fetch static function paths do not execute native handlers twice", async (t) => {
  let nodeCalls = 0
  const nodeApp = new Nelysia({ requestId: false })
    .get("/native", () => {
      nodeCalls++
      return new Response("native-node", { status: 201, headers: { "x-native": "node" } })
    })
    .get("/json", () => ({ ok: true }))
  const nodeServer = createNodeServer(nodeApp)
  await new Promise<void>((resolve) => nodeServer.listen(0, resolve))
  t.after(() => nodeServer.close())
  const address = nodeServer.address()
  assert.ok(address && typeof address === "object")
  const nodeResponse = await fetch(`http://127.0.0.1:${address.port}/native`)
  assert.equal(nodeResponse.status, 201)
  assert.equal(nodeResponse.headers.get("x-native"), "node")
  assert.equal(await nodeResponse.text(), "native-node")
  assert.equal(nodeCalls, 1)

  let fetchCalls = 0
  const fetchApp = new Nelysia({ requestId: false }).get("/native", () => {
    fetchCalls++
    return new Response("native-fetch", { status: 202, headers: { "x-native": "fetch" } })
  })
  const fetchResponse = await createFetchHandler(fetchApp)(new Request("http://localhost/native"))
  assert.equal(fetchResponse.status, 202)
  assert.equal(fetchResponse.headers.get("x-native"), "fetch")
  assert.equal(await fetchResponse.text(), "native-fetch")
  assert.equal(fetchCalls, 1)
})

test("compiled and generic handlers stay equivalent across fallback boundaries", async () => {
  const app = new Nelysia({ requestId: false })
    .get("/wild/*", ({ params }) => params["*"])
    .get("/schema/:id", ({ params }) => ({ id: params.id }), { params: t.Object({ id: t.String() }) })
    .get("/native", () => new Response("native", { status: 201, headers: { "x-native": "yes" } }))
    .get("/stream", () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("stream")); controller.close() } })))
  const compiled = createCompiledBunHandler(app)
  const generic = createBunHandler(app)
  const requests = [
    new Request("http://localhost/wild/a/b"),
    new Request("http://localhost/schema/42"),
    new Request("http://localhost/schema/42", { method: "HEAD" }),
    new Request("http://localhost/schema/42", { method: "OPTIONS" }),
    new Request("http://localhost/schema/42", { method: "POST" }),
    new Request("http://localhost/native"),
    new Request("http://localhost/stream")
  ]
  for (const request of requests) {
    const [fast, slow] = await Promise.all([compiled(request.clone()), generic(request)])
    assert.equal(fast.status, slow.status, `${request.method} ${request.url} status`)
    assert.equal(await fast.text(), await slow.text(), `${request.method} ${request.url} body`)
    for (const [name, value] of slow.headers) assert.equal(fast.headers.get(name), value, `${request.method} ${request.url} header ${name}`)
  }
})

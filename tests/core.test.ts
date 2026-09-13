import assert from "node:assert/strict"
import test from "node:test"
import { gracefulShutdown, HttpError, Nelysia, t } from "../packages/core/src/index.ts"
import { compile, createCompiledBunHandler, inspect } from "../packages/compiler/src/index.ts"
import { generateClientTypes, generateOpenAPI, openapi, openapiUi } from "../packages/openapi/src/index.ts"
import { compression, rateLimit, staticFile } from "../packages/plugins/src/index.ts"
import { otlpHttpExporter } from "../packages/observability/src/index.ts"
import { createFetchHandler } from "../packages/runtime-fetch/src/server.ts"
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql"
import { graphqlPlugin } from "../packages/integrations-graphql/src/index.ts"
import { createVercelHandler } from "../packages/runtime-vercel/src/index.ts"
import { createCloudflareHandler, createCloudflareWorker } from "../packages/runtime-cloudflare/src/index.ts"
// @ts-ignore
import { drizzleRoute } from "../packages/integrations-drizzle/src/index.ts"
import { betterAuthPlugin } from "../packages/integrations-better-auth/src/index.ts"

function createApp() {
  return new Nelysia()
    .get("/", () => "Hello Nelysia")
    .get("/users/:id", ({ params }) => ({ id: params.id }))
}

test("matches static and parameter routes", async () => {
  const app = createApp()
  assert.deepEqual((await app.handle({ method: "GET", url: "/" })).body, "Hello Nelysia")
  assert.deepEqual((await app.handle({ method: "GET", url: "/users/a%2Fb" })).body, { id: "a/b" })
  assert.equal((await app.handle({ method: "GET", url: "/missing" })).status, 404)
})

test("registers websocket routes without affecting HTTP routing", async () => {
  const events: string[] = []
  const app = new Nelysia().websocket("/events", {
    open: () => { events.push("open") }
  }).get("/events", () => "http")
  assert.equal(app.websocketRoutes.length, 1)
  assert.equal(app.websocketRoutes[0]?.path, "/events")
  assert.equal((await app.handle({ method: "GET", url: "/events" })).body, "http")
  assert.deepEqual(events, [])
})

test("preserves hook order and early responses", async () => {
  const events: string[] = []
  const app = new Nelysia()
    .onBeforeHandle(() => { events.push("hook-1") })
    .onBeforeHandle(({ response }) => { events.push("hook-2"); return response(202, "accepted") })
    .get("/", () => { events.push("handler"); return "never" })
  const result = await app.handle({ method: "GET", url: "/" })
  assert.equal(result.status, 202)
  assert.deepEqual(events, ["hook-1", "hook-2"])
})

test("applies hooks added after route registration without misclassifying JSON", async () => {
  const events: string[] = []
  const app = new Nelysia().get("/", () => ({ status: "data", headers: "data", body: "data" }))
  app.onBeforeHandle(() => { events.push("hook") })
  const result = await app.handle({ method: "GET", url: "/" })
  assert.deepEqual(events, ["hook"])
  assert.deepEqual(result.body, { status: "data", headers: "data", body: "data" })
})

test("compiled application has parity with reference execution", async () => {
  const app = createApp()
  const compiled = compile(app)
  for (const request of [{ method: "GET", url: "/" }, { method: "GET", url: "/users/42" }, { method: "GET", url: "/nope" }]) {
    assert.deepEqual(await compiled.handle(request), await app.handle(request))
  }
  assert.match(inspect(compiled), /GET \/users\/:id\n  Execution: GENERIC/)
})

test("compiled Bun handler specializes context-free static routes", async () => {
  const app = new Nelysia().getStatic("/json", { ok: true })
  const handler = createCompiledBunHandler(app)
  const response = await handler(new Request("http://localhost/json"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.match(inspect(compile(app)), /GET \/json\n  Execution: COMPILED/)
})

test("compiled Bun handler preserves parameter context", async () => {
  const app = new Nelysia().get("/users/:id", ({ params }) => ({ id: params.id }))
  const handler = createCompiledBunHandler(app)
  const response = await handler(new Request("http://localhost/users/42"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { id: "42" })
})

test("supports plugin, schemas, after hooks, and error handlers", async () => {
  const events: string[] = []
  const app = new Nelysia()
    .use((instance) => instance.onBeforeHandle(() => { events.push("plugin") }))
    .onAfterHandle((_context, result) => { events.push(`after:${result.status}`) })
    .onError((error, context) => context.response(418, { error: (error as Error).message }))
    .get("/users/:id", ({ params, query }) => ({ id: params.id, name: (query as unknown as Record<string, string>).name }), {
      params: t.Object({ id: t.String() }),
      query: t.Object({ name: t.String() })
    })
  const result = await app.handle({ method: "GET", url: "/users/42?name=Ada" })
  assert.deepEqual(result.body, { id: "42", name: "Ada" })
  assert.deepEqual(events, ["plugin", "after:200"])
})

test("routes errors through onError", async () => {
  const app = new Nelysia()
    .onError((error, context) => context.response(400, { message: (error as Error).message }))
    .get("/", () => { throw new Error("broken") })
  const result = await app.handle({ method: "GET", url: "/" })
  assert.equal(result.status, 400)
  assert.deepEqual(result.body, { message: "broken" })
})

test("onError automatically adopts HttpError status when returning plain object", async () => {
  const app = new Nelysia()
    .onError((error) => ({ error: (error as Error).message }))
    .get("/fail-422", () => { throw new HttpError(422, "Invalid entity") })
    .get("/fail-500", () => { throw new Error("Unexpected crash") })

  const res422 = await app.handle({ method: "GET", url: "/fail-422" })
  assert.equal(res422.status, 422)
  assert.deepEqual(res422.body, { error: "Invalid entity" })

  const res500 = await app.handle({ method: "GET", url: "/fail-500" })
  assert.equal(res500.status, 500)
  assert.deepEqual(res500.body, { error: "Unexpected crash" })
})

test("unhandled HttpError returns structured response with error.status", async () => {
  const app = new Nelysia()
    .get("/unhandled", () => { throw new HttpError(403, "Forbidden resource") })
  const res = await app.handle({ method: "GET", url: "/unhandled" })
  assert.equal(res.status, 403)
  assert.deepEqual(res.body, { error: "Forbidden resource" })
})

test("provides ergonomic proxy access to context.query while preserving URLSearchParams methods", async () => {
  const app = new Nelysia()
    .get("/search", ({ query }) => {
      const { category, q } = query
      return {
        category,
        q,
        rawCategory: query.get("category"),
        hasQ: query.has("q"),
      }
    })
  const result = await app.handle({ method: "GET", url: "/search?category=hardware&q=board" })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, {
    category: "hardware",
    q: "board",
    rawCategory: "hardware",
    hasQ: true,
  })
})

test("supports setting response status and headers via context.set", async () => {
  const app = new Nelysia()
    .post("/items", ({ body, set }) => {
      set.status = 201
      set.headers["x-custom-engine"] = "nelysia"
      return { created: true, body }
    })
  const result = await app.handle({
    method: "POST",
    url: "/items",
    body: { name: "Keyboard" },
  })
  assert.equal(result.status, 201)
  assert.deepEqual(result.body, { created: true, body: { name: "Keyboard" } })
  assert.equal(result.headers.get("x-custom-engine"), "nelysia")
})

test("supports static value handlers", async () => {
  const app = new Nelysia()
    .get("/text", "hello")
    .get("/json", { ok: true })
  assert.equal((await app.handle({ method: "GET", url: "/text" })).body, "hello")
  assert.deepEqual((await app.handle({ method: "GET", url: "/json" })).body, { ok: true })
})

test("supports Standard Schema and response validation", async () => {
  const standardString = {
    "~standard": {
      version: 1 as const,
      validate(value: unknown) {
        return typeof value === "object" && value !== null ? { value } : { issues: [{ message: "must be object" }] }
      }
    }
  }
  const app = new Nelysia()
    .get("/name", () => "Ada", { query: standardString, response: t.String() })
  const result = await app.handle({ method: "GET", url: "/name?value=ok" })
  assert.equal(result.body, "Ada")
})

test("generates OpenAPI paths from route schemas", () => {
  const app = new Nelysia().post("/users", ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })
  const document = generateOpenAPI(app, { title: "Test API" })
  assert.equal(document.info.title, "Test API")
  assert.ok(document.paths["/users"].post)
})

test("OpenAPI plugin serves a live document", async () => {
  const app = new Nelysia().get("/users/:id", ({ params }) => params.id).use(openapi({ title: "Live API" }))
  const result = await app.handle({ method: "GET", url: "/openapi.json" })
  assert.equal((result.body as { info: { title: string } }).info.title, "Live API")
  assert.ok((result.body as { paths: Record<string, unknown> }).paths["/users/:id"])
})

test("OpenAPI UI serves the generated document and client types reflect routes", async () => {
  const app = new Nelysia().get("/users", () => []).use(openapi({ path: "/schema" })).use(openapiUi({ specPath: "/schema" }))
  const page = await app.handle({ method: "GET", url: "/docs" })
  assert.equal(page.status, 200)
  assert.match(String(page.body), /spec-url=\"\/schema\"/)
  assert.match(page.headers.get("content-type") ?? "", /text\/html/)
  assert.match(generateClientTypes(app), /GET \"\/users\"/)
})

test("supports cookies and telemetry callbacks", async () => {
  const events: string[] = []
  const app = new Nelysia({
    telemetry: {
      onRequest: () => { events.push("request") },
      onResponse: () => { events.push("response") }
    }
  }).get("/", ({ cookies, setCookie }) => {
    setCookie("session", "new", { httpOnly: true, path: "/" })
    return { previous: cookies.session ?? null }
  })
  const result = await app.handle({ method: "GET", url: "/", headers: new Headers({ cookie: "session=old" }) })
  assert.deepEqual(result.body, { previous: "old" })
  assert.match(result.headers.get("set-cookie") ?? "", /session=new/)
  assert.deepEqual(events, ["request", "response"])
})

test("propagates a request ID through context, telemetry, and response", async () => {
  let observed = ""
  const app = new Nelysia({ telemetry: { onRequest: (context) => { observed = context.requestId } } })
    .get("/", ({ requestId }) => requestId)
  const result = await app.handle({ method: "GET", url: "/", headers: new Headers({ "x-request-id": "client-123" }) })
  assert.equal(observed, "client-123")
  assert.equal(result.body, "client-123")
  assert.equal(result.headers.get("x-request-id"), "client-123")
})

test("trusts forwarded client IPs only when configured and secures cookies by policy", async () => {
  const untrusted = new Nelysia({ secureCookies: true }).get("/", ({ clientIp, setCookie }) => {
    setCookie("session", "value")
    return { clientIp: clientIp ?? null }
  })
  const untrustedResult = await untrusted.handle({ method: "GET", url: "/", remoteAddress: "10.0.0.2", headers: new Headers({ "x-forwarded-for": "192.0.2.1" }) })
  assert.deepEqual(untrustedResult.body, { clientIp: "10.0.0.2" })
  assert.match(untrustedResult.headers.get("set-cookie") ?? "", /Secure/)
  const trusted = new Nelysia({ trustedProxy: true }).get("/", ({ clientIp }) => clientIp)
  const trustedResult = await trusted.handle({ method: "GET", url: "/", remoteAddress: "10.0.0.2", headers: new Headers({ "x-forwarded-for": "192.0.2.1, 10.0.0.2" }) })
  assert.equal(trustedResult.body, "192.0.2.1")
})

test("gracefully shuts down Node-style and Bun-style server handles", async () => {
  let nodeClosed = false
  await gracefulShutdown({ close(callback) { nodeClosed = true; callback?.() } })
  let bunStopped = false
  await gracefulShutdown({ stop() { bunStopped = true } })
  assert.equal(nodeClosed, true)
  assert.equal(bunStopped, true)
})

test("rate limits requests with a retry hint", async () => {
  const app = new Nelysia().use(rateLimit({ limit: 2, windowMs: 60_000, key: ({ request }) => request.url })).get("/", () => "ok")
  assert.equal((await app.handle({ method: "GET", url: "/" })).status, 200)
  assert.equal((await app.handle({ method: "GET", url: "/" })).status, 200)
  const limited = await app.handle({ method: "GET", url: "/" })
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get("retry-after"), "60")
})

test("serves an explicit static file with MIME metadata and 404 fallback", async () => {
  const app = new Nelysia().use(staticFile("/package", new URL("../package.json", import.meta.url)))
  const result = await app.handle({ method: "GET", url: "/package" })
  assert.equal(result.status, 200)
  assert.match(result.headers.get("content-type") ?? "", /application\/json/)
  assert.match(new TextDecoder().decode(result.body as Uint8Array), /\"name\"/)
  assert.equal((await app.handle({ method: "GET", url: "/missing" })).status, 404)
})

test("compresses negotiated response bodies and preserves decompressed content", async () => {
  const app = new Nelysia().get("/", () => ({ message: "compressed" })).use(compression())
  const result = await app.handle({ method: "GET", url: "/", headers: new Headers({ "accept-encoding": "gzip" }) })
  assert.equal(result.headers.get("content-encoding"), "gzip")
  const stream = result.body as ReadableStream<Uint8Array>
  const compressed = await new Response(stream).arrayBuffer()
  const decoded = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
  assert.deepEqual(JSON.parse(decoded), { message: "compressed" })
})

test("exports telemetry spans for success and error paths", async () => {
  const spans: { status: number; route: string; requestId: string; error?: unknown }[] = []
  const app = new Nelysia({ telemetry: { exportSpan: (span) => { spans.push(span) } } })
    .get("/ok", () => "ok")
    .get("/fail", () => { throw new Error("boom") })
  await app.handle({ method: "GET", url: "/ok", requestId: "span-ok" })
  await assert.rejects(() => app.handle({ method: "GET", url: "/fail", requestId: "span-fail" }))
  assert.deepEqual(spans.map(({ status, route, requestId }) => ({ status, route, requestId })), [
    { status: 200, route: "/ok", requestId: "span-ok" },
    { status: 500, route: "/fail", requestId: "span-fail" }
  ])
})

test("OTLP HTTP exporter sends a valid span payload", async () => {
  let payload: Record<string, any> | undefined
  const exporter = otlpHttpExporter({ url: "https://collector.test/v1/traces", serviceName: "test-api", fetch: async (_input, init) => {
    payload = JSON.parse(String(init?.body))
    return new Response(null, { status: 200 })
  } })
  await exporter.exportSpan?.({ name: "GET /", requestId: "trace-1", method: "GET", route: "/", status: 200, durationMs: 1 })
  assert.equal(payload?.resourceSpans?.[0]?.resource?.attributes?.[0]?.value?.stringValue, "test-api")
  assert.equal(payload?.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.attributes?.[0]?.value?.stringValue, "trace-1")
})

test("Fetch-standard adapter works with Deno/edge-compatible Request and Response", async () => {
  const app = new Nelysia().get("/health", () => ({ ok: true }))
  const response = await createFetchHandler(app)(new Request("https://example.test/health"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test("GraphQL integration executes a schema through the Nelysia lifecycle", async () => {
  const schema = new GraphQLSchema({ query: new GraphQLObjectType({ name: "Query", fields: { hello: { type: GraphQLString, resolve: () => "world" } } }) })
  const app = new Nelysia().use(graphqlPlugin({ schema }))
  const result = await app.handle({ method: "POST", url: "/graphql", body: { query: "{ hello }" }, headers: new Headers({ "content-type": "application/json" }) })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { data: { hello: "world" } })
})

test("Vercel adapter preserves the Fetch handler contract", async () => {
  const app = new Nelysia().get("/", () => "vercel")
  const response = await createVercelHandler(app)(new Request("https://example.test/"))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "vercel")
})

test("Cloudflare adapter preserves the Worker fetch contract", async () => {
  const app = new Nelysia().get("/", () => "cloudflare")
  const request = new Request("https://example.test/")
  assert.equal(await (await createCloudflareHandler(app)(request)).text(), "cloudflare")
  assert.equal(await (await createCloudflareWorker(app).fetch(request)).text(), "cloudflare")
})

test("Drizzle integration executes a real SQLite query through a route", async () => {
  if ("Bun" in globalThis) return
  const { default: Database } = await import("better-sqlite3")
  const { drizzle } = await import("drizzle-orm/better-sqlite3")
  const { integer, sqliteTable, text } = await import("drizzle-orm/sqlite-core")
  const database = new Database(":memory:")
  database.exec("create table users (id integer primary key, name text not null); insert into users (name) values ('Ada')")
  const db = drizzle(database)
  const users = sqliteTable("users", { id: integer("id").primaryKey(), name: text("name").notNull() })
  const app = new Nelysia().use(drizzleRoute({ db, path: "/users", query: (client) => client.select().from(users) }))
  const result = await app.handle({ method: "GET", url: "/users" })
  assert.deepEqual(result.body, [{ id: 1, name: "Ada" }])
  database.close()
})

test("Better Auth integration forwards catch-all methods and preserves response cookies", async () => {
  const auth = { handler: async (request: Request) => new Response(JSON.stringify({ path: new URL(request.url).pathname, method: request.method, body: await request.text() }), { headers: { "content-type": "application/json", "set-cookie": "session=ok; HttpOnly" } }) }
  const app = new Nelysia().use(betterAuthPlugin(auth))
  const result = await app.handle({ method: "POST", url: "https://example.test/api/auth/sign-in/email", body: { email: "a@test.dev" }, headers: new Headers({ "content-type": "application/json" }) })
  assert.equal(result.status, 200)
  assert.deepEqual(await new Response(result.body as ReadableStream).json(), { path: "/api/auth/sign-in/email", method: "POST", body: '{"email":"a@test.dev"}' })
  assert.match(result.headers.get("set-cookie") ?? "", /session=ok/)
})

test("implements OPTIONS, 405, and mounted sub-app routes", async () => {
  const users = new Nelysia().get("/", () => ({ users: true }))
  const app = new Nelysia().mount("/users", users)
  const options = await app.handle({ method: "OPTIONS", url: "/users" })
  assert.equal(options.status, 204)
  assert.match(options.headers.get("allow") ?? "", /GET/)
  const wrongMethod = await app.handle({ method: "POST", url: "/users" })
  assert.equal(wrongMethod.status, 405)
  assert.match(wrongMethod.headers.get("allow") ?? "", /OPTIONS/)
  const missing = await app.handle({ method: "GET", url: "/missing" })
  assert.equal(missing.status, 404)
})

test("isolates mounted plugin after and error lifecycle", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .onAfterHandle(() => { events.push("child-after") })
    .onError((_error, context) => context.response(418, "child-error"))
    .get("/ok", () => "ok")
    .get("/fail", () => { throw new Error("failure") })
  const app = new Nelysia().mount("/plugin", child).get("/outside", () => "outside")
  assert.equal((await app.handle({ method: "GET", url: "/plugin/ok" })).body, "ok")
  assert.deepEqual(events, ["child-after"])
  const failure = await app.handle({ method: "GET", url: "/plugin/fail" })
  assert.equal(failure.status, 418)
  assert.equal(failure.body, "child-error")
  assert.equal((await app.handle({ method: "GET", url: "/outside" })).body, "outside")
  assert.deepEqual(events, ["child-after"])
})

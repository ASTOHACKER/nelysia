import assert from "node:assert/strict"
import test from "node:test"
import { gracefulShutdown, HttpError, Nelysia, t, type Schema } from "../packages/core/src/index.ts"
import { compile, createCompiledBunHandler, inspect } from "../packages/compiler/src/index.ts"
import { generateClientTypes, generateOpenAPI, openapi, openapiUi, swaggerUi } from "../packages/openapi/src/index.ts"
import { compression, cors, rateLimit, securityHeaders, staticDirectory, staticFile } from "../packages/plugins/src/index.ts"
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
  assert.match(inspect(compiled), /GET \/users\/:id\n  Execution: SPECIALIZED/)
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

test("Standard Schema validation reports nested issue paths", async () => {
  const standard = {
    shape: { profile: { shape: { name: { type: "string" } } } },
    "~standard": {
      version: 1 as const,
      validate() { return { issues: [{ message: "expected text", path: ["profile", "name"] }] } }
    }
  }
  const response = await new Nelysia().post("/standard-error", () => "never", { body: standard }).injectUntyped({ method: "POST", path: "/standard-error", body: {} })
  assert.equal(response.status, 400)
  assert.match(String((await response.json<{ error: string }>()).error), /body\.profile\.name/)
})

test("object schema validation does not mutate prototypes for parsed keys", async () => {
  const app = new Nelysia().post("/safe-object", ({ body }) => body, { body: t.Object({ ["__proto__"]: t.Optional(t.Unknown()) }) })
  const response = await app.inject({ method: "POST", path: "/safe-object", body: JSON.parse('{"__proto__":{"polluted":true}}') })
  assert.equal(response.status, 200)
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "__proto__"), true)
})

test("generates OpenAPI paths from route schemas", () => {
  const app = new Nelysia().post("/users", ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })
  const document = generateOpenAPI(app, { title: "Test API" })
  assert.equal(document.info.title, "Test API")
  assert.deepEqual((document.paths["/users"]?.post as Record<string, any>)?.requestBody?.content["application/json"]?.schema, {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"]
  })
})

test("generates OpenAPI paths and parameters from StandardSchema", () => {
  const fakeStandardObject = {
    shape: {
      search: { type: "string" },
      limit: { type: "number" },
    },
    "~standard": {
      version: 1 as const,
      validate(value: unknown) { return { value } }
    }
  }
  const app = new Nelysia().get("/items", ({ query }) => query, {
    query: fakeStandardObject
  })
  const document = generateOpenAPI(app)
  assert.deepEqual((document.paths["/items"]?.get as Record<string, any>)?.parameters, [
    { name: "search", in: "query", required: true, schema: { type: "string" } },
    { name: "limit", in: "query", required: true, schema: { type: "number" } },
  ])
})

test("preserves nested Standard Schema definitions and optional fields", () => {
  const standard = {
    shape: {
      profile: { shape: { name: { type: "string" }, alias: { type: "string", optional: true } } },
      labels: { type: "array", items: { type: "string" } }
    },
    "~standard": { version: 1 as const, validate(value: unknown) { return { value } } }
  }
  const app = new Nelysia().post("/standard", ({ body }) => body, { body: standard })
  const document = generateOpenAPI(app)
  assert.deepEqual(document.paths["/standard"]?.post && (document.paths["/standard"]?.post as Record<string, any>).requestBody.content["application/json"].schema, {
    type: "object",
    properties: {
      profile: { type: "object", properties: { name: { type: "string" }, alias: { type: "string" } }, required: ["name"] },
      labels: { type: "array", items: { type: "string" } }
    },
    required: ["profile", "labels"]
  })
})

test("extracts Standard Schema metadata and preserves it in OpenAPI", async () => {
  const standard = {
    shape: {
      name: { type: "string", description: "Display name", minLength: 2, maxLength: 40, pattern: "^[A-Z]", examples: ["Ada"] },
      count: { type: "integer", minimum: 1, maximum: 10, default: 1 },
      createdAt: { type: "string", format: "date-time" },
      labels: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, default: [] },
      nickname: { type: "string", optional: true }
    },
    "~standard": {
      version: 1 as const,
      validate(value: unknown) {
        const input = value as Record<string, unknown>
        if (typeof input.name !== "string" || !/^[A-Z]/.test(input.name)) return { issues: [{ message: "name must start with a capital", path: ["name"] }] }
        return { value }
      }
    }
  }
  const app = new Nelysia().post("/metadata", ({ body }) => body, { body: standard })
  const schema = (app.graph.routes[0].bodySchema?.definition ?? {}) as Record<string, unknown>
  assert.deepEqual(schema.properties, {
    name: { type: "string", description: "Display name", minLength: 2, maxLength: 40, pattern: "^[A-Z]", examples: ["Ada"] },
    count: { type: "integer", minimum: 1, maximum: 10, default: 1 },
    createdAt: { type: "string", format: "date-time" },
    labels: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3, default: [] },
    nickname: { type: "string" }
  })
  assert.deepEqual(schema.required, ["name", "count", "createdAt", "labels"])
  const valid = await app.inject({ method: "POST", path: "/metadata", body: { name: "Ada", count: 1, createdAt: "now", labels: [] } })
  assert.equal(valid.status, 200)
  const invalid = await app.inject({ method: "POST", path: "/metadata", body: { name: "ada", count: 1, createdAt: "now", labels: [] } })
  assert.equal(invalid.status, 400)
  const operation = (generateOpenAPI(app) as { paths: Record<string, Record<string, unknown>> }).paths["/metadata"]?.post as { requestBody: { content: { "application/json": { schema: unknown } } } }
  assert.deepEqual(operation.requestBody.content["application/json"].schema, schema)
})

test("OpenAPI plugin serves a live document", async () => {
  const app = new Nelysia().get("/users/:id", ({ params }) => params.id).use(openapi({ title: "Live API" }))
  const result = await app.handle({ method: "GET", url: "/openapi.json" })
  assert.equal((result.body as { info: { title: string } }).info.title, "Live API")
  assert.equal((result.body as { info: { version: string } }).info.version, "1.0.0")
  assert.ok((result.body as { paths: Record<string, unknown> }).paths["/users/{id}"])
})

test("OpenAPI UI serves the generated document and client types reflect routes", async () => {
  const app = new Nelysia().get("/users", () => []).use(openapi({ path: "/schema" })).use(openapiUi({ specPath: "/schema" }))
  const page = await app.handle({ method: "GET", url: "/docs" })
  assert.equal(page.status, 200)
  assert.match(String(page.body), /spec-url=\"\/schema\"/)
  assert.match(page.headers.get("content-type") ?? "", /text\/html/)
  assert.match(generateClientTypes(app), /\"GET \/users\": \{ response: unknown \}/)
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

test("serves directory files with staticDirectory plugin, index fallback, and traversal guard", async () => {
  const app = new Nelysia().use(staticDirectory({
    prefix: "/docs",
    root: new URL("../docs", import.meta.url),
    index: "index.html"
  }))

  const rootRes = await app.handle({ method: "GET", url: "/docs" })
  assert.equal(rootRes.status, 200)
  assert.match(rootRes.headers.get("content-type") ?? "", /text\/html/)

  const missingRes = await app.handle({ method: "GET", url: "/docs/does-not-exist.txt" })
  assert.equal(missingRes.status, 404)

  const attackRes = await app.handle({ method: "GET", url: "/docs/../../package.json" })
  assert.equal(attackRes.status, 404)
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

test("telemetry exporter failures do not fail an otherwise successful response", async () => {
  const app = new Nelysia({ telemetry: { exportSpan: async () => { throw new Error("collector unavailable") } } })
    .get("/health", () => "ok")
  const response = await app.inject({ method: "GET", path: "/health" })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "ok")
})

test("telemetry events cover request phases without affecting responses", async () => {
  const events: string[] = []
  const app = new Nelysia({ telemetry: {
    onEvent(event) {
      events.push(event.phase)
      if (event.phase === "parse") throw new Error("observer failure")
    }
  } })
    .onParse(() => undefined)
    .post("/events", ({ body }) => body)
  const response = await app.handle({ method: "POST", url: "/events", body: { ok: true } })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
  assert.deepEqual(events, ["request.start", "route.matched", "parse", "handler", "response", "after.response"])
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

test("Fetch adapter waits for lazy modules before dispatching", async () => {
  const app = new Nelysia().use(new Promise<Nelysia<any, any, any>>((resolve) => {
    setTimeout(() => resolve(new Nelysia().get("/lazy", () => "ready")), 5)
  }))
  const response = await createFetchHandler(app)(new Request("https://example.test/lazy"))
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "ready")
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

test("Cloudflare adapter exposes env and execution context to routes", async () => {
  let observed: { env?: unknown; executionContext?: unknown } | undefined
  const app = new Nelysia().get("/", (context) => {
    observed = { env: context.env, executionContext: context.executionContext }
    return "ok"
  })
  const env = { DATABASE_URL: "test" }
  const executionContext = { waitUntil() {} }
  const response = await createCloudflareHandler(app)(new Request("https://example.test/"), env, executionContext)
  assert.equal(await response.text(), "ok")
  assert.deepEqual(observed, { env, executionContext })
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

test("composes feature modules with instance plugins and prefixes", async () => {
  const users = new Nelysia({ prefix: "/users", name: "users" })
    .get("/", () => ({ users: true }))
    .get("/:id", ({ params }) => ({ id: params.id }))

  const app = new Nelysia().use(users)

  const list = await app.handle({ method: "GET", url: "/users" })
  assert.equal(list.status, 200)
  assert.deepEqual(list.body, { users: true })

  const detail = await app.handle({ method: "GET", url: "/users/42" })
  assert.equal(detail.status, 200)
  assert.deepEqual(detail.body, { id: "42" })

  assert.equal((await app.handle({ method: "GET", url: "/" })).status, 404)
})

test("composes state, decorate, derive, and resolve context extensions", async () => {
  const app = new Nelysia()
    .state("version", 2)
    .decorate("service", () => "users")
    .derive(({ headers }) => ({ requestUser: headers.get("x-user") ?? "guest" }))
    .resolve(async ({ requestUser }) => ({ authorized: requestUser !== "guest" }))
    .get("/context", ({ store, service, requestUser, authorized }) => ({
      version: store.version,
      service,
      requestUser,
      authorized
    }))

  const res = await app.handle({
    method: "GET",
    url: "/context",
    headers: new Headers({ "x-user": "usr-123" })
  })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, {
    version: 2,
    service: "users",
    requestUser: "usr-123",
    authorized: true
  })
})

test("reuses named models and guards a feature group", async () => {
  const app = new Nelysia()
    .model({
      UserInput: t.Object({ name: t.String() }),
      User: t.Object({ name: t.String() })
    })
    .guard({
      body: "UserInput",
      response: "User",
      beforeHandle: ({ headers, response }) => {
        if (headers.get("x-api-key") !== "valid") return response(401, "Unauthorized")
      }
    }, (api) => {
      api.post("/users", ({ body }) => body)
    })

  const unauthorized = await app.inject({ method: "POST", path: "/users", body: { name: "Ada" } })
  assert.equal(unauthorized.statusCode, 401)

  const authorized = await app.inject({
    method: "POST",
    path: "/users",
    headers: { "x-api-key": "valid" },
    body: { name: "Ada" }
  })
  assert.equal(authorized.statusCode, 200)
  assert.deepEqual(await authorized.json(), { name: "Ada" })
})

test("applies macros and scoped hooks without leaking local lifecycle", async () => {
  const events: string[] = []
  const secured = new Nelysia({ name: "secured" })
    .macro({
      auth: {
        beforeHandle: ({ headers, response }) => {
          if (!headers.get("x-auth")) return response(401, { error: "Unauthorized" })
        }
      }
    })
    .get("/private", () => "private", { auth: true })

  const child = new Nelysia()
    .onBeforeHandle({ as: "scoped" }, () => { events.push("scoped") })
    .use(secured)
    .get("/child", () => "child")

  const app = new Nelysia()
    .use(child)
    .get("/parent", () => "parent")

  assert.equal((await app.inject({ method: "GET", path: "/private" })).statusCode, 401)
  assert.equal((await app.inject({ method: "GET", path: "/private", headers: { "x-auth": "ok" } })).statusCode, 200)
  assert.equal((await app.inject({ method: "GET", path: "/parent" })).statusCode, 200)
  assert.deepEqual(events, ["scoped", "scoped"])
})

test("deduplicates named modules and waits for async modules", async () => {
  const named = new Nelysia({ name: "health", seed: 1 })
    .get("/health", () => "ok")
  const app = new Nelysia()
    .use(named)
    .use(named)
    .use(async (instance) => {
      await Promise.resolve()
      return instance.get("/async", () => "ready")
    })

  await app.modules
  assert.equal(app.graph.routes.filter((route) => route.path === "/health").length, 1)
  assert.equal((await app.injectUntyped({ method: "GET", path: "/async" })).statusCode, 200)
  assert.equal(await (await app.injectUntyped({ method: "GET", path: "/async" })).text(), "ready")
})

test("exposes module graph ownership and rejects conflicting named modules", async () => {
  const child = new Nelysia({ name: "catalog", seed: { version: 1 } }).get("/items", () => [])
  const app = new Nelysia({ name: "root" }).use(child)
  assert.equal(app.moduleGraph.name, "root")
  assert.equal(app.moduleGraph.dependencies[0]?.name, "catalog")
  assert.deepEqual(app.moduleGraph.dependencies[0]?.routeOwnership, ["GET /items"])
  assert.equal(app.moduleGraph.dependencies[0]?.loadState, "loaded")
  assert.throws(() => app.use(new Nelysia({ name: "catalog", seed: { version: 2 } })), /Conflicting named module/)
  const rejected = new Nelysia().use(Promise.reject(new Error("module failed")))
  await assert.rejects(() => rejected.modules, /module failed/)
  assert.equal(rejected.moduleGraph.loadState, "rejected")
  const models = new Nelysia().model({ User: t.Object({ id: t.String() }) })
  assert.throws(() => models.model({ User: t.Object({ name: t.String() }) }), /Conflicting model definition/)
})

test("runs the extended request and response lifecycle in order", async () => {
  const events: string[] = []
  const app = new Nelysia()
    .onRequest(() => { events.push("request") })
    .onParse((request, contentType) => {
      events.push(`parse:${contentType}`)
      return typeof request.body === "string" ? JSON.parse(request.body) : request.body
    })
    .onTransform(() => { events.push("transform") })
    .mapResponse((_context, response) => {
      events.push("map")
      return { ...((response.body as Record<string, unknown>) ?? {}), mapped: true }
    })
    .onAfterResponse(() => { events.push("after-response") })
    .post("/lifecycle", ({ body }) => body)

  const result = await app.handle({
    method: "POST",
    url: "/lifecycle",
    headers: new Headers({ "content-type": "application/json" }),
    body: '{"ok":true}'
  })
  assert.deepEqual(result.body, { ok: true, mapped: true })
  assert.deepEqual(events, ["request", "parse:application/json", "transform", "map", "after-response"])
})

test("routes every request and response lifecycle failure through the owning error handler", async () => {
  const failures: Array<{ name: string; status: number; build(app: Nelysia<any, any, any>): void }> = [
    { name: "request", status: 401, build: (app) => app.onRequest(() => { throw new HttpError(401, "request failed") }).get("/failure", () => "never") },
    { name: "parse", status: 402, build: (app) => app.onParse(() => { throw new HttpError(402, "parse failed") }).post("/failure", () => "never") },
    { name: "handler", status: 403, build: (app) => app.get("/failure", () => { throw new HttpError(403, "handler failed") }) },
    { name: "response", status: 400, build: (app) => app.get("/failure", () => 123, { response: t.String() }) },
    { name: "map-response", status: 405, build: (app) => app.mapResponse(() => { throw new HttpError(405, "map failed") }).get("/failure", () => "ok") },
    { name: "after-handle", status: 406, build: (app) => app.onAfterHandle(() => { throw new HttpError(406, "after failed") }).get("/failure", () => "ok") },
    { name: "after-response", status: 407, build: (app) => app.onAfterResponse(() => { throw new HttpError(407, "after response failed") }).get("/failure", () => "ok") }
  ]
  for (const failure of failures) {
    const app = new Nelysia().onError((error, context) => context.response(error instanceof HttpError ? error.status : 500, { failure: failure.name }))
    failure.build(app)
    const result = await app.inject({ method: failure.name === "parse" ? "POST" : "GET", path: "/failure" })
    assert.equal(result.status, failure.status, failure.name)
    assert.deepEqual(result.body, { failure: failure.name })
  }

  const child = new Nelysia()
    .onError({ as: "scoped" }, (_error, context) => context.response(418, { owner: "child" }))
    .onAfterHandle(() => { throw new HttpError(500, "child after failed") })
    .get("/child", () => "child")
  const app = new Nelysia()
    .onError((_error, context) => context.response(419, { owner: "root" }))
    .use(child)
    .get("/sibling", () => { throw new HttpError(500, "sibling failed") })
  assert.deepEqual((await app.inject({ method: "GET", path: "/child" })).body, { owner: "child" })
  assert.deepEqual((await app.inject({ method: "GET", path: "/sibling" })).body, { owner: "root" })
})

test("supports composed built-in schemas with optional, array, union, and nullable values", async () => {
  const payload = t.Object({
    name: t.String(),
    labels: t.Array(t.String()),
    role: t.Union([t.Literal("user"), t.Literal("admin")]),
    note: t.Optional(t.Nullable(t.String()))
  })
  const app = new Nelysia().post("/schema-composed", ({ body }) => body, { body: payload })

  const valid = await app.injectUntyped({
    method: "POST",
    path: "/schema-composed",
    body: { name: "Ada", labels: ["active"], role: "admin" }
  })
  assert.equal(valid.statusCode, 200)
  assert.deepEqual(await valid.json(), { name: "Ada", labels: ["active"], role: "admin" })

  const invalid = await app.injectUntyped({
    method: "POST",
    path: "/schema-composed",
    body: { name: "Ada", labels: [1], role: "owner" }
  })
  assert.equal(invalid.statusCode, 400)
})

test("supports reusable object schema transformations and enums", async () => {
  const user = t.Object({ id: t.Number(), name: t.String(), role: t.Enum(["admin", "user"] as const) })
  const update = t.Partial(user)
  const picked = t.Pick(user, ["id", "name"] as const)
  const omitted = t.Omit(user, ["id"] as const)
  const combined = t.Intersect([t.Object({ id: t.Number() }), t.Object({ active: t.Boolean() })] as const)

  assert.deepEqual(await update.validate({ name: "Ada" }), { name: "Ada" })
  assert.deepEqual(await picked.validate({ id: 1, name: "Ada" }), { id: 1, name: "Ada" })
  assert.deepEqual(await omitted.validate({ name: "Ada", role: "user" }), { name: "Ada", role: "user" })
  assert.deepEqual(await combined.validate({ id: 1, active: true }), { id: 1, active: true })
  await assert.rejects(async () => await user.validate({ id: 1, name: "Ada", role: "owner" }))
})

test("built-in schemas keep runtime, OpenAPI, and client contracts aligned", async () => {
  const base = t.Object({ id: t.String(), count: t.Number() })
  const cases: Array<{ name: string; schema: Schema; valid: unknown; invalid?: unknown }> = [
    { name: "string", schema: t.String(), valid: "ok", invalid: 1 },
    { name: "number", schema: t.Number(), valid: 1, invalid: "1" },
    { name: "boolean", schema: t.Boolean(), valid: true, invalid: "true" },
    { name: "object", schema: t.Object({ id: t.String() }), valid: { id: "a" }, invalid: { id: 1 } },
    { name: "array", schema: t.Array(t.Number()), valid: [1, 2], invalid: ["1"] },
    { name: "literal", schema: t.Literal("ok"), valid: "ok", invalid: "no" },
    { name: "union", schema: t.Union([t.String(), t.Number()]), valid: 1, invalid: false },
    { name: "nullable", schema: t.Nullable(t.String()), valid: null, invalid: false },
    { name: "optional", schema: t.Optional(t.String()), valid: undefined, invalid: 1 },
    { name: "any", schema: t.Any(), valid: { anything: true } },
    { name: "unknown", schema: t.Unknown(), valid: { anything: true } },
    { name: "date", schema: t.Date(), valid: new Date("2026-01-01"), invalid: "2026-01-01" },
    { name: "record", schema: t.Record(t.Number()), valid: { score: 1 }, invalid: { score: "1" } },
    { name: "enum", schema: t.Enum(["a", "b"] as const), valid: "a", invalid: "c" },
    { name: "intersect", schema: t.Intersect([t.Object({ id: t.String() }), t.Object({ count: t.Number() })]), valid: { id: "a", count: 1 }, invalid: { id: "a" } },
    { name: "partial", schema: t.Partial(base), valid: {}, invalid: { count: "1" } },
    { name: "pick", schema: t.Pick(base, ["id"] as const), valid: { id: "a" }, invalid: { id: 1 } },
    { name: "omit", schema: t.Omit(base, ["count"] as const), valid: { id: "a" }, invalid: { id: 1 } }
  ]
  const app = new Nelysia()
  for (const item of cases) app.post(`/schema/${item.name}`, ({ body }) => body, { body: item.schema, response: item.schema })
  for (const item of cases) {
    const valid = await app.inject({ method: "POST", path: `/schema/${item.name}`, body: item.valid })
    assert.equal(valid.status, 200, item.name)
    if (item.invalid !== undefined) {
      const invalid = await app.inject({ method: "POST", path: `/schema/${item.name}`, body: item.invalid })
      assert.equal(invalid.status, 400, item.name)
    }
    const spec = generateOpenAPI(app) as { paths: Record<string, Record<string, unknown>> }
    assert.ok((spec.paths[`/schema/${item.name}`]?.post as { requestBody?: unknown }).requestBody, item.name)
    assert.match(generateClientTypes(app), new RegExp(`POST \\/schema\\/${item.name}`), item.name)
  }
})

test("mounts a Web Standard fetch handler under a route prefix", async () => {
  const app = new Nelysia().mount("/external", async (request) => {
    return new Response(JSON.stringify({ path: new URL(request.url).pathname, method: request.method }), {
      status: 201,
      headers: { "content-type": "application/json", "x-source": "mounted" }
    })
  })

  const result = await app.inject({ method: "POST", path: "/external/users" })
  assert.equal(result.statusCode, 201)
  assert.equal(result.headers.get("x-source"), "mounted")
  assert.deepEqual(await result.json(), { path: "/external/users", method: "POST" })
})

test("accepts native Response values from request and route hooks", async () => {
  const requestBlocked = new Nelysia()
    .onRequest(() => new Response("blocked", { status: 429 }))
    .get("/blocked", () => "never")
  const blocked = await requestBlocked.inject({ method: "GET", path: "/blocked" })
  assert.equal(blocked.statusCode, 429)
  assert.equal(await blocked.text(), "blocked")

  const routeBlocked = new Nelysia()
    .onBeforeHandle(() => new Response("unauthorized", { status: 401 }))
    .get("/private", () => "never")
  const unauthorized = await routeBlocked.inject({ method: "GET", path: "/private" })
  assert.equal(unauthorized.statusCode, 401)
  assert.equal(await unauthorized.text(), "unauthorized")
})

test("supports grouped guards with a route prefix", async () => {
  const app = new Nelysia().group("/v1", {
    beforeHandle: ({ headers, response }) => headers.get("x-token") === "ok" ? undefined : response(403, "Forbidden"),
    response: t.Object({ ok: t.Boolean() })
  }, (api) => {
    api.get("/status", () => ({ ok: true }))
  })

  assert.equal((await app.inject({ method: "GET", path: "/v1/status" })).statusCode, 403)
  const allowed = await app.inject({ method: "GET", path: "/v1/status", headers: { "x-token": "ok" } })
  assert.equal(allowed.statusCode, 200)
  assert.deepEqual(await allowed.json(), { ok: true })
})

test("exports named models as reusable OpenAPI components", async () => {
  const user = t.Object({ name: t.String() })
  const app = new Nelysia()
    .model({ User: user })
    .post("/users", ({ body }) => body, { body: "User", response: "User" })

  const spec = generateOpenAPI(app) as { components?: { schemas?: Record<string, unknown> }; paths: Record<string, Record<string, unknown>> }
  assert.deepEqual(spec.components?.schemas?.User, user.definition)
  const operation = spec.paths["/users"]?.post as { requestBody: { content: { "application/json": { schema: unknown } } }; responses: Record<string, unknown> }
  assert.deepEqual(operation.requestBody.content["application/json"].schema, { "$ref": "#/components/schemas/User" })
  assert.deepEqual((operation.responses["200"] as { content: { "application/json": { schema: unknown } } }).content["application/json"].schema, { "$ref": "#/components/schemas/User" })
  assert.match(generateClientTypes(app), /export type User = \{ "name": string \}/)
  assert.match(generateClientTypes(app), /"POST \/users": \{ response: User; body: User \}/)
})

test("supports status-specific response schemas in runtime and OpenAPI", async () => {
  const user = t.Object({ id: t.String() })
  const app = new Nelysia()
    .model({ User: user })
    .post("/users", (context) => context.response(201, { id: "user-1" }), {
      responses: {
        201: "User",
        422: t.Object({ error: t.String() })
      }
    })
  const created = await app.inject({ method: "POST", path: "/users" })
  assert.equal(created.status, 201)
  assert.deepEqual(created.body, { id: "user-1" })
  const spec = generateOpenAPI(app) as { paths: Record<string, Record<string, unknown>> }
  const operation = spec.paths["/users"]?.post as { responses: Record<string, { content?: Record<string, { schema: unknown }> }> }
  assert.deepEqual(operation?.responses["201"]?.content?.["application/json"]?.schema, { "$ref": "#/components/schemas/User" })
  assert.deepEqual(operation?.responses["422"]?.content?.["application/json"]?.schema, { type: "object", properties: { error: { type: "string" } }, required: ["error"] })
})

test("rejects circular named model definitions with a readable diagnostic", () => {
  const definition: Record<string, unknown> = { type: "object", properties: {} }
  ;(definition.properties as Record<string, unknown>).self = definition
  const schema: Schema = { kind: "object", definition, validate: (value) => value }
  assert.throws(() => new Nelysia().model({ Node: schema }), /Circular model definition: Node/)
})

test("exports query and header schemas as correctly required OpenAPI parameters", () => {
  const app = new Nelysia().get("/users/:id", () => "ok", {
    params: t.Object({ id: t.String() }),
    query: t.Object({ page: t.Number(), cursor: t.Optional(t.String()) }),
    headers: t.Object({ authorization: t.String(), "x-trace": t.Optional(t.String()) })
  })
  const spec = generateOpenAPI(app) as { paths: Record<string, Record<string, unknown>> }
  const operation = spec.paths["/users/{id}"]?.get as { parameters: Array<{ name: string; in: string; required: boolean }> }
  assert.deepEqual(operation.parameters, [
    { name: "id", in: "path", required: true, schema: { type: "string" } },
    { name: "page", in: "query", required: true, schema: { type: "number" } },
    { name: "cursor", in: "query", required: false, schema: { type: "string" } },
    { name: "authorization", in: "header", required: true, schema: { type: "string" } },
    { name: "x-trace", in: "header", required: false, schema: { type: "string" } }
  ])
})

test("promotes all instance hooks with as()", async () => {
  const events: string[] = []
  const module = new Nelysia()
    .onBeforeHandle(() => { events.push("module") })
    .as("scoped")
    .get("/module", () => "module")
  const app = new Nelysia()
    .use(module)
    .get("/parent", () => "parent")

  await app.inject({ method: "GET", path: "/module" })
  await app.inject({ method: "GET", path: "/parent" })
  assert.deepEqual(events, ["module"])
})

test("waits for lazy modules before starting a server", async () => {
  const app = new Nelysia().use(new Promise<Nelysia<any, any, any>>((resolve) => {
    setTimeout(() => resolve(new Nelysia({ name: "lazy-server-module" }).get("/ready", () => "ready")), 5)
  }))

  await new Promise<void>((resolve, reject) => {
    try {
      app.listen(0, (info) => {
        try {
          assert.ok(app.graph.routes.some((route) => route.path === "/ready"))
          const server = info.server as { close?: (callback: () => void) => void; stop?: () => void }
          if (server.close) server.close(resolve)
          else {
            server.stop?.()
            resolve()
          }
        } catch (error) {
          reject(error)
        }
      })
    } catch (error) {
      reject(error)
    }
  })
})

test("waits for lazy modules before inject", async () => {
  const app = new Nelysia().use(new Promise<Nelysia<any, any, any>>((resolve) => {
    setTimeout(() => resolve(new Nelysia().get("/lazy", () => "loaded")), 5)
  }))
  const response = await app.inject({ method: "GET", path: "/lazy" })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "loaded")
})

test("waits for lazy descendants before mounting a child module", async () => {
  const child = new Nelysia().use(Promise.resolve(new Nelysia().get("/nested", () => "ready")))
  const app = new Nelysia().use(child)
  const response = await app.inject({ method: "GET", path: "/nested" })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "ready")
})

test("rejects circular module dependencies", () => {
  const first = new Nelysia({ name: "first-cycle" })
  const second = new Nelysia({ name: "second-cycle" })
  second.use(first)
  assert.throws(() => first.use(second), /Circular Nelysia module dependency/)
  assert.throws(() => first.use(first), /Circular Nelysia module dependency/)
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

test("keeps scoped mounted hooks inside the mounted subtree", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .onBeforeHandle({ as: "scoped" }, () => { events.push("child") })
    .get("/inside", () => "inside")
  const app = new Nelysia()
    .get("/before", () => "before")
    .mount("/feature", child)
    .get("/after", () => "after")

  await app.inject({ method: "GET", path: "/before" })
  await app.inject({ method: "GET", path: "/feature/inside" })
  await app.inject({ method: "GET", path: "/after" })
  assert.deepEqual(events, ["child"])
})

test("explicit local lifecycle hooks stay on the owning instance", async () => {
  const events: string[] = []
  const app = new Nelysia()
    .onBeforeHandle({ as: "local" }, () => { events.push("before") })
    .onRequest({ as: "local" }, () => { events.push("request") })
    .onParse({ as: "local" }, () => { events.push("parse") })
    .mapResponse({ as: "local" }, (_context, response) => { events.push("map"); return response.body })
    .onAfterResponse({ as: "local" }, () => { events.push("after-response") })
    .get("/root", () => "root")
  const child = new Nelysia().get("/child", () => "child")
  app.mount("/feature", child)
  await app.inject({ method: "GET", path: "/root" })
  assert.deepEqual(events, ["request", "parse", "before", "map", "after-response"])
  events.length = 0
  await app.injectUntyped({ method: "GET", path: "/feature/child" })
  assert.deepEqual(events, [])
})

test("global lifecycle hooks from a module reach parent and mounted routes once", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .onRequest({ as: "global" }, () => { events.push("request") })
    .onParse({ as: "global" }, () => { events.push("parse") })
    .mapResponse({ as: "global" }, (_context, response) => { events.push("map"); return response.body })
    .onAfterResponse({ as: "global" }, () => { events.push("after") })
    .get("/child", () => "child")
  const app = new Nelysia().mount("/feature", child).get("/root", () => "root")
  await app.inject({ method: "GET", path: "/root" })
  await app.inject({ method: "GET", path: "/feature/child" })
  assert.deepEqual(events, ["request", "parse", "map", "after", "request", "parse", "map", "after"])
})

test("propagates scoped after and error hooks only to mounted routes", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .onAfterHandle({ as: "scoped" }, () => { events.push("after") })
    .onError({ as: "scoped" }, (_error, context) => context.response(409, "handled"))
    .get("/ok", () => "ok")
    .get("/fail", () => { throw new Error("fail") })
  const app = new Nelysia().mount("/feature", child).get("/outside", () => "outside")

  await app.inject({ method: "GET", path: "/outside" })
  assert.equal((await app.inject({ method: "GET", path: "/feature/ok" })).status, 200)
  assert.equal((await app.inject({ method: "GET", path: "/feature/fail" })).status, 409)
  assert.deepEqual(events, ["after"])
})

test("mounts request and parse hooks within the child module boundary", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .onRequest((request) => { events.push(`request:${request.url}`) })
    .onParse((_request, contentType) => { events.push(`parse:${contentType}`); return { parsed: true } })
    .post("/submit", ({ body }) => body)
  const app = new Nelysia().mount("/feature", child).post("/outside", ({ body }) => body)

  const outside = await app.inject({ method: "POST", path: "/outside", body: { parsed: false } })
  assert.deepEqual(await outside.json(), { parsed: false })
  const inside = await app.inject({ method: "POST", path: "/feature/submit", body: { original: true } })
  assert.deepEqual(await inside.json(), { parsed: true })
  assert.deepEqual(events, ["request:/feature/submit", "parse:application/json; charset=utf-8"])
})

test("mounts response lifecycle hooks within the child module boundary", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .mapResponse((_context, response) => {
      events.push("child-map")
      return { wrapped: response.body }
    })
    .onAfterResponse((_context, response) => { events.push(`child-after:${String((response.body as { wrapped: string }).wrapped)}`) })
    .get("/inside", () => "inside")
  const app = new Nelysia().mount("/feature", child).get("/outside", () => "outside")

  const outside = await app.inject({ method: "GET", path: "/outside" })
  assert.equal(await outside.text(), "outside")
  const inside = await app.inject({ method: "GET", path: "/feature/inside" })
  assert.deepEqual(await inside.json(), { wrapped: "inside" })
  assert.deepEqual(events, ["child-map", "child-after:inside"])
})

test("keeps transform hook scopes consistent across mounted and sibling routes", async () => {
  const events: string[] = []
  const child = new Nelysia()
    .onTransform({ as: "local" }, () => { events.push("child-local") })
    .onTransform({ as: "scoped" }, () => { events.push("child-scoped") })
    .get("/inside", () => "inside")
  const app = new Nelysia()
    .onTransform({ as: "local" }, () => { events.push("root-local") })
    .mount("/feature", child)
    .get("/outside", () => "outside")

  await app.inject({ method: "GET", path: "/outside" })
  assert.deepEqual(events, ["root-local"])
  events.length = 0
  await app.inject({ method: "GET", path: "/feature/inside" })
  assert.deepEqual(events, ["child-local", "child-scoped"])
})

test("context.store shares state between hooks and handlers", async () => {
  const app = new Nelysia()
    .onBeforeHandle(({ store, headers }) => {
      store.user = { id: headers.get("x-user-id") ?? "guest" }
    })
    .get("/me", ({ store }) => store.user)

  const res = await app.handle({ method: "GET", url: "/me", headers: new Headers({ "x-user-id": "usr-123" }) })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { id: "usr-123" })
})

test("app.group organizes routes with prefix and hook inheritance", async () => {
  const traces: string[] = []
  const app = new Nelysia()
    .onBeforeHandle(() => { traces.push("global-hook") })
    .group("/api/v1", (v1) => {
      v1.onBeforeHandle(() => { traces.push("v1-hook") })
      v1.get("/users", () => [{ id: 1 }])
      v1.post("/users", () => ({ created: true }))
    })
    .get("/ping", () => "pong")

  const resUsers = await app.handle({ method: "GET", url: "/api/v1/users" })
  assert.equal(resUsers.status, 200)
  assert.deepEqual(resUsers.body, [{ id: 1 }])
  assert.deepEqual(traces, ["global-hook", "v1-hook"])

  traces.length = 0
  const resPing = await app.handle({ method: "GET", url: "/ping" })
  assert.equal(resPing.status, 200)
  assert.deepEqual(traces, ["global-hook"])
})

test("app.notFound provides custom 404 handler", async () => {
  const app = new Nelysia()
    .notFound(({ request, response }) => {
      return response(404, { code: "NOT_FOUND_CUSTOM", url: request.url })
    })
    .get("/hello", () => "world")

  const resMissing = await app.handle({ method: "GET", url: "/non-existent" })
  assert.equal(resMissing.status, 404)
  assert.deepEqual(resMissing.body, { code: "NOT_FOUND_CUSTOM", url: "/non-existent" })

  const resOk = await app.handle({ method: "GET", url: "/hello" })
  assert.equal(resOk.status, 200)
  assert.equal(resOk.body, "world")
})

test("cors plugin handles preflight OPTIONS and normal requests", async () => {
  const app = new Nelysia()
    .use(cors({
      origin: ["https://example.com"],
      credentials: true,
      maxAge: 3600
    }))
    .get("/data", () => ({ value: 42 }))

  // Preflight
  const preflight = await app.handle({
    method: "OPTIONS",
    url: "/data",
    headers: new Headers({
      origin: "https://example.com",
      "access-control-request-method": "GET"
    })
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://example.com")
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true")
  assert.equal(preflight.headers.get("access-control-max-age"), "3600")

  // Normal request with origin
  const res = await app.handle({
    method: "GET",
    url: "/data",
    headers: new Headers({ origin: "https://example.com" })
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("access-control-allow-origin"), "https://example.com")
  assert.equal(res.headers.get("access-control-allow-credentials"), "true")
  assert.deepEqual(res.body, { value: 42 })
})

test("CORS does not reflect arbitrary origins when wildcard credentials are enabled", async () => {
  const app = new Nelysia().use(cors({ origin: "*", credentials: true })).get("/data", () => "ok")
  const response = await app.inject({ method: "GET", path: "/data", headers: { origin: "https://attacker.example" } })
  assert.equal(response.headers.get("access-control-allow-origin"), null)
})

test("plugins reject invalid security-sensitive options", () => {
  assert.throws(() => compression({ threshold: -1 }), /threshold/)
  assert.throws(() => cors({ maxAge: -1 }), /maxAge/)
  assert.throws(() => cors({ allowedHeaders: "x-test\r\nInjected: true" }), /line breaks/)
  assert.throws(() => securityHeaders({ referrerPolicy: "safe\nvalue" }), /line breaks/)
})

test("securityHeaders plugin applies standard defense-in-depth headers", async () => {
  const app = new Nelysia()
    .use(securityHeaders())
    .get("/secure", () => "safe")

  const res = await app.handle({ method: "GET", url: "/secure" })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("x-content-type-options"), "nosniff")
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN")
  assert.equal(res.headers.get("referrer-policy"), "no-referrer")
  assert.match(res.headers.get("strict-transport-security") ?? "", /max-age/)
})

test("swaggerUi serves Swagger documentation interface and routes have metadata", async () => {
  const app = new Nelysia()
    .use(swaggerUi({ path: "/docs/swagger", title: "Test API Docs" }))
    .get("/users", () => [], {
      summary: "List users",
      description: "Returns all active registered users",
      tags: ["Users"]
    })

  const res = await app.handle({ method: "GET", url: "/docs/swagger" })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8")
  assert.match(res.body as string, /<div id="swagger-ui"><\/div>/)
  assert.match(res.body as string, /Test API Docs/)

  const openapiSpec = generateOpenAPI(app)
  const userOp = openapiSpec.paths["/users"]?.["get"] as Record<string, unknown>
  assert.equal(userOp.summary, "List users")
  assert.equal(userOp.description, "Returns all active registered users")
  assert.deepEqual(userOp.tags, ["Users"])
})

test("OpenAPI preserves route security metadata and safely embeds custom Swagger URLs", async () => {
  const app = new Nelysia().get("/private", () => "ok", { auth: true, summary: "Private" }).use(swaggerUi({ path: "/api-docs", specPath: "/spec?name='safe" }))
  const spec = generateOpenAPI(app) as { paths: Record<string, Record<string, { security?: unknown[] }>> }
  assert.deepEqual(spec.paths["/private"]?.get.security, [{ bearerAuth: [] }])
  const page = await app.injectUntyped({ method: "GET", path: "/api-docs" })
  assert.match(await page.text(), /name='safe/)
  assert.doesNotMatch(await page.text(), /url: '\/spec\?name=/)
})

test("context provides html, text, json, and redirect shorthands", async () => {
  const app = new Nelysia()
    .get("/page", ({ html }) => html("<h1>Hello Nelysia</h1>"))
    .get("/plain", ({ text }) => text("Just text"))
    .get("/data", ({ json }) => json({ success: true }))
    .get("/old", ({ redirect }) => redirect("/new"))

  const resHtml = await app.handle({ method: "GET", url: "/page" })
  assert.equal(resHtml.status, 200)
  assert.equal(resHtml.headers.get("content-type"), "text/html; charset=utf-8")
  assert.equal(resHtml.body, "<h1>Hello Nelysia</h1>")

  const resText = await app.handle({ method: "GET", url: "/plain" })
  assert.equal(resText.status, 200)
  assert.equal(resText.headers.get("content-type"), "text/plain; charset=utf-8")
  assert.equal(resText.body, "Just text")

  const resJson = await app.handle({ method: "GET", url: "/data" })
  assert.equal(resJson.status, 200)
  assert.equal(resJson.headers.get("content-type"), "application/json; charset=utf-8")
  assert.deepEqual(resJson.body, { success: true })

  const resRedir = await app.handle({ method: "GET", url: "/old" })
  assert.equal(resRedir.status, 302)
  assert.equal(resRedir.headers.get("location"), "/new")
})

test("context provides header() and deleteCookie() helpers", async () => {
  const app = new Nelysia()
    .get("/set-hdr", ({ header }) => {
      header("x-trace-id", "trace-abc-123")
      return { ok: true }
    })
    .get("/logout", ({ deleteCookie }) => {
      deleteCookie("token", { path: "/" })
      return { loggedOut: true }
    })

  const resHdr = await app.handle({ method: "GET", url: "/set-hdr" })
  assert.equal(resHdr.status, 200)
  assert.equal(resHdr.headers.get("x-trace-id"), "trace-abc-123")

  const resLogout = await app.handle({ method: "GET", url: "/logout" })
  assert.equal(resLogout.status, 200)
  const setCookie = resLogout.headers.get("set-cookie") ?? ""
  assert.match(setCookie, /token=/)
  assert.match(setCookie, /Max-Age=0/)
})

test("app.listen supports callback with server metadata", async () => {
  const app = new Nelysia().get("/ping", () => "pong")
  let serverInstance: any

  const serverInfo = await new Promise<any>((resolve) => {
    serverInstance = app.listen(0, (info) => {
      resolve(info)
    })
  })

  assert.ok(serverInfo.port >= 0)
  assert.ok(serverInfo.url.startsWith("http://"))
  assert.equal(typeof serverInfo.stop, "function")
  if (typeof serverInstance?.close === "function") {
    await new Promise<void>((r) => serverInstance.close(() => r()))
  } else if (typeof serverInstance?.stop === "function") {
    serverInstance.stop()
  }
})

test("app.inject executes requests without binding a network port", async () => {
  const app = new Nelysia()
    .get("/users/:id", ({ params, query }) => ({ id: params.id, filter: query.get("filter") }))
    .post("/echo", ({ body }) => body)

  const res1 = await app.inject({
    method: "GET",
    path: "/users/42",
    query: { filter: "active" }
  })
  assert.equal(res1.statusCode, 200)
  assert.equal(res1.status, 200)
  assert.deepEqual(await res1.json(), { id: "42", filter: "active" })

  const res2 = await app.inject({
    method: "POST",
    path: "/echo",
    body: { hello: "world" }
  })
  assert.equal(res2.statusCode, 200)
  assert.deepEqual(await res2.json(), { hello: "world" })
  assert.equal(typeof (await res2.text()), "string")
  assert.ok((await res2.bytes()) instanceof Uint8Array)
})

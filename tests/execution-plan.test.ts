import assert from "node:assert/strict"
import test from "node:test"
import { HttpError, Nelysia } from "../packages/core/src/index.ts"
import { createBunHandler, createBunRuntimeHandler } from "../packages/runtime-bun/src/handler.ts"
import { createFetchHandler } from "../packages/runtime-fetch/src/server.ts"
import { lookupDynamicPath, lookupDynamicUrl, matchSingleDynamicPath } from "../packages/core/src/router.ts"
import { compilePath } from "../packages/core/src/router.ts"
import type { RequestData, RouteRecord } from "../packages/core/src/types.ts"
import { createExecutionPlan, getRuntimeExecutor } from "../packages/core/src/execution.ts"

test("a route-level no-op hook uses the specialized runtime contract", async () => {
  const calls: string[] = []
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle(() => { calls.push("hook") })
    .get("/specialized", () => { calls.push("handler"); return { ok: true } })

  const response = await createBunHandler(app)(new Request("http://local/specialized"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(calls, ["hook", "handler"])
})

test("the synchronous specialized lane runs synchronous hooks without changing ordering", async () => {
  const calls: string[] = []
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle((context) => { calls.push(`hook:${context.request.method}`) })
    .get("/sync-hook", (context) => { calls.push(context.request.url); return { ok: true } })

  const response = await createBunHandler(app)(new Request("http://local/sync-hook"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(calls, ["hook:GET", "http://local/sync-hook"])
})

test("the internal Bun runtime boundary preserves synchronous responses", () => {
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle(() => {})
    .get("/sync-boundary", () => ({ ok: true }))

  const result = createBunRuntimeHandler(app)(new Request("http://local/sync-boundary"))
  assert.equal(result instanceof Promise, false)
  assert.equal((result as Response).status, 200)
})

test("the runtime executor exposes a native response fast lane for context-free routes", () => {
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle(() => {})
    .get("/native-fast", () => ({ ok: true }))
  const executor = getRuntimeExecutor(app)
  assert.equal(typeof executor?.handleNative, "function")
  const result = executor!.handleNative!({ method: "GET", url: "http://local/native-fast", headers: new Headers() })
  assert.equal(result instanceof Response, true)
  assert.equal((result as Response).status, 200)
})

test("Bun native routing skips preflight for a statically empty global hook", async () => {
  const app = new Nelysia({ requestId: false })
    .onRequest(() => {})
    .get("/native-noop", () => ({ ok: true }))
  let preflightCalls = 0
  const executor = getRuntimeExecutor(app)!
  const originalPreflight = executor.preflight
  executor.preflight = (request) => {
    preflightCalls++
    return originalPreflight(request)
  }

  const response = await createBunRuntimeHandler(app)(new Request("http://local/native-noop"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(preflightCalls, 0)
})

test("Bun native routing skips preflight for a pipeline-safe opaque handler", async () => {
  const app = new Nelysia({ requestId: false })
    .onRequest(() => {})
    .get("/native-generic/:id", (context) => ({ id: context.params.id }))
  let preflightCalls = 0
  const executor = getRuntimeExecutor(app)!
  const originalPreflight = executor.preflight
  executor.preflight = (request) => {
    preflightCalls++
    return originalPreflight(request)
  }

  const response = await createBunRuntimeHandler(app)(new Request("http://local/native-generic/42"))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { id: "42" })
  assert.equal(preflightCalls, 0)
})

test("conservative inference recognizes a named params-only context", () => {
  const app = new Nelysia({ requestId: false })
    .get("/named-params/:id", (context) => ({ id: context.params.id }))
  const plan = createExecutionPlan(app.graph.routes[0]!, {
    telemetry: false,
    modulesPending: false,
    mounts: false,
    contextValues: false,
    contextExtensions: false
  })
  assert.equal(plan.lane, "minimal")
  assert.equal(plan.contextFreePipeline, true)
  assert.deepEqual(plan.needs.fields, ["params"])
})

test("conservative inference recognizes literal computed context fields", () => {
  const app = new Nelysia({ requestId: false })
    .get("/literal", (context) => ({ url: context["request"].url }))
  const plan = createExecutionPlan(app.graph.routes[0]!, {
    telemetry: false,
    modulesPending: false,
    mounts: false,
    contextValues: false,
    contextExtensions: false
  })
  assert.equal(plan.lane, "specialized")
  assert.equal(plan.needs.full, false)
  assert.deepEqual(plan.needs.fields, ["request"])
})

test("dynamic computed context fields remain generic", () => {
  const selectField = () => "request"
  const app = new Nelysia({ requestId: false })
    .get("/dynamic", (context) => ({ value: (context as unknown as Record<string, unknown>)[selectField()] }))
  const plan = createExecutionPlan(app.graph.routes[0]!, {
    telemetry: false,
    modulesPending: false,
    mounts: false,
    contextValues: false,
    contextExtensions: false
  })
  assert.equal(plan.lane, "generic")
  assert.equal(plan.needs.full, true)
})

test("native specialized responses preserve helpers and HttpError semantics", async () => {
  const app = new Nelysia({ requestId: false })
    .onRequest(() => {})
    .get("/native-helper", ({ json }) => json({ ok: true }, { status: 201, headers: { "x-native": "yes" } }))
    .get("/native-error", () => { throw new HttpError(418, "teapot", { error: "teapot" }) })

  const handler = createBunRuntimeHandler(app)
  const helper = await handler(new Request("http://local/native-helper"))
  assert.equal(helper.status, 201)
  assert.equal(helper.headers.get("x-native"), "yes")
  assert.deepEqual(await helper.json(), { ok: true })

  const error = await handler(new Request("http://local/native-error"))
  assert.equal(error.status, 418)
  assert.deepEqual(await error.json(), { error: "teapot" })
})

test("specialized execution cleans up execution controls", async () => {
  let cleanupCalls = 0
  const control = {
    signal: new AbortController().signal,
    invoke(handler: () => unknown) { return handler() },
    cleanup() { cleanupCalls++ }
  }
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle((context) => { context.executionControl = control })
    .get("/cleanup", () => ({ ok: true }))

  const response = await createFetchHandler(app)(new Request("http://local/cleanup"))
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(cleanupCalls, 1)
})

test("public handle keeps Promise rejection semantics for synchronous errors", async () => {
  const app = new Nelysia({ requestId: false }).get("/sync-error", () => { throw new Error("sync failure") })
  const result = app.handle({ method: "GET", url: "http://local/sync-error", headers: new Headers() })
  assert.equal(result instanceof Promise, true)
  await assert.rejects(result, /sync failure/)
})

test("context-free async HttpError results are normalized", async () => {
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle(() => {})
    .get("/async-error", () => Promise.reject(new HttpError(409, "conflict", { error: "conflict" })))

  const response = await app.handle({ method: "GET", url: "http://local/async-error", headers: new Headers() })
  assert.equal(response.status, 409)
  assert.deepEqual(response.body, { error: "conflict" })
})

test("Bun native routing preserves generated request IDs", async () => {
  const app = new Nelysia()
    .onRequest(() => {})
    .get("/native-request-id", () => ({ ok: true }))

  const response = await createBunRuntimeHandler(app)(new Request("http://local/native-request-id"))
  assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})

test("the optimized dynamic matcher preserves decoding and trailing-slash behavior", () => {
  const route = {
    method: "GET",
    path: "/users/:id",
    ...compilePath("/users/:id")
  } as RouteRecord

  assert.deepEqual(lookupDynamicPath([route], "/users/a%2Fb")?.params, { id: "a/b" })
  assert.deepEqual(lookupDynamicPath([route], "/users/42/")?.params, { id: "42" })
  assert.deepEqual(matchSingleDynamicPath(route, "/users/42/"), { id: "42" })
  assert.equal(lookupDynamicPath([route], "/users/42/more"), undefined)
  assert.deepEqual(lookupDynamicUrl([route], "http://local/users/encoded%2Fid?x=1")?.params, { id: "encoded/id" })
})

test("sync-classified hooks still await custom thenables exactly once", async () => {
  let thenCalls = 0
  const thenable = {
    then(resolve: (value: undefined) => void) {
      thenCalls++
      resolve(undefined)
    }
  }
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle(() => thenable)
    .get("/thenable", () => "ok")

  const response = await createFetchHandler(app)(new Request("http://local/thenable"))
  assert.equal(await response.text(), "ok")
  assert.equal(thenCalls, 1)
})

test("adding a hook after registration invalidates the route plan", async () => {
  const calls: string[] = []
  const app = new Nelysia({ requestId: false }).get("/invalidate", () => "ok")
  assert.equal(await (await createBunHandler(app)(new Request("http://local/invalidate"))).text(), "ok")
  app.onBeforeHandle(() => { calls.push("late") })
  assert.equal(await (await createBunHandler(app)(new Request("http://local/invalidate"))).text(), "ok")
  assert.deepEqual(calls, ["late"])
})

test("known context fields are available while opaque access keeps generic behavior", async () => {
  const app = new Nelysia({ requestId: false })
    .get("/known", ({ query }) => ({ value: query.value }))
    .get("/opaque", (context) => ({ value: context.query.value }))

  const handler = createFetchHandler(app)
  const known = await handler(new Request("http://local/known?value=one"))
  const opaque = await handler(new Request("http://local/opaque?value=two"))
  assert.deepEqual(await known.json(), { value: "one" })
  assert.deepEqual(await opaque.json(), { value: "two" })
})

test("opaque contexts keep lazy query and response helpers observable", async () => {
  const app = new Nelysia({ requestId: false }).get("/lazy", (context) => {
    context.header("x-lazy", context.query.value ?? "missing")
    return context.text("ok")
  })
  const response = await createFetchHandler(app)(new Request("http://local/lazy?value=yes"))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("x-lazy"), "yes")
  assert.equal(await response.text(), "ok")
})

test("opaque contexts materialize lazy route metadata on demand", async () => {
  const selectField = () => "route"
  const app = new Nelysia({ requestId: false }).get("/lazy-route", (context) => ({
    path: (context as unknown as Record<string, { path: string }>)[selectField()]?.path
  }))
  const response = await createFetchHandler(app)(new Request("http://local/lazy-route"))
  assert.deepEqual(await response.json(), { path: "/lazy-route" })
})

test("specialized stages preserve lifecycle order and response helpers", async () => {
  const order: string[] = []
  const app = new Nelysia({ requestId: false })
    .onBeforeHandle(async ({ params }) => { order.push(`before:${params.id}`) })
    .mapResponse(({ params }, response) => { order.push(`map:${params.id}`); response.headers.set("x-mapped", "yes"); return response })
    .onAfterHandle(({ params }) => { order.push(`after:${params.id}`) })
    .onAfterResponse(({ params }) => { order.push(`after-response:${params.id}`) })
    .get("/lifecycle/:id", ({ json, params }) => { order.push("handler"); return json({ id: params.id }) })

  const response = await createFetchHandler(app)(new Request("http://local/lifecycle/42"))
  assert.equal(response.headers.get("x-mapped"), "yes")
  assert.deepEqual(await response.json(), { id: "42" })
  assert.deepEqual(order, ["before:42", "handler", "map:42", "after:42", "after-response:42"])
})

test("specialized error handlers preserve HttpError normalization", async () => {
  const app = new Nelysia({ requestId: false })
    .onError((error, { json }) => error instanceof Error ? json({ message: error.message }, 418) : undefined)
    .get("/error", () => { throw new Error("specialized failure") })

  const response = await createBunHandler(app)(new Request("http://local/error"))
  assert.equal(response.status, 418)
  assert.deepEqual(await response.json(), { message: "specialized failure" })
})

test("opaque context enumeration remains on the generic reference path", async () => {
  const app = new Nelysia({ requestId: false }).get("/keys", (context) => Object.keys(context).includes("query"))
  const response = await createFetchHandler(app)(new Request("http://local/keys"))
  assert.equal(await response.text(), "true")
})

test("generic execution reuses the route match for opaque handlers", async () => {
  const app = new Nelysia({ requestId: false }).get("/opaque/:id", (context) => ({ id: context["params"].id }))
  let urlReads = 0
  const request = {
    method: "GET",
    headers: new Headers(),
    get url() {
      urlReads++
      return "http://local/opaque/42"
    }
  } as RequestData

  const response = await getRuntimeExecutor(app)!.handle(request)
  assert.deepEqual(response.body, { id: "42" })
  assert.ok(urlReads <= 4, `expected one prepared match, got ${urlReads} URL reads`)
})

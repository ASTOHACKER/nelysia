import assert from "node:assert/strict"
import test from "node:test"
import { createTypedClient, type ClientResponse } from "../packages/client/src/index.ts"
import { Nelysia } from "../packages/core/src/app.ts"
import { t } from "../packages/core/src/schema.ts"

interface Routes {
  "GET /users": { response: { id: string }[]; query: { page?: number } }
  "GET /users/:id": { response: { id: string }; params: { id: string }; query: { verbose?: boolean } }
  "POST /users": { response: { id: string }; body: { name: string } }
  "PUT /users/:id": { response: { id: string }; params: { id: string }; body: { name: string } }
  "PATCH /users/:id": { response: { id: string }; params: { id: string }; body: { name?: string }; headers: { "x-request-token": string } }
  "DELETE /users/:id": { response: { deleted: true }; params: { id: string } }
  "HEAD /users": { response: undefined }
  "OPTIONS /users": { response: undefined }
}

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2) ? true : false
type Expect<Value extends true> = Value
const typedApp = new Nelysia()
  .model({ User: t.Object({ id: t.String() }) })
  .get("/users", () => [{ id: "user-1" }], { response: t.Array(t.Object({ id: t.String() })) })
  .post("/users", ({ body }) => body, { body: t.Object({ name: t.String() }), response: "User" })
  .patch("/users/:id", ({ params }) => ({ id: params.id }), { params: t.Object({ id: t.String() }) })
type InferredRoutes = typeof typedApp extends Nelysia<any, infer RouteTypes, any> ? RouteTypes : never
type _RouteKeys = Expect<Equal<keyof InferredRoutes, "GET /users" | "POST /users" | "PATCH /users/:id">>
type _NamedModel = Expect<InferredRoutes["POST /users"]["response"] extends { id: string } ? true : false>
type _PathParams = Expect<InferredRoutes["PATCH /users/:id"]["params"] extends { id: string } ? true : false>
const childApp = new Nelysia().get("/health", () => ({ ok: true }))
type ChildRoutes = typeof childApp extends Nelysia<any, infer RouteTypes, any> ? RouteTypes : never
type _ChildRoute = Expect<"GET /health" extends keyof ChildRoutes ? true : false>
const composedApp = new Nelysia().mount("/api", childApp).use(new Nelysia().post("/events", () => "accepted"))
const pluginComposedApp = new Nelysia().use((plugin) => plugin.get("/plugin-health", () => "ok"))
const groupedApp = new Nelysia().group("/v1", (group) => group.get("/status", () => "up"))
const guardedApp = new Nelysia().guard({ body: t.Object({ token: t.String() }) }, (guard) => guard.post("/secure", ({ body }) => body))
type ComposedRoutes = typeof composedApp extends Nelysia<any, infer RouteTypes, any> ? RouteTypes : never
type PluginComposedRoutes = typeof pluginComposedApp extends Nelysia<any, infer RouteTypes, any> ? RouteTypes : never
type GroupedRoutes = typeof groupedApp extends Nelysia<any, infer RouteTypes, any> ? RouteTypes : never
type GuardedRoutes = typeof guardedApp extends Nelysia<any, infer RouteTypes, any> ? RouteTypes : never
type _MountedRoute = Expect<"GET /api/health" extends keyof ComposedRoutes ? true : false>
type _UsedRoute = Expect<"POST /events" extends keyof ComposedRoutes ? true : false>
type _PluginRoute = Expect<"GET /plugin-health" extends keyof PluginComposedRoutes ? true : false>
type _GroupedRoute = Expect<"GET /v1/status" extends keyof GroupedRoutes ? true : false>
type _GuardedBody = Expect<GuardedRoutes["POST /secure"]["body"] extends { token: string } ? true : false>

const typeClient = createTypedClient<Routes>("https://api.example.test")
function compileTimeChecks() {
  void typeClient.get("/users", { query: { page: 1 } })
  void typeClient.get("/users/123")
  void typeClient.post("/users", { name: "Ada" })
  void typeClient.put("/users/123", { name: "Ada" })
  void typeClient.patch("/users/123", { name: "Grace" }, { headers: { "x-request-token": "token" } })
  void typeClient.delete("/users/123")
  void typeClient.head("/users")
  void typeClient.options("/users")
  // @ts-expect-error unknown method/path combinations are rejected by the route map
  void typeClient.get("/missing")
  // @ts-expect-error request bodies must match the generated contract
  void typeClient.post("/users", { displayName: "Ada" })
  // @ts-expect-error path parameters are required when the template is used
  void typeClient.get("/users/:id", { params: { other: "id" } })
  // @ts-expect-error query fields must match the generated contract
  void typeClient.get("/users", { query: { page: "one" } })
  // @ts-expect-error required headers cannot be omitted from a header object
  void typeClient.patch("/users/123", { name: "Ada" }, { headers: { "x-other": "token" } })
}
void compileTimeChecks

test("typed client maps generated route keys to response types", async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify([{ id: "user-1" }]), { headers: { "content-type": "application/json" } })
  }
  try {
    const client = createTypedClient<Routes>("https://api.example.test")
    const result = await client.get("/users")
    const typed: ClientResponse<{ id: string }[]> = result
    assert.deepEqual(typed.data, [{ id: "user-1" }])
    await client.post("/users", { name: "Ada" })
    await client.get("/users/:id", { params: { id: "user-1" }, query: { verbose: true } })
    assert.equal(requestedUrl, "https://api.example.test/users/user-1?verbose=true")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("typed client supports custom fetch, headers, all methods, and array query policies", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "content-type": "application/json" } })
  }
  const client = createTypedClient<Routes>("https://api.example.test/v1/", {
    fetch: fetcher,
    headers: { "x-client": "test" },
    queryArray: "repeat"
  })
  await client.patch("/users/:id", { name: "Ada" }, { params: { id: "a/b" }, headers: { "x-request-token": "token" } })
  await client.delete("/users/123", { query: undefined })
  assert.equal(calls[0]?.url, "https://api.example.test/users/a%2Fb")
  assert.equal(new Headers(calls[0]?.init.headers).get("x-client"), "test")
  assert.equal(new Headers(calls[0]?.init.headers).get("x-request-token"), "token")
  assert.equal(calls[0]?.init.method, "PATCH")
  assert.equal(calls[1]?.init.method, "DELETE")
})

test("typed client preserves non-JSON error bodies and response metadata", async () => {
  const client = createTypedClient<Routes>("https://api.example.test", {
    fetch: async () => new Response("upstream failed", { status: 502, headers: { "x-upstream": "edge" } })
  })
  const result = await client.get("/users")
  assert.equal(result.error?.status, 502)
  assert.equal(result.error?.body, "upstream failed")
  assert.equal(result.response.headers.get("x-upstream"), "edge")
})

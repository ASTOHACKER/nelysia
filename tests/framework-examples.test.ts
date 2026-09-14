import assert from "node:assert/strict"
import test from "node:test"
import { GET as astroGet } from "../examples/astro/src/pages/api/nelysia.ts"
import { GET as nextGet } from "../examples/nextjs/app/api/nelysia/route.ts"
import { fetchHandler as nuxtHandler, handler as nuxtEventHandler } from "../examples/nuxt/server/api/nelysia.ts"
import { GET as svelteKitGet } from "../examples/sveltekit/src/routes/api/nelysia/+server.ts"
import { fetchHandler as tanStackStartHandler, server as tanStackStartServer } from "../examples/tanstack-start/src/routes/api/nelysia.ts"
import { app as featureModuleApp } from "../examples/feature-module.ts"
import cloudflareWorker from "../examples/cloudflare/worker.ts"

test("framework examples preserve the Fetch handler contract", async () => {
  const handlers = [
    ["astro", (request: Request) => astroGet({ request })],
    ["nextjs", nextGet],
    ["nuxt", nuxtHandler],
    ["sveltekit", (request: Request) => svelteKitGet({ request })],
    ["tanstack-start", tanStackStartHandler]
  ] as const

  for (const [runtime, handler] of handlers) {
    const response = await handler(new Request("https://example.test/api/nelysia"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { runtime, ok: true })
  }

  const nuxtRequest = new Request("https://example.test/api/nelysia")
  const nuxtEventResponse = await nuxtEventHandler({ req: nuxtRequest, web: { request: nuxtRequest } } as never)
  assert.deepEqual(await nuxtEventResponse.json(), { runtime: "nuxt", ok: true })
  const tanstackResponse = await tanStackStartServer.handlers.GET({ request: new Request("https://example.test/api/nelysia") })
  assert.deepEqual(await tanstackResponse.json(), { runtime: "tanstack-start", ok: true })
})

test("Cloudflare example preserves env and execution context forwarding", async () => {
  const response = await cloudflareWorker.fetch(new Request("https://example.test/"), { REGION: "test" }, { waitUntil() {} })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { runtime: "cloudflare", ok: true, region: "test", hasExecutionContext: true })
})

test("feature module example composes prefixed routes and named schemas", async () => {
  const created = await featureModuleApp.injectUntyped({
    method: "POST",
    path: "/users",
    body: { name: "Ada" }
  })
  assert.equal(created.statusCode, 200)
  assert.deepEqual(await created.json(), { id: "user-1", name: "Ada" })

  const user = await featureModuleApp.injectUntyped({ method: "GET", path: "/users/42" })
  assert.equal(user.statusCode, 200)
  assert.deepEqual(await user.json(), { id: "42", name: "Ada" })
})

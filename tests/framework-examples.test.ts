import assert from "node:assert/strict"
import test from "node:test"
import { GET as astroGet } from "../examples/astro/src/pages/api/nelysia.ts"
import { GET as nextGet } from "../examples/nextjs/app/api/nelysia/route.ts"
import { fetchHandler as nuxtHandler } from "../examples/nuxt/server/api/nelysia.ts"
import { GET as svelteKitGet } from "../examples/sveltekit/src/routes/api/nelysia/+server.ts"
import { fetchHandler as tanStackStartHandler } from "../examples/tanstack-start/src/routes/api/nelysia.ts"

test("framework examples preserve the Fetch handler contract", async () => {
  const handlers = [
    ["astro", astroGet],
    ["nextjs", nextGet],
    ["nuxt", nuxtHandler],
    ["sveltekit", (request: Request) => svelteKitGet({ request })],
    ["tanstack-start", tanStackStartHandler]
  ] as const

  for (const [runtime, handler] of handlers) {
    const response = await handler(new Request("https://example.test/"))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { runtime, ok: true })
  }
})

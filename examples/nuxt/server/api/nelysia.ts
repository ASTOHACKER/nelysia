import { Nelysia } from "../../../../packages/core/src/index.ts"
import { createFetchHandler } from "../../../../packages/runtime-fetch/src/server.ts"

const app = new Nelysia().get("/", () => ({ runtime: "nuxt", ok: true }))

// Keep the Fetch handler available for a Nitro/server route bridge.
export const fetchHandler = createFetchHandler(app)

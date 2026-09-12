import { Nelysia } from "../../../../../packages/core/src/index.ts"
import { createFetchHandler } from "../../../../../packages/runtime-fetch/src/server.ts"

const app = new Nelysia().get("/", () => ({ runtime: "astro", ok: true }))

// Astro's endpoint method can use a Fetch-standard handler directly.
export const GET = createFetchHandler(app)

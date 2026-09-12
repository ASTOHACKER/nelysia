import { Nelysia } from "../../../../../packages/core/src/index.ts"
import { createFetchHandler } from "../../../../../packages/runtime-fetch/src/server.ts"

const app = new Nelysia().get("/", () => ({ runtime: "tanstack-start", ok: true }))

// Export the Fetch boundary for a TanStack Start server route to call.
export const fetchHandler = createFetchHandler(app)

import { Nelysia } from "../../../../../packages/core/src/index.ts"
import { createFetchHandler } from "../../../../../packages/runtime-fetch/src/server.ts"

const app = new Nelysia().get("/", () => ({ runtime: "nextjs", ok: true }))

// Next.js App Router route methods accept Fetch-standard handlers.
export const GET = createFetchHandler(app)

import { Nelysia } from "@narudom96/nelysia"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"

const app = new Nelysia().get("/api/nelysia", () => ({ runtime: "nextjs", ok: true }))

// Next.js App Router route methods accept Fetch-standard handlers.
const fetchHandler = createFetchHandler(app)
const routeHandler = (request: Request) => fetchHandler(request)
export const GET = routeHandler
export const POST = routeHandler
export const PUT = routeHandler
export const PATCH = routeHandler
export const DELETE = routeHandler
export const HEAD = routeHandler
export const OPTIONS = routeHandler

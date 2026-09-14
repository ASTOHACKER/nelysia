import { Nelysia } from "@narudom96/nelysia"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"

const app = new Nelysia().get("/api/nelysia", () => ({ runtime: "sveltekit", ok: true }))
const fetchHandler = createFetchHandler(app)

// SvelteKit passes a Request inside its RequestEvent.
type RequestEvent = { request: Request }
const fromEvent = ({ request }: RequestEvent) => fetchHandler(request)
export const GET = fromEvent
export const POST = fromEvent
export const PUT = fromEvent
export const PATCH = fromEvent
export const DELETE = fromEvent
export const HEAD = fromEvent
export const OPTIONS = fromEvent

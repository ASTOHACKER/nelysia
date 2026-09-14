import { Nelysia } from "@narudom96/nelysia"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"

const app = new Nelysia().get("/api/nelysia", () => ({ runtime: "astro", ok: true }))

const fetchHandler = createFetchHandler(app)

// Astro passes an APIContext; forward its Fetch-standard Request to Nelysia.
export const GET = ({ request }: { request: Request }) => fetchHandler(request)
export const POST = ({ request }: { request: Request }) => fetchHandler(request)

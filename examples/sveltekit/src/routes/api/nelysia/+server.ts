import { Nelysia } from "../../../../../../packages/core/src/index.ts"
import { createFetchHandler } from "../../../../../../packages/runtime-fetch/src/server.ts"

const app = new Nelysia().get("/", () => ({ runtime: "sveltekit", ok: true }))
const fetchHandler = createFetchHandler(app)

// SvelteKit passes a Request inside its RequestEvent.
export const GET = ({ request }: { request: Request }) => fetchHandler(request)

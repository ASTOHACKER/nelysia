import { Nelysia } from "../../packages/core/src/index.ts"
import { createFetchHandler } from "../../packages/runtime-fetch/src/server.ts"

const app = new Nelysia().get("/", () => ({ runtime: "cloudflare", ok: true }))
const fetchHandler = createFetchHandler(app)

export default { fetch: fetchHandler }

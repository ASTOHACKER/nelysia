import type { Nelysia } from "../../core/src/app.ts"
import { createFetchHandler } from "../../runtime-fetch/src/server.ts"

export function createVercelHandler(app: Nelysia): (request: Request) => Promise<Response> {
  return createFetchHandler(app)
}

import type { Nelysia } from "../../core/src/app.ts"
import { createFetchHandler } from "../../runtime-fetch/src/server.ts"

export function createCloudflareHandler(app: Nelysia): (request: Request, env?: unknown, executionContext?: unknown) => Promise<Response> {
  const handler = createFetchHandler(app)
  return (request) => handler(request)
}

export function createCloudflareWorker(app: Nelysia) {
  return { fetch: createCloudflareHandler(app) }
}

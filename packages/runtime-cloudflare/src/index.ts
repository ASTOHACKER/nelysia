import type { Nelysia } from "../../core/src/app.ts"
import { createFetchHandler } from "../../runtime-fetch/src/server.ts"

export function createCloudflareHandler(app: Nelysia<any, any, any>): (request: Request, env?: unknown, executionContext?: unknown) => Promise<Response> {
  const handler = createFetchHandler(app)
  return (request, env, executionContext) => handler(request, { env, executionContext })
}

export function createCloudflareWorker(app: Nelysia<any, any, any>) {
  return { fetch: createCloudflareHandler(app) }
}

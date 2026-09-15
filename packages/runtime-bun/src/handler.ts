import { type Nelysia } from "../../core/src/app.ts"
import { parseWebRequestBody } from "../../core/src/body.ts"
import type { RequestData } from "../../core/src/types.ts"

/** Generic Bun handler kept separate from the server so the compiler can
 * compose a compiled handler with this fallback without a module cycle. */
export function createBunHandler(app: Nelysia<any, any, any>): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = app.requestIdEnabled ? request.headers.get("x-request-id") ?? crypto.randomUUID() : undefined
    const data: RequestData = { method: request.method, url: request.url, requestId, headers: request.headers, rawRequest: request }
    try {
      const preflight = await app.preflight(data)
      if (preflight.kind === "response") return toResponse(preflight.response)
      const body = await parseWebRequestBody(request, app.bodyLimit)
      return toResponse(await app.handle({ ...data, body, preflight }))
    } catch (error) {
      return toResponse(await app.handleAdapterError(error, data))
    }
  }
}

export function toResponse(result: { status: number; headers: Headers; body: unknown }): Response {
  if (result.body instanceof Response) {
    const headers = new Headers(result.body.headers)
    for (const [key, value] of result.headers) headers.set(key, value)
    return new Response(result.body.body, { status: result.status, headers })
  }
  if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
  const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body)
  if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
  return new Response(body, { status: result.status, headers: result.headers })
}

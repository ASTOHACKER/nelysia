import { type Nelysia } from "../../core/src/app.ts"
import { parseWebRequestBody } from "../../core/src/body.ts"
import type { RequestData } from "../../core/src/types.ts"

/** Generic Bun handler kept separate from the server so the compiler can
 * compose a compiled handler with this fallback without a module cycle. */
const sharedJsonHeaders = new Headers({ "content-type": "application/json; charset=utf-8" })

function isEmptyHeaders(headers: Headers): boolean {
  for (const _entry of headers) return false
  return true
}

export function createBunHandler(app: Nelysia<any, any, any>): (request: Request) => Promise<Response> {
  // GET/HEAD carry no body, so when the app has no global lifecycle to run
  // before body parsing, preflight is pure overhead: handle() already routes
  // and runs any route-level hooks itself when no preflight is attached.
  const skipPreflight = app.telemetry === undefined && !app.hasGlobalLifecycle && !app.hasContextValues && !app.hasFetchMounts
  return async (request) => {
    const requestId = app.requestIdEnabled ? request.headers.get("x-request-id") ?? crypto.randomUUID() : undefined
    const data: RequestData = { method: request.method, url: request.url, requestId, headers: request.headers, rawRequest: request }
    try {
      if (skipPreflight && (request.method === "GET" || request.method === "HEAD")) {
        return toResponse(await app.handle(data))
      }
      const preflight = await app.preflight(data)
      if (preflight.kind === "response") return toResponse(preflight.response)
      // GET/HEAD never carry a usable body (parseWebRequestBody returns
      // undefined for them); skip the await tick on the hot path.
      const body = request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await parseWebRequestBody(request, app.bodyLimit)
      // Mutate the per-request object instead of spreading: identical fields,
      // one fewer allocation on the hot path.
      data.body = body
      data.preflight = preflight
      return toResponse(await app.handle(data))
    } catch (error) {
      return toResponse(await app.handleAdapterError(error, data))
    }
  }
}

export function toResponse(result: { status: number; headers: Headers; body: unknown }): Response {
  if (result.body instanceof Response) {
    // Fast path: same status and no adapter headers to merge means the native
    // response is already exact — return it instead of copying headers twice.
    if (result.status === result.body.status) {
      let hasExtra = false
      for (const _entry of result.headers) { hasExtra = true; break }
      if (!hasExtra) return result.body
    }
    const headers = new Headers(result.body.headers)
    for (const [key, value] of result.headers) headers.set(key, value)
    return new Response(result.body.body, { status: result.status, headers })
  }
  if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
  // Plain-object JSON is the hot path (bench /json, /users/:id). When the
  // adapter added no extra headers (no x-request-id, no set.headers), reuse
  // the shared Headers instance instead of mutating a per-request Headers.
  // Bun reuses Headers instances faster than normalizing a mutated one.
  // Behavior is identical: same status, same JSON body, same content-type.
  if (typeof result.body !== "string" && result.body !== undefined && result.body !== null) {
    const serialized = JSON.stringify(result.body)
    if (isEmptyHeaders(result.headers)) return new Response(serialized, { status: result.status, headers: sharedJsonHeaders })
    result.headers.set("content-type", "application/json; charset=utf-8")
    return new Response(serialized, { status: result.status, headers: result.headers })
  }
  const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body)
  return new Response(body, { status: result.status, headers: result.headers })
}

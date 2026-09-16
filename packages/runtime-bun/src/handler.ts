import { type Nelysia } from "../../core/src/app.ts"
import { parseWebRequestBody } from "../../core/src/body.ts"
import type { RequestData } from "../../core/src/types.ts"
import { getRuntimeExecutor, isThenable, type RuntimeExecutor } from "../../core/src/execution.ts"

/** Generic Bun handler kept separate from the server so the compiler can
 * compose a compiled handler with this fallback without a module cycle. */
const sharedJsonHeaders = new Headers({ "content-type": "application/json; charset=utf-8" })

function isEmptyHeaders(headers: Headers): boolean {
  for (const _entry of headers) return false
  return true
}

type BunHandler = (request: Request) => Response | Promise<Response>

/**
 * Internal adapter boundary used by Bun. The core executor deliberately
 * returns a sync/async union; keeping that union through the adapter avoids a
 * Promise allocation for the common synchronous lifecycle path. The public
 * createBunHandler wrapper below retains its Promise-returning contract.
 */
export function createBunRuntimeHandler(app: Nelysia<any, any, any>): BunHandler {
  // GET/HEAD carry no body, so when the app has no global lifecycle to run
  // before body parsing, preflight is pure overhead: handle() already routes
  // and runs any route-level hooks itself when no preflight is attached.
  const skipPreflight = app.telemetry === undefined && !app.hasGlobalLifecycle && !app.hasContextValues && !app.hasFetchMounts
  const executor: RuntimeExecutor = getRuntimeExecutor(app) ?? { preflight: (data) => app.preflight(data), handle: (data) => app.handle(data) }

  const handleAdapterError = (error: unknown, data: RequestData): Response | Promise<Response> => {
    try {
      const result = app.handleAdapterError(error, data)
      if (isThenable(result)) {
        return Promise.resolve(result).then((value) => toResponse(value))
      }
      return toResponse(result)
    } catch (nextError) {
      return Promise.reject(nextError)
    }
  }

  const resolveHandle = (data: RequestData, result: unknown): Response | Promise<Response> => {
    if (isThenable(result)) {
      return Promise.resolve(result).then(
        (value) => {
          try { return toResponse(value as { status: number; headers: Headers; body: unknown }) }
          catch (error) { return handleAdapterError(error, data) }
        },
        (error) => handleAdapterError(error, data)
      )
    }
    try { return toResponse(result as { status: number; headers: Headers; body: unknown }) }
    catch (error) { return handleAdapterError(error, data) }
  }

  const resolveNative = (data: RequestData | undefined, request: Request, requestId: string | undefined, result: Response | Promise<Response>): Response | Promise<Response> => {
    if (isThenable(result)) return Promise.resolve(result).then((value) => value, (error) => handleAdapterError(error, data ?? { method: request.method, url: request.url, requestId, headers: request.headers, rawRequest: request }))
    return result
  }

  const consumePreflight = (data: RequestData, preflight: Awaited<ReturnType<RuntimeExecutor["preflight"]>>): Response | Promise<Response> => {
    if (preflight.kind === "response") return resolveHandle(data, preflight.response)
    const finish = (body: unknown): Response | Promise<Response> => {
      data.body = body
      data.preflight = preflight
      return resolveHandle(data, executor.handle(data))
    }
    if (data.method === "GET" || data.method === "HEAD") return finish(undefined)
    try {
      const body = parseWebRequestBody(data.rawRequest ?? new Request(data.url, { method: data.method, headers: data.headers }), app.bodyLimit)
      if (isThenable(body)) return Promise.resolve(body).then(finish, (error) => handleAdapterError(error, data))
      return finish(body)
    } catch (error) {
      return handleAdapterError(error, data)
    }
  }

  return (request) => {
    const requestId = app.requestIdEnabled ? request.headers.get("x-request-id") ?? crypto.randomUUID() : undefined
    let data: RequestData | undefined
    try {
      const bodyless = request.method === "GET" || request.method === "HEAD"
      if (skipPreflight && bodyless) {
        const nativeRequest = executor.handleNativeRequest?.(request, requestId)
        if (nativeRequest !== undefined) return resolveNative(undefined, request, requestId, nativeRequest)
        data = { method: request.method, url: request.url, requestId, headers: request.headers, rawRequest: request }
        const native = executor.handleNative?.(data)
        if (native !== undefined) return resolveNative(data, request, requestId, native)
        return resolveHandle(data!, executor.handle(data!))
      }
      // A statically empty request/parse/guard stage is safe to elide from
      // preflight. Let the core executor prove that route-local condition;
      // routes with observable stages return undefined and use the reference
      // preflight path below.
      if (bodyless) {
        const nativeRequest = executor.handleNativeRequest?.(request, requestId)
        if (nativeRequest !== undefined) return resolveNative(undefined, request, requestId, nativeRequest)
      }
      data = { method: request.method, url: request.url, requestId, headers: request.headers, rawRequest: request }
      const preflight = executor.preflight(data!)
      if (isThenable(preflight)) return Promise.resolve(preflight).then((value) => consumePreflight(data!, value), (error) => handleAdapterError(error, data!))
      return consumePreflight(data!, preflight)
    } catch (error) {
      return handleAdapterError(error, data ?? { method: request.method, url: request.url, requestId, headers: request.headers, rawRequest: request })
    }
  }
}

/** Public Promise-returning compatibility wrapper. */
export function createBunHandler(app: Nelysia<any, any, any>): (request: Request) => Promise<Response> {
  const handler = createBunRuntimeHandler(app)
  return (request) => {
    try { return Promise.resolve(handler(request)) }
    catch (error) { return Promise.reject(error) }
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

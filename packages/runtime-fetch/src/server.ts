import { HttpError, type Nelysia } from "../../core/src/app.ts"
import { compileDispatcher, fastPathname, lookupCompiled, type CompiledDispatcher } from "../../compiler/src/dispatcher.ts"
import { responseMarker } from "../../core/src/types.ts"

export interface FetchRequestContext {
  env?: unknown
  executionContext?: unknown
}

export function createFetchHandler(app: Nelysia<any, any, any>): (request: Request, context?: FetchRequestContext) => Promise<Response> {
  // Auto-use the compiled dispatcher for hook-free GET routes; everything else
  // flows through the generic adapter below (same contract, same fallbacks).
  let dispatcher: CompiledDispatcher | undefined
  let dispatcherReady: Promise<void> | undefined
  const getDispatcher = async (): Promise<CompiledDispatcher | undefined> => {
    if (dispatcherReady === undefined) dispatcherReady = app.modules.then(() => {
      if (app.telemetry === undefined) dispatcher = compileDispatcher(app)
    })
    await dispatcherReady
    return dispatcher
  }
  return async (request, context) => {
    if (dispatcher !== undefined && context === undefined && request.method === "GET") {
      const fast = await tryCompiledGet(app, dispatcher, request)
      if (fast !== undefined) return fast
    } else if (context === undefined && request.method === "GET") {
      let ready: CompiledDispatcher | undefined
      try { ready = await getDispatcher() } catch { return genericFetch(app, request, context) }
      if (ready !== undefined) {
        const fast = await tryCompiledGet(app, ready, request)
        if (fast !== undefined) return fast
      }
    }
    return genericFetch(app, request, context)
  }
}

/** Compiled GET fast path. Returns undefined when the generic flow owns it. */
async function tryCompiledGet(app: Nelysia<any, any, any>, dispatcher: CompiledDispatcher, request: Request): Promise<Response | undefined> {
  const found = lookupCompiled(dispatcher, fastPathname(request.url))
  if (found === undefined || found.kind === "generic") return undefined
  if (dispatcher.hasContextValues && found.kind === "params") return undefined
  const requestId = dispatcher.needsRequestId
    ? (request.headers.get("x-request-id") ?? `req-GET-${request.url}`)
    : undefined
  const withId = (headers: Headers): Headers => {
    if (requestId !== undefined) headers.set("x-request-id", requestId)
    return headers
  }
  if (found.kind === "static-prebuilt") {
    const serialized = found.entry.serialized!
    const body = serialized.text !== undefined ? serialized.text : serialized.bytes as unknown as BodyInit
    return new Response(body, {
      status: 200,
      headers: withId(new Headers({ "content-type": serialized.contentType })),
    })
  }
  let result: unknown
  try {
    result = found.kind === "static-sync"
      ? (found.entry.route.handler as () => unknown)()
      : found.entry.route.handler({ params: found.params } as never)
    result = await result
  } catch (error) {
    return errorResponse(app, error, request)
  }
  if (result instanceof HttpError) return errorResponse(app, result, request)
  if (result instanceof Response) {
    return new Response(result.body, { status: result.status, headers: withId(new Headers(result.headers)) })
  }
  if (result instanceof ReadableStream) {
    return new Response(result, { status: 200, headers: withId(new Headers()) })
  }
  if (isResponseData(result)) {
    return responseData(result, withId)
  }
  if (result === undefined || result === null) return new Response(null, { status: 200, headers: withId(new Headers()) })
  if (typeof result === "string" || result instanceof Uint8Array) {
    return new Response(result as unknown as BodyInit, {
      status: 200,
      headers: withId(new Headers({ "content-type": "text/plain; charset=utf-8" })),
    })
  }
  try {
    return Response.json(result, { headers: withId(new Headers()) })
  } catch (error) {
    return errorResponse(app, error, request)
  }
}

function isResponseData(value: unknown): value is { status: number; headers: Headers; body: unknown } {
  return typeof value === "object" && value !== null && (value as { [key: symbol]: unknown })[responseMarker] === true
}

function responseData(result: { status: number; headers: Headers; body: unknown }, withId: (headers: Headers) => Headers): Response {
  const headers = withId(new Headers(result.headers))
  if (result.body instanceof Response) {
    for (const [key, value] of result.body.headers) headers.set(key, value)
    return new Response(result.body.body, { status: result.status, headers })
  }
  if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers })
  if (result.body === undefined || result.body === null) return new Response(null, { status: result.status, headers })
  if (typeof result.body === "string" || result.body instanceof Uint8Array) return new Response(result.body as BodyInit, { status: result.status, headers })
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
  return new Response(JSON.stringify(result.body), { status: result.status, headers })
}

async function errorResponse(app: Nelysia<any, any, any>, error: unknown, request: Request): Promise<Response> {
  const result = await app.handleAdapterError(error, { method: request.method, url: request.url, headers: request.headers })
  if (result.body instanceof Response) return result.body
  if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
  const output = typeof result.body === "string" ? result.body : result.body === undefined ? null : JSON.stringify(result.body)
  if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
  return new Response(output, { status: result.status, headers: result.headers })
}

async function genericFetch(app: Nelysia<any, any, any>, request: Request, context?: FetchRequestContext): Promise<Response> {
  try {
    let body: unknown
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      const contentType = request.headers.get("content-type")
      const declaredLength = Number(request.headers.get("content-length") ?? 0)
      if (declaredLength > app.bodyLimit) throw new HttpError(413, "Request body is too large")
      if (contentType?.toLowerCase().includes("multipart/form-data")) {
        body = await request.formData()
      } else {
        const text = await request.text()
        if (new TextEncoder().encode(text).byteLength > app.bodyLimit) throw new HttpError(413, "Request body is too large")
        body = text || undefined
        if (contentType?.includes("application/json") && text) {
          try { body = JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
        }
      }
    }
    const result = await app.handle({ method: request.method, url: request.url, headers: request.headers, body, ...context })
    if (result.body instanceof Response) return result.body
    if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
    const output = typeof result.body === "string" ? result.body : result.body === undefined ? null : JSON.stringify(result.body)
    if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
    return new Response(output, { status: result.status, headers: result.headers })
  } catch (error) {
    const result = await app.handleAdapterError(error, { method: request.method, url: request.url, headers: request.headers, ...context })
    if (result.body instanceof Response) return result.body
    if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
    const output = typeof result.body === "string" ? result.body : result.body === undefined ? null : JSON.stringify(result.body)
    if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
    return new Response(output, { status: result.status, headers: result.headers })
  }
}

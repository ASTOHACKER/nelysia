import { HttpError, type Nelysia } from "../../core/src/app.ts"
import { compileDispatcher, fastPathname, lookupCompiled, type CompiledDispatcher } from "../../compiler/src/dispatcher.ts"
import { responseMarker } from "../../core/src/types.ts"

export function createFetchHandler(app: Nelysia): (request: Request) => Promise<Response> {
  // Auto-use the compiled dispatcher for hook-free GET routes; everything else
  // flows through the generic adapter below (same contract, same fallbacks).
  const dispatcher = app.telemetry !== undefined ? undefined : compileDispatcher(app)
  return async (request) => {
    if (dispatcher !== undefined && request.method === "GET") {
      const fast = await tryCompiledGet(dispatcher, request)
      if (fast !== undefined) return fast
    }
    return genericFetch(app, request)
  }
}

/** Compiled GET fast path. Returns undefined when the generic flow owns it. */
async function tryCompiledGet(dispatcher: CompiledDispatcher, request: Request): Promise<Response | undefined> {
  const found = lookupCompiled(dispatcher, fastPathname(request.url))
  if (found === undefined || found.kind === "generic") return undefined
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
    if (result instanceof Promise) result = await result.catch(() => FALLBACK)
  } catch {
    return undefined
  }
  if (result === FALLBACK || result instanceof Response || isResponseData(result)) return undefined
  if (result === undefined || result === null) return new Response(null, { status: 200, headers: withId(new Headers()) })
  if (typeof result === "string" || result instanceof Uint8Array) {
    return new Response(result as unknown as BodyInit, {
      status: 200,
      headers: withId(new Headers({ "content-type": "text/plain; charset=utf-8" })),
    })
  }
  try {
    return Response.json(result, { headers: withId(new Headers()) })
  } catch {
    return undefined
  }
}

const FALLBACK = Symbol("nelysia.fetch-fallback")

function isResponseData(value: unknown): value is { status: number; headers: Headers; body: unknown } {
  return typeof value === "object" && value !== null && (value as { [key: symbol]: unknown })[responseMarker] === true
}

async function genericFetch(app: Nelysia, request: Request): Promise<Response> {
  try {
    let body: unknown
    if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
      const text = await request.text()
      if (new TextEncoder().encode(text).byteLength > app.bodyLimit) throw new HttpError(413, "Request body is too large")
      body = text || undefined
      if (request.headers.get("content-type")?.includes("application/json") && text) {
        try { body = JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
      }
    }
    const result = await app.handle({ method: request.method, url: request.url, headers: request.headers, body })
    if (result.body instanceof Response) return result.body
    if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
    const output = typeof result.body === "string" ? result.body : result.body === undefined ? null : JSON.stringify(result.body)
    if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
    return new Response(output, { status: result.status, headers: result.headers })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return Response.json({ error: status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request" }, { status })
  }
}

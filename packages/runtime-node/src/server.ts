import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { WebSocketServer, type WebSocket } from "ws"
import { HttpError, type Nelysia } from "../../core/src/app.ts"
import { isJsonContentType, isMultipartContentType } from "../../core/src/body.ts"
import type { RequestData, ResponseData } from "../../core/src/types.ts"
import { responseMarker } from "../../core/src/types.ts"
import { compileDispatcher, executeGeneratedGet, lookupCompiled, matchSingleDynamicUrl, type CompiledDispatcher, type CompiledRoute } from "../../compiler/src/dispatcher.ts"

interface PrebuiltStatic {
  contentType: string
  bytes: Buffer
}

export function createNodeServer(app: Nelysia<any, any, any>) {
  const hasWebSocket = app.websocketRoutes.length > 0
  const websocketRoutes = new Map(app.websocketRoutes.map((route) => [route.path, route.handlers]))
  // Auto-use the compiled dispatcher for hook-free GET routes. Anything else
  // (misses, non-GET, schemas, hooks, telemetry) flows through app.handle().
  const dispatcher = app.telemetry !== undefined || app.hasGlobalLifecycle || app.hasFetchMounts ? undefined : compileDispatcher(app)
  const prebuilt = new Map<CompiledRoute, PrebuiltStatic>()
  if (dispatcher !== undefined) {
    for (const entry of dispatcher.routes) {
      const serialized = entry.serialized
      if (entry.route.static && serialized !== undefined) {
        const bytes = serialized.text !== undefined ? Buffer.from(serialized.text) : Buffer.from(serialized.bytes!)
        prebuilt.set(entry, { contentType: serialized.contentType, bytes })
      }
    }
  }
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let cleanupSignal = () => {}
    try {
      const method = request.method ?? "GET"
      if (dispatcher !== undefined && method === "GET") {
        const compiled = tryCompiledGet(app, dispatcher, prebuilt, request, response)
        if (compiled === true || (compiled instanceof Promise && await compiled)) return
      }
      const headers = new Headers(request.headers as Record<string, string>)
      const requestId = app.requestIdEnabled ? randomUUID() : undefined
      const connection = requestSignal(request, response)
      cleanupSignal = connection.cleanup
      const data: RequestData = { method, url: request.url ?? "/", requestId: headers.get("x-request-id") ?? requestId, remoteAddress: request.socket.remoteAddress, headers, signal: connection.signal }
      const preflight = app.hasFetchMounts ? undefined : await app.preflight(data)
      if (preflight?.kind === "response") {
        if (method !== "GET" && method !== "HEAD") request.resume()
        await writeResponse(response, preflight.response, method === "HEAD")
        return
      }
      const body = method !== "GET" && method !== "HEAD"
        ? await readBody(request, Number(headers.get("content-length") ?? 0), app.bodyLimit, headers.get("content-type"))
        : undefined
      const result = await app.handle({ ...data, body, ...(preflight === undefined ? {} : { preflight }) })
      await writeResponse(response, result, method === "HEAD")
    } catch (error) {
      const result = await app.handleAdapterError(error, { method: request.method ?? "GET", url: request.url ?? "/", headers: new Headers(request.headers as Record<string, string>) })
      await writeResponse(response, result, request.method === "HEAD")
    } finally {
      cleanupSignal()
    }
  })
  if (!hasWebSocket) return server
  const websocketServer = new WebSocketServer({ noServer: true })
  server.on("upgrade", (request, socket, head) => {
    if (request.headers.upgrade?.toLowerCase() !== "websocket") return
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname
    const handlers = websocketRoutes.get(pathname)
    if (!handlers) {
      socket.destroy()
      return
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      attachWebSocketHandlers(websocket, handlers)
    })
  })
  return server
}

/** Compiled GET fast path. Returns true when the response was sent; false means
 * the caller must run the generic app.handle() flow for a miss or generic route.
 * Specialized handlers keep native responses/streams direct and adapt errors on
 * the cold path without invoking the handler a second time. */
function tryCompiledGet(app: Nelysia<any, any, any>, dispatcher: CompiledDispatcher, prebuilt: Map<CompiledRoute, PrebuiltStatic>, request: IncomingMessage, response: ServerResponse): boolean | Promise<boolean> {
  const url = request.url ?? "/"
  const clientRequestId = request.headers["x-request-id"]
  const requestId = dispatcher.needsRequestId
    ? (Array.isArray(clientRequestId) ? clientRequestId[0] : clientRequestId) ?? randomUUID()
    : undefined
  const found = dispatcher.singleDynamic !== undefined
    ? (() => {
        const params = matchSingleDynamicUrl(dispatcher.singleDynamic, url)
        return params === undefined ? undefined : { kind: "params" as const, entry: dispatcher.singleDynamic, params }
      })()
    : (() => {
        const query = url.indexOf("?")
        const pathname = (query === -1 ? url : url.slice(0, query)) || "/"
        return lookupCompiled(dispatcher, pathname)
      })()
  if (found === undefined) return false
  if (dispatcher.hasContextValues && found.kind === "params") return false
  if (found.kind === "generic") {
    if (found.entry.generated === undefined || dispatcher.hasContextValues) return false
    try {
      const generatedRequest = new Request(`http://nelysia.local${url.startsWith("/") ? url : `/${url}`}`, {
        method: "GET",
        headers: new Headers(request.headers as Record<string, string>)
      })
      return executeGeneratedGet(found.entry, found.params, generatedRequest, requestId).then(
        (result) => writeResponse(response, result).then(() => true),
        (error) => writeHandledResponse(app, response, error, { method: "GET", url, headers: requestHeaders(), requestId })
      )
    } catch (error) {
      return writeHandledResponse(app, response, error, { method: "GET", url, headers: requestHeaders(), requestId })
    }
  }
  if (found.kind === "static-prebuilt") {
    const staticResponse = prebuilt.get(found.entry)!
    const headers: Record<string, string | number> = {
      "content-type": staticResponse.contentType,
      "content-length": staticResponse.bytes.length,
    }
    if (requestId !== undefined) headers["x-request-id"] = requestId
    response.writeHead(200, headers)
    response.end(staticResponse.bytes)
    return true
  }
  // static-sync / params: invoke the handler with a minimal context. The
  // zero-argument tier does not allocate a request context at all.
  let result: unknown
  try {
    result = found.kind === "static-sync"
      ? (found.entry.route.handler as () => unknown)()
      : found.entry.route.handler({ params: found.params } as never)
  } catch (error) {
    return writeHandledResponse(app, response, error, { method: "GET", url, headers: requestHeaders(), requestId })
  }
  if (isPromiseLike(result)) return Promise.resolve(result).then(
    (value) => finishCompiledResult(value),
    (error) => writeHandledResponse(app, response, error, { method: "GET", url, headers: requestHeaders(), requestId })
  )
  return finishCompiledResult(result)

  function requestHeaders(): Headers {
    return new Headers(request.headers as Record<string, string>)
  }

  function finishCompiledResult(value: unknown): boolean | Promise<boolean> {
    if (value instanceof HttpError) return writeHandledResponse(app, response, value, { method: "GET", url, headers: requestHeaders(), requestId })
    const addRequestId = (headers: Headers): Headers => {
      if (requestId !== undefined) headers.set("x-request-id", requestId)
      return headers
    }
    if (value instanceof Response) return writeResponse(response, {
      status: value.status,
      headers: addRequestId(new Headers(value.headers)),
      body: value,
      [responseMarker]: true
    }).then(() => true)
    if (value instanceof ReadableStream) return writeResponse(response, {
      status: 200,
      headers: addRequestId(new Headers()),
      body: value,
      [responseMarker]: true
    }).then(() => true)
    if (isResponseData(value)) return writeResponse(response, value).then(() => true)
    const serialized = serializeHandlerResult(value)
    if (serialized === undefined) return writeHandledResponse(app, response, new TypeError("Response could not be serialized"), { method: "GET", url, headers: requestHeaders(), requestId })
    const headers: Record<string, string | number> = { "content-length": serialized.bytes.length }
    if (serialized.contentType !== undefined) headers["content-type"] = serialized.contentType
    if (requestId !== undefined) headers["x-request-id"] = requestId
    response.writeHead(200, headers)
    response.end(serialized.bytes)
    return true
  }
}

function writeHandledResponse(app: Nelysia<any, any, any>, response: ServerResponse, error: unknown, data: RequestData): Promise<boolean> {
  return app.handleAdapterError(error, data).then((handled) => writeResponse(response, handled).then(() => true))
}

function isResponseData(value: unknown): value is { status: number; headers: Headers; body: unknown } {
  return typeof value === "object" && value !== null && (value as { [key: symbol]: unknown })[responseMarker] === true
}

function serializeHandlerResult(result: unknown): { bytes: Buffer; contentType?: string } | undefined {
  if (result === undefined || result === null) return { bytes: Buffer.alloc(0) }
  if (typeof result === "string") return { bytes: Buffer.from(result), contentType: "text/plain; charset=utf-8" }
  if (result instanceof Uint8Array) return { bytes: Buffer.from(result), contentType: "text/plain; charset=utf-8" }
  try {
    const json = JSON.stringify(result)
    return { bytes: Buffer.from(json === undefined ? "" : json), contentType: "application/json; charset=utf-8" }
  } catch {
    return undefined
  }
}

function attachWebSocketHandlers(websocket: WebSocket, handlers: { open?(socket: WebSocket): unknown; message?(socket: WebSocket, message: string | Uint8Array): unknown; close?(socket: WebSocket, code: number, reason: string): unknown; error?(socket: WebSocket, error: unknown): unknown }): void {
  runWebSocketHandler(() => handlers.open?.(websocket), websocket)
  websocket.on("message", (message, isBinary) => {
    const binary = Array.isArray(message) ? new Uint8Array(Buffer.concat(message)) : message instanceof ArrayBuffer ? new Uint8Array(message) : new Uint8Array(message)
    runWebSocketHandler(() => handlers.message?.(websocket, isBinary ? binary : message.toString()), websocket)
  })
  websocket.on("close", (code, reason) => { runWebSocketHandler(() => handlers.close?.(websocket, code, reason.toString()), websocket) })
  websocket.on("error", (error) => { runWebSocketHandler(() => handlers.error?.(websocket, error), websocket) })
}

function runWebSocketHandler(handler: () => unknown, websocket: WebSocket): void {
  try {
    const result = handler()
    if (isPromiseLike(result)) void Promise.resolve(result).catch((error) => { try { websocket.emit("error", error) } catch {} })
  } catch (error) {
    try { websocket.emit("error", error) } catch {}
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function"
}

function requestSignal(request: IncomingMessage, response: ServerResponse): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abort = () => { if (!controller.signal.aborted) controller.abort() }
  request.once("aborted", abort)
  response.once("close", abort)
  return { signal: controller.signal, cleanup: () => { request.off("aborted", abort); response.off("close", abort) } }
}

async function writeResponse(response: ServerResponse, result: ResponseData, head = false): Promise<void> {
  const headers = result.headers
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  const writeHeaders = () => {
    const values = Object.fromEntries(headers.entries()) as Record<string, string | string[]>
    if (getSetCookie) values["set-cookie"] = getSetCookie.call(headers)
    response.writeHead(result.status, values)
  }
  if (result.body instanceof Response) {
    const merged = new Headers(result.body.headers)
    for (const [key, value] of headers) merged.set(key, value)
    for (const [key, value] of merged) headers.set(key, value)
    writeHeaders()
    if (head || !result.body.body) {
      response.end()
      return
    }
    return pipeWebBody(response, result.body.body)
  }
  if (result.body === undefined || result.body === null) {
    writeHeaders()
    response.end()
    return
  }
  if (typeof result.body === "string" || result.body instanceof Uint8Array) {
    if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8")
    writeHeaders()
    if (!head) response.end(result.body)
    else response.end()
    return
  }
  if (result.body instanceof ReadableStream) {
    writeHeaders()
    if (head) {
      response.end()
      return
    }
    return pipeWebBody(response, result.body)
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
  writeHeaders()
  if (!head) response.end(JSON.stringify(result.body))
  else response.end()
}

async function pipeWebBody(response: ServerResponse, body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader()
  let closed = false
  const onClose = () => { closed = true; void reader.cancel().catch(() => undefined) }
  response.once("close", onClose)
  try {
    while (true) {
      if (closed || response.destroyed) break
      const chunk = await reader.read()
      if (chunk.done) break
      if (!response.write(chunk.value)) await new Promise<void>((resolve) => response.once("drain", resolve))
    }
  } finally {
    response.off("close", onClose)
    reader.releaseLock()
  }
  if (!closed && !response.destroyed) response.end()
}

async function readBody(request: IncomingMessage, declaredLength: number, limit: number, contentType: string | null): Promise<unknown> {
  if (declaredLength > limit) throw new HttpError(413, "Request body is too large")
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new HttpError(413, "Request body is too large")
    chunks.push(buffer)
  }
  if (size === 0) return undefined
    if (isMultipartContentType(contentType)) {
    const formRequest = new Request("http://nelysia.local/upload", {
      method: "POST",
      headers: { "content-type": contentType ?? "application/octet-stream" },
      body: Buffer.concat(chunks)
    })
    return formRequest.formData()
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (isJsonContentType(contentType)) {
    try { return JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
  }
  return text
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { WebSocketServer, type WebSocket } from "ws"
import { HttpError, type Nelysia } from "../../core/src/app.ts"
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
  const dispatcher = app.telemetry !== undefined || app.hasGlobalLifecycle ? undefined : compileDispatcher(app)
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
    try {
      const method = request.method ?? "GET"
      if (dispatcher !== undefined && method === "GET" && await tryCompiledGet(app, dispatcher, prebuilt, request, response)) return
      // Fast path: GET/HEAD without body headers never touch the request stream.
      const needsBody = method !== "GET" && method !== "HEAD" && (request.headers["content-length"] !== undefined || request.headers["transfer-encoding"] !== undefined)
      const headers = new Headers(request.headers as Record<string, string>)
      const body = needsBody
        ? await readBody(request, Number(headers.get("content-length") ?? 0), app.bodyLimit, headers.get("content-type"))
        : undefined
      const requestId = app.requestIdEnabled ? randomUUID() : undefined
       const data: RequestData = { method, url: request.url ?? "/", requestId: headers.get("x-request-id") ?? requestId, remoteAddress: request.socket.remoteAddress, headers, body }
      const result = await app.handle(data)
      await writeResponse(response, result, method === "HEAD")
    } catch (error) {
      const result = await app.handleAdapterError(error, { method: request.method ?? "GET", url: request.url ?? "/", headers: new Headers(request.headers as Record<string, string>) })
      await writeResponse(response, result, request.method === "HEAD")
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
async function tryCompiledGet(app: Nelysia<any, any, any>, dispatcher: CompiledDispatcher, prebuilt: Map<CompiledRoute, PrebuiltStatic>, request: IncomingMessage, response: ServerResponse): Promise<boolean> {
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
      const result = await executeGeneratedGet(found.entry, found.params, generatedRequest, requestId)
      await writeResponse(response, result)
      return true
    } catch (error) {
      const handled = await app.handleAdapterError(error, {
        method: "GET",
        url,
        headers: new Headers(request.headers as Record<string, string>),
        requestId
      })
      await writeResponse(response, handled)
      return true
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
  const requestHeaders = new Headers(request.headers as Record<string, string>)
  try {
    result = found.kind === "static-sync"
      ? (found.entry.route.handler as () => unknown)()
      : found.entry.route.handler({ params: found.params } as never)
    result = await result
  } catch (error) {
    const handled = await app.handleAdapterError(error, { method: "GET", url, headers: requestHeaders, requestId })
    await writeResponse(response, handled)
    return true
  }
  if (result instanceof HttpError) {
    const handled = await app.handleAdapterError(result, { method: "GET", url, headers: requestHeaders, requestId })
    await writeResponse(response, handled)
    return true
  }
  const addRequestId = (headers: Headers): Headers => {
    if (requestId !== undefined) headers.set("x-request-id", requestId)
    return headers
  }
  if (result instanceof Response) {
    await writeResponse(response, {
      status: result.status,
      headers: addRequestId(new Headers(result.headers)),
      body: result,
      [responseMarker]: true
    })
    return true
  }
  if (result instanceof ReadableStream) {
    await writeResponse(response, {
      status: 200,
      headers: addRequestId(new Headers()),
      body: result,
      [responseMarker]: true
    })
    return true
  }
  if (isResponseData(result)) {
    await writeResponse(response, result)
    return true
  }
  const serialized = serializeHandlerResult(result)
  if (serialized === undefined) {
    const handled = await app.handleAdapterError(new TypeError("Response could not be serialized"), { method: "GET", url, headers: requestHeaders })
    await writeResponse(response, handled)
    return true
  }
  const headers: Record<string, string | number> = { "content-length": serialized.bytes.length }
  if (serialized.contentType !== undefined) headers["content-type"] = serialized.contentType
  if (requestId !== undefined) headers["x-request-id"] = requestId
  response.writeHead(200, headers)
  response.end(serialized.bytes)
  return true
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
  void handlers.open?.(websocket)
  websocket.on("message", (message, isBinary) => {
    const binary = Array.isArray(message) ? new Uint8Array(Buffer.concat(message)) : message instanceof ArrayBuffer ? new Uint8Array(message) : new Uint8Array(message)
    void handlers.message?.(websocket, isBinary ? binary : message.toString())
  })
  websocket.on("close", (code, reason) => { void handlers.close?.(websocket, code, reason.toString()) })
  websocket.on("error", (error) => { void handlers.error?.(websocket, error) })
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
    for (const [key, value] of result.body.headers) headers.set(key, value)
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
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      response.write(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  response.end()
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
  if (contentType?.toLowerCase().includes("multipart/form-data")) {
    const formRequest = new Request("http://nelysia.local/upload", {
      method: "POST",
      headers: { "content-type": contentType },
      body: Buffer.concat(chunks)
    })
    return formRequest.formData()
  }
  const text = Buffer.concat(chunks).toString("utf8")
  if (contentType?.includes("application/json")) {
    try { return JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
  }
  return text
}

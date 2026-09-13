import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { WebSocketServer, type WebSocket } from "ws"
import { HttpError, type Nelysia } from "../../core/src/app.ts"
import type { RequestData, ResponseData } from "../../core/src/types.ts"

export function createNodeServer(app: Nelysia) {
  const hasWebSocket = app.websocketRoutes.length > 0
  const websocketRoutes = new Map(app.websocketRoutes.map((route) => [route.path, route.handlers]))
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const method = request.method ?? "GET"
      // Fast path: GET/HEAD without body headers never touch the request stream.
      const needsBody = method !== "GET" && method !== "HEAD" && (request.headers["content-length"] !== undefined || request.headers["transfer-encoding"] !== undefined)
      const headers = new Headers(request.headers as Record<string, string>)
      const body = needsBody
        ? await readBody(request, Number(headers.get("content-length") ?? 0), app.bodyLimit, headers.get("content-type"))
        : undefined
      const requestId = app.requestIdEnabled ? randomUUID() : undefined
       const data: RequestData = { method, url: request.url ?? "/", requestId, remoteAddress: request.socket.remoteAddress, headers, body }
      const result = await app.handle(data)
      await writeResponse(response, result, method === "HEAD")
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request"
      await writeResponse(response, { status, headers: new Headers(), body: { error: message } }, request.method === "HEAD")
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
  const text = Buffer.concat(chunks).toString("utf8")
  if (contentType?.includes("application/json")) {
    try { return JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
  }
  return text
}

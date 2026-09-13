import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import { WebSocketServer, type WebSocket } from "ws"
import { HttpError, type Nelysia } from "../../core/src/app.ts"
import type { RequestData, ResponseData } from "../../core/src/types.ts"

export function createNodeServer(app: Nelysia) {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const rawHeaders = request.headers
      const contentLength = Number(rawHeaders["content-length"] ?? 0)
      const contentType = (rawHeaders["content-type"] as string | undefined) ?? null
      const isPostOrPut = request.method !== "GET" && request.method !== "HEAD"
      const body = isPostOrPut && (contentLength > 0 || rawHeaders["transfer-encoding"] !== undefined)
        ? await readBody(request, contentLength, app.bodyLimit, contentType)
        : undefined

      const data: RequestData = {
        method: request.method ?? "GET",
        url: request.url ?? "/",
        remoteAddress: request.socket.remoteAddress,
        headers: rawHeaders as unknown as Headers,
        body
      }
      const result = await app.handle(data)
      await writeResponse(response, result, request.method === "HEAD")
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request"
      await writeResponse(response, { status, headers: new Headers(), body: { error: message } }, request.method === "HEAD")
    }
  })
  const websocketServer = new WebSocketServer({ noServer: true })
  server.on("upgrade", (request, socket, head) => {
    if (request.headers.upgrade?.toLowerCase() !== "websocket") return
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname
    const route = app.websocketRoutes.find((candidate) => candidate.path === pathname)
    if (!route) {
      socket.destroy()
      return
    }
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      attachWebSocketHandlers(websocket, route.handlers)
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

  const writeHeaders = (extraType?: string) => {
    if (extraType && !headers.has("content-type")) {
      headers.set("content-type", extraType)
    }
    const values: Record<string, string | string[]> = {}
    for (const [key, value] of headers.entries()) {
      values[key] = value
    }
    if (getSetCookie) {
      const cookies = getSetCookie.call(headers)
      if (cookies && cookies.length > 0) values["set-cookie"] = cookies
    }
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
    writeHeaders("text/plain; charset=utf-8")
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
  writeHeaders("application/json; charset=utf-8")
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

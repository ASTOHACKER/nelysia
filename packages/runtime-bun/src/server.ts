import { HttpError, type Nelysia } from "../../core/src/app.ts"
import type { WebSocketHandlers } from "../../core/src/types.ts"

export function createBunHandler(app: Nelysia): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      let body: unknown
      const hasBody = request.method !== "GET" && request.method !== "HEAD" && (request.headers.has("content-length") || request.headers.has("transfer-encoding"))
      if (hasBody) {
        const text = await request.text()
        if (new TextEncoder().encode(text).byteLength > app.bodyLimit) throw new HttpError(413, "Request body is too large")
        body = text || undefined
        if (request.headers.get("content-type")?.includes("application/json") && text) {
          try { body = JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
        }
      }
       const result = await app.handle({ method: request.method, url: request.url, requestId: crypto.randomUUID(), headers: request.headers, body })
      return toResponse(result)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      return new Response(JSON.stringify({ error: status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request" }), { status, headers: { "content-type": "application/json; charset=utf-8" } })
    }
  }
}

export function createBunServer(app: Nelysia, port: number): unknown {
  const runtime = globalThis as typeof globalThis & { Bun?: { serve(options: Record<string, unknown>): unknown } }
  if (!runtime.Bun) throw new Error("Bun runtime is required")
  type BunSocket = { data: { handlers: WebSocketHandlers }; send(message: string | Uint8Array): void; close(code?: number, reason?: string): void }
  return runtime.Bun.serve({
    port,
    fetch(request: Request, server: { upgrade(request: Request, options: { data: { handlers: unknown } }): boolean }) {
      const pathname = new URL(request.url).pathname
      const route = app.websocketRoutes.find((candidate) => candidate.path === pathname)
      if (route && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return server.upgrade(request, { data: { handlers: route.handlers } })
          ? undefined
          : new Response("WebSocket upgrade failed", { status: 400 })
      }
      return createBunHandler(app)(request)
    },
    websocket: {
      async open(socket: BunSocket) { await socket.data.handlers.open?.(socket) },
      async message(socket: BunSocket, message: string | Uint8Array) { await socket.data.handlers.message?.(socket, message) },
      async close(socket: BunSocket, code: number, reason: string) { await socket.data.handlers.close?.(socket, code, reason) },
      async error(socket: BunSocket, error: unknown) { await socket.data.handlers.error?.(socket, error) }
    }
  })
}

function toResponse(result: { status: number; headers: Headers; body: unknown }): Response {
    if (result.body instanceof Response) return result.body
    if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
    const body = typeof result.body === "string" ? result.body : JSON.stringify(result.body)
    if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
    return new Response(body, { status: result.status, headers: result.headers })
}

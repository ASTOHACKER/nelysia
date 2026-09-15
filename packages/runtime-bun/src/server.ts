import type { Nelysia } from "../../core/src/app.ts"
import type { WebSocketHandlers } from "../../core/src/types.ts"
import { createCompiledBunHandler } from "../../compiler/src/index.ts"

export { createBunHandler } from "./handler.ts"

export interface BunServerOptions {
  hostname?: string
}

export function createBunServer(app: Nelysia<any, any, any>, port: number, options: BunServerOptions = {}): unknown {
  const runtime = globalThis as typeof globalThis & { Bun?: { serve(options: Record<string, unknown>): unknown } }
  if (!runtime.Bun) throw new Error("Bun runtime is required")
  type BunSocket = { data: { handlers: WebSocketHandlers }; send(message: string | Uint8Array): void; close(code?: number, reason?: string): void }
  const hasWebSocket = app.websocketRoutes.length > 0
  // Let the compiler build the fallback once as well. Keeping app.listen()
  // and the direct compiled entrypoint on the same handler construction avoids
  // an unnecessary extra closure on the public Bun boundary.
  const fetchHandler = createCompiledBunHandler(app)
  const websocketRoutes = new Map(app.websocketRoutes.map((route) => [route.path, route.handlers]))
  const fetch = hasWebSocket
    ? (request: Request, server: { upgrade(request: Request, options: { data: { handlers: unknown } }): boolean }) => {
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const handlers = websocketRoutes.get(new URL(request.url).pathname)
          if (!handlers) return new Response("Not Found", { status: 404 })
          return server.upgrade(request, { data: { handlers } })
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 })
        }
        return fetchHandler(request)
      }
    : fetchHandler
  const serveOptions: Record<string, unknown> = {
    port,
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    fetch
  }
  if (hasWebSocket) serveOptions.websocket = {
      async open(socket: BunSocket) { await socket.data.handlers.open?.(socket) },
      async message(socket: BunSocket, message: string | Uint8Array) { await socket.data.handlers.message?.(socket, message) },
      async close(socket: BunSocket, code: number, reason: string) { await socket.data.handlers.close?.(socket, code, reason) },
      async error(socket: BunSocket, error: unknown) { await socket.data.handlers.error?.(socket, error) }
    }
  return runtime.Bun.serve(serveOptions)
}

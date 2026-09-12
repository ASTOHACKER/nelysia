import { HttpError, type Nelysia } from "../../core/src/app.ts"
import type { Context } from "../../core/src/types.ts"
import { readFile } from "node:fs/promises"

export interface RateLimitOptions {
  limit: number
  windowMs: number
  key?(context: Context): string
}

export interface CompressionOptions {
  threshold?: number
}

export function rateLimit(options: RateLimitOptions): (app: Nelysia) => Nelysia {
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("rateLimit limit must be a positive integer")
  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) throw new Error("rateLimit windowMs must be positive")
  const buckets = new Map<string, { count: number; expiresAt: number }>()
  const key = options.key ?? ((context) => context.clientIp ?? "anonymous")
  return (app) => app.onBeforeHandle((context) => {
    const now = Date.now()
    const bucketKey = key(context)
    const current = buckets.get(bucketKey)
    const bucket = !current || current.expiresAt <= now
      ? { count: 0, expiresAt: now + options.windowMs }
      : current
    bucket.count++
    buckets.set(bucketKey, bucket)
    if (bucket.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000))
      return context.response(429, { error: "Too Many Requests" }, { "retry-after": String(retryAfter) })
    }
  })
}

export function staticFile(path: string, file: string | URL): (app: Nelysia) => Nelysia {
  return (app) => {
    app.get(path, async ({ response }) => {
      try {
        const body = await readFile(file)
        return response(200, body, { "content-type": mimeType(String(file)) })
      } catch {
        return response(404, { error: "Not Found" })
      }
    })
    return app
  }
}

export function compression(options: CompressionOptions = {}): (app: Nelysia) => Nelysia {
  const threshold = options.threshold ?? 0
  return (app) => app.onAfterHandle((context, result) => {
    if (!context.request.headers?.get("accept-encoding")?.includes("gzip")) return
    if (result.headers.has("content-encoding") || result.body === undefined || result.body === null) return
    const source = typeof result.body === "string" ? new TextEncoder().encode(result.body) : result.body instanceof Uint8Array ? result.body : new TextEncoder().encode(JSON.stringify(result.body))
    const bytes = source
    if (bytes.byteLength < threshold || typeof CompressionStream === "undefined") return
    result.body = new Response(bytes as unknown as BodyInit).body?.pipeThrough(new CompressionStream("gzip"))
    result.headers.set("content-encoding", "gzip")
    result.headers.set("vary", "Accept-Encoding")
    result.headers.delete("content-length")
  })
}

function mimeType(file: string): string {
  const extension = file.toLowerCase().split(".").pop()
  return ({ html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml", txt: "text/plain; charset=utf-8" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream"
}

export { HttpError }

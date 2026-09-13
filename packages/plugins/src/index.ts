import { HttpError, type Nelysia } from "../../core/src/app.ts"
import type { Context } from "../../core/src/types.ts"
import { readFile, stat } from "node:fs/promises"
import { join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export interface RateLimitOptions {
  limit: number
  windowMs: number
  key?(context: Context): string
}

export interface CompressionOptions {
  threshold?: number
}

export interface StaticDirectoryOptions {
  prefix?: string
  root: string | URL
  index?: string
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

export function staticDirectory(options: StaticDirectoryOptions): (app: Nelysia) => Nelysia {
  const prefix = (options.prefix ?? "").replace(/\/$/, "")
  const root = resolve(typeof options.root === "string" ? options.root : fileURLToPath(options.root))
  const indexFile = options.index ?? "index.html"

  const serveFile = async (context: Context) => {
    const rawPath = context.params["*"] ? `/${context.params["*"]}` : `/${indexFile}`
    let subpath = rawPath === "" || rawPath === "/" ? `/${indexFile}` : rawPath

    const safeRelative = normalize(subpath).replace(/^(\.\.[\/\\])+/, "")
    const fullPath = resolve(root, `.${safeRelative}`)

    if (!fullPath.startsWith(root)) {
      return context.response(404, { error: "Not Found" })
    }

    try {
      const fileStat = await stat(fullPath)
      const targetPath = fileStat.isDirectory() ? join(fullPath, indexFile) : fullPath
      const body = await readFile(targetPath)
      return context.response(200, body, { "content-type": mimeType(targetPath) })
    } catch {
      return context.response(404, { error: "Not Found" })
    }
  }

  return (app) => {
    if (prefix !== "") {
      app.get(prefix, serveFile)
      app.get(`${prefix}/*`, serveFile)
    } else {
      app.get("/*", serveFile)
    }
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
  const table: Record<string, string> = {
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    ico: "image/x-icon",
    woff2: "font/woff2",
    wasm: "application/wasm",
  }
  return table[extension ?? ""] ?? "application/octet-stream"
}

export { HttpError }

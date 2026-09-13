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

export interface CorsOptions {
  origin?: string | string[] | boolean | ((origin: string, context: Context) => boolean | string)
  methods?: string | string[]
  allowedHeaders?: string | string[]
  exposedHeaders?: string | string[]
  credentials?: boolean
  maxAge?: number
}

export interface SecurityHeadersOptions {
  xContentTypeOptions?: boolean
  xFrameOptions?: "DENY" | "SAMEORIGIN" | false
  xXSSProtection?: boolean
  referrerPolicy?: string | false
  strictTransportSecurity?: string | false
  crossOriginOpenerPolicy?: string | false
  crossOriginResourcePolicy?: string | false
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

export function cors(options: CorsOptions = {}): (app: Nelysia) => Nelysia {
  const originOption = options.origin ?? "*"
  const methods = options.methods
    ? (Array.isArray(options.methods) ? options.methods.join(", ") : options.methods)
    : "GET, HEAD, PUT, POST, DELETE, PATCH"
  const allowedHeaders = options.allowedHeaders
    ? (Array.isArray(options.allowedHeaders) ? options.allowedHeaders.join(", ") : options.allowedHeaders)
    : undefined
  const exposedHeaders = options.exposedHeaders
    ? (Array.isArray(options.exposedHeaders) ? options.exposedHeaders.join(", ") : options.exposedHeaders)
    : undefined
  const credentials = options.credentials ?? false
  const maxAge = options.maxAge !== undefined ? String(options.maxAge) : undefined

  function resolveOrigin(reqOrigin: string | null, context: Context): string | undefined {
    if (!reqOrigin) {
      return typeof originOption === "string" ? originOption : undefined
    }
    if (typeof originOption === "boolean") {
      return originOption ? reqOrigin : undefined
    }
    if (typeof originOption === "string") {
      return originOption === "*" && credentials ? reqOrigin : originOption
    }
    if (Array.isArray(originOption)) {
      return originOption.includes(reqOrigin) ? reqOrigin : undefined
    }
    if (typeof originOption === "function") {
      const result = originOption(reqOrigin, context)
      if (typeof result === "string") return result
      if (result) return reqOrigin
      return undefined
    }
    return undefined
  }

  return (app) => {
    app.onBeforeHandle((context) => {
      const reqOrigin = context.headers.get("origin")
      const isOptions = context.request.method.toUpperCase() === "OPTIONS"
      const matchedOrigin = resolveOrigin(reqOrigin, context)

      if (isOptions) {
        const resHeaders: Record<string, string> = {}
        if (matchedOrigin) {
          resHeaders["access-control-allow-origin"] = matchedOrigin
          if (matchedOrigin !== "*") resHeaders["vary"] = "Origin"
        }
        if (credentials) {
          resHeaders["access-control-allow-credentials"] = "true"
        }
        resHeaders["access-control-allow-methods"] = methods
        const reqHeaders = context.headers.get("access-control-request-headers")
        const allowHeadersValue = allowedHeaders ?? reqHeaders ?? "*"
        if (allowHeadersValue) {
          resHeaders["access-control-allow-headers"] = allowHeadersValue
        }
        if (exposedHeaders) {
          resHeaders["access-control-expose-headers"] = exposedHeaders
        }
        if (maxAge) {
          resHeaders["access-control-max-age"] = maxAge
        }
        return context.response(204, undefined, resHeaders)
      }

      if (matchedOrigin) {
        context.set.headers["access-control-allow-origin"] = matchedOrigin
        if (matchedOrigin !== "*") {
          context.set.headers["vary"] = "Origin"
        }
      }
      if (credentials) {
        context.set.headers["access-control-allow-credentials"] = "true"
      }
      if (exposedHeaders) {
        context.set.headers["access-control-expose-headers"] = exposedHeaders
      }
    })
    return app
  }
}

export function securityHeaders(options: SecurityHeadersOptions = {}): (app: Nelysia) => Nelysia {
  const xContentTypeOptions = options.xContentTypeOptions ?? true
  const xFrameOptions = options.xFrameOptions ?? "SAMEORIGIN"
  const xXSSProtection = options.xXSSProtection ?? true
  const referrerPolicy = options.referrerPolicy ?? "no-referrer"
  const strictTransportSecurity = options.strictTransportSecurity ?? "max-age=15552000; includeSubDomains"
  const crossOriginOpenerPolicy = options.crossOriginOpenerPolicy ?? "same-origin"
  const crossOriginResourcePolicy = options.crossOriginResourcePolicy ?? "same-origin"

  return (app) => app.onAfterHandle((_context, result) => {
    if (xContentTypeOptions) result.headers.set("x-content-type-options", "nosniff")
    if (xFrameOptions) result.headers.set("x-frame-options", xFrameOptions)
    if (xXSSProtection) result.headers.set("x-xss-protection", "0")
    if (referrerPolicy) result.headers.set("referrer-policy", referrerPolicy)
    if (strictTransportSecurity) result.headers.set("strict-transport-security", strictTransportSecurity)
    if (crossOriginOpenerPolicy) result.headers.set("cross-origin-opener-policy", crossOriginOpenerPolicy)
    if (crossOriginResourcePolicy) result.headers.set("cross-origin-resource-policy", crossOriginResourcePolicy)
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

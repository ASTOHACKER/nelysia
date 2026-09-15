import type { Context, NelysiaPlugin, ResponseData } from "../../core/src/index.ts"

export interface CacheStore {
  get(key: string): ResponseData | undefined | Promise<ResponseData | undefined>
  set(key: string, value: ResponseData, ttlMs: number): void | Promise<void>
  delete?(key: string): void | Promise<void>
}

export interface CacheOptions {
  ttlMs?: number
  maxEntries?: number
  key?(context: Context): string
  store?: CacheStore
}

export function memoryCacheStore(maxEntries = 1000): CacheStore {
  const values = new Map<string, { value: ResponseData; expiresAt: number }>()
  return {
    get(key) {
      const entry = values.get(key)
      if (entry === undefined || entry.expiresAt <= Date.now()) {
        values.delete(key)
        return undefined
      }
      values.delete(key)
      values.set(key, entry)
      return cloneResponse(entry.value)
    },
    set(key, value, ttlMs) {
      values.delete(key)
      values.set(key, { value: cloneResponse(value), expiresAt: Date.now() + ttlMs })
      while (values.size > maxEntries) values.delete(values.keys().next().value as string)
    },
    delete(key) { values.delete(key) }
  }
}

export type CachePlugin = NelysiaPlugin

export function cache(options: CacheOptions = {}): CachePlugin {
  const ttlMs = options.ttlMs ?? 30_000
  const maxEntries = options.maxEntries ?? 1000
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("cache ttlMs must be positive")
  if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("cache maxEntries must be a positive integer")
  const store = options.store ?? memoryCacheStore(maxEntries)
  const key = options.key ?? ((context) => `${context.request.method}:${context.request.url}`)
  const before = (config: CacheOptions) => async (context: Context) => {
    if (context.request.method.toUpperCase() !== "GET") return
    const activeStore = config.store ?? store
    const hit = await activeStore.get((config.key ?? key)(context))
    if (hit === undefined) return
    if (context.headers.get("if-none-match") !== null && context.headers.get("if-none-match") === hit.headers.get("etag")) {
      return context.response(undefined, { status: 304, headers: hit.headers })
    }
    return context.response(hit.body, { status: hit.status, headers: hit.headers })
  }
  const after = (config: CacheOptions) => async (context: Context, result: ResponseData) => {
    if (context.request.method.toUpperCase() !== "GET" || result.status !== 200 || result.body instanceof Response || result.body instanceof ReadableStream) return
    const etag = result.headers.get("etag") ?? makeEtag(result.body)
    result.headers.set("etag", etag)
    if (context.headers.get("if-none-match") === etag) {
      result.status = 304
      result.body = undefined
      return
    }
    const activeStore = config.store ?? store
    await activeStore.set((config.key ?? key)(context), cloneResponse(result), config.ttlMs ?? ttlMs)
  }
  return ((app: import("../../core/src/app.ts").Nelysia<any, any, any, any>) => {
    app.registerRouteFeature("cache", {
      beforeHandle(value) { return before(value === true ? {} : value as CacheOptions) },
      afterHandle(value) { return after(value === true ? {} : value as CacheOptions) }
    })
    app.onBeforeHandle(async (context) => {
      if (context.route?.features.cache !== undefined) return
      return before(options)(context)
    })
    app.onAfterHandle(async (context, result) => {
      if (context.route?.features.cache !== undefined) return
      return after(options)(context, result)
    })
    return app
  }) as CachePlugin
}

function cloneResponse(value: ResponseData): ResponseData {
  const body = value.body
  let cloned = body
  if (body !== undefined && body !== null && typeof body === "object" && !(body instanceof Uint8Array)) {
    try { cloned = structuredClone(body) } catch { cloned = body }
  } else if (body instanceof Uint8Array) cloned = new Uint8Array(body)
  return { status: value.status, headers: new Headers(value.headers), body: cloned }
}

function makeEtag(body: unknown): string {
  let hash = 2166136261
  if (body instanceof Uint8Array) {
    for (const byte of body) hash = Math.imul(hash ^ byte, 16777619)
  } else {
    const text = typeof body === "string" ? body : JSON.stringify(body) ?? ""
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return `W/\"${(hash >>> 0).toString(16)}\"`
}

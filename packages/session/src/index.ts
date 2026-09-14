import type { Context, NelysiaPlugin } from "../../core/src/index.ts"

export interface SessionStore<Value = unknown> {
  get(id: string): Value | undefined | Promise<Value | undefined>
  set(id: string, value: Value, ttlMs?: number): void | Promise<void>
  delete(id: string): void | Promise<void>
}

export interface SessionOptions<Value = unknown> {
  cookieName?: string
  ttlSeconds?: number
  store?: SessionStore<Value>
  generateId?(): string
}

export interface SessionApi<Value = unknown> {
  id?: string
  get(): Promise<Value | undefined>
  set(value: Value): Promise<string>
  destroy(): Promise<void>
}

export interface SessionContext<Value = unknown> {
  session: SessionApi<Value>
}

export function memorySessionStore<Value = unknown>(): SessionStore<Value> {
  const values = new Map<string, { value: Value; expiresAt?: number }>()
  return {
    get(id) {
      const entry = values.get(id)
      if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
        values.delete(id)
        return undefined
      }
      return entry?.value
    },
    set(id, value, ttlMs) {
      values.set(id, { value, ...(ttlMs === undefined ? {} : { expiresAt: Date.now() + ttlMs }) })
    },
    delete(id) {
      values.delete(id)
    }
  }
}

export type SessionPlugin<Value = unknown> = NelysiaPlugin<SessionContext<Value>>

export function session<Value = unknown>(options: SessionOptions<Value> = {}): SessionPlugin<Value> {
  const cookieName = options.cookieName ?? "nelysia_session"
  const ttlSeconds = options.ttlSeconds ?? 86400
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) throw new Error("session cookieName must be a safe cookie token")
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("session ttlSeconds must be a positive integer")
  const store = options.store ?? memorySessionStore<Value>()
  const generateId = options.generateId ?? (() => crypto.randomUUID())

  return ((app: import("../../core/src/app.ts").Nelysia<any, any, any, any>) => app.derive((context: Context) => ({
    session: createSessionApi(context, store, cookieName, ttlSeconds, generateId)
  })) as import("../../core/src/app.ts").Nelysia<any, any, any, any>) as SessionPlugin<Value>
}

function createSessionApi<Value>(context: Context, store: SessionStore<Value>, cookieName: string, ttlSeconds: number, generateId: () => string): SessionApi<Value> {
  let id: string | undefined = context.cookies[cookieName]
  return {
    get id() { return id },
    async get() {
      if (id === undefined) return undefined
      const value = await store.get(id)
      if (value === undefined) id = undefined
      return value
    },
    async set(value) {
      id = generateId()
      await store.set(id, value, ttlSeconds * 1000)
      context.setCookie(cookieName, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: ttlSeconds })
      return id
    },
    async destroy() {
      if (id !== undefined) await store.delete(id)
      id = undefined
      context.deleteCookie(cookieName, { path: "/" })
    }
  }
}

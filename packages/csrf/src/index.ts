import type { Context, NelysiaPlugin } from "../../core/src/index.ts"

export interface CsrfOptions {
  cookieName?: string
  headerName?: string
  safeMethods?: readonly string[]
  exclude?(context: Context): boolean | Promise<boolean>
}

export interface CsrfContext {
  csrfToken(): string
}

export type CsrfPlugin = NelysiaPlugin<CsrfContext>

export function csrf(options: CsrfOptions = {}): CsrfPlugin {
  const cookieName = options.cookieName ?? "nelysia_csrf"
  const headerName = (options.headerName ?? "x-csrf-token").toLowerCase()
  const safeMethods = new Set((options.safeMethods ?? ["GET", "HEAD", "OPTIONS"]).map((method) => method.toUpperCase()))
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) throw new Error("csrf cookieName must be a safe cookie token")
  return ((app: import("../../core/src/app.ts").Nelysia<any, any, any, any>) => app.derive((context: Context) => {
    const token = context.cookies[cookieName] ?? crypto.randomUUID()
    return { csrfToken: () => token }
  }).onBeforeHandle(async (context) => {
    if (await options.exclude?.(context)) return
    const token = context.cookies[cookieName] ?? (context as Context & Partial<CsrfContext>).csrfToken?.()
    if (token === undefined) return context.response(403, { error: "CSRF token required" })
    if (safeMethods.has(context.request.method.toUpperCase())) {
      if (context.cookies[cookieName] === undefined) context.setCookie(cookieName, token, { httpOnly: false, sameSite: "lax", path: "/" })
      return
    }
    const supplied = context.headers.get(headerName)
    if (supplied === null || !safeEqual(token, supplied)) return context.response(403, { error: "Invalid CSRF token" })
  }) as import("../../core/src/app.ts").Nelysia<any, any, any, any>) as CsrfPlugin
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

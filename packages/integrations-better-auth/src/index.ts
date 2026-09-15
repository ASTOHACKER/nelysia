import type { Nelysia } from "../../core/src/app.ts"

declare module "../../core/src/types.ts" {
  interface AuthStrategyRegistry {
    session: unknown
  }
}

export interface BetterAuthLike {
  handler(request: Request): Response | Promise<Response>
  /** Optional session resolver used by routes with auth: "session". */
  getSession?(request: Request): unknown | Promise<unknown>
}

export function betterAuthPlugin(auth: BetterAuthLike, prefix = "/api/auth"): (app: Nelysia<any, any, any>) => Nelysia<any, any, any> {
  return (app) => {
    if (auth.getSession !== undefined) {
      app.registerAuthStrategy("session", {
        guard: async (context) => {
          const value = await auth.getSession!(new Request(context.request.url, { method: "GET", headers: context.headers }))
          if (value === undefined || value === null) {
            const optional = typeof context.route?.auth === "object" && context.route.auth.optional === true
            if (optional) return
            return context.response(401, { error: "Unauthorized" })
          }
          context.auth = value
        }
      })
    }
    app.all(`${prefix}/*`, async (context) => {
      const headers = new Headers(context.request.headers)
      const init: RequestInit = { method: context.request.method, headers }
      if (!["GET", "HEAD"].includes(context.request.method) && context.body !== undefined) init.body = typeof context.body === "string" ? context.body : JSON.stringify(context.body)
      return auth.handler(new Request(context.request.url, init))
    })
    return app
  }
}

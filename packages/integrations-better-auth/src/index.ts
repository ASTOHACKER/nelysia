import type { Nelysia } from "../../core/src/app.ts"

export interface BetterAuthLike {
  handler(request: Request): Response | Promise<Response>
}

export function betterAuthPlugin(auth: BetterAuthLike, prefix = "/api/auth"): (app: Nelysia) => Nelysia {
  return (app) => {
    app.all(`${prefix}/*`, async (context) => {
      const headers = new Headers(context.request.headers)
      const init: RequestInit = { method: context.request.method, headers }
      if (!["GET", "HEAD"].includes(context.request.method) && context.body !== undefined) init.body = typeof context.body === "string" ? context.body : JSON.stringify(context.body)
      return auth.handler(new Request(context.request.url, init))
    })
    return app
  }
}

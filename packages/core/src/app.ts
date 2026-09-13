import { allowedMethodsFor, compilePath, lookupDynamicRoute, normalizeMethod, normalizePathname, splitSegments } from "./router.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "./schema.ts"
import { HttpError, responseMarker, type AfterHook, type Context, type CookieOptions, type ErrorHandler, type Handler, type Hook, type NelysiaOptions, type RequestData, type ResponseData, type RouteGraph, type RouteOptions, type RouteRecord, type Telemetry, type WebSocketHandlers } from "./types.ts"
import { createBunServer } from "../../runtime-bun/src/server.ts"
import { createNodeServer } from "../../runtime-node/src/server.ts"

const asHeaders = (headers?: Headers): Headers => headers ?? new Headers()

export class Nelysia {
  readonly graph: RouteGraph = { routes: [] }
  readonly bodyLimit: number
  private readonly trustedProxy: boolean
  private readonly secureCookies: boolean
  private hooks: Hook[] = []
  private afterHooks: AfterHook[] = []
  private errorHandlers: ErrorHandler[] = []
  readonly telemetry?: Telemetry
  readonly websocketRoutes: { path: string; handlers: WebSocketHandlers }[] = []
  private readonly staticRoutes = new Map<string, RouteRecord>()
  private readonly dynamicRoutes = new Map<string, RouteRecord[]>()
  /** Public so runtime adapters can skip UUID generation when disabled. */
  readonly requestIdEnabled: boolean

  constructor(options: NelysiaOptions = {}) {
    this.bodyLimit = options.bodyLimit ?? 1024 * 1024
    this.telemetry = options.telemetry
    this.trustedProxy = options.trustedProxy ?? false
    this.secureCookies = options.secureCookies ?? false
    this.requestIdEnabled = options.requestId ?? true
  }

  onBeforeHandle(hook: Hook): this {
    this.hooks.push(hook)
    for (const route of this.graph.routes) route.hooks.push(hook)
    return this
  }

  onAfterHandle(hook: AfterHook): this {
    this.afterHooks.push(hook)
    for (const route of this.graph.routes) route.afterHooks.push(hook)
    return this
  }

  onError(handler: ErrorHandler): this {
    this.errorHandlers.push(handler)
    for (const route of this.graph.routes) route.errorHandlers.push(handler)
    return this
  }

  use(plugin: (app: this) => this | void): this {
    plugin(this)
    return this
  }

  get(path: string, handler: Handler, options?: RouteOptions): this
  get(path: string, body: string | number | boolean | Record<string, unknown>, options?: RouteOptions): this
  get(path: string, handlerOrBody: Handler | string | number | boolean | Record<string, unknown>, options?: RouteOptions): this {
    const app = this.route("GET", path, typeof handlerOrBody === "function" ? handlerOrBody : () => handlerOrBody, options)
    if (typeof handlerOrBody !== "function") {
      this.graph.routes[this.graph.routes.length - 1].contextFree = true
      this.graph.routes[this.graph.routes.length - 1].staticValue = handlerOrBody
    }
    return app
  }
  getStatic(path: string, body: unknown): this {
    this.route("GET", path, () => body)
    this.graph.routes[this.graph.routes.length - 1].contextFree = true
    this.graph.routes[this.graph.routes.length - 1].staticValue = body
    return this
  }
  post(path: string, handler: Handler, options?: RouteOptions): this { return this.route("POST", path, handler, options) }
  put(path: string, handler: Handler, options?: RouteOptions): this { return this.route("PUT", path, handler, options) }
  patch(path: string, handler: Handler, options?: RouteOptions): this { return this.route("PATCH", path, handler, options) }
  delete(path: string, handler: Handler, options?: RouteOptions): this { return this.route("DELETE", path, handler, options) }
  head(path: string, handler: Handler, options?: RouteOptions): this { return this.route("HEAD", path, handler, options) }
  options(path: string, handler: Handler, options?: RouteOptions): this { return this.route("OPTIONS", path, handler, options) }

  all(path: string, handler: Handler, options?: RouteOptions): this {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) this.route(method, path, handler, options)
    return this
  }

  websocket(path: string, handlers: WebSocketHandlers): this {
    this.websocketRoutes.push({ path, handlers })
    return this
  }

  mount(prefix: string, child: Nelysia): this {
    const base = prefix === "/" ? "" : prefix.replace(/\/$/, "")
    for (const route of child.graph.routes) {
      const path = `${base}${route.path === "/" ? "" : route.path}`.replace(/\/\/+/g, "/") || "/"
      const metadata = compilePath(path)
      if (this.graph.routes.some((candidate) => candidate.method === route.method && candidate.path === path)) throw new Error(`Duplicate route: ${route.method} ${path}`)
      const mounted = { ...route, path, ...metadata }
      this.registerRoute(mounted)
    }
    return this
  }

  listen(port: number | { port: number }): unknown {
    const actualPort = typeof port === "number" ? port : port.port
    const runtime = globalThis as typeof globalThis & { Bun?: { serve(options: { port: number; fetch: (request: Request) => Promise<Response> }): unknown } }
    if (runtime.Bun) return createBunServer(this, actualPort)
    return createNodeServer(this).listen(actualPort)
  }

  route(method: string, path: string, handler: Handler, options: RouteOptions = {}): this {
    const metadata = compilePath(path)
    if (this.graph.routes.some((route) => route.method === normalizeMethod(method) && route.path === path)) {
      throw new Error(`Duplicate route: ${method.toUpperCase()} ${path}`)
    }
    const route = { method: normalizeMethod(method), path, ...metadata, handler, hooks: [...this.hooks], afterHooks: [...this.afterHooks], errorHandlers: [...this.errorHandlers], bodySchema: normalizeSchema(options.body), paramsSchema: normalizeSchema(options.params), querySchema: normalizeSchema(options.query), headersSchema: normalizeSchema(options.headers), responseSchema: normalizeSchema(options.response) }
    this.registerRoute(route)
    return this
  }

  private registerRoute(route: RouteRecord): void {
    this.graph.routes.push(route)
    if (route.static) {
      this.staticRoutes.set(`${route.method} ${route.path}`, route)
      return
    }
    const list = this.dynamicRoutes.get(route.method)
    if (list) list.push(route)
    else this.dynamicRoutes.set(route.method, [route])
  }

  async handle(request: RequestData): Promise<ResponseData> {
    const { pathname, search } = splitUrl(request.url)
    const method = fastNormalizeMethod(request.method)
    if (method === undefined) return this.response(400, { error: "Unsupported HTTP method" })
    const lookupMethod = method === "HEAD" ? "GET" : method
    const normalized = normalizePathname(pathname)
    // OPTIONS is a cold path: preserve the original 204-with-Allow contract first.
    if (method === "OPTIONS") {
      const actual = splitSegments(normalized)
      const allow = allowedMethodsFor(this.graph.routes, actual)
      return allow !== "OPTIONS"
        ? this.response(204, undefined, { allow })
        : this.response(404, { error: "Not Found" })
    }
    // Hot path: O(1) static hit, single-split dynamic lookup within one method.
    const directRoute = this.staticRoutes.get(`${lookupMethod} ${normalized}`)
    let route: RouteRecord | undefined
    let params: Record<string, string>
    if (directRoute !== undefined) {
      route = directRoute
      params = {}
    } else {
      const actual = splitSegments(normalized)
      const match = lookupDynamicRoute(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, actual)
      if (match === undefined) {
        // Cold paths only: 404 / 405. Never scanned on a matched request.
        const allow = allowedMethodsFor(this.graph.routes, actual)
        return allow !== "OPTIONS"
          ? this.response(405, { error: "Method Not Allowed" }, { allow })
          : this.response(404, { error: "Not Found" })
      }
      route = match.route
      params = match.params
    }
    const headers = asHeaders(request.headers)
    const hasTelemetry = this.telemetry !== undefined
    const startedAt = hasTelemetry ? performance.now() : 0
    // requestId is resolved without object spreads; skipped entirely when disabled.
    let requestId = ""
    if (this.requestIdEnabled) {
      requestId = request.requestId ?? headers.get("x-request-id") ?? `req-${method}-${request.url}`
    }
    const responseHeaders = new Headers()
    if (this.requestIdEnabled) responseHeaders.set("x-request-id", requestId)
    const clientIp = this.trustedProxy ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.remoteAddress : request.remoteAddress
    const context: Context = {
      request: { ...request, headers },
      requestId,
      clientIp,
      params,
      query: search === "" ? new URLSearchParams() : new URLSearchParams(search),
      body: request.body,
      headers,
      cookies: lazyCookies(headers),
      setCookie: (name, value, options) => responseHeaders.append("set-cookie", serializeCookie(name, value, this.secureCookies ? { ...options, secure: options?.secure ?? true } : options)),
      response: (status, body, headers) => ({ status, body, headers: mergeHeaders(responseHeaders, headers), [responseMarker]: true })
    }
    try {
      await this.telemetry?.onRequest?.(context)
      if (route.paramsSchema) context.params = await route.paramsSchema.validate(context.params) as Record<string, string>
      if (route.querySchema) context.query = await route.querySchema.validate(Object.fromEntries(context.query.entries())) as URLSearchParams
      if (route.headersSchema) context.headers = await route.headersSchema.validate(Object.fromEntries(context.headers.entries())) as Headers
      if (route.bodySchema) context.body = await route.bodySchema.validate(context.body)
      for (const hook of route.hooks) {
        const result = await hook(context)
        if (isResponse(result)) return result
      }
      const result = await route.handler(context)
      const response = isResponse(result) ? result : result instanceof Response
        ? { status: result.status, headers: mergeHeaders(responseHeaders, Object.fromEntries(result.headers.entries())), body: result.body, [responseMarker]: true as const }
        : { status: 200, body: result, headers: responseHeaders, [responseMarker]: true as const }
      if (route.responseSchema) response.body = await route.responseSchema.validate(response.body, "response")
      for (const hook of route.afterHooks) await hook(context, response)
      await this.telemetry?.onResponse?.(context, response)
      await this.telemetry?.exportSpan?.({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: response.status, durationMs: hasTelemetry ? performance.now() - startedAt : 0 })
      return response
    } catch (error) {
      await this.telemetry?.onError?.(context, error)
      await this.telemetry?.exportSpan?.({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: error instanceof HttpError ? error.status : 500, durationMs: hasTelemetry ? performance.now() - startedAt : 0, error })
      for (const handler of route.errorHandlers) {
        const result = await handler(error, context)
        if (isResponse(result)) return result
      }
      throw error
    }
  }

  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData {
    return { status, body, headers: new Headers(headers), [responseMarker]: true }
  }
}

const EMPTY_ROUTES: RouteRecord[] = []

function fastNormalizeMethod(method: string): RouteRecord["method"] | undefined {
  switch (method) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "OPTIONS":
    case "HEAD":
      return method
    default:
      try {
        return normalizeMethod(method)
      } catch {
        return undefined
      }
  }
}

function lazyCookies(headers: Headers): Record<string, string> {
  const value = headers.get("cookie")
  if (!value) return {}
  return parseCookies(value)
}

function normalizeSchema(schema: Schema | StandardSchema | undefined): Schema | undefined {
  if (!schema) return undefined
  if ("~standard" in schema) return fromStandardSchema(schema)
  return "validate" in schema ? schema : fromStandardSchema(schema)
}

function splitUrl(input: string): { pathname: string; search: string } {
  let value = input
  const scheme = value.indexOf("://")
  if (scheme !== -1) {
    const slash = value.indexOf("/", scheme + 3)
    value = slash === -1 ? "/" : value.slice(slash)
  }
  const queryIndex = value.indexOf("?")
  return queryIndex === -1
    ? { pathname: value || "/", search: "" }
    : { pathname: value.slice(0, queryIndex) || "/", search: value.slice(queryIndex + 1) }
}

export { HttpError }

function isResponse(value: unknown): value is ResponseData {
  return typeof value === "object" && value !== null && (value as ResponseData)[responseMarker] === true
}

function parseCookies(value: string | null): Record<string, string> {
  if (!value) return {}
  return Object.fromEntries(value.split(";").map((part) => {
    const index = part.indexOf("=")
    return index === -1 ? [part.trim(), ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]
  }))
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let output = `${name}=${encodeURIComponent(value)}`
  if (options.maxAge !== undefined) output += `; Max-Age=${options.maxAge}`
  if (options.path) output += `; Path=${options.path}`
  if (options.httpOnly) output += "; HttpOnly"
  if (options.secure) output += "; Secure"
  if (options.sameSite) output += `; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`
  return output
}

function mergeHeaders(base: Headers, extra?: Record<string, string>): Headers {
  const headers = new Headers(base)
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value)
  return headers
}

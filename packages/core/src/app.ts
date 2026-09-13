import { allowedMethodsFor, compilePath, lookupDynamicRoute, normalizeMethod, normalizePathname, splitSegments } from "./router.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "./schema.ts"
import { HttpError, responseMarker, type AfterHook, type Context, type CookieOptions, type ErrorHandler, type Handler, type Hook, type InjectOptions, type InjectResponse, type ListenOptions, type NelysiaOptions, type ParsedQuery, type RequestData, type ResponseData, type RouteGraph, type RouteOptions, type RouteRecord, type ServerInfo, type Telemetry, type WebSocketHandlers } from "./types.ts"
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
  private notFoundHandler?: Handler

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

  notFound(handler: Handler): this {
    this.notFoundHandler = handler
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
      const mounted: RouteRecord = {
        ...route,
        path,
        ...metadata,
        hooks: [...this.hooks, ...route.hooks],
        afterHooks: [...this.afterHooks, ...route.afterHooks],
        errorHandlers: [...this.errorHandlers, ...route.errorHandlers]
      }
      this.registerRoute(mounted)
    }
    for (const ws of child.websocketRoutes) {
      const path = `${base}${ws.path === "/" ? "" : ws.path}`.replace(/\/\/+/g, "/") || "/"
      this.websocketRoutes.push({ path, handlers: ws.handlers })
    }
    return this
  }

  group(prefix: string, callback: (app: Nelysia) => void): this {
    const child = new Nelysia({
      bodyLimit: this.bodyLimit,
      trustedProxy: this.trustedProxy,
      secureCookies: this.secureCookies,
      requestId: this.requestIdEnabled,
      telemetry: this.telemetry
    })
    callback(child)
    return this.mount(prefix, child)
  }

  listen(
    port: number | { port: number; hostname?: string },
    callback?: (info: ServerInfo) => void
  ): unknown {
    const actualPort = typeof port === "number" ? port : port.port
    const hostname = typeof port === "object" ? port.hostname : undefined
    const runtime = globalThis as typeof globalThis & { Bun?: { serve(options: Record<string, unknown>): { port: number; hostname?: string } } }
    if (runtime.Bun) {
      const server = createBunServer(this, actualPort) as { port: number; hostname?: string }
      const resolvedHost = server.hostname ?? hostname ?? "localhost"
      const info: ServerInfo = {
        port: server.port,
        hostname: resolvedHost,
        url: `http://${resolvedHost}:${server.port}`,
        server
      }
      if (callback) callback(info)
      return server
    }
    const nodeServer = createNodeServer(this)
    if (callback) {
      nodeServer.listen(actualPort, hostname, () => {
        const addr = nodeServer.address()
        const p = typeof addr === "object" && addr ? addr.port : actualPort
        const h = hostname ?? "localhost"
        const info: ServerInfo = {
          port: p,
          hostname: h,
          url: `http://${h}:${p}`,
          server: nodeServer
        }
        callback(info)
      })
      return nodeServer
    }
    return nodeServer.listen(actualPort, hostname)
  }

  async inject(options: InjectOptions = {}): Promise<InjectResponse> {
    let url = options.url ?? options.path ?? "/"
    if (options.query) {
      const q = new URLSearchParams(options.query).toString()
      if (q) url += (url.includes("?") ? "&" : "?") + q
    }
    const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers)
    let body = options.body
    if (body !== undefined && typeof body !== "string" && !(body instanceof Uint8Array) && !(body instanceof ReadableStream)) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
    }
    const res = await this.handle({
      method: options.method ?? "GET",
      url,
      headers,
      body
    })
    return {
      status: res.status,
      statusCode: res.status,
      headers: res.headers,
      body: res.body,
      async json<T = unknown>(): Promise<T> {
        if (typeof res.body === "string") return JSON.parse(res.body) as T
        if (res.body instanceof Response) return (await res.body.json()) as T
        if (res.body instanceof ReadableStream) return (await new Response(res.body).json()) as T
        return res.body as T
      },
      async text(): Promise<string> {
        if (typeof res.body === "string") return res.body
        if (res.body instanceof Response) return await res.body.text()
        if (res.body instanceof ReadableStream) return await new Response(res.body).text()
        if (res.body instanceof Uint8Array) return new TextDecoder().decode(res.body)
        return JSON.stringify(res.body)
      },
      async bytes(): Promise<Uint8Array> {
        if (res.body instanceof Uint8Array) return res.body
        if (typeof res.body === "string") return new TextEncoder().encode(res.body)
        if (res.body instanceof Response) return new Uint8Array(await res.body.arrayBuffer())
        if (res.body instanceof ReadableStream) return new Uint8Array(await new Response(res.body).arrayBuffer())
        return new TextEncoder().encode(JSON.stringify(res.body))
      }
    }
  }

  route(method: string, path: string, handler: Handler, options: RouteOptions = {}): this {
    const metadata = compilePath(path)
    if (this.graph.routes.some((route) => route.method === normalizeMethod(method) && route.path === path)) {
      throw new Error(`Duplicate route: ${method.toUpperCase()} ${path}`)
    }
    const route = {
      method: normalizeMethod(method),
      path,
      ...metadata,
      handler,
      hooks: [...this.hooks],
      afterHooks: [...this.afterHooks],
      errorHandlers: [...this.errorHandlers],
      summary: options.summary,
      description: options.description,
      tags: options.tags,
      auth: options.auth,
      bodySchema: normalizeSchema(options.body),
      paramsSchema: normalizeSchema(options.params),
      querySchema: normalizeSchema(options.query),
      headersSchema: normalizeSchema(options.headers),
      responseSchema: normalizeSchema(options.response)
    }
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

  private createContext(request: RequestData, params: Record<string, string>, search: string, method: string): { context: Context; responseHeaders: Headers } {
    const headers = asHeaders(request.headers)
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
      query: createParsedQuery(search),
      set: { status: undefined, headers: {} },
      store: {},
      body: request.body,
      headers,
      cookies: lazyCookies(headers),
      setCookie: (name, value, options) => responseHeaders.append("set-cookie", serializeCookie(name, value, this.secureCookies ? { ...options, secure: options?.secure ?? true } : options)),
      deleteCookie: (name, options) => responseHeaders.append("set-cookie", serializeCookie(name, "", { ...options, maxAge: 0, path: options?.path ?? "/" })),
      response: (status, body, extraHeaders) => ({ status, body, headers: mergeHeaders(responseHeaders, extraHeaders), [responseMarker]: true }),
      html: (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "text/html; charset=utf-8" }), [responseMarker]: true }),
      text: (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "text/plain; charset=utf-8" }), [responseMarker]: true }),
      json: (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "application/json; charset=utf-8" }), [responseMarker]: true }),
      redirect: (url, status = 302) => ({ status, body: undefined, headers: mergeHeaders(responseHeaders, { location: url }), [responseMarker]: true }),
      header: (name, value) => {
        context.set.headers[name.toLowerCase()] = value
        return context
      }
    }
    return { context, responseHeaders }
  }

  async handle(request: RequestData): Promise<ResponseData> {
    const { pathname, search } = splitUrl(request.url)
    const method = fastNormalizeMethod(request.method)
    if (method === undefined) return this.response(400, { error: "Unsupported HTTP method" })
    const lookupMethod = method === "HEAD" ? "GET" : method
    const normalized = normalizePathname(pathname)
    // OPTIONS is a cold path: preserve the original 204-with-Allow contract first, unless handled by hooks (e.g. CORS preflight).
    if (method === "OPTIONS") {
      const actual = splitSegments(normalized)
      const allow = allowedMethodsFor(this.graph.routes, actual)
      if (this.hooks.length > 0) {
        const { context } = this.createContext(request, {}, search, method)
        for (const hook of this.hooks) {
          const result = await hook(context)
          if (isResponse(result)) return result
        }
      }
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
        if (allow !== "OPTIONS") {
          return this.response(405, { error: "Method Not Allowed" }, { allow })
        }
        if (this.notFoundHandler !== undefined) {
          const { context, responseHeaders } = this.createContext(request, {}, search, method)
          const result = await this.notFoundHandler(context)
          if (isResponse(result)) return result
          if (result instanceof Response) {
            return {
              status: context.set.status ?? result.status,
              headers: mergeHeaders(mergeHeaders(responseHeaders, Object.fromEntries(result.headers.entries())), context.set.headers),
              body: result.body,
              [responseMarker]: true as const
            }
          }
          const effectiveStatus = context.set.status ?? 404
          const effectiveHeaders = Object.keys(context.set.headers).length > 0 ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
          return { status: effectiveStatus, body: result, headers: effectiveHeaders, [responseMarker]: true as const }
        }
        return this.response(404, { error: "Not Found" })
      }
      route = match.route
      params = match.params
    }
    const hasTelemetry = this.telemetry !== undefined
    const startedAt = hasTelemetry ? performance.now() : 0
    const { context, responseHeaders } = this.createContext(request, params, search, method)
    const requestId = context.requestId
    try {
      await this.telemetry?.onRequest?.(context)
      if (route.paramsSchema) context.params = await route.paramsSchema.validate(context.params) as Record<string, string>
      if (route.querySchema) context.query = asParsedQuery(await route.querySchema.validate(Object.fromEntries(context.query.entries())))
      if (route.headersSchema) context.headers = await route.headersSchema.validate(Object.fromEntries(context.headers.entries())) as Headers
      if (route.bodySchema) context.body = await route.bodySchema.validate(context.body)
      for (const hook of route.hooks) {
        const result = await hook(context)
        if (isResponse(result)) return result
      }
      const result = await route.handler(context)
      const effectiveHeaders = Object.keys(context.set.headers).length > 0 ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
      const response = isResponse(result)
        ? (context.set.status !== undefined && result.status === 200 ? { ...result, status: context.set.status, headers: mergeHeaders(result.headers, context.set.headers) } : (Object.keys(context.set.headers).length > 0 ? { ...result, headers: mergeHeaders(result.headers, context.set.headers) } : result))
        : result instanceof Response
        ? { status: context.set.status ?? result.status, headers: mergeHeaders(effectiveHeaders, Object.fromEntries(result.headers.entries())), body: result.body, [responseMarker]: true as const }
        : { status: context.set.status ?? 200, body: result, headers: effectiveHeaders, [responseMarker]: true as const }
      if (route.responseSchema) response.body = await route.responseSchema.validate(response.body, "response")
      for (const hook of route.afterHooks) await hook(context, response)
      await this.telemetry?.onResponse?.(context, response)
      await this.telemetry?.exportSpan?.({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: response.status, durationMs: hasTelemetry ? performance.now() - startedAt : 0 })
      return response
    } catch (error) {
      await this.telemetry?.onError?.(context, error)
      const errorStatus = error instanceof HttpError ? error.status : 500
      await this.telemetry?.exportSpan?.({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: errorStatus, durationMs: hasTelemetry ? performance.now() - startedAt : 0, error })
      context.set.status = errorStatus
      for (const handler of route.errorHandlers) {
        const result = await handler(error, context)
        if (isResponse(result)) return result
        if (result instanceof Response) {
          return {
            status: context.set.status ?? result.status,
            headers: mergeHeaders(mergeHeaders(responseHeaders, Object.fromEntries(result.headers.entries())), context.set.headers),
            body: result.body,
            [responseMarker]: true as const
          }
        }
        if (result !== undefined) {
          return {
            status: context.set.status ?? errorStatus,
            body: result,
            headers: mergeHeaders(responseHeaders, context.set.headers),
            [responseMarker]: true as const
          }
        }
      }
      if (error instanceof HttpError) {
        return this.response(errorStatus, { error: error.message })
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

export function createParsedQuery(search: string): ParsedQuery {
  const params = search === "" ? new URLSearchParams() : new URLSearchParams(search)
  return new Proxy(params, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) {
        const val = Reflect.get(target, prop, receiver)
        return typeof val === "function" ? val.bind(target) : val
      }
      return target.get(String(prop)) ?? undefined
    },
    has(target, prop) {
      if (typeof prop === "symbol") return Reflect.has(target, prop)
      return target.has(String(prop)) || prop in target
    },
    ownKeys(target) {
      return Array.from(new Set([...Reflect.ownKeys(target), ...target.keys()]))
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && target.has(prop)) {
        return {
          enumerable: true,
          configurable: true,
          writable: true,
          value: target.get(prop) ?? undefined,
        }
      }
      return Reflect.getOwnPropertyDescriptor(target, prop)
    }
  }) as ParsedQuery
}

export function asParsedQuery(source: unknown): ParsedQuery {
  if (typeof source === "string") return createParsedQuery(source)
  if (source instanceof URLSearchParams) return createParsedQuery(source.toString())
  if (typeof source === "object" && source !== null) {
    const entries = Object.entries(source).map(([k, v]) => [k, String(v ?? "")])
    const params = new URLSearchParams(entries)
    return new Proxy(source as Record<string, unknown>, {
      get(target, prop, receiver) {
        if (prop === "get") return (key: string) => params.get(key)
        if (prop === "has") return (key: string) => params.has(key)
        if (prop === "entries") return () => params.entries()
        if (prop === "keys") return () => params.keys()
        if (prop === "values") return () => params.values()
        if (prop === "toString") return () => params.toString()
        if (typeof prop === "symbol" || prop in target) {
          return Reflect.get(target, prop, receiver)
        }
        return params.get(String(prop)) ?? undefined
      }
    }) as unknown as ParsedQuery
  }
  return createParsedQuery("")
}

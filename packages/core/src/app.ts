import { compilePath, matchRoute, normalizeMethod } from "./router.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "./schema.ts"
import { HttpError, requestIdFor, responseMarker, type AfterHook, type Context, type CookieOptions, type ErrorHandler, type Handler, type Hook, type HttpMethod, type InjectOptions, type InjectResponse, type NelysiaOptions, type RequestData, type ResponseData, type RouteGraph, type RouteOptions, type RouteRecord, type Telemetry, type WebSocketHandlers } from "./types.ts"
import { createBunServer } from "../../runtime-bun/src/server.ts"
import { createNodeServer } from "../../runtime-node/src/server.ts"

const asHeaders = (headers?: Headers): Headers => headers ?? new Headers()

let requestSeq = 0

class DefaultContext implements Context {
  readonly _app: Nelysia
  readonly _rawRequest: RequestData
  body: unknown
  readonly responseHeaders: Headers
  params: Record<string, string>
  readonly requestId: string
  auth?: unknown
  readonly setCookie: (name: string, value: string, options?: CookieOptions) => void
  readonly response: (status: number, body: unknown, headers?: Record<string, string>) => ResponseData
  private _clientIp?: string | null
  private _headersInstance?: Headers
  private _requestWithHeaders?: RequestData
  private readonly _search: string
  private _query?: URLSearchParams
  private _cookies?: Record<string, string>

  constructor(app: Nelysia, request: RequestData, requestId: string, params: Record<string, string>, search: string, responseHeaders: Headers) {
    this._app = app
    this._rawRequest = request
    this.requestId = requestId
    this.params = params
    this.body = request.body
    this._search = search
    this.responseHeaders = responseHeaders

    this.setCookie = (name: string, value: string, options?: CookieOptions) => {
      this.responseHeaders.append(
        "set-cookie",
        serializeCookie(name, value, this._app.secureCookies ? { ...options, secure: options?.secure ?? true } : options)
      )
    }

    this.response = (status: number, body: unknown, headers?: Record<string, string>): ResponseData => {
      return {
        status,
        body,
        headers: mergeHeaders(this.responseHeaders, headers),
        [responseMarker]: true
      }
    }
  }

  get request(): RequestData {
    if (!this._requestWithHeaders) {
      this._requestWithHeaders = { ...this._rawRequest, headers: this.headers }
    }
    return this._requestWithHeaders
  }

  get clientIp(): string | undefined {
    if (this._clientIp === undefined) {
      const forwarded = this._app.trustedProxy ? this.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined
      this._clientIp = forwarded || this._rawRequest.remoteAddress || null
    }
    return this._clientIp ?? undefined
  }

  get headers(): Headers {
    if (!this._headersInstance) {
      if (this._rawRequest.headers instanceof Headers) {
        this._headersInstance = this._rawRequest.headers
      } else if (this._rawRequest.headers) {
        this._headersInstance = new Headers(this._rawRequest.headers as Record<string, string>)
      } else {
        this._headersInstance = new Headers()
      }
    }
    return this._headersInstance
  }

  set headers(val: Headers) {
    this._headersInstance = val
    if (this._requestWithHeaders) this._requestWithHeaders.headers = val
  }

  get query(): URLSearchParams {
    if (!this._query) {
      this._query = new URLSearchParams(this._search)
    }
    return this._query
  }

  set query(val: URLSearchParams) {
    this._query = val
  }

  get cookies(): Record<string, string> {
    if (!this._cookies) {
      this._cookies = parseCookies(this.headers.get("cookie"))
    }
    return this._cookies
  }
}

export class Nelysia {
  readonly graph: RouteGraph = { routes: [] }
  readonly bodyLimit: number
  readonly trustedProxy: boolean
  readonly secureCookies: boolean
  private hooks: Hook[] = []
  private afterHooks: AfterHook[] = []
  private errorHandlers: ErrorHandler[] = []
  readonly telemetry?: Telemetry
  readonly websocketRoutes: { path: string; handlers: WebSocketHandlers }[] = []
  readonly staticRoutes = new Map<string, RouteRecord>()
  readonly dynamicRoutes: RouteRecord[] = []

  constructor(options: NelysiaOptions = {}) {
    this.bodyLimit = options.bodyLimit ?? 1024 * 1024
    this.telemetry = options.telemetry
    this.trustedProxy = options.trustedProxy ?? false
    this.secureCookies = options.secureCookies ?? false
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
      this.graph.routes.push(mounted)
      if (mounted.static) this.staticRoutes.set(`${mounted.method} ${mounted.path}`, mounted)
      else this.dynamicRoutes.push(mounted)
    }
    return this
  }

  listen(port: number | { port: number }): unknown {
    const actualPort = typeof port === "number" ? port : port.port
    const runtime = globalThis as typeof globalThis & { Bun?: { serve(options: { port: number; fetch: (request: Request) => Promise<Response> }): unknown } }
    if (runtime.Bun) return createBunServer(this, actualPort)
    return createNodeServer(this).listen(actualPort)
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
    const route = { method: normalizeMethod(method), path, ...metadata, handler, hooks: [...this.hooks], afterHooks: [...this.afterHooks], errorHandlers: [...this.errorHandlers], auth: options.auth, bodySchema: normalizeSchema(options.body), paramsSchema: normalizeSchema(options.params), querySchema: normalizeSchema(options.query), headersSchema: normalizeSchema(options.headers), responseSchema: normalizeSchema(options.response) }
    this.graph.routes.push(route)
    if (route.static) this.staticRoutes.set(`${route.method} ${route.path}`, route)
    else this.dynamicRoutes.push(route)
    return this
  }

  async handle(request: RequestData): Promise<ResponseData> {
    const { pathname, search } = splitUrl(request.url)
    let method: HttpMethod
    try { method = normalizeMethod(request.method) } catch { return this.response(400, { error: "Unsupported HTTP method" }) }
    const lookupMethod = method === "HEAD" ? "GET" : method
    let route = this.staticRoutes.get(`${lookupMethod} ${pathname}`)
    let params: Record<string, string> = {}

    if (!route) {
      for (let i = 0; i < this.dynamicRoutes.length; i++) {
        const candidate = this.dynamicRoutes[i]
        if (candidate.method === lookupMethod) {
          const matched = matchRoute(candidate, pathname)
          if (matched !== undefined) {
            route = candidate
            params = matched
            break
          }
        }
      }
    }

    if (method === "OPTIONS") {
      const pathRoutes = this.graph.routes.filter((candidate) => matchRoute(candidate, pathname))
      if (pathRoutes.length > 0) return this.response(204, undefined, { allow: allowedMethods(pathRoutes) })
    }

    if (!route) {
      const pathRoutes = this.graph.routes.filter((candidate) => matchRoute(candidate, pathname))
      return pathRoutes.length > 0
        ? this.response(405, { error: "Method Not Allowed" }, { allow: allowedMethods(pathRoutes) })
        : this.response(404, { error: "Not Found" })
    }

    const responseHeaders = new Headers()
    const rawReqId = request.requestId ?? (request.headers?.get ? request.headers.get("x-request-id") : (request.headers as Record<string, string> | undefined)?.["x-request-id"])
    const requestId = rawReqId || requestIdFor(request)
    responseHeaders.set("x-request-id", requestId)

    const context = new DefaultContext(this, request, requestId, params, search, responseHeaders)
    const hasTelemetry = this.telemetry !== undefined
    const startedAt = hasTelemetry ? performance.now() : 0

    try {
      if (hasTelemetry) await this.telemetry!.onRequest?.(context)
      if (route.paramsSchema) context.params = (await route.paramsSchema.validate(context.params)) as Record<string, string>
      if (route.querySchema) context.query = (await route.querySchema.validate(Object.fromEntries(context.query.entries()))) as URLSearchParams
      if (route.headersSchema) context.headers = (await route.headersSchema.validate(Object.fromEntries(context.headers.entries()))) as Headers
      if (route.bodySchema) context.body = await route.bodySchema.validate(context.body)

      if (route.hooks.length > 0) {
        for (let i = 0; i < route.hooks.length; i++) {
          const hookResult = await route.hooks[i](context)
          if (isResponse(hookResult)) return hookResult
        }
      }

      const result = await route.handler(context)

      let response: ResponseData
      if (isResponse(result)) {
        response = result
      } else if (result instanceof Response) {
        response = {
          status: result.status,
          headers: mergeHeaders(responseHeaders, Object.fromEntries(result.headers.entries())),
          body: result.body,
          [responseMarker]: true as const
        }
      } else {
        response = {
          status: 200,
          headers: responseHeaders,
          body: result,
          [responseMarker]: true as const
        }
      }

      if (route.responseSchema) (response as { body: unknown }).body = await route.responseSchema.validate(response.body, "response")

      if (route.afterHooks.length > 0) {
        for (let i = 0; i < route.afterHooks.length; i++) {
          await route.afterHooks[i](context, response)
        }
      }

      if (hasTelemetry) {
        await this.telemetry!.onResponse?.(context, response)
        await this.telemetry!.exportSpan?.({
          name: `${method} ${route.path}`,
          requestId,
          method,
          route: route.path,
          status: response.status,
          durationMs: performance.now() - startedAt
        })
      }
      return response
    } catch (error) {
      if (hasTelemetry) {
        await this.telemetry!.onError?.(context, error)
        await this.telemetry!.exportSpan?.({
          name: `${method} ${route.path}`,
          requestId,
          method,
          route: route.path,
          status: error instanceof HttpError ? error.status : 500,
          durationMs: performance.now() - startedAt,
          error
        })
      }
      if (route.errorHandlers.length > 0) {
        for (let i = 0; i < route.errorHandlers.length; i++) {
          const res = await route.errorHandlers[i](error, context)
          if (isResponse(res)) return res
        }
      }
      throw error
    }
  }

  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData {
    return { status, body, headers: new Headers(headers), [responseMarker]: true }
  }
}

function normalizeSchema(schema: Schema | StandardSchema | undefined): Schema | undefined {
  if (!schema) return undefined
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

function allowedMethods(routes: RouteRecord[]): string {
  const methods = new Set(routes.map((route) => route.method))
  if (methods.has("GET")) methods.add("HEAD")
  methods.add("OPTIONS")
  return [...methods].join(", ")
}

import type { Nelysia } from "../../core/src/app.ts"
import { HttpError, responseMarker, type Context, type ResponseData, type RouteRecord } from "../../core/src/types.ts"
import type { Schema } from "../../core/src/schema.ts"

export const jsonContentType = "application/json; charset=utf-8"
export const textContentType = "text/plain; charset=utf-8"

/** Platform-neutral pre-serialized static payload. Adapters turn this into a
 * `Response` (Bun/Fetch) or raw bytes + headers (Node) without re-serializing. */
export interface SerializedBody {
  text?: string
  bytes?: Uint8Array
  contentType: string
}

export interface CompiledRoute {
  route: RouteRecord
  paramsOnly: boolean
  /** A static route whose handler can execute without a context allocation. */
  zeroArg: boolean
  match: (pathname: string) => Record<string, string> | undefined
  prefixFast?: { prefix: string; paramName: string }
  /** Present when the static value was serializable at compile time. */
  serialized?: SerializedBody
  /** Build-time generated validators for deterministic request/response schemas. */
  generated?: GeneratedRouteSchema
}

export interface GeneratedValidator {
  validate(value: unknown, path?: string): unknown
}

export interface GeneratedRouteSchema {
  body?: GeneratedValidator
  params?: GeneratedValidator
  query?: GeneratedValidator
  headers?: GeneratedValidator
  response?: GeneratedValidator
  responses?: Record<string, GeneratedValidator>
}

/** Stable, JSON-compatible intermediate representation used by code
 * generation. Keeping this boundary separate from runtime Schema objects
 * prevents user-defined validators and mutable definitions from leaking into
 * generated artifacts. */
export type SchemaIR = Readonly<Record<string, unknown>>

export interface CompiledDispatcher {
  routes: CompiledRoute[]
  staticMap: Map<string, CompiledRoute>
  staticFunctionMap: Map<string, CompiledRoute>
  single?: CompiledRoute
  singleStatic?: CompiledRoute
  singleDynamic?: CompiledRoute
  needsRequestId: boolean
  /** Contextful generic routes cannot use the minimal dispatcher context when
   * app-level state/decorations are installed; they must use app.handle(). */
  hasContextValues: boolean
}

/**
 * Execute a deterministic GET route with the generated schema contract.
 * Runtime adapters use this shared implementation so Bun, Node, and Fetch do
 * not drift in query/context/response semantics. The caller owns error
 * adaptation through `app.handleAdapterError`.
 */
export async function executeGeneratedGet(entry: CompiledRoute, params: Record<string, string>, request: Request, requestId?: string): Promise<ResponseData> {
  const responseHeaders = new Headers()
  if (requestId !== undefined) responseHeaders.set("x-request-id", requestId)
  const context = createGeneratedContext(entry.route, params, request, responseHeaders)
  const generated = entry.generated
  if (generated?.params) context.params = generated.params.validate(context.params) as Record<string, string>
  if (generated?.query) context.query = generated.query.validate(context.query) as Context["query"]
  if (generated?.headers) context.headers = generated.headers.validate(Object.fromEntries(context.headers.entries())) as Headers
  if (generated?.body) context.body = generated.body.validate(context.body)

  const result = await entry.route.handler(context)
  if (result instanceof HttpError) throw result
  let response: ResponseData
  if (isGeneratedResponseData(result)) {
    response = {
      ...result,
      status: context.set.status !== undefined && result.status === 200 ? context.set.status : result.status,
      headers: mergeGeneratedHeaders(responseHeaders, result.headers, context.set.headers)
    }
  } else if (result instanceof Response) {
    response = {
      status: context.set.status ?? result.status,
      headers: mergeGeneratedHeaders(responseHeaders, result.headers, context.set.headers),
      body: result,
      [responseMarker]: true
    }
  } else if (result instanceof ReadableStream) {
    response = { status: context.set.status ?? 200, headers: mergeGeneratedHeaders(responseHeaders, undefined, context.set.headers), body: result, [responseMarker]: true }
  } else {
    response = {
      status: context.set.status ?? 200,
      headers: mergeGeneratedHeaders(responseHeaders, undefined, context.set.headers),
      body: result,
      [responseMarker]: true
    }
  }

  const validator = generated?.responses?.[String(response.status)] ?? (response.status === 200 ? generated?.response : undefined)
  if (validator && !(response.body instanceof Response) && !(response.body instanceof ReadableStream)) {
    response.body = validator.validate(response.body, "response")
  }
  return response
}

function createGeneratedContext(route: RouteRecord, params: Record<string, string>, request: Request, responseHeaders: Headers): Context {
  const url = new URL(request.url)
  const context = {} as Context
  const set: Context["set"] = { status: undefined, headers: {} }
  const headers = request.headers
  Object.assign(context, {
    request: { method: request.method, url: request.url, headers, body: undefined },
    requestId: responseHeaders.get("x-request-id") ?? "",
    params,
    query: createGeneratedQuery(url.search),
    set,
    store: {},
    body: undefined,
    headers,
    cookies: parseGeneratedCookies(headers.get("cookie")),
    route: { method: route.method, path: route.path, features: route.features ?? {}, auth: route.auth },
    signal: request.signal ?? new AbortController().signal,
    setCookie(name: string, value: string) { responseHeaders.append("set-cookie", `${name}=${encodeURIComponent(value)}; Path=/`) },
    deleteCookie(name: string) { responseHeaders.append("set-cookie", `${name}=; Max-Age=0; Path=/`) },
    response(bodyOrStatus: unknown, optionsOrBody?: unknown, extraHeaders?: Record<string, string>): ResponseData {
      if (typeof bodyOrStatus === "number" && !(extraHeaders === undefined && isGeneratedResponseOptions(optionsOrBody))) {
        return { status: bodyOrStatus, body: optionsOrBody, headers: mergeGeneratedHeaders(responseHeaders, undefined, extraHeaders), [responseMarker]: true }
      }
      const options = isGeneratedResponseOptions(optionsOrBody) ? optionsOrBody : undefined
      return { status: options?.status ?? 200, body: bodyOrStatus, headers: mergeGeneratedHeaders(responseHeaders, undefined, options?.headers), [responseMarker]: true }
    },
    html(body: string, status = 200) { return { status, body, headers: mergeGeneratedHeaders(responseHeaders, undefined, { "content-type": "text/html; charset=utf-8" }), [responseMarker]: true } },
    text(body: string, status = 200) { return { status, body, headers: mergeGeneratedHeaders(responseHeaders, undefined, { "content-type": "text/plain; charset=utf-8" }), [responseMarker]: true } },
    json(body: unknown, statusOrOptions: number | { status?: number; headers?: HeadersInit } = 200) {
      const options = typeof statusOrOptions === "number" ? { status: statusOrOptions } : statusOrOptions
      return { status: options.status ?? 200, body, headers: mergeGeneratedHeaders(responseHeaders, undefined, { "content-type": "application/json; charset=utf-8", ...Object.fromEntries(new Headers(options.headers).entries()) }), [responseMarker]: true }
    },
    redirect(url: string, status = 302) { return { status, body: undefined, headers: mergeGeneratedHeaders(responseHeaders, undefined, { location: url }), [responseMarker]: true } },
    header(name: string, value: string) { set.headers[name.toLowerCase()] = value; return context }
  })
  return context
}

function createGeneratedQuery(search: string): Context["query"] {
  const params = new URLSearchParams(search)
  return new Proxy(params, {
    get(target, property, receiver) {
      if (typeof property === "symbol" || property in target) {
        const value = Reflect.get(target, property, receiver)
        return typeof value === "function" ? value.bind(target) : value
      }
      return target.get(String(property)) ?? undefined
    },
    has(target, property) { return typeof property === "symbol" ? Reflect.has(target, property) : target.has(String(property)) || property in target },
    ownKeys(target) { return Array.from(new Set([...Reflect.ownKeys(target), ...target.keys()])) },
    getOwnPropertyDescriptor(target, property) {
      if (typeof property === "string" && target.has(property)) return { enumerable: true, configurable: true, writable: true, value: target.get(property) ?? undefined }
      return Reflect.getOwnPropertyDescriptor(target, property)
    }
  }) as Context["query"]
}

function parseGeneratedCookies(value: string | null): Record<string, string> {
  if (!value) return {}
  return Object.fromEntries(value.split(";").map((part) => {
    const index = part.indexOf("=")
    if (index < 0) return [part.trim(), ""]
    const name = part.slice(0, index).trim()
    const raw = part.slice(index + 1).trim()
    try { return [name, decodeURIComponent(raw)] } catch { return [name, raw] }
  }))
}

function mergeGeneratedHeaders(base: Headers, extra?: HeadersInit, overrides?: HeadersInit): Headers {
  const headers = new Headers(base)
  for (const [key, value] of new Headers(extra).entries()) headers.set(key, value)
  for (const [key, value] of new Headers(overrides).entries()) headers.set(key, value)
  return headers
}

function isGeneratedResponseData(value: unknown): value is ResponseData {
  return typeof value === "object" && value !== null && (value as ResponseData)[responseMarker] === true
}

function isGeneratedResponseOptions(value: unknown): value is { status?: number; headers?: HeadersInit } {
  return typeof value === "object" && value !== null && (("status" in value && typeof (value as { status?: unknown }).status === "number") || "headers" in value)
}

export type CompiledLookup =
  | { kind: "static-prebuilt"; entry: CompiledRoute }
  | { kind: "static-sync"; entry: CompiledRoute }
  | { kind: "params"; entry: CompiledRoute; params: Record<string, string> }
  | { kind: "generic"; entry: CompiledRoute; params: Record<string, string> }

/**
 * Routes eligible for the compiled fast path. Body parsing remains owned by
 * the runtime adapter, but deterministic body definitions are still emitted
 * into the route IR so standalone/runtime integrations can consume the same
 * generated validator without invoking user code.
 */
export function isCompilableRoute(route: RouteRecord): boolean {
  return route.method === "GET"
    && route.auth === undefined
    && route.role === undefined
    && route.permissions === undefined
    && Object.keys(route.features ?? {}).length === 0
    && (route.routeGuards?.length ?? 0) === 0
    && (route.requestHooks?.length ?? 0) === 0
    && (route.parseHooks?.length ?? 0) === 0
    && (route.mapResponseHooks?.length ?? 0) === 0
    && (route.afterResponseHooks?.length ?? 0) === 0
    && route.hooks.length === 0
    && route.afterHooks.length === 0
    && route.errorHandlers.length === 0
    && (!route.bodySchema || canGenerateSchema(route.bodySchema))
    && (!route.paramsSchema || canGenerateSchema(route.paramsSchema))
    && (!route.querySchema || canGenerateSchema(route.querySchema))
    && (!route.headersSchema || canGenerateSchema(route.headersSchema))
    && (!route.responseSchema || canGenerateSchema(route.responseSchema))
    && (!route.responseSchemas || Object.values(route.responseSchemas).every((schema) => canGenerateSchema(schema)))
}

/** A route may enter the minimal static dispatcher only when no request or
 * response contract needs runtime validation. Schema-bearing routes remain on
 * the generated-validation adapter path even when their URL is static. */
export function isStaticFastPathRoute(route: RouteRecord): boolean {
  return route.static
    && route.paramsSchema === undefined
    && route.querySchema === undefined
    && route.headersSchema === undefined
    && route.responseSchema === undefined
    && route.responseSchemas === undefined
}

export function serializeStaticValue(value: unknown): SerializedBody | undefined {
  try {
    // Native responses and streams carry status/headers or a live body. They
    // must stay on the specialized function lane so adapters can forward them
    // unchanged instead of accidentally serializing the Response object.
    if (value instanceof Response || value instanceof ReadableStream) return undefined
    if (typeof value === "string") return { text: value, contentType: textContentType }
    if (value instanceof Uint8Array) return { bytes: value, contentType: textContentType }
    const text = JSON.stringify(value)
    return text === undefined ? undefined : { text, contentType: jsonContentType }
  } catch {
    return undefined
  }
}

export function compileDispatcher(app: Nelysia<any, any, any>): CompiledDispatcher {
  const routes: CompiledRoute[] = app.graph.routes
    .filter(isCompilableRoute)
    .map((route) => {
      const entry: CompiledRoute = {
        route,
        paramsOnly: isParamsOnlyHandler(route.handler)
          && route.bodySchema === undefined
          && route.paramsSchema === undefined
          && route.querySchema === undefined
          && route.headersSchema === undefined
          && route.responseSchema === undefined
          && route.responseSchemas === undefined,
        zeroArg: isStaticFastPathRoute(route) && route.handler.length === 0 && route.afterHooks.length === 0,
        match: createGeneratedMatcher(route),
        generated: createGeneratedRouteSchema(route)
      }
      if (isStaticFastPathRoute(route) && route.staticValue !== undefined) {
        const serialized = serializeStaticValue(route.staticValue)
        if (serialized !== undefined) entry.serialized = serialized
      }
      // Specialize single trailing-param routes like /users/:id (no other params, static prefix)
      if (!route.static && route.segments.length === 2 && !route.segments[0].startsWith(":") && route.segments[1].startsWith(":") && route.params.length === 1) {
        entry.prefixFast = { prefix: `/${route.segments[0]}/`, paramName: route.params[0] }
      }
      return entry
    })

  const staticMap = new Map<string, CompiledRoute>()
  const staticFunctionMap = new Map<string, CompiledRoute>()
  for (const entry of routes) {
    if (!entry.route.static) continue
    if (entry.serialized !== undefined) staticMap.set(entry.route.path, entry)
    else staticFunctionMap.set(entry.route.path, entry)
  }

  const single = routes.length === 1 ? routes[0] : undefined
  const singleStatic = single !== undefined && single.route.static ? single : undefined
  const singleDynamic = single !== undefined && !single.route.static && single.prefixFast !== undefined && single.paramsOnly ? single : undefined
  return { routes, staticMap, staticFunctionMap, single, singleStatic, singleDynamic, needsRequestId: app.requestIdEnabled, hasContextValues: app.hasContextValues }
}

/** Return true only for schemas whose definition is sufficient to reproduce
 * the built-in validator without invoking user code. Standard Schema objects,
 * transforms, and unknown keywords intentionally use the generic runtime. */
export function canGenerateSchema(schema: Schema | undefined): boolean {
  if (schema === undefined || schema.kind === "standard" || schema.kind === "date") return false
  const definition = schema.definition
  return definition !== undefined && supportedDefinition(definition)
}

function createGeneratedRouteSchema(route: RouteRecord): GeneratedRouteSchema | undefined {
  const generated: GeneratedRouteSchema = {}
  const body = createSchemaIR(route.bodySchema)
  const params = createSchemaIR(route.paramsSchema)
  const query = createSchemaIR(route.querySchema)
  const headers = createSchemaIR(route.headersSchema)
  const response = createSchemaIR(route.responseSchema)
  if (body !== undefined) generated.body = createGeneratedValidator(body)
  if (params !== undefined) generated.params = createGeneratedValidator(params)
  if (query !== undefined) generated.query = createGeneratedValidator(query)
  if (headers !== undefined) generated.headers = createGeneratedValidator(headers)
  if (response !== undefined) generated.response = createGeneratedValidator(response)
  const responses: Record<string, GeneratedValidator> = {}
  for (const [status, schema] of Object.entries(route.responseSchemas ?? {})) {
    const definition = createSchemaIR(schema)
    if (definition !== undefined) responses[status] = createGeneratedValidator(definition)
  }
  if (Object.keys(responses).length > 0) generated.responses = responses
  return Object.keys(generated).length === 0 ? undefined : generated
}

function supportedDefinition(definition: Record<string, unknown>): boolean {
  const allowed = new Set([
    "type", "properties", "required", "additionalProperties", "items", "prefixItems",
    "enum", "const", "anyOf", "allOf", "minimum", "maximum", "minLength", "maxLength",
    "pattern", "format", "minItems", "maxItems", "description", "default", "examples"
  ])
  for (const key of Object.keys(definition)) if (!allowed.has(key)) return false
  if (definition.format !== undefined && definition.format !== "date-time") return false
  for (const key of ["anyOf", "allOf", "prefixItems"]) {
    const value = definition[key]
    if (value !== undefined && (!Array.isArray(value) || !value.every((item) => isSupportedDefinition(item)))) return false
  }
  if (definition.items !== undefined && !isSupportedDefinition(definition.items)) return false
  if (definition.additionalProperties !== undefined && typeof definition.additionalProperties === "object" && definition.additionalProperties !== null && !isSupportedDefinition(definition.additionalProperties)) return false
  if (definition.properties !== undefined) {
    if (typeof definition.properties !== "object" || definition.properties === null || Array.isArray(definition.properties)) return false
    for (const item of Object.values(definition.properties)) if (!isSupportedDefinition(item)) return false
  }
  return true
}

function isSupportedDefinition(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && supportedDefinition(value as Record<string, unknown>)
}

export function createGeneratedValidator(definition: Record<string, unknown>): GeneratedValidator {
  return { validate: (value, path = "body") => validateGeneratedValue(value, definition, path) }
}

export function createSchemaIR(schema: Schema | undefined): SchemaIR | undefined {
  if (!canGenerateSchema(schema)) return undefined
  return stableDefinition(schema!.definition!)
}

function stableDefinition(value: Record<string, unknown>): SchemaIR {
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const child = value[key]
    if (Array.isArray(child)) output[key] = child.map((entry) => isSupportedDefinition(entry) ? stableDefinition(entry) : entry)
    else if (isSupportedDefinition(child)) output[key] = stableDefinition(child)
    else if (child !== undefined) output[key] = child
  }
  return output
}

function validateGeneratedValue(value: unknown, schema: Record<string, unknown>, path: string): unknown {
  if (Object.keys(schema).length === 0) return value
  if ("const" in schema && value !== schema.const) throw invalidGenerated(path + " must equal " + String(schema.const))
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) throw invalidGenerated(path + " must be an allowed value")
  if (Array.isArray(schema.anyOf)) {
    for (const branch of schema.anyOf) {
      try { return validateGeneratedValue(value, branch as Record<string, unknown>, path) } catch { /* try next branch */ }
    }
    throw invalidGenerated(path + " does not match any allowed value")
  }
  if (Array.isArray(schema.allOf)) {
    let output = value
    for (const branch of schema.allOf) {
      const validated = validateGeneratedValue(output, branch as Record<string, unknown>, path)
      output = typeof output === "object" && output !== null && typeof validated === "object" && validated !== null
        ? { ...(output as Record<string, unknown>), ...(validated as Record<string, unknown>) }
        : validated
    }
    return output
  }
  if (schema.type === "null") { if (value !== null) throw invalidGenerated(path + " must be null"); return value }
  if (schema.type === "string") {
    if (typeof value !== "string") throw invalidGenerated(path + " must be string")
    if (typeof schema.minLength === "number" && value.length < schema.minLength) throw invalidGenerated(path + " is too short")
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) throw invalidGenerated(path + " is too long")
    if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern)).test(value)) throw invalidGenerated(path + " has an invalid format")
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) throw invalidGenerated(path + " must be a date-time")
    return value
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) throw invalidGenerated(path + " must be " + String(schema.type))
    if (typeof schema.minimum === "number" && value < schema.minimum) throw invalidGenerated(path + " is below minimum")
    if (typeof schema.maximum === "number" && value > schema.maximum) throw invalidGenerated(path + " is above maximum")
    return value
  }
  if (schema.type === "boolean") { if (typeof value !== "boolean") throw invalidGenerated(path + " must be boolean"); return value }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw invalidGenerated(path + " must be array")
    if (typeof schema.minItems === "number" && value.length < schema.minItems) throw invalidGenerated(path + " has too few items")
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) throw invalidGenerated(path + " has too many items")
    if (Array.isArray(schema.prefixItems)) {
      if (value.length !== schema.prefixItems.length) throw invalidGenerated(path + " has an invalid tuple length")
      const prefixItems = schema.prefixItems as unknown[]
      return value.map((entry, index) => validateGeneratedValue(entry, prefixItems[index] as Record<string, unknown>, path + "." + index))
    }
    return schema.items === undefined ? value : value.map((entry, index) => validateGeneratedValue(entry, schema.items as Record<string, unknown>, path + "." + index))
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidGenerated(path + " must be object")
    const input = value as Record<string, unknown>
    for (const key of Array.isArray(schema.required) ? schema.required : []) if (input[key] === undefined) throw invalidGenerated(path + "." + key + " is required")
    const output: Record<string, unknown> = {}
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties as Record<string, unknown> : undefined
    if (properties !== undefined) for (const [key, child] of Object.entries(properties)) if (input[key] !== undefined) setSafe(output, key, validateGeneratedValue(input[key], child as Record<string, unknown>, path + "." + key))
    if (properties === undefined && schema.additionalProperties && typeof schema.additionalProperties === "object") for (const [key, entry] of Object.entries(input)) setSafe(output, key, validateGeneratedValue(entry, schema.additionalProperties as Record<string, unknown>, path + "." + key))
    return output
  }
  return value
}

function invalidGenerated(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 })
}

function setSafe(output: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__" || key === "constructor" || key === "prototype") Object.defineProperty(output, key, { value, enumerable: true, configurable: true, writable: true })
  else output[key] = value
}

function classify(entry: CompiledRoute, params: Record<string, string>): CompiledLookup {
  if (entry.route.static) {
    return entry.serialized !== undefined
      ? { kind: "static-prebuilt", entry }
      : entry.zeroArg ? { kind: "static-sync", entry } : { kind: "generic", entry, params }
  }
  return entry.paramsOnly
    ? { kind: "params", entry, params }
    : { kind: "generic", entry, params }
}

function classifyPrefix(entry: CompiledRoute, params: Record<string, string>): CompiledLookup {
  // Trailing-param fast matches skip query/header parsing, so only params-only
  // handlers can run on the fast path; anything else needs the generic context.
  if (entry.route.static || !entry.paramsOnly) return classify(entry, params)
  return { kind: "params", entry, params }
}

/** Shared dispatch core: O(1) static hit, single-route shortcuts, then a
 * per-method-order scan. Returns undefined when the generic fallback owns it. */
export function lookupCompiled(dispatcher: CompiledDispatcher, pathname: string): CompiledLookup | undefined {
  const { staticMap, staticFunctionMap, single, singleStatic } = dispatcher
  const hit = staticMap.get(pathname)
  if (hit !== undefined) return { kind: "static-prebuilt", entry: hit }
  const functionHit = staticFunctionMap.get(pathname)
  if (functionHit !== undefined) return classify(functionHit, {})
  // Trailing-slash normalization only when needed (avoids alloc on hot path).
  let path = pathname
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    path = path.slice(0, -1)
    const hit2 = staticMap.get(path)
    if (hit2 !== undefined) return { kind: "static-prebuilt", entry: hit2 }
    const functionHit2 = staticFunctionMap.get(path)
    if (functionHit2 !== undefined) return classify(functionHit2, {})
  }
  // Single-static shortcut: direct string compare, no Map hashing (benchmark case).
  if (singleStatic !== undefined) {
    if (path === singleStatic.route.path) return classify(singleStatic, {})
    return undefined
  }
  if (single !== undefined) return lookupSingle(single, path)
  for (let i = 0; i < dispatcher.routes.length; i++) {
    const entry = dispatcher.routes[i]
    // Static entries without a map hit above are handled by the sync path below.
    if (entry.route.static) continue
    if (entry.prefixFast !== undefined) {
      const params = matchPrefix(entry.prefixFast, path)
      if (params !== undefined) return classifyPrefix(entry, params)
    } else {
      const params = entry.match(path)
      if (params !== undefined) return classify(entry, params)
    }
  }
  return undefined
}

function lookupSingle(entry: CompiledRoute, path: string): CompiledLookup | undefined {
  // Note: single static entries are handled by the singleStatic branch above,
  // which verifies the path (the previous dispatcher invoked the static handler
  // for any path here — fixed).
  if (entry.prefixFast !== undefined) {
    const params = matchPrefix(entry.prefixFast, path)
    if (params === undefined) return undefined
    return classifyPrefix(entry, params)
  }
  const params = entry.match(path)
  if (params === undefined) return undefined
  return classify(entry, params)
}

export function matchPrefix(spec: { prefix: string; paramName: string }, path: string): Record<string, string> | undefined {
  if (!path.startsWith(spec.prefix)) return undefined
  let rest = path.slice(spec.prefix.length)
  if (rest.length > 1 && rest.charCodeAt(rest.length - 1) === 47) rest = rest.slice(0, -1)
  if (rest.length === 0 || rest.indexOf("/") !== -1) return undefined
  let value = rest
  if (value.indexOf("%") !== -1) {
    try { value = decodeURIComponent(value) } catch { return undefined }
  }
  return { [spec.paramName]: value }
}

export function matchSingleDynamicUrl(entry: { prefixFast?: { prefix: string; paramName: string } }, url: string): Record<string, string> | undefined {
  const spec = entry.prefixFast
  if (spec === undefined) return undefined
  const pre = spec.prefix
  let ps: number
  if (url.startsWith("/")) ps = 0
  else {
    ps = url.indexOf("/", 8)
    if (ps === -1) {
      ps = url.indexOf("/", 7)
      if (ps === -1) return undefined
    }
  }
  if (!url.startsWith(pre, ps)) return undefined
  const idStart = ps + pre.length
  let idEnd = url.indexOf("?", idStart)
  if (idEnd === -1) idEnd = url.length
  let len = idEnd - idStart
  if (len > 1 && url.charCodeAt(idEnd - 1) === 47) { idEnd--; len-- }
  if (len === 0) return undefined
  // Reject multi-segment tails without allocating: scan raw slice bounds.
  for (let i = idStart; i < idEnd; i++) if (url.charCodeAt(i) === 47) return undefined
  let raw = url.slice(idStart, idEnd)
  if (raw.indexOf("%") !== -1) {
    try { raw = decodeURIComponent(raw) } catch { return undefined }
  }
  return { [spec.paramName]: raw }
}

export function fastPathname(url: string): string {
  // http://host:port/path?query — find first "/" after "//", then strip query.
  let start = url.indexOf("/", 8)
  if (start === -1) {
    start = url.indexOf("/", 7)
    if (start === -1) return "/"
  }
  const q = url.indexOf("?", start)
  if (q === -1) return start === url.length ? "/" : url.slice(start)
  return q === start ? "/" : url.slice(start, q)
}

export function createGeneratedMatcher(route: RouteRecord): (pathname: string) => Record<string, string> | undefined {
  if (route.static) return (pathname) => pathname === route.path ? {} : undefined
  const segments = route.segments
  const names = route.params
  return (pathname) => {
    const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
    const values = normalized === "/" ? [] : normalized.slice(1).split("/")
    if (route.wildcard ? values.length < segments.length - 1 : values.length !== segments.length) return
    const params: Record<string, string> = {}
    let paramIndex = 0
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]
      if (segment === "*") {
        try { params["*"] = values.slice(index).map((value) => decodeURIComponent(value)).join("/") } catch { return }
        break
      }
      const value = values[index]
      if (segment.startsWith(":")) {
        try { params[names[paramIndex++]] = decodeURIComponent(value) } catch { return }
      } else if (segment !== value) return
    }
    return params
  }
}

export function isParamsOnlyHandler(handler: (context: Context) => unknown): boolean {
  const source = Function.prototype.toString.call(handler)
  return /^(?:async\s*)?\(\s*\{\s*params\s*\}\s*\)\s*=>/.test(source)
}

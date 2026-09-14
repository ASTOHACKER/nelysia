import { asParsedQuery, createParsedQuery, type Nelysia } from "../../core/src/app.ts"
import { requestIdFor, responseMarker, type Context, type RouteGraph, type RouteRecord } from "../../core/src/types.ts"
import type { Schema } from "../../core/src/schema.ts"
import { createBunHandler } from "../../runtime-bun/src/server.ts"
import { canGenerateSchema, compileDispatcher, fastPathname, isCompilableRoute, isParamsOnlyHandler, jsonContentType, lookupCompiled, matchSingleDynamicUrl, textContentType, type CompiledRoute } from "./dispatcher.ts"
import { createHash } from "node:crypto"

export { canGenerateSchema, createGeneratedMatcher, createGeneratedValidator, isParamsOnlyHandler } from "./dispatcher.ts"
export type { CompiledDispatcher, CompiledLookup, CompiledRoute, GeneratedRouteSchema, GeneratedValidator, SerializedBody } from "./dispatcher.ts"

export interface RouteAnalysis {
  method: string
  path: string
  execution: "compiled" | "specialized" | "generic"
  reason: string
}

export type BuildTarget = "bun" | "node"

export type BuildDiagnosticCode =
  | "NELY001"
  | "NELY002"
  | "NELY003"
  | "NELY101"
  | "NELY102"
  | "NELY103"
  | "NELY104"
  | "NELY105"
  | "NELY106"
  | "NELY107"
  | "NELY108"
  | "NELY109"
  | "NELY110"
  | "NELY111"

export interface BuildDiagnostic {
  code: BuildDiagnosticCode
  severity: "info" | "warning"
  message: string
  route?: { method: string; path: string }
}

export interface BuildManifest {
  version: 1
  compiler: "nelysia"
  target: BuildTarget
  entry: string
  artifact: string
  sourceToSource: boolean
  generation: "standalone" | "adapter"
  /** True when the runtime adapter serves hook-free GET routes through the
   * compiled dispatcher instead of the generic router. Additive v1 field. */
  dispatcher: boolean
  routes: RouteAnalysis[]
  diagnostics: BuildDiagnostic[]
  reproducible: true
  cacheKey: string
  sourceMap: string
}

export interface BuildArtifact {
  source: string
  manifest: BuildManifest
  sourceMap: string
}

export interface CompiledApplication {
  graph: RouteGraph
  analyses: RouteAnalysis[]
  handle: Nelysia["handle"]
  standaloneBlock?: { code: "NELY107" | "NELY110" | "NELY111"; reason: string }
}

export function compile(app: Nelysia): CompiledApplication {
  const analyses = app.graph.routes.map((route) => ({
    method: route.method,
    path: route.path,
    execution: route.static && route.hooks.length === 0 && route.contextFree ? "compiled" as const : route.static && route.hooks.length === 0 ? "specialized" as const : "generic" as const,
    reason: route.static && route.hooks.length === 0 && route.contextFree
      ? "Explicit static response; adapter uses static-prebuilt dispatch"
      : route.static && route.hooks.length === 0 && route.handler.length === 0
        ? "Static zero-arg handler; adapter uses static-sync dispatch"
        : isStandaloneRoute(route) ? "Handler and schema source can be embedded" : unsupportedRouteDiagnostic(route).reason
  }))
  const standaloneBlock = app.telemetry !== undefined
    ? { code: "NELY111" as const, reason: "Telemetry requires the generic runtime" }
    : app.websocketRoutes.length > 0
      ? { code: "NELY110" as const, reason: "WebSocket routes require the runtime adapter" }
      : app.hasFetchMounts
        ? { code: "NELY107" as const, reason: "Mounted Fetch handlers require the runtime adapter" }
        : undefined
  return { graph: app.graph, analyses, handle: app.handle.bind(app), standaloneBlock }
}

export function createCompiledBunHandler(app: Nelysia): (request: Request) => Response | Promise<Response> {
  const fallback = createBunHandler(app)
  const useFallback = app.telemetry !== undefined || app.hasGlobalLifecycle
  // Shared Headers instances: Bun normalizes plain-object headers on every
  // construction (~1.8M/s) but reuses Headers instances (~2.8M/s).
  const jsonHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "server": "Nelysia" })
  const textHeaders = new Headers({ "content-type": "text/plain;charset=UTF-8", "server": "Nelysia" })
  const dispatcher = useFallback ? undefined : compileDispatcher(app)

  // Bun-specific prebuilt responses from platform-neutral payloads.
  const prebuilt = new Map<CompiledRoute, Response>()
  if (dispatcher !== undefined) {
    for (const entry of dispatcher.routes) {
      const serialized = entry.serialized
      if (entry.route.static && serialized !== undefined) {
        const headers = serialized.contentType === jsonContentType ? jsonHeaders : textHeaders
        prebuilt.set(entry, serialized.text !== undefined
          ? new Response(serialized.text, { status: 200, headers })
          : new Response(serialized.bytes as unknown as BodyInit, { status: 200, headers }))
      }
    }
  }

  return (request) => {
    if (dispatcher === undefined) return fallback(request)
    // Fast guard: method check only. Compiled GET routes declare no body schema,
    // so a body on GET is ignored per GET semantics — no Headers/body access here.
    if (request.method !== "GET") return fallback(request)
    // Single-dynamic shortcut: extract the param straight from the URL,
    // skipping the intermediate pathname slice (benchmark /users/:id case).
    if (dispatcher.singleDynamic !== undefined) {
      const params = matchSingleDynamicUrl(dispatcher.singleDynamic, request.url)
      if (params !== undefined) return runParamsOnly(dispatcher.singleDynamic, params, fallback)
      return fallback(request)
    }
    const found = lookupCompiled(dispatcher, fastPathname(request.url))
    if (found === undefined) return fallback(request)
    switch (found.kind) {
      case "static-prebuilt":
        return prebuilt.get(found.entry)!.clone()
      case "static-sync": {
        // Static function routes are context-free but their value is only known
        // at request time. Execute once, preserve native results, and keep the
        // error path out of the hot response pipeline.
        return runStaticFunction(found.entry, request)
      }
      case "params":
        return runParamsOnly(found.entry, found.params, fallback)
      case "generic":
        return runGeneric(found.entry, found.params, request, fallback)
    }
  }

  function runParamsOnly(c: CompiledRoute, params: Record<string, string>, fb: (r: Request) => Promise<Response>): Response | Promise<Response> {
    try {
      const result = c.route.handler({ params } as Context)
      if (result instanceof Promise) return result.then((v) => fastJson(v), () => fbNoRequest(fb))
      return fastJson(result)
    } catch { return fbNoRequest(fb) }
  }

  function runStaticFunction(c: CompiledRoute, request: Request): Response | Promise<Response> {
    try {
      const result = (c.route.handler as () => unknown)()
      if (isPromiseLike(result)) return Promise.resolve(result).then((value) => fastJson(value), (error) => handleFastError(error, request))
      return fastJson(result)
    } catch (error) {
      return handleFastError(error, request)
    }
  }

  async function handleFastError(error: unknown, request: Request): Promise<Response> {
    const result = await app.handleAdapterError(error, {
      method: request.method,
      url: request.url,
      headers: request.headers,
      signal: request.signal
    })
    return responseFromResult(result.status, result.headers, result.body)
  }

  function fbNoRequest(fb: (r: Request) => Promise<Response>): Promise<Response> {
    // Generic fallback needs the original request; this path is cold (handler threw).
    // Return 500 to avoid re-entry cost; route-level errors on fast paths are rare.
    void fb
    return Promise.resolve(new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: jsonHeaders }))
  }

  function runGeneric(entry: CompiledRoute, params: Record<string, string>, request: Request, fb: (r: Request) => Promise<Response>): Response | Promise<Response> {
    const route = entry.route
    const headers = request.headers
    const context: Context = {
      request: { method: request.method, url: request.url, headers },
      requestId: requestIdFor(request),
      clientIp: undefined,
      signal: request.signal ?? new AbortController().signal,
      params,
      query: createParsedQuery(requestQuery(request.url)),
      set: { status: undefined, headers: {} },
      store: {},
      body: undefined,
      headers,
      cookies: {},
      setCookie: () => {},
      deleteCookie: () => {},
      response: (status, body, responseHeaders) => ({ status, body, headers: new Headers(responseHeaders), [responseMarker]: true }),
      html: (body, status = 200) => ({ status, body, headers: new Headers({ "content-type": "text/html; charset=utf-8" }), [responseMarker]: true }),
      text: (body, status = 200) => ({ status, body, headers: new Headers({ "content-type": "text/plain; charset=utf-8" }), [responseMarker]: true }),
      json: (body, status = 200) => ({ status, body, headers: new Headers({ "content-type": "application/json; charset=utf-8" }), [responseMarker]: true }),
      redirect: (url, status = 302) => ({ status, body: undefined, headers: new Headers({ location: url }), [responseMarker]: true }),
      header: (name, value) => {
        context.set.headers[name.toLowerCase()] = value
        return context
      }
    }
    try {
      const generated = entry.generated
      if (generated?.params) context.params = generated.params.validate(context.params, "params") as Record<string, string>
      if (generated?.query) context.query = asParsedQuery(generated.query.validate(Object.fromEntries(context.query.entries()), "query"))
      if (generated?.headers) context.headers = generated.headers.validate(Object.fromEntries(context.headers.entries()), "headers") as Headers
      const out = route.handler(context) as unknown
      if (out instanceof Promise) return out.then((v) => {
        try { return genericToResponse(v, context, entry) } catch { return fb(request) }
      }, () => fb(request))
      return genericToResponse(out, context, entry)
    } catch { return fb(request) }
  }

  function genericToResponse(result: unknown, ctx: Context, entry?: CompiledRoute): Response {
    if (isResponseData(result)) return responseFromResult(result.status, result.headers, result.body)
    if (entry?.generated?.response) result = entry.generated.response.validate(result, "response")
    const status = ctx.set.status ?? 200
    const extraHeaders = Object.keys(ctx.set.headers).length > 0 ? ctx.set.headers : undefined
    return fastJson(result, status, extraHeaders)
  }

  function fastJson(value: unknown, status = 200, headers?: Record<string, string>): Response {
    if (value instanceof Response) return value
    if (value instanceof ReadableStream) return new Response(value, { status, headers })
    if (value === undefined || value === null) return new Response(null, { status, headers })
    const combinedHeaders = headers ? { ...textHeaders, ...headers } : textHeaders
    if (typeof value === "string") return new Response(value, { status, headers: combinedHeaders })
    if (value instanceof Uint8Array) return new Response(value as unknown as BodyInit, { status, headers: combinedHeaders })
    // Preserve the framework's charset-bearing JSON contract while reusing
    // the shared Headers instance on the generated path.
    const jsonResponseHeaders = headers ? { ...Object.fromEntries(jsonHeaders.entries()), ...headers } : jsonHeaders
    return Response.json(value, { status, headers: jsonResponseHeaders })
  }
}

function responseFromResult(status: number, headers: HeadersInit | undefined, body: unknown): Response {
  if (body instanceof Response) return body
  if (body instanceof ReadableStream) return new Response(body, { status, headers })
  if (body === undefined || body === null) return new Response(null, { status, headers })
  if (typeof body === "string" || body instanceof Uint8Array) {
    const outputHeaders = headers && new Headers(headers).has("content-type") ? headers : { ...(headers ? Object.fromEntries(new Headers(headers).entries()) : {}), "content-type": "text/plain; charset=utf-8" }
    return new Response(body as unknown as BodyInit, { status, headers: outputHeaders })
  }
  return Response.json(body, { status, headers })
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function"
}

function requestPath(input: string): string {
  let value = input
  const scheme = value.indexOf("://")
  if (scheme !== -1) {
    const slash = value.indexOf("/", scheme + 3)
    value = slash === -1 ? "/" : value.slice(slash)
  }
  const query = value.indexOf("?")
  return (query === -1 ? value : value.slice(0, query)) || "/"
}

function requestQuery(input: string): string {
  const index = input.indexOf("?")
  return index === -1 ? "" : input.slice(index + 1)
}

export function generateMatcherSource(routes: readonly Pick<RouteRecord, "path" | "method">[]): string {
  const definitions = JSON.stringify(routes.map(({ method, path }) => ({ method, path })))
  return `const routes = ${definitions}\nexport function matchGeneratedRoute(method, pathname) {\n  for (const route of routes) {\n    if (route.method !== method) continue\n    const pattern = route.path.split("/").filter(Boolean)\n    const values = pathname.split("/").filter(Boolean)\n    if (pattern.at(-1) === "*" ? values.length < pattern.length - 1 : pattern.length !== values.length) continue\n    const params = {}\n    let matched = true\n    for (let index = 0; index < pattern.length; index++) {\n      if (pattern[index] === "*") { try { params["*"] = values.slice(index).map((value) => decodeURIComponent(value)).join("/") } catch { matched = false } break }\n      if (pattern[index].startsWith(":")) { try { params[pattern[index].slice(1)] = decodeURIComponent(values[index]) } catch { matched = false } }\n      else if (pattern[index] !== values[index]) matched = false\n    }\n    if (matched) return { route, params }\n  }\n}\n`
}

export function generateValidatorSource(schema: Schema): string {
  const definition = JSON.stringify(schema.definition ?? { type: schema.kind })
  return `const definition = ${definition}
function setSafe(output, key, value) {
  if (key === "__proto__" || key === "constructor" || key === "prototype") Object.defineProperty(output, key, { value, enumerable: true, configurable: true, writable: true })
  else output[key] = value
}
const invalid = (message) => Object.assign(new Error(message), { status: 400 })
function validate(value, schema, path) {
  if (!schema || Object.keys(schema).length === 0) return value
  if ("const" in schema && value !== schema.const) throw invalid(path + " must equal " + String(schema.const))
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) throw invalid(path + " must be an allowed value")
  if (Array.isArray(schema.anyOf)) {
    const errors = []
    for (const branch of schema.anyOf) {
      try { return validate(value, branch, path) } catch (error) { errors.push(String(error && error.message || error)) }
    }
    throw invalid(path + " does not match any allowed value: " + errors.join("; "))
  }
  if (Array.isArray(schema.allOf)) { let output = value; for (const branch of schema.allOf) { const validated = validate(output, branch, path); output = output && typeof output === "object" && validated && typeof validated === "object" ? { ...output, ...validated } : validated } return output }
  if (schema.type === "null") { if (value !== null) throw invalid(path + " must be null"); return value }
  if (schema.type === "string") {
    if (typeof value !== "string") throw invalid(path + " must be string")
    if (schema.minLength !== undefined && value.length < schema.minLength) throw invalid(path + " is too short")
    if (schema.maxLength !== undefined && value.length > schema.maxLength) throw invalid(path + " is too long")
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern)).test(value)) throw invalid(path + " has an invalid format")
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) throw invalid(path + " must be a date-time")
    return value
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) throw invalid(path + " must be " + schema.type)
    if (schema.minimum !== undefined && value < schema.minimum) throw invalid(path + " is below minimum")
    if (schema.maximum !== undefined && value > schema.maximum) throw invalid(path + " is above maximum")
    return value
  }
  if (schema.type === "boolean") { if (typeof value !== "boolean") throw invalid(path + " must be boolean"); return value }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw invalid(path + " must be array")
    if (schema.minItems !== undefined && value.length < schema.minItems) throw invalid(path + " has too few items")
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw invalid(path + " has too many items")
    if (Array.isArray(schema.prefixItems)) {
      if (value.length !== schema.prefixItems.length) throw invalid(path + " has an invalid tuple length")
      return value.map((entry, index) => validate(entry, schema.prefixItems[index], path + "." + index))
    }
    return value.map((entry, index) => validate(entry, schema.items, path + "." + index))
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid(path + " must be object")
    const input = value
    for (const key of schema.required || []) if (input[key] === undefined) throw invalid(path + "." + key + " is required")
    const output = {}
    for (const [key, child] of Object.entries(schema.properties || {})) if (input[key] !== undefined) setSafe(output, key, validate(input[key], child, path + "." + key))
    if (!schema.properties && schema.additionalProperties && typeof schema.additionalProperties === "object") for (const [key, entry] of Object.entries(input)) setSafe(output, key, validate(entry, schema.additionalProperties, path + "." + key))
    return output
  }
  return value
}
export function validateGenerated(value, path = "body") { return validate(value, definition, path) }
`
}

export function generateSerializerSource(): string {
  return `export function serializeGenerated(value) {\n  return JSON.stringify(value)\n}\n`
}

function isResponseData(value: unknown): value is { status: number; headers: Headers; body: unknown } {
  return typeof value === "object" && value !== null && (value as { [key: symbol]: unknown })[responseMarker] === true
}

export function inspect(compiled: CompiledApplication): string {
  return compiled.analyses.map((route) => `${route.method} ${route.path}\n  Execution: ${route.execution.toUpperCase()}\n  Reason: ${route.reason}`).join("\n")
}

export function generateServerSource(options: { entry: string; target: BuildTarget }): string {
  const entry = options.entry.startsWith(".") ? options.entry : `./${options.entry}`
  if (options.target === "bun") {
    return `import { app } from ${JSON.stringify(entry)}\nimport { createCompiledBunHandler } from "../packages/compiler/src/index.ts"\n\nconst port = Number(process.env.PORT ?? 3000)\nconst server = Bun.serve({ port, fetch: createCompiledBunHandler(app) })\nconsole.log(\`Nelysia compiled Bun server listening on http://localhost:\${server.port}\`)\n`
  }
  return `import { app } from ${JSON.stringify(entry)}\nimport { createNodeServer } from "../packages/runtime-node/src/server.ts"\n\nconst port = Number(process.env.PORT ?? 3000)\ncreateNodeServer(app).listen(port, () => console.log(\`Nelysia compiled Node server listening on http://localhost:\${port}\`))\n`
}

export function generateStandaloneServerSource(options: { entry: string; target: BuildTarget; compiled: CompiledApplication }): string | undefined {
  if (options.compiled.standaloneBlock !== undefined) return
  if (!options.compiled.graph.routes.every(isStandaloneRoute)) return
  const routes = options.compiled.graph.routes.map((route) => {
    const handler = route.staticValue !== undefined ? `() => ${literalSource(route.staticValue)}` : functionSource(route.handler)
    const functions = (values: readonly ((...args: never[]) => unknown)[] | undefined) => `[${(values ?? []).map(functionSource).join(",")}]`
    const schema = (value: Schema | undefined) => value === undefined || !canGenerateSchema(value) ? "undefined" : JSON.stringify(value.definition)
    const responseSchemas = Object.fromEntries(Object.entries(route.responseSchemas ?? {}).filter(([, value]) => canGenerateSchema(value)).map(([status, value]) => [status, JSON.stringify(value.definition)]))
    return `{ method: ${JSON.stringify(route.method)}, path: ${JSON.stringify(route.path)}, handler: ${handler}, requestHooks: ${functions(route.requestHooks)}, parseHooks: ${functions(route.parseHooks)}, hooks: ${functions(route.hooks)}, mapResponseHooks: ${functions(route.mapResponseHooks)}, afterHooks: ${functions(route.afterHooks)}, afterResponseHooks: ${functions(route.afterResponseHooks)}, errorHandlers: ${functions(route.errorHandlers)}, bodySchema: ${schema(route.bodySchema)}, paramsSchema: ${schema(route.paramsSchema)}, querySchema: ${schema(route.querySchema)}, headersSchema: ${schema(route.headersSchema)}, responseSchema: ${schema(route.responseSchema)}, responseSchemas: ${JSON.stringify(responseSchemas)} }`
  }).join(",\n")
  const handler = `const routes = [${routes}]
const mergeHeaders = (base, extra) => { const headers = new Headers(base); for (const [key, value] of new Headers(extra || {}).entries()) headers.set(key, value); return headers }
const match = (route, pathname) => { const pattern = route.path.split("/").filter(Boolean); const values = pathname.split("/").filter(Boolean); if (pattern.at(-1) === "*" ? values.length < pattern.length - 1 : pattern.length !== values.length) return; const params = {}; for (let index = 0; index < pattern.length; index++) { if (pattern[index] === "*") { try { params["*"] = values.slice(index).map((value) => decodeURIComponent(value)).join("/") } catch { return } break } if (pattern[index].startsWith(":")) { try { params[pattern[index].slice(1)] = decodeURIComponent(values[index]) } catch { return } } else if (pattern[index] !== values[index]) return } return params }
const isData = (value) => value && typeof value === "object" && value.__nelysiaResponse === true
const data = (status, body, headers) => ({ status, body, headers: new Headers(headers), __nelysiaResponse: true })
const toResponse = (value, context, status = context.set.status || 200) => { if (value instanceof Response) return value; if (isData(value)) { if (value.body instanceof Response) return value.body; const headers = mergeHeaders(context.responseHeaders, value.headers); if (value.body === undefined || value.body === null) return new Response(null, { status: value.status, headers }); if (value.body instanceof ReadableStream) return new Response(value.body, { status: value.status, headers }); if (typeof value.body === "string" || value.body instanceof Uint8Array) { if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8"); return new Response(value.body, { status: value.status, headers }) } if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8"); return new Response(JSON.stringify(value.body), { status: value.status, headers }) } if (value === undefined || value === null) return new Response(null, { status, headers: context.responseHeaders }); if (typeof value === "string" || value instanceof Uint8Array) return new Response(value, { status, headers: mergeHeaders(context.responseHeaders, { "content-type": "text/plain; charset=utf-8" }) }); return new Response(JSON.stringify(value), { status, headers: mergeHeaders(context.responseHeaders, { "content-type": "application/json; charset=utf-8" }) }) }
const validate = (value, schema, path) => { if (!schema || Object.keys(schema).length === 0) return value; if ("const" in schema && value !== schema.const) throw Object.assign(new Error(path + " must equal " + String(schema.const)), { status: 400 }); if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) throw Object.assign(new Error(path + " must be an allowed value"), { status: 400 }); if (Array.isArray(schema.anyOf)) { const errors = []; for (const branch of schema.anyOf) { try { return validate(value, branch, path) } catch (error) { errors.push(String(error && error.message || error)) } } throw Object.assign(new Error(path + " does not match any allowed value: " + errors.join("; ")), { status: 400 }) } if (Array.isArray(schema.allOf)) return schema.allOf.reduce((current, branch) => validate(current, branch, path), value); if (schema.type === "null") { if (value !== null) throw Object.assign(new Error(path + " must be null"), { status: 400 }); return value } if (schema.type === "string") { if (typeof value !== "string") throw Object.assign(new Error(path + " must be string"), { status: 400 }); if (schema.minLength !== undefined && value.length < schema.minLength) throw Object.assign(new Error(path + " is too short"), { status: 400 }); if (schema.maxLength !== undefined && value.length > schema.maxLength) throw Object.assign(new Error(path + " is too long"), { status: 400 }); if (schema.pattern !== undefined && !(new RegExp(schema.pattern)).test(value)) throw Object.assign(new Error(path + " has an invalid format"), { status: 400 }); if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) throw Object.assign(new Error(path + " must be a date-time"), { status: 400 }); return value } if (schema.type === "number" || schema.type === "integer") { if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) throw Object.assign(new Error(path + " must be " + schema.type), { status: 400 }); if (schema.minimum !== undefined && value < schema.minimum) throw Object.assign(new Error(path + " is below minimum"), { status: 400 }); if (schema.maximum !== undefined && value > schema.maximum) throw Object.assign(new Error(path + " is above maximum"), { status: 400 }); return value } if (schema.type === "boolean") { if (typeof value !== "boolean") throw Object.assign(new Error(path + " must be boolean"), { status: 400 }); return value } if (schema.type === "array") { if (!Array.isArray(value)) throw Object.assign(new Error(path + " must be array"), { status: 400 }); if (schema.minItems !== undefined && value.length < schema.minItems) throw Object.assign(new Error(path + " has too few items"), { status: 400 }); if (schema.maxItems !== undefined && value.length > schema.maxItems) throw Object.assign(new Error(path + " has too many items"), { status: 400 }); if (Array.isArray(schema.prefixItems)) { if (value.length !== schema.prefixItems.length) throw Object.assign(new Error(path + " has an invalid tuple length"), { status: 400 }); return value.map((entry, index) => validate(entry, schema.prefixItems[index], path + "." + index)) } return schema.items === undefined ? value : value.map((entry, index) => validate(entry, schema.items, path + "." + index)) } if (schema.type === "object") { if (value === null || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error(path + " must be object"), { status: 400 }); const output = {}; for (const key of schema.required || []) if (value[key] === undefined) throw Object.assign(new Error(path + "." + key + " is required"), { status: 400 }); for (const [key, child] of Object.entries(schema.properties || {})) if (value[key] !== undefined) Object.defineProperty(output, key, { value: validate(value[key], child, path + "." + key), enumerable: true, configurable: true, writable: true }); if (!schema.properties && schema.additionalProperties && typeof schema.additionalProperties === "object") for (const [key, entry] of Object.entries(value)) Object.defineProperty(output, key, { value: validate(entry, schema.additionalProperties, path + "." + key), enumerable: true, configurable: true, writable: true }); return output } return value }
const parseBody = async (request) => { if (request.method === "GET" || request.method === "HEAD") return undefined; const text = await request.text(); if (!text) return undefined; if (request.headers.get("content-type")?.includes("application/json")) { try { return JSON.parse(text) } catch { throw Object.assign(new Error("Malformed JSON body"), { status: 400 }) } } return text }
const makeContext = (request, params, body, url) => { const responseHeaders = new Headers({ "x-request-id": request.headers.get("x-request-id") || "" }); const context = { request: { method: request.method, url: request.url, headers: request.headers, body }, requestId: request.headers.get("x-request-id") || "", params, query: new URLSearchParams(url.search), body, headers: request.headers, cookies: {}, set: { status: undefined, headers: {} }, store: {}, responseHeaders, response: (status, value, headers) => data(status, value, mergeHeaders(responseHeaders, headers)), html: (value, status = 200) => data(status, value, mergeHeaders(responseHeaders, { "content-type": "text/html; charset=utf-8" })), text: (value, status = 200) => data(status, value, mergeHeaders(responseHeaders, { "content-type": "text/plain; charset=utf-8" })), json: (value, status = 200) => data(status, value, mergeHeaders(responseHeaders, { "content-type": "application/json; charset=utf-8" })), redirect: (value, status = 302) => data(status, undefined, mergeHeaders(responseHeaders, { location: value })), header: (name, value) => { context.set.headers[name.toLowerCase()] = value; return context }, setCookie: (name, value) => responseHeaders.append("set-cookie", name + "=" + encodeURIComponent(value) + "; Path=/"), deleteCookie: (name) => responseHeaders.append("set-cookie", name + "=; Max-Age=0; Path=/") }; return context }
const allowFor = (pathname) => [...new Set(routes.filter((route) => match(route, pathname) !== undefined).map((route) => route.method === "GET" ? ["GET", "HEAD"] : [route.method]).flat())].concat(["OPTIONS"]).join(", ")
export const handle = async (request) => { const url = new URL(request.url); const pathname = url.pathname; const method = request.method === "HEAD" ? "GET" : request.method; const matching = routes.filter((route) => match(route, pathname) !== undefined); if (request.method === "OPTIONS" && matching.length > 0) return new Response(null, { status: 204, headers: { allow: allowFor(pathname) } }); const route = routes.find((candidate) => candidate.method === method && match(candidate, pathname) !== undefined); if (!route) return matching.length > 0 ? new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { allow: allowFor(pathname), "content-type": "application/json; charset=utf-8" } }) : new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }); const context = makeContext(request, match(route, pathname), await parseBody(request), url); try { let parsedRequest = context.request; for (const hook of route.requestHooks) { const result = await hook(parsedRequest); if (result instanceof Response) return result } for (const hook of route.parseHooks) { const parsed = await hook(parsedRequest, request.headers.get("content-type")); if (parsed !== undefined) { parsedRequest = { ...parsedRequest, body: parsed }; context.body = parsed } } if (route.paramsSchema) context.params = validate(context.params, route.paramsSchema, "params"); if (route.querySchema) context.query = new URLSearchParams(Object.entries(validate(Object.fromEntries(context.query.entries()), route.querySchema, "query")).map(([key, value]) => [key, String(value)])); if (route.headersSchema) validate(Object.fromEntries(context.headers.entries()), route.headersSchema, "headers"); if (route.bodySchema) context.body = validate(context.body, route.bodySchema, "body"); for (const hook of route.hooks) { const result = await hook(context); if (result instanceof Response || isData(result)) return result } let result = await route.handler(context); if (route.responseSchema) result = validate(result, route.responseSchema, "response"); let response = isData(result) ? result : data(context.set.status || 200, result, mergeHeaders(context.responseHeaders, context.set.headers)); for (const hook of route.mapResponseHooks) { const mapped = await hook(context, response); if (mapped instanceof Response || isData(mapped)) response = mapped; else if (mapped !== undefined) response.body = mapped } for (const hook of route.afterHooks) await hook(context, response); const output = toResponse(response, context); for (const hook of route.afterResponseHooks) await hook(context, response); return request.method === "HEAD" ? new Response(null, { status: output.status, headers: output.headers }) : output } catch (error) { context.set.status = error && error.status || 500; for (const hook of route.errorHandlers) { const result = await hook(error, context); if (result instanceof Response) return result; if (isData(result)) return toResponse(result, context); if (result !== undefined) return toResponse(data(context.set.status, result, context.responseHeaders), context) } return new Response(JSON.stringify({ error: error && error.message || "Internal Server Error" }), { status: context.set.status, headers: mergeHeaders(context.responseHeaders, { "content-type": "application/json; charset=utf-8" }) }) } }
`
  if (options.target === "bun") return `${handler}\nconst port = Number(process.env.PORT ?? 3000)\nconst server = Bun.serve({ port, fetch: handle })\nconsole.log(\`Nelysia standalone Bun server listening on http://localhost:\${server.port}\`)\n`
  return `import http from "node:http"\n${handler}\nconst port = Number(process.env.PORT ?? 3000)\nhttp.createServer(async (request, response) => { const chunks = []; for await (const chunk of request) chunks.push(chunk); const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined; const result = await handle(new Request(\`http://localhost\${request.url}\`, { method: request.method, headers: request.headers as HeadersInit, body: body?.length ? new Uint8Array(body) : undefined })); response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(new Uint8Array(await result.arrayBuffer())) }).listen(port, () => console.log(\`Nelysia standalone Node server listening on http://localhost:\${port}\`))\n`
}

function isStandaloneRoute(route: RouteRecord): boolean {
  if (route.auth !== undefined) return false
  const schemas = [route.bodySchema, route.paramsSchema, route.querySchema, route.headersSchema, route.responseSchema, ...Object.values(route.responseSchemas ?? {})]
  if (schemas.some((schema) => schema !== undefined && !canGenerateSchema(schema))) return false
  if (route.staticValue !== undefined) return true
  const functions = [route.handler, ...(route.requestHooks ?? []), ...(route.parseHooks ?? []), ...route.hooks, ...(route.mapResponseHooks ?? []), ...route.afterHooks, ...(route.afterResponseHooks ?? []), ...route.errorHandlers]
  return functions.every(canEmbedFunction)
}

function functionSource(value: (...args: never[]) => unknown): string {
  const source = value.toString()
  if (source.startsWith("function") || source.startsWith("async function") || source.includes("=>")) return source
  return `function ${source}`
}

function canEmbedFunction(value: (...args: never[]) => unknown): boolean {
  try {
    const source = functionSource(value)
    new Function(`return (${source})`)()
    return !source.includes("[native code]") && hasOnlyEmbeddedIdentifiers(source)
  } catch {
    return false
  }
}

function hasOnlyEmbeddedIdentifiers(source: string): boolean {
  const sanitized = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, " ")
  const bindings = new Set<string>()
  const parameterEnd = sanitized.indexOf("=>")
  const parameterSource = parameterEnd === -1
    ? sanitized.slice(sanitized.indexOf("(") + 1, sanitized.indexOf(")"))
    : sanitized.slice(0, parameterEnd)
  for (const match of parameterSource.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) bindings.add(match[0])
  for (const match of sanitized.matchAll(/\b(?:const|let|var|function|class|catch)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) bindings.add(match[1])
  const allowed = new Set([
    "async", "await", "function", "return", "const", "let", "var", "if", "else", "for", "of", "in", "while", "do", "switch", "case", "break", "continue", "throw", "try", "catch", "finally", "new", "typeof", "void", "delete", "instanceof", "true", "false", "null", "undefined",
    "Math", "Date", "JSON", "Number", "String", "Boolean", "Object", "Array", "Promise", "RegExp", "Error", "URL", "URLSearchParams", "Headers", "Response", "Request", "TextEncoder", "TextDecoder", "Uint8Array", "ReadableStream", "Buffer", "crypto", "console"
  ])
  for (const match of sanitized.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    const identifier = match[0]
    const index = match.index ?? 0
    const before = sanitized.slice(0, index).trimEnd()
    const after = sanitized.slice(index + identifier.length).trimStart()
    if (before.endsWith(".") || (after.startsWith(":") && !after.startsWith("::"))) continue
    if (allowed.has(identifier) || bindings.has(identifier)) continue
    return false
  }
  return true
}

function literalSource(value: unknown): string {
  if (value instanceof Uint8Array) return `new Uint8Array([${[...value].join(",")}])`
  const serialized = JSON.stringify(value)
  if (serialized !== undefined) return serialized
  return "undefined"
}

function compileDispatcherForManifest(compiled: CompiledApplication): { fast: number; total: number } {
  const routes = compiled.graph.routes
  return { fast: routes.filter(isCompilableRoute).length, total: routes.length }
}

export function generateBuildArtifact(options: { entry: string; target: BuildTarget; compiled: CompiledApplication }): BuildArtifact {
  const standalone = options.compiled.standaloneBlock === undefined && options.compiled.graph.routes.every(isStandaloneRoute)
  const dispatcher = compileDispatcherForManifest(options.compiled)
  const manifest: BuildManifest = {
    version: 1,
    compiler: "nelysia",
    target: options.target,
    entry: options.entry,
    artifact: `server.${options.target}.ts`,
    sourceToSource: standalone,
    generation: standalone ? "standalone" : "adapter",
    dispatcher: !standalone,
    reproducible: true,
    cacheKey: "",
    sourceMap: `${`server.${options.target}.ts`}.map`,
    routes: options.compiled.analyses,
    diagnostics: [
      {
        code: "NELY001",
        severity: "info",
         message: standalone ? "This artifact is a standalone source-to-source server for the routes whose handlers and schemas can be embedded safely." : "This artifact retains the application entry and runtime adapter; routes that cannot be embedded safely use the generic fallback."
      },
      ...options.compiled.graph.routes
        .filter((route) => !isStandaloneRoute(route))
        .map((route): BuildDiagnostic => {
          const analysis = options.compiled.analyses.find((item) => item.method === route.method && item.path === route.path)
          const unsupported = unsupportedRouteDiagnostic(route, analysis?.reason)
          return {
            code: unsupported.code,
            severity: "warning",
            message: `Standalone generation unsupported: ${unsupported.reason}`,
            route: { method: route.method, path: route.path }
          }
        }),
      ...(options.compiled.standaloneBlock === undefined ? [] : [{
        code: options.compiled.standaloneBlock.code,
        severity: "warning" as const,
        message: `Standalone generation unsupported: ${options.compiled.standaloneBlock.reason}`
      }]),
      ...options.compiled.graph.routes
        .filter((route) => isCompilableRoute(route) && hasGeneratedSchema(route))
        .map((route): BuildDiagnostic => ({
          code: "NELY002",
          severity: "info",
          message: "Generated validator/serializer fast path enabled for deterministic built-in schemas.",
          route: { method: route.method, path: route.path }
        })),
      ...(!standalone ? [{
        code: "NELY003" as const,
        severity: "info" as const,
        message: `Compiled dispatcher fast path covers ${dispatcher.fast} of ${dispatcher.total} routes; ${dispatcher.total - dispatcher.fast} use the generic fallback.`,
      }] : [])
    ]
  }
  const source = generateStandaloneServerSource(options) ?? generateServerSource(options)
  const cacheKey = createHash("sha256").update(source).update(JSON.stringify(manifest)).digest("hex")
  const sourceMap = JSON.stringify({ version: 3, file: manifest.artifact, sourceRoot: "", sources: [options.entry], names: [], mappings: source.split("\n").map(() => "AAAA").join(";") })
  return { source, sourceMap, manifest: { ...manifest, reproducible: true, cacheKey } }
}

function hasGeneratedSchema(route: RouteRecord): boolean {
  return route.paramsSchema !== undefined || route.querySchema !== undefined || route.headersSchema !== undefined || route.responseSchema !== undefined
}

/** Explain why a route cannot be emitted into the standalone artifact. The
 * first matching rule is intentionally deterministic so diagnostics remain
 * stable across builds and can be consumed by CI tooling. */
export function unsupportedRouteDiagnostic(route: RouteRecord, analysisReason?: string): { code: BuildDiagnosticCode; reason: string } {
  if (!("GET POST PUT PATCH DELETE OPTIONS HEAD" as string).split(" ").includes(route.method)) return { code: "NELY101", reason: `Unsupported method ${route.method}` }
  if ((route.requestHooks?.length ?? 0) > 0 || (route.parseHooks?.length ?? 0) > 0) {
    return { code: "NELY102", reason: "Request lifecycle hooks require the generic runtime" }
  }
  if ((route.mapResponseHooks?.length ?? 0) > 0 || (route.afterResponseHooks?.length ?? 0) > 0 || route.afterHooks.length > 0) {
    return { code: "NELY103", reason: "Response lifecycle hooks require the generic runtime" }
  }
  if (route.bodySchema || route.paramsSchema || route.querySchema || route.headersSchema || route.responseSchema || route.responseSchemas) {
    return { code: "NELY104", reason: "Schema validation requires the generic runtime" }
  }
  if (route.errorHandlers.length > 0) return { code: "NELY108", reason: "Native error handling requires the generic runtime" }
  if (route.hooks.length > 0) return { code: "NELY106", reason: "Context extensions or route hooks require the generic runtime" }
  if (route.auth !== undefined) return { code: "NELY107", reason: "Mounted or authenticated route metadata requires the generic runtime" }
  if (route.handler.toString().includes("ReadableStream")) return { code: "NELY109", reason: "Streaming responses require the generic runtime" }
  return { code: "NELY105", reason: analysisReason ?? "Opaque handler cannot be safely embedded into standalone source" }
}

import { createParsedQuery, type Nelysia } from "../../core/src/app.ts"
import { requestIdFor, responseMarker, type Context, type RouteGraph, type RouteRecord } from "../../core/src/types.ts"
import type { Schema } from "../../core/src/schema.ts"
import { createBunHandler } from "../../runtime-bun/src/server.ts"
import { compileDispatcher, fastPathname, isCompilableRoute, isParamsOnlyHandler, jsonContentType, lookupCompiled, matchSingleDynamicUrl, textContentType, type CompiledRoute } from "./dispatcher.ts"
import { createHash } from "node:crypto"

export { createGeneratedMatcher, isParamsOnlyHandler } from "./dispatcher.ts"
export type { CompiledDispatcher, CompiledLookup, CompiledRoute, SerializedBody } from "./dispatcher.ts"

export interface RouteAnalysis {
  method: string
  path: string
  execution: "compiled" | "specialized" | "generic"
  reason: string
}

export type BuildTarget = "bun" | "node"

export interface BuildDiagnostic {
  code: "NELY001" | "NELY002" | "NELY003"
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
  sourceToSource: false
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
}

export function compile(app: Nelysia): CompiledApplication {
  const analyses = app.graph.routes.map((route) => ({
    method: route.method,
    path: route.path,
    execution: route.static && route.hooks.length === 0 && route.contextFree ? "compiled" as const : route.static && route.hooks.length === 0 ? "specialized" as const : "generic" as const,
    reason: route.static && route.hooks.length === 0 && route.contextFree ? "Explicit static response" : isStandaloneRoute(route) ? "Static route metadata; context retained" : route.method !== "GET" ? "Only GET static and params-only routes are standalone" : "Hooks, parameters, or opaque handler retained"
  }))
  return { graph: app.graph, analyses, handle: app.handle.bind(app) }
}

export function createCompiledBunHandler(app: Nelysia): (request: Request) => Response | Promise<Response> {
  const fallback = createBunHandler(app)
  const useFallback = app.telemetry !== undefined
  // Shared Headers instances: Bun normalizes plain-object headers on every
  // construction (~1.8M/s) but reuses Headers instances (~2.8M/s).
  const jsonHeaders = new Headers({ "content-type": "application/json; charset=utf-8", "server": "Nelysia" })
  const textHeaders = new Headers({ "content-type": "text/plain", "server": "Nelysia" })
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
        // Static without precomputed value: call context-free handler synchronously when possible.
        try {
          const result = (found.entry.route.handler as () => unknown)()
          if (result instanceof Promise) return result.then((v) => fastJson(v))
          return fastJson(result)
        } catch { return fallback(request) }
      }
      case "params":
        return runParamsOnly(found.entry, found.params, fallback)
      case "generic":
        return runGeneric(found.entry.route, found.params, request, fallback)
    }
  }

  function runParamsOnly(c: CompiledRoute, params: Record<string, string>, fb: (r: Request) => Promise<Response>): Response | Promise<Response> {
    try {
      const result = c.route.handler({ params } as Context)
      if (result instanceof Promise) return result.then((v) => fastJson(v), () => fbNoRequest(fb))
      return fastJson(result)
    } catch { return fbNoRequest(fb) }
  }

  function fbNoRequest(fb: (r: Request) => Promise<Response>): Promise<Response> {
    // Generic fallback needs the original request; this path is cold (handler threw).
    // Return 500 to avoid re-entry cost; route-level errors on fast paths are rare.
    void fb
    return Promise.resolve(new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500, headers: jsonHeaders }))
  }

  function runGeneric(route: RouteRecord, params: Record<string, string>, request: Request, fb: (r: Request) => Promise<Response>): Response | Promise<Response> {
    const headers = request.headers
    const context: Context = {
      request: { method: request.method, url: request.url, headers },
      requestId: requestIdFor(request),
      clientIp: undefined,
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
      const out = route.handler(context) as unknown
      if (out instanceof Promise) return out.then((v) => genericToResponse(v, context), () => fb(request))
      return genericToResponse(out, context)
    } catch { return fb(request) }
  }

  function genericToResponse(result: unknown, ctx: Context): Response {
    if (isResponseData(result)) return responseFromResult(result.status, result.headers, result.body)
    const status = ctx.set.status ?? 200
    const extraHeaders = Object.keys(ctx.set.headers).length > 0 ? ctx.set.headers : undefined
    return fastJson(result, status, extraHeaders)
  }

  function fastJson(value: unknown, status = 200, headers?: Record<string, string>): Response {
    if (value === undefined || value === null) return new Response(null, { status, headers })
    const combinedHeaders = headers ? { ...textHeaders, ...headers } : textHeaders
    if (typeof value === "string") return new Response(value, { status, headers: combinedHeaders })
    if (value instanceof Uint8Array) return new Response(value as unknown as BodyInit, { status, headers: combinedHeaders })
    // Response.json is faster than manual stringify + construction in Bun.
    return Response.json(value, { status, headers })
  }
}

function responseFromResult(status: number, headers: HeadersInit | undefined, body: unknown): Response {
  if (body === undefined || body === null) return new Response(null, { status, headers })
  if (typeof body === "string" || body instanceof Uint8Array) {
    const outputHeaders = headers && new Headers(headers).has("content-type") ? headers : { ...(headers ? Object.fromEntries(new Headers(headers).entries()) : {}), "content-type": "text/plain; charset=utf-8" }
    return new Response(body as unknown as BodyInit, { status, headers: outputHeaders })
  }
  return Response.json(body, { status, headers })
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
  return `const routes = ${definitions}\nexport function matchGeneratedRoute(method, pathname) {\n  for (const route of routes) {\n    if (route.method !== method) continue\n    const pattern = route.path.split("/").filter(Boolean)\n    const values = pathname.split("/").filter(Boolean)\n    if (pattern.length !== values.length) continue\n    const params = {}\n    let matched = true\n    for (let index = 0; index < pattern.length; index++) {\n      if (pattern[index].startsWith(":")) params[pattern[index].slice(1)] = decodeURIComponent(values[index])\n      else if (pattern[index] !== values[index]) matched = false\n    }\n    if (matched) return { route, params }\n  }\n}\n`
}

export function generateValidatorSource(schema: Schema): string {
  const definition = JSON.stringify(schema.definition ?? { type: schema.kind })
  return `const definition = ${definition}\nfunction validate(value, schema, path) {\n  if (schema.type === "string" && typeof value !== "string") throw new Error(path + " must be string")\n  if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(path + " must be number")\n  if (schema.type === "boolean" && typeof value !== "boolean") throw new Error(path + " must be boolean")\n  if (schema.type === "object") {\n    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(path + " must be object")\n    for (const key of schema.required || []) validate(value[key], schema.properties[key], path + "." + key)\n  }\n  return value\n}\nexport function validateGenerated(value, path = "body") { return validate(value, definition, path) }\n`
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
  if (!options.compiled.graph.routes.every(isStandaloneRoute)) return
  const routes = options.compiled.graph.routes.map((route) => {
    const handler = route.staticValue !== undefined ? `() => ${JSON.stringify(route.staticValue)}` : route.handler.toString()
    return `{ path: ${JSON.stringify(route.path)}, params: ${JSON.stringify(route.params)}, handler: ${handler} }`
  }).join(",\n")
  const handler = `const routes = [${routes}]\nconst match = (route, pathname) => { const pattern = route.path.split("/").filter(Boolean); const values = pathname.split("/").filter(Boolean); if (pattern.length !== values.length) return; const params = {}; for (let index = 0; index < pattern.length; index++) { if (pattern[index].startsWith(":")) { try { params[pattern[index].slice(1)] = decodeURIComponent(values[index]) } catch { return } } else if (pattern[index] !== values[index]) return } return params }\nconst toResponse = (value, status = 200) => { if (value === undefined || value === null) return new Response(null, { status }); if (typeof value === "string" || value instanceof Uint8Array) return new Response(value, { status, headers: { "content-type": "text/plain; charset=utf-8" } }); return Response.json(value, { status }) }\nexport const handle = async (request) => {\n  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } })\n  const pathname = new URL(request.url).pathname\n  for (const route of routes) { const params = match(route, pathname); if (params) { const response = toResponse(await route.handler({ params })); if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers }); return response } }\n  return Response.json({ error: "Not Found" }, { status: 404 })\n}`
  if (options.target === "bun") return `${handler}\nconst port = Number(process.env.PORT ?? 3000)\nconst server = Bun.serve({ port, fetch: handle })\nconsole.log(\`Nelysia standalone Bun server listening on http://localhost:\${server.port}\`)\n`
  return `import http from "node:http"\n${handler}\nconst port = Number(process.env.PORT ?? 3000)\nhttp.createServer(async (request, response) => { const result = await handle(new Request(\`http://localhost\${request.url}\`, { method: request.method, headers: request.headers as HeadersInit })); response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(new Uint8Array(await result.arrayBuffer())) }).listen(port, () => console.log(\`Nelysia standalone Node server listening on http://localhost:\${port}\`))\n`
}

function isStandaloneRoute(route: RouteRecord): boolean {
  if (route.method !== "GET" || route.hooks.length > 0 || route.afterHooks.length > 0 || route.errorHandlers.length > 0 || route.bodySchema || route.paramsSchema || route.querySchema || route.headersSchema || route.responseSchema) return false
  if (route.staticValue !== undefined) return true
  return isParamsOnlyHandler(route.handler)
}

function compileDispatcherForManifest(compiled: CompiledApplication): { fast: number; total: number } {
  const routes = compiled.graph.routes
  return { fast: routes.filter(isCompilableRoute).length, total: routes.length }
}

export function generateBuildArtifact(options: { entry: string; target: BuildTarget; compiled: CompiledApplication }): BuildArtifact {
  const standalone = options.compiled.graph.routes.every(isStandaloneRoute)
  const dispatcher = compileDispatcherForManifest(options.compiled)
  const manifest: BuildManifest = {
    version: 1,
    compiler: "nelysia",
    target: options.target,
    entry: options.entry,
    artifact: `server.${options.target}.ts`,
    sourceToSource: false,
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
         message: standalone ? "This artifact is a standalone server for the supported static and params-only GET subset; arbitrary source-to-source generation is not enabled." : "This artifact retains the application entry and runtime adapter, which serves hook-free GET routes through the compiled dispatcher without the generic router; standalone generation is limited to static and params-only GET routes."
      },
      ...options.compiled.graph.routes
        .filter((route) => !isStandaloneRoute(route))
        .map((route): BuildDiagnostic => ({
          code: "NELY002",
          severity: "warning",
          message: `Standalone generation unsupported: ${options.compiled.analyses.find((analysis) => analysis.method === route.method && analysis.path === route.path)?.reason ?? "Route requires generic runtime behavior"}`,
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

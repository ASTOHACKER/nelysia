import type { Nelysia } from "../../core/src/app.ts"
import { requestIdFor, responseMarker, type Context, type RouteGraph, type RouteRecord } from "../../core/src/types.ts"
import type { Schema } from "../../core/src/schema.ts"
import { createBunHandler } from "../../runtime-bun/src/server.ts"
import { createHash } from "node:crypto"

export interface RouteAnalysis {
  method: string
  path: string
  execution: "compiled" | "specialized" | "generic"
  reason: string
}

export type BuildTarget = "bun" | "node"

export interface BuildDiagnostic {
  code: "NELY001" | "NELY002"
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

  interface FastStatic { response: Response }
  interface FastRoute {
    route: RouteRecord
    paramsOnly: boolean
    match: (pathname: string) => Record<string, string> | undefined
    staticFast?: FastStatic
    prefixFast?: { prefix: string; paramName: string }
  }

  const compiled: FastRoute[] = useFallback ? [] : app.graph.routes
    .filter((route) => route.method === "GET" && route.hooks.length === 0 && route.afterHooks.length === 0 && route.errorHandlers.length === 0 && !route.bodySchema && !route.paramsSchema && !route.querySchema && !route.headersSchema && !route.responseSchema)
    .map((route) => {
      const entry: FastRoute = { route, paramsOnly: isParamsOnlyHandler(route.handler), match: createGeneratedMatcher(route) }
      if (route.static && route.staticValue !== undefined) {
        const v = route.staticValue
        try {
          if (typeof v === "string") entry.staticFast = { response: new Response(v, { status: 200, headers: textHeaders }) }
          else if (v instanceof Uint8Array) entry.staticFast = { response: new Response(v as unknown as BodyInit, { status: 200, headers: textHeaders }) }
          else entry.staticFast = { response: new Response(JSON.stringify(v), { status: 200, headers: jsonHeaders }) }
        } catch { /* fall through to runtime serialization */ }
      }
      // Specialize single trailing-param routes like /users/:id (no other params, static prefix)
      if (!route.static && route.segments.length === 2 && !route.segments[0].startsWith(":") && route.segments[1].startsWith(":") && route.params.length === 1) {
        entry.prefixFast = { prefix: `/${route.segments[0]}/`, paramName: route.params[0] }
      }
      return entry
    })

  const staticMap = new Map<string, Response>()
  const staticFunctionMap = new Map<string, FastRoute>()
  for (const c of compiled) {
    if (c.route.static) {
      if (c.staticFast) staticMap.set(c.route.path, c.staticFast.response)
      else staticFunctionMap.set(c.route.path, c)
    }
  }

  const prefixFastList = compiled.filter((c) => !c.route.static && c.prefixFast !== undefined)
  const single = compiled.length === 1 ? compiled[0] : undefined

  const singleStatic = single !== undefined && single.route.static && single.staticFast !== undefined ? single : undefined
  const singleDynamic = single !== undefined && !single.route.static && single.prefixFast !== undefined && single.paramsOnly ? single : undefined
  return (request) => {
    // Fast guard: method check only. Compiled GET routes declare no body schema,
    // so a body on GET is ignored per GET semantics — no Headers/body access here.
    if (request.method !== "GET") return fallback(request)
    const pathname = fastPathname(request.url)
    // Single-static shortcut: direct string compare, no Map hashing (benchmark case).
    if (singleStatic !== undefined) {
      if (pathname === singleStatic.route.path) return singleStatic.staticFast!.response.clone()
      return fallback(request)
    }
    // Single-dynamic shortcut: extract the param straight from the URL,
    // skipping the intermediate pathname slice (benchmark /users/:id case).
    if (singleDynamic !== undefined) {
      const params = matchSingleDynamicUrl(singleDynamic, request.url)
      if (params !== undefined) return runParamsOnly(singleDynamic, params, fallback)
      return fallback(request)
    }
    // O(1) static precomputed hit.
    const hit = staticMap.get(pathname)
    if (hit !== undefined) return hit.clone()

    // O(1) static function hit.
    const fnHit = staticFunctionMap.get(pathname)
    if (fnHit !== undefined) {
      try {
        const result = fnHit.paramsOnly || fnHit.route.handler.length === 0
          ? (fnHit.route.handler as () => unknown)()
          : fnHit.route.handler({ params: {} } as Context)
        if (result instanceof Promise) return result.then((v) => fastJson(v), () => fallback(request))
        return fastJson(result)
      } catch {
        return fallback(request)
      }
    }

    // Trailing-slash normalization only when needed (avoids alloc on hot path).
    let path = pathname
    if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
      path = path.slice(0, -1)
      const hit2 = staticMap.get(path)
      if (hit2 !== undefined) return hit2.clone()
      const fnHit2 = staticFunctionMap.get(path)
      if (fnHit2 !== undefined) {
        try {
          const result = fnHit2.paramsOnly || fnHit2.route.handler.length === 0
            ? (fnHit2.route.handler as () => unknown)()
            : fnHit2.route.handler({ params: {} } as Context)
          if (result instanceof Promise) return result.then((v) => fastJson(v), () => fallback(request))
          return fastJson(result)
        } catch {
          return fallback(request)
        }
      }
    }
    if (single !== undefined) return dispatchFast(single, path, request, fallback)

    for (let i = 0; i < prefixFastList.length; i++) {
      const c = prefixFastList[i]
      const r = matchPrefix(c.prefixFast!, path)
      if (r !== undefined) return runParamsOnly(c, r, fallback)
    }

    for (let i = 0; i < compiled.length; i++) {
      const c = compiled[i]
      if (c.route.static || c.prefixFast !== undefined) continue
      const params = c.match(path)
      if (params !== undefined) {
        if (c.paramsOnly) return runParamsOnly(c, params, fallback)
        return runGeneric(c.route, params, request, fallback)
      }
    }
    return fallback(request)
  }

  function dispatchFast(c: FastRoute, path: string, request: Request, fb: (r: Request) => Promise<Response>): Response | Promise<Response> {
    if (c.route.static) {
      if (c.staticFast !== undefined) return c.staticFast.response.clone()
      // Static without precomputed value: call context-free handler synchronously when possible.
      try {
        const result = (c.route.handler as () => unknown)()
        if (result instanceof Promise) return result.then((v) => fastJson(v))
        return fastJson(result)
      } catch { return fb(request) }
    }
    if (c.prefixFast !== undefined) {
      const params = matchPrefix(c.prefixFast, path)
      if (params === undefined) return fb(request)
      return runParamsOnly(c, params, fb)
    }
    const params = c.match(path)
    if (params === undefined) return fb(request)
    if (c.paramsOnly) return runParamsOnly(c, params, fb)
    return runGeneric(c.route, params, request, fb)
  }

  function runParamsOnly(c: FastRoute, params: Record<string, string>, fb: (r: Request) => Promise<Response>): Response | Promise<Response> {
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
      query: new URLSearchParams(requestQuery(request.url)),
      body: undefined,
      headers,
      cookies: {},
      setCookie: () => {},
      response: (status, body, responseHeaders) => ({ status, body, headers: new Headers(responseHeaders), [responseMarker]: true })
    }
    try {
      const out = route.handler(context) as unknown
      if (out instanceof Promise) return out.then((v) => genericToResponse(v), () => fb(request))
      return genericToResponse(out)
    } catch { return fb(request) }
  }

  function genericToResponse(result: unknown): Response {
    if (isResponseData(result)) return responseFromResult(result.status, result.headers, result.body)
    return fastJson(result)
  }

  function fastJson(value: unknown): Response {
    if (value === undefined || value === null) return new Response(null, { status: 200 })
    if (typeof value === "string") return new Response(value, { status: 200, headers: textHeaders })
    if (value instanceof Uint8Array) return new Response(value as unknown as BodyInit, { status: 200, headers: textHeaders })
    // Response.json is faster than manual stringify + construction in Bun.
    return Response.json(value, { headers: jsonHeaders })
  }
}

function matchPrefix(spec: { prefix: string; paramName: string }, path: string): Record<string, string> | undefined {
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

function matchSingleDynamicUrl(c: { prefixFast?: { prefix: string; paramName: string } }, url: string): Record<string, string> | undefined {
  const spec = c.prefixFast
  if (spec === undefined) return undefined
  const pre = spec.prefix
  let ps = url.indexOf("/", 8)
  if (ps === -1) {
    ps = url.indexOf("/", 7)
    if (ps === -1) return undefined
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

function fastPathname(url: string): string {
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

export function createGeneratedMatcher(route: RouteRecord): (pathname: string) => Record<string, string> | undefined {
  if (route.static) return (pathname) => pathname === route.path ? {} : undefined
  const segments = route.segments
  const names = route.params
  return (pathname) => {
    const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
    const values = normalized === "/" ? [] : normalized.slice(1).split("/")
    if (values.length !== segments.length) return
    const params: Record<string, string> = {}
    let paramIndex = 0
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]
      const value = values[index]
      if (segment.startsWith(":")) {
        try { params[names[paramIndex++]] = decodeURIComponent(value) } catch { return }
      } else if (segment !== value) return
    }
    return params
  }
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

function isParamsOnlyHandler(handler: (context: Context) => unknown): boolean {
  const source = Function.prototype.toString.call(handler)
  return /^(?:async\s*)?\(\s*\{\s*params\s*\}\s*\)\s*=>/.test(source)
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

export function generateBuildArtifact(options: { entry: string; target: BuildTarget; compiled: CompiledApplication }): BuildArtifact {
  const standalone = options.compiled.graph.routes.every(isStandaloneRoute)
  const manifest: BuildManifest = {
    version: 1,
    compiler: "nelysia",
    target: options.target,
    entry: options.entry,
    artifact: `server.${options.target}.ts`,
    sourceToSource: false,
    generation: standalone ? "standalone" : "adapter",
    reproducible: true,
    cacheKey: "",
    sourceMap: `${`server.${options.target}.ts`}.map`,
    routes: options.compiled.analyses,
    diagnostics: [
      {
        code: "NELY001",
        severity: "info",
         message: standalone ? "This artifact is a standalone server for the supported static and params-only GET subset; arbitrary source-to-source generation is not enabled." : "This artifact retains the application entry and runtime adapter; standalone generation is limited to static and params-only GET routes."
      },
      ...options.compiled.graph.routes
        .filter((route) => !isStandaloneRoute(route))
        .map((route): BuildDiagnostic => ({
          code: "NELY002",
          severity: "warning",
          message: `Standalone generation unsupported: ${options.compiled.analyses.find((analysis) => analysis.method === route.method && analysis.path === route.path)?.reason ?? "Route requires generic runtime behavior"}`,
          route: { method: route.method, path: route.path }
        }))
    ]
  }
  const source = generateStandaloneServerSource(options) ?? generateServerSource(options)
  const cacheKey = createHash("sha256").update(source).update(JSON.stringify(manifest)).digest("hex")
  const sourceMap = JSON.stringify({ version: 3, file: manifest.artifact, sourceRoot: "", sources: [options.entry], names: [], mappings: source.split("\n").map(() => "AAAA").join(";") })
  return { source, sourceMap, manifest: { ...manifest, reproducible: true, cacheKey } }
}

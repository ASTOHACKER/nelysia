import type { Nelysia } from "../../core/src/app.ts"
import type { Context, RouteRecord } from "../../core/src/types.ts"

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
  match: (pathname: string) => Record<string, string> | undefined
  prefixFast?: { prefix: string; paramName: string }
  /** Present when the static value was serializable at compile time. */
  serialized?: SerializedBody
}

export interface CompiledDispatcher {
  routes: CompiledRoute[]
  staticMap: Map<string, CompiledRoute>
  single?: CompiledRoute
  singleStatic?: CompiledRoute
  singleDynamic?: CompiledRoute
  needsRequestId: boolean
}

export type CompiledLookup =
  | { kind: "static-prebuilt"; entry: CompiledRoute }
  | { kind: "static-sync"; entry: CompiledRoute }
  | { kind: "params"; entry: CompiledRoute; params: Record<string, string> }
  | { kind: "generic"; entry: CompiledRoute; params: Record<string, string> }

/** Routes eligible for the compiled fast path: GET-only, no hooks, no schemas. */
export function isCompilableRoute(route: RouteRecord): boolean {
  return route.method === "GET"
    && route.hooks.length === 0
    && route.afterHooks.length === 0
    && route.errorHandlers.length === 0
    && !route.bodySchema
    && !route.paramsSchema
    && !route.querySchema
    && !route.headersSchema
    && !route.responseSchema
}

export function serializeStaticValue(value: unknown): SerializedBody | undefined {
  try {
    if (typeof value === "string") return { text: value, contentType: textContentType }
    if (value instanceof Uint8Array) return { bytes: value, contentType: textContentType }
    return { text: JSON.stringify(value), contentType: jsonContentType }
  } catch {
    return undefined
  }
}

export function compileDispatcher(app: Nelysia): CompiledDispatcher {
  const routes: CompiledRoute[] = app.graph.routes
    .filter(isCompilableRoute)
    .map((route) => {
      const entry: CompiledRoute = { route, paramsOnly: isParamsOnlyHandler(route.handler), match: createGeneratedMatcher(route) }
      if (route.static && route.staticValue !== undefined) {
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
  for (const entry of routes) if (entry.route.static && entry.serialized !== undefined) staticMap.set(entry.route.path, entry)

  const single = routes.length === 1 ? routes[0] : undefined
  const singleStatic = single !== undefined && single.route.static ? single : undefined
  const singleDynamic = single !== undefined && !single.route.static && single.prefixFast !== undefined && single.paramsOnly ? single : undefined
  return { routes, staticMap, single, singleStatic, singleDynamic, needsRequestId: app.requestIdEnabled }
}

function classify(entry: CompiledRoute, params: Record<string, string>): CompiledLookup {
  if (entry.route.static) {
    return entry.serialized !== undefined
      ? { kind: "static-prebuilt", entry }
      : { kind: "static-sync", entry }
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
  const { staticMap, single, singleStatic } = dispatcher
  const hit = staticMap.get(pathname)
  if (hit !== undefined) return { kind: "static-prebuilt", entry: hit }
  // Trailing-slash normalization only when needed (avoids alloc on hot path).
  let path = pathname
  if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
    path = path.slice(0, -1)
    const hit2 = staticMap.get(path)
    if (hit2 !== undefined) return { kind: "static-prebuilt", entry: hit2 }
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

export function isParamsOnlyHandler(handler: (context: Context) => unknown): boolean {
  const source = Function.prototype.toString.call(handler)
  return /^(?:async\s*)?\(\s*\{\s*params\s*\}\s*\)\s*=>/.test(source)
}

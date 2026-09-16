import type { HttpMethod, RouteRecord } from "./types.ts"

export function compilePath(path: string): Pick<RouteRecord, "segments" | "params" | "static" | "wildcard"> {
  if (!path.startsWith("/")) throw new Error(`Route path must start with '/': ${path}`)
  const segments = path === "/" ? [] : path.slice(1).split("/")
  const wildcard = segments.at(-1) === "*"
  const params = segments.filter((segment) => segment.startsWith(":") || segment === "*")
    .map((segment) => segment === "*" ? "*" : segment.slice(1))
  if (params.some((name) => name !== "*" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    throw new Error(`Invalid route parameter in ${path}`)
  }
  return { segments, params, static: params.length === 0 && !wildcard, wildcard }
}

export function matchRoute(route: RouteRecord, pathname: string): Record<string, string> | undefined {
  const normalized = normalizePathname(pathname)
  const actual = splitSegments(normalized)
  return matchSegments(route, actual)
}

export function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.charCodeAt(pathname.length - 1) === 47 ? pathname.slice(0, -1) : pathname
}

export function splitSegments(normalizedPathname: string): string[] {
  return normalizedPathname === "/" ? [] : normalizedPathname.slice(1).split("/")
}

function decodeIfNeeded(value: string): string {
  if (value.indexOf("%") === -1) return value
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error("invalid-encoding")
  }
}

export function matchSegments(route: RouteRecord, actual: string[]): Record<string, string> | undefined {
  if (route.wildcard ? actual.length < route.segments.length - 1 : actual.length !== route.segments.length) return
  const params: Record<string, string> = {}
  for (let index = 0; index < route.segments.length; index++) {
    const expected = route.segments[index]
    if (expected === "*") {
      const rest: string[] = []
      for (let i = index; i < actual.length; i++) {
        try {
          rest.push(decodeIfNeeded(actual[i]))
        } catch {
          return
        }
      }
      params["*"] = rest.join("/")
      break
    }
    const value = actual[index]
    if (expected.charCodeAt(0) === 58) {
      try {
        params[expected.slice(1)] = decodeIfNeeded(value)
      } catch {
        return
      }
    } else if (expected !== value) return
  }
  return params
}

export interface RouterMatch {
  route: RouteRecord
  params: Record<string, string>
}

interface SingleParamSpec {
  prefix: string
  paramName: string
}

const singleParamSpecs = new WeakMap<RouteRecord, SingleParamSpec | null>()

/** Single-pass dynamic lookup within one HTTP method. Caller splits the pathname once. */
export function lookupDynamicRoute(candidates: readonly RouteRecord[], actual: string[]): RouterMatch | undefined {
  for (let i = 0; i < candidates.length; i++) {
    const route = candidates[i]
    const params = matchSegments(route, actual)
    if (params !== undefined) return { route, params }
  }
  return undefined
}

/**
 * Dynamic lookup that keeps registration order but avoids allocating a
 * segment array for the common `/static-prefix/:id` shape. More complex route
 * patterns continue through the reference segment matcher unchanged.
 */
export function lookupDynamicPath(candidates: readonly RouteRecord[], pathname: string): RouterMatch | undefined {
  const normalized = normalizePathname(pathname)
  let actual: string[] | undefined
  for (let i = 0; i < candidates.length; i++) {
    const route = candidates[i]
    const spec = singleParamSpec(route)
    const fast = spec === undefined ? undefined : matchSingleParamPath(spec, normalized)
    if (fast !== undefined) return { route, params: fast }
    if (spec === undefined) {
      actual ??= splitSegments(normalized)
      const params = matchSegments(route, actual)
      if (params !== undefined) return { route, params }
    }
  }
  return undefined
}

/** URL-aware counterpart for adapters that already have the original request
 * URL. Simple dynamic routes can be matched without first slicing the host,
 * pathname, query, and segment array into separate allocations. */
export function lookupDynamicUrl(candidates: readonly RouteRecord[], url: string): RouterMatch | undefined {
  let start = url.startsWith("/") ? 0 : url.indexOf("/", 8)
  if (start === -1 && !url.startsWith("/")) start = url.indexOf("/", 7)
  if (start === -1) return undefined
  const query = url.indexOf("?", start)
  const end = query === -1 ? url.length : query
  let pathname: string | undefined
  let actual: string[] | undefined
  for (let i = 0; i < candidates.length; i++) {
    const route = candidates[i]
    const spec = singleParamSpec(route)
    const fast = spec === undefined ? undefined : matchSingleParamUrl(spec, url, start, end)
    if (fast !== undefined) return { route, params: fast }
    if (spec === undefined) {
      pathname ??= normalizePathname(url.slice(start, end) || "/")
      actual ??= splitSegments(pathname)
      const params = matchSegments(route, actual)
      if (params !== undefined) return { route, params }
    }
  }
  return undefined
}

/** Fast result-only matcher used when a method has exactly one simple dynamic
 * route. It avoids allocating the RouterMatch wrapper. */
export function matchSingleDynamicUrl(route: RouteRecord, url: string): Record<string, string> | undefined {
  const spec = singleParamSpec(route)
  if (spec === undefined) return undefined
  let start = url.startsWith("/") ? 0 : url.indexOf("/", 8)
  if (start === -1 && !url.startsWith("/")) start = url.indexOf("/", 7)
  if (start === -1) return undefined
  const query = url.indexOf("?", start)
  const end = query === -1 ? url.length : query
  return matchSingleParamUrl(spec, url, start, end)
}

/** Result-only counterpart for callers that already extracted the pathname. */
export function matchSingleDynamicPath(route: RouteRecord, pathname: string): Record<string, string> | undefined {
  const spec = singleParamSpec(route)
  return spec === undefined ? undefined : matchSingleParamPath(spec, pathname)
}

export function isSingleParamRoute(route: RouteRecord): boolean {
  return singleParamSpec(route) !== undefined
}

function singleParamSpec(route: RouteRecord): SingleParamSpec | undefined {
  const cached = singleParamSpecs.get(route)
  if (cached !== undefined) return cached ?? undefined
  const spec = !route.wildcard
    && route.segments.length === 2
    && route.params.length === 1
    && route.segments[0] !== undefined
    && route.segments[0].charCodeAt(0) !== 58
    && route.segments[1]?.charCodeAt(0) === 58
    ? { prefix: `/${route.segments[0]}/`, paramName: route.params[0] }
    : null
  singleParamSpecs.set(route, spec)
  return spec ?? undefined
}

function matchSingleParamPath(spec: SingleParamSpec, pathname: string): Record<string, string> | undefined {
  if (!pathname.startsWith(spec.prefix)) return undefined
  let value = pathname.slice(spec.prefix.length)
  if (value.length > 1 && value.charCodeAt(value.length - 1) === 47) value = value.slice(0, -1)
  if (value.length === 0 || value.indexOf("/") !== -1) return undefined
  try {
    const params: Record<string, string> = {}
    params[spec.paramName] = decodeIfNeeded(value)
    return params
  }
  catch { return undefined }
}

function matchSingleParamUrl(spec: SingleParamSpec, url: string, start: number, end: number): Record<string, string> | undefined {
  if (!url.startsWith(spec.prefix, start)) return undefined
  let valueEnd = end
  if (valueEnd > start + spec.prefix.length + 1 && url.charCodeAt(valueEnd - 1) === 47) valueEnd--
  const valueStart = start + spec.prefix.length
  if (valueStart >= valueEnd) return undefined
  const nestedSlash = url.indexOf("/", valueStart)
  if (nestedSlash !== -1 && nestedSlash < valueEnd) return undefined
  try {
    const params: Record<string, string> = {}
    params[spec.paramName] = decodeIfNeeded(url.slice(valueStart, valueEnd))
    return params
  }
  catch { return undefined }
}

/** Cold-path helper: does any route (any method) match this pathname? Used only for 404/405/OPTIONS. */
export function matchAnyMethod(routes: readonly RouteRecord[], actual: string[]): boolean {
  for (let i = 0; i < routes.length; i++) {
    if (matchSegments(routes[i], actual) !== undefined) return true
  }
  return false
}

/** Cold-path helper: build the `Allow` header value without re-splitting per route. */
export function allowedMethodsFor(routes: readonly RouteRecord[], actual: string[]): string {
  const methods = new Set<string>()
  for (let i = 0; i < routes.length; i++) {
    if (matchSegments(routes[i], actual) !== undefined) methods.add(routes[i].method)
  }
  if (methods.has("GET")) methods.add("HEAD")
  methods.add("OPTIONS")
  return [...methods].join(", ")
}

export function normalizeMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase()
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(normalized)) {
    throw new Error(`Unsupported HTTP method: ${method}`)
  }
  return normalized as HttpMethod
}

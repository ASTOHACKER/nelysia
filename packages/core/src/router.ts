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

/** Single-pass dynamic lookup within one HTTP method. Caller splits the pathname once. */
export function lookupDynamicRoute(candidates: readonly RouteRecord[], actual: string[]): RouterMatch | undefined {
  for (let i = 0; i < candidates.length; i++) {
    const route = candidates[i]
    const params = matchSegments(route, actual)
    if (params !== undefined) return { route, params }
  }
  return undefined
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

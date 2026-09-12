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
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  const actual = normalized === "/" ? [] : normalized.slice(1).split("/")
  if (route.wildcard ? actual.length < route.segments.length - 1 : actual.length !== route.segments.length) return
  const params: Record<string, string> = {}
  for (let index = 0; index < route.segments.length; index++) {
    const expected = route.segments[index]
    const value = actual[index]
    if (expected === "*") { params["*"] = actual.slice(index).map(decodeURIComponent).join("/"); break }
    if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(value)
    else if (expected !== value) return
  }
  return params
}

export function normalizeMethod(method: string): HttpMethod {
  const normalized = method.toUpperCase()
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(normalized)) {
    throw new Error(`Unsupported HTTP method: ${method}`)
  }
  return normalized as HttpMethod
}

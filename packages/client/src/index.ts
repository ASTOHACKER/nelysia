export interface ClientResponse<T> {
  data?: T
  error?: { status: number; body: unknown }
  response: Response
}

export type ClientQueryArrayPolicy = "repeat" | "comma" | "json"

export interface ClientOptions {
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit
  queryArray?: ClientQueryArrayPolicy
}

export type ClientRouteMap = Record<string, {
  response?: unknown
  body?: unknown
  params?: unknown
  query?: unknown
  headers?: unknown
  errors?: unknown
}>

type StringKey<T> = Extract<keyof T, string>
type RoutePattern<Routes, Method extends string> = {
  [Key in StringKey<Routes>]: Key extends `${Method} ${infer Path}` ? Path : never
}[StringKey<Routes>]
type ExpandPath<Path extends string> = Path extends `${infer Prefix}:${string}/${infer Rest}`
  ? `${Prefix}${string}/${ExpandPath<Rest>}`
  : Path extends `${infer Prefix}:${string}`
    ? `${Prefix}${string}`
    : Path extends `${infer Prefix}/*`
      ? `${Prefix}/${string}`
      : Path
type RoutePaths<Routes, Method extends string> = {
  [Key in StringKey<Routes>]: Key extends `${Method} ${infer Pattern}` ? Pattern | ExpandPath<Pattern> : never
}[StringKey<Routes>]
type RouteKeyForPath<Routes, Method extends string, Path extends string> = {
  [Key in StringKey<Routes>]: Key extends `${Method} ${infer Pattern}`
    ? Path extends ExpandPath<Pattern> ? Key : never
    : never
}[StringKey<Routes>]
type RouteEntry<Routes, Method extends string, Path extends string> = Routes[RouteKeyForPath<Routes, Method, Path> & keyof Routes]
type RouteField<Routes, Method extends string, Path extends string, Field extends string, Fallback = never> =
  RouteEntry<Routes, Method, Path> extends infer Entry
    ? Entry extends Record<Field, infer Value> ? Value : Fallback
    : Fallback
type RouteResponse<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "response", unknown>
type RouteBody<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "body">
type RouteQuery<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "query">
type RouteParams<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "params">
type RouteHeaders<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "headers">
type HeaderInput<Value> = Value extends Record<string, unknown> ? Value & Record<string, string | number | boolean | undefined> : HeadersInit
type PathNeedsParams<Path extends string> = Path extends `${string}:${string}` | `${string}/*` ? true : false
type RequestOptions<Routes, Method extends string, Path extends string> = (PathNeedsParams<Path> extends true
  ? { params: RouteParams<Routes, Method, Path> }
  : { params?: RouteParams<Routes, Method, Path> }) & {
  query?: RouteQuery<Routes, Method, Path>
  headers?: HeaderInput<RouteHeaders<Routes, Method, Path>>
  signal?: AbortSignal
}

function toHeaders(input?: HeadersInit): Headers {
  return new Headers(input)
}

function withQuery(path: string, query: unknown, policy: ClientQueryArrayPolicy): string {
  if (query === undefined || query === null) return path
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      if (policy === "comma") search.set(key, value.map(String).join(","))
      else if (policy === "json") search.set(key, JSON.stringify(value))
      else for (const item of value) search.append(key, String(item))
    } else search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `${path}${path.includes("?") ? "&" : "?"}${encoded}` : path
}

function withParams(path: string, params?: unknown): string {
  if (params === undefined || params === null) return path
  const values = params as Record<string, unknown>
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => encodeURIComponent(String(values[name] ?? `:${name}`)))
    .replace(/\*$/, () => encodeURIComponent(String(values["*"] ?? "*")))
}

function resolveUrl(path: string, baseUrl: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) return path
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(baseUrl)) return new URL(path, baseUrl).toString()
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const relative = path.startsWith("/") ? path : `/${path}`
  const joined = `${base}${relative}` || "/"
  if (typeof globalThis.location !== "undefined") return new URL(joined, globalThis.location.href).toString()
  return joined
}

export function createClient(baseUrl: string, options: ClientOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch
  const request = async <T>(method: string, path: string, body?: unknown, requestOptions: { headers?: HeadersInit; signal?: AbortSignal } = {}): Promise<ClientResponse<T>> => {
    const headers = toHeaders(options.headers)
    for (const [key, value] of toHeaders(requestOptions.headers)) headers.set(key, value)
    if (body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")
    const response = await fetcher(resolveUrl(path, baseUrl), {
      method,
      headers,
      body: body === undefined ? undefined : (body instanceof Uint8Array || typeof body === "string" ? body : JSON.stringify(body)) as BodyInit,
      signal: requestOptions.signal
    })
    const text = await response.text()
    let value: unknown = undefined
    if (text.length > 0) {
      try { value = JSON.parse(text) } catch { value = text }
    }
    return response.ok ? { data: value as T, response } : { error: { status: response.status, body: value }, response }
  }
  return {
    request,
    get: <T>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("GET", path, undefined, requestOptions),
    post: <T>(path: string, body: unknown, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("POST", path, body, requestOptions),
    put: <T>(path: string, body: unknown, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("PUT", path, body, requestOptions),
    patch: <T>(path: string, body: unknown, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("PATCH", path, body, requestOptions),
    delete: <T>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("DELETE", path, undefined, requestOptions),
    head: <T>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("HEAD", path, undefined, requestOptions),
    options: <T>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T>("OPTIONS", path, undefined, requestOptions)
  }
}

export function createTypedClient<Routes>(baseUrl: string, options: ClientOptions = {}) {
  const client = createClient(baseUrl, options)
  const prepare = <Method extends string, Path extends string>(path: Path, requestOptions?: RequestOptions<Routes, Method, Path>) => ({
    path: withQuery(withParams(path, requestOptions?.params), requestOptions?.query, options.queryArray ?? "repeat"),
    requestOptions: { headers: requestOptions?.headers as HeadersInit | undefined, signal: requestOptions?.signal }
  })
  return {
    get: <Path extends RoutePaths<Routes, "GET">>(path: Path, requestOptions?: RequestOptions<Routes, "GET", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.get<RouteResponse<Routes, "GET", Path>>(prepared.path, prepared.requestOptions)
    },
    post: <Path extends RoutePaths<Routes, "POST">>(path: Path, body: RouteBody<Routes, "POST", Path>, requestOptions?: RequestOptions<Routes, "POST", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.post<RouteResponse<Routes, "POST", Path>>(prepared.path, body, prepared.requestOptions)
    },
    put: <Path extends RoutePaths<Routes, "PUT">>(path: Path, body: RouteBody<Routes, "PUT", Path>, requestOptions?: RequestOptions<Routes, "PUT", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.put<RouteResponse<Routes, "PUT", Path>>(prepared.path, body, prepared.requestOptions)
    },
    patch: <Path extends RoutePaths<Routes, "PATCH">>(path: Path, body: RouteBody<Routes, "PATCH", Path>, requestOptions?: RequestOptions<Routes, "PATCH", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.patch<RouteResponse<Routes, "PATCH", Path>>(prepared.path, body, prepared.requestOptions)
    },
    delete: <Path extends RoutePaths<Routes, "DELETE">>(path: Path, requestOptions?: RequestOptions<Routes, "DELETE", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.delete<RouteResponse<Routes, "DELETE", Path>>(prepared.path, prepared.requestOptions)
    },
    head: <Path extends RoutePaths<Routes, "HEAD">>(path: Path, requestOptions?: RequestOptions<Routes, "HEAD", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.head<RouteResponse<Routes, "HEAD", Path>>(prepared.path, prepared.requestOptions)
    },
    options: <Path extends RoutePaths<Routes, "OPTIONS">>(path: Path, requestOptions?: RequestOptions<Routes, "OPTIONS", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.options<RouteResponse<Routes, "OPTIONS", Path>>(prepared.path, prepared.requestOptions)
    }
  }
}

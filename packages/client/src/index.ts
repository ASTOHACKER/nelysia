type JsonMethod<Body, StatusMap extends object> = [keyof StatusMap] extends [never]
  ? {
      <T = Body>(): Promise<T>
    }
  : {
      <T = Body>(): Promise<T>
      <Status extends keyof StatusMap>(status: Status): Promise<StatusMap[Status]>
    }

export interface ClientResponse<T, ErrorBody = unknown, StatusMap extends object = {}> {
  data?: T
  error?: { status: number; body: ErrorBody }
  response: Response
  json: JsonMethod<T, StatusMap>
}

export type ClientQueryArrayPolicy = "repeat" | "comma" | "json"

export interface ClientOptions {
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit
  queryArray?: ClientQueryArrayPolicy
}

export type ClientRouteMap = Record<string, {
  response?: unknown
  responses?: Record<string | number, unknown>
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
type RouteResponses<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "responses", {}>
type RouteBody<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "body">
type RouteQuery<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "query">
type RouteParams<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "params">
type RouteHeaders<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "headers">
type RouteErrors<Routes, Method extends string, Path extends string> = RouteField<Routes, Method, Path, "errors", unknown>
type HeaderInput<Value> = Value extends Record<string, unknown> ? Value & Record<string, string | number | boolean | undefined> : HeadersInit
type PathNeedsParams<Path extends string> = Path extends `${string}:${string}` | `${string}/*` ? true : false
type RequestOptions<Routes, Method extends string, Path extends string> = (PathNeedsParams<Path> extends true
  ? { params: RouteParams<Routes, Method, Path> }
  : { params?: RouteParams<Routes, Method, Path> }) & {
  query?: RouteQuery<Routes, Method, Path>
  headers?: HeaderInput<RouteHeaders<Routes, Method, Path>>
  signal?: AbortSignal
}
type BodyArguments<Routes, Method extends string, Path extends string> = [RouteBody<Routes, Method, Path>] extends [never]
  ? [requestOptions?: RequestOptions<Routes, Method, Path>]
  : [body: RouteBody<Routes, Method, Path>, requestOptions?: RequestOptions<Routes, Method, Path>]

type RoutesOfApp<App> = App extends { readonly __nelysiaRouteMap?: infer Routes } ? Routes : App extends Record<string, unknown> ? App : never
type TypedClient<Routes> = {
  get<Path extends RoutePaths<Routes, "GET">>(path: Path, requestOptions?: RequestOptions<Routes, "GET", Path>): Promise<ClientResponse<RouteResponse<Routes, "GET", Path>, RouteErrors<Routes, "GET", Path>, RouteResponses<Routes, "GET", Path>>>
  post<Path extends RoutePaths<Routes, "POST">>(path: Path, ...args: BodyArguments<Routes, "POST", Path>): Promise<ClientResponse<RouteResponse<Routes, "POST", Path>, RouteErrors<Routes, "POST", Path>, RouteResponses<Routes, "POST", Path>>>
  put<Path extends RoutePaths<Routes, "PUT">>(path: Path, ...args: BodyArguments<Routes, "PUT", Path>): Promise<ClientResponse<RouteResponse<Routes, "PUT", Path>, RouteErrors<Routes, "PUT", Path>, RouteResponses<Routes, "PUT", Path>>>
  patch<Path extends RoutePaths<Routes, "PATCH">>(path: Path, ...args: BodyArguments<Routes, "PATCH", Path>): Promise<ClientResponse<RouteResponse<Routes, "PATCH", Path>, RouteErrors<Routes, "PATCH", Path>, RouteResponses<Routes, "PATCH", Path>>>
  delete<Path extends RoutePaths<Routes, "DELETE">>(path: Path, requestOptions?: RequestOptions<Routes, "DELETE", Path>): Promise<ClientResponse<RouteResponse<Routes, "DELETE", Path>, RouteErrors<Routes, "DELETE", Path>, RouteResponses<Routes, "DELETE", Path>>>
  head<Path extends RoutePaths<Routes, "HEAD">>(path: Path, requestOptions?: RequestOptions<Routes, "HEAD", Path>): Promise<ClientResponse<RouteResponse<Routes, "HEAD", Path>, RouteErrors<Routes, "HEAD", Path>, RouteResponses<Routes, "HEAD", Path>>>
  options<Path extends RoutePaths<Routes, "OPTIONS">>(path: Path, requestOptions?: RequestOptions<Routes, "OPTIONS", Path>): Promise<ClientResponse<RouteResponse<Routes, "OPTIONS", Path>, RouteErrors<Routes, "OPTIONS", Path>, RouteResponses<Routes, "OPTIONS", Path>>>
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
    .replace(/\*$/, () => String(values["*"] ?? "*").split("/").map((segment) => encodeURIComponent(segment)).join("/"))
}

function isRequestOptions(value: unknown): value is { params?: unknown; query?: unknown; headers?: HeadersInit; signal?: AbortSignal } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.keys(value).some((key) => key === "params" || key === "query" || key === "headers" || key === "signal")
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

function createBaseClient(baseUrl: string, options: ClientOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch
  const request = async <T, E = unknown, StatusMap extends object = {}>(method: string, path: string, body?: unknown, requestOptions: { headers?: HeadersInit; signal?: AbortSignal } = {}): Promise<ClientResponse<T, E, StatusMap>> => {
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
    const json = async <Requested = T>(_status?: PropertyKey): Promise<Requested> => value as Requested
    return (response.ok ? { data: value as T, response, json } : { error: { status: response.status, body: value as E }, response, json }) as ClientResponse<T, E, StatusMap>
  }
  return {
    request,
    get: <T, E = unknown, StatusMap extends object = {}>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("GET", path, undefined, requestOptions),
    post: <T, E = unknown, StatusMap extends object = {}>(path: string, body: unknown, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("POST", path, body, requestOptions),
    put: <T, E = unknown, StatusMap extends object = {}>(path: string, body: unknown, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("PUT", path, body, requestOptions),
    patch: <T, E = unknown, StatusMap extends object = {}>(path: string, body: unknown, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("PATCH", path, body, requestOptions),
    delete: <T, E = unknown, StatusMap extends object = {}>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("DELETE", path, undefined, requestOptions),
    head: <T, E = unknown, StatusMap extends object = {}>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("HEAD", path, undefined, requestOptions),
    options: <T, E = unknown, StatusMap extends object = {}>(path: string, requestOptions?: { headers?: HeadersInit; signal?: AbortSignal }) => request<T, E, StatusMap>("OPTIONS", path, undefined, requestOptions)
  }
}

export function createClient<App = never>(baseUrl: string, options?: ClientOptions): [App] extends [never] ? ReturnType<typeof createBaseClient> : TypedClient<RoutesOfApp<App>>
export function createClient(baseUrl: string, options: ClientOptions = {}): any {
  return createBaseClient(baseUrl, options)
}

export function createTypedClient<Routes>(baseUrl: string, options: ClientOptions = {}): TypedClient<Routes> {
  const client = createBaseClient(baseUrl, options)
  const prepare = <Method extends string, Path extends string>(path: Path, requestOptions?: RequestOptions<Routes, Method, Path>) => ({
    path: withQuery(withParams(path, requestOptions?.params), requestOptions?.query, options.queryArray ?? "repeat"),
    requestOptions: { headers: requestOptions?.headers as HeadersInit | undefined, signal: requestOptions?.signal }
  })
  return {
    get: <Path extends RoutePaths<Routes, "GET">>(path: Path, requestOptions?: RequestOptions<Routes, "GET", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.get<RouteResponse<Routes, "GET", Path>, RouteErrors<Routes, "GET", Path>, RouteResponses<Routes, "GET", Path>>(prepared.path, prepared.requestOptions)
    },
    post: <Path extends RoutePaths<Routes, "POST">>(path: Path, bodyOrOptions?: RouteBody<Routes, "POST", Path> | RequestOptions<Routes, "POST", Path>, requestOptions?: RequestOptions<Routes, "POST", Path>) => {
      const bodyIsOptions = requestOptions === undefined && isRequestOptions(bodyOrOptions)
      const body = bodyIsOptions ? undefined : bodyOrOptions
      const options = (bodyIsOptions ? bodyOrOptions : requestOptions) as RequestOptions<Routes, "POST", Path> | undefined
      const prepared = prepare(path, options)
      return client.post<RouteResponse<Routes, "POST", Path>, RouteErrors<Routes, "POST", Path>, RouteResponses<Routes, "POST", Path>>(prepared.path, body, prepared.requestOptions)
    },
    put: <Path extends RoutePaths<Routes, "PUT">>(path: Path, bodyOrOptions?: RouteBody<Routes, "PUT", Path> | RequestOptions<Routes, "PUT", Path>, requestOptions?: RequestOptions<Routes, "PUT", Path>) => {
      const bodyIsOptions = requestOptions === undefined && isRequestOptions(bodyOrOptions)
      const body = bodyIsOptions ? undefined : bodyOrOptions
      const options = (bodyIsOptions ? bodyOrOptions : requestOptions) as RequestOptions<Routes, "PUT", Path> | undefined
      const prepared = prepare(path, options)
      return client.put<RouteResponse<Routes, "PUT", Path>, RouteErrors<Routes, "PUT", Path>, RouteResponses<Routes, "PUT", Path>>(prepared.path, body, prepared.requestOptions)
    },
    patch: <Path extends RoutePaths<Routes, "PATCH">>(path: Path, bodyOrOptions?: RouteBody<Routes, "PATCH", Path> | RequestOptions<Routes, "PATCH", Path>, requestOptions?: RequestOptions<Routes, "PATCH", Path>) => {
      const bodyIsOptions = requestOptions === undefined && isRequestOptions(bodyOrOptions)
      const body = bodyIsOptions ? undefined : bodyOrOptions
      const options = (bodyIsOptions ? bodyOrOptions : requestOptions) as RequestOptions<Routes, "PATCH", Path> | undefined
      const prepared = prepare(path, options)
      return client.patch<RouteResponse<Routes, "PATCH", Path>, RouteErrors<Routes, "PATCH", Path>, RouteResponses<Routes, "PATCH", Path>>(prepared.path, body, prepared.requestOptions)
    },
    delete: <Path extends RoutePaths<Routes, "DELETE">>(path: Path, requestOptions?: RequestOptions<Routes, "DELETE", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.delete<RouteResponse<Routes, "DELETE", Path>, RouteErrors<Routes, "DELETE", Path>, RouteResponses<Routes, "DELETE", Path>>(prepared.path, prepared.requestOptions)
    },
    head: <Path extends RoutePaths<Routes, "HEAD">>(path: Path, requestOptions?: RequestOptions<Routes, "HEAD", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.head<RouteResponse<Routes, "HEAD", Path>, RouteErrors<Routes, "HEAD", Path>, RouteResponses<Routes, "HEAD", Path>>(prepared.path, prepared.requestOptions)
    },
    options: <Path extends RoutePaths<Routes, "OPTIONS">>(path: Path, requestOptions?: RequestOptions<Routes, "OPTIONS", Path>) => {
      const prepared = prepare(path, requestOptions)
      return client.options<RouteResponse<Routes, "OPTIONS", Path>, RouteErrors<Routes, "OPTIONS", Path>, RouteResponses<Routes, "OPTIONS", Path>>(prepared.path, prepared.requestOptions)
    }
  }
}

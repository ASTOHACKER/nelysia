export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD"

export interface RequestData {
  method: string
  url: string
  requestId?: string
  remoteAddress?: string
  headers?: Headers
  body?: unknown
  env?: unknown
  executionContext?: unknown
  signal?: AbortSignal
}

export type FetchHandler = (request: Request) => Response | Promise<Response>

export interface NelysiaOptions {
  /** Prefix applied to every route registered on this instance. */
  prefix?: string
  /** Stable identity used by module composition and plugin deduplication. */
  name?: string
  /** Optional configuration seed for a named module. */
  seed?: unknown
  /** Route metadata inherited by every route registered on this instance. */
  routeOptions?: RouteMetadataOptions
  bodyLimit?: number
  telemetry?: Telemetry
  trustedProxy?: boolean
  secureCookies?: boolean
  /** When false, skips request-id generation and the `x-request-id` response header (Elysia-like fast path). Defaults to true for compatibility. */
  requestId?: boolean
}

export interface TelemetrySpan {
  name: string
  requestId: string
  method: string
  route: string
  status: number
  durationMs: number
  error?: unknown
}

export type TelemetryPhase = "request.start" | "route.matched" | "parse" | "handler" | "response" | "error" | "after.response"

export interface TelemetryEvent {
  phase: TelemetryPhase
  requestId: string
  method: string
  route: string
  durationMs: number
  status?: number
  error?: unknown
}

export interface Telemetry {
  onRequest?(context: Context): void | Promise<void>
  onResponse?(context: Context, response: ResponseData): void | Promise<void>
  onError?(context: Context, error: unknown): void | Promise<void>
  onEvent?(event: TelemetryEvent): void | Promise<void>
  exportSpan?(span: TelemetrySpan): void | Promise<void>
}

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: "strict" | "lax" | "none"
  path?: string
  maxAge?: number
}

export interface WebSocketSocket {
  send(message: string | Uint8Array): void
  close(code?: number, reason?: string): void
}

export interface WebSocketHandlers {
  open?(socket: WebSocketSocket): void | Promise<void>
  message?(socket: WebSocketSocket, message: string | Uint8Array): void | Promise<void>
  close?(socket: WebSocketSocket, code: number, reason: string): void | Promise<void>
  error?(socket: WebSocketSocket, error: unknown): void | Promise<void>
}

export interface AuthStrategyRegistry {
  /** Authentication packages augment this registry with their strategy names. */
}

export type AuthStrategyName = Extract<keyof AuthStrategyRegistry, string>

export type AuthStrategySetting = AuthStrategyName | "optional" | boolean | AuthStrategyDescriptor | LegacyAuthStrategy

/** @deprecated Prefer a strategy name registered through AuthStrategyRegistry. */
export type LegacyAuthStrategy = string

export interface AuthStrategyDescriptor {
  strategy: AuthStrategyName
  role?: string | readonly string[]
  permissions?: string | readonly string[]
  /** Optional mode for a provider-specific strategy. */
  optional?: boolean
}

export interface AuthStrategyProvider<Claims = unknown> {
  readonly claims?: Claims
  readonly guard: RouteGuard
}

export interface RateLimitRouteOptions {
  limit: number
  windowMs: number
  key?(context: Context): string
}

export interface CacheRouteOptions {
  ttlMs?: number
  maxEntries?: number
  key?(context: Context): string
  store?: {
    get(key: string): ResponseData | undefined | Promise<ResponseData | undefined>
    set(key: string, value: ResponseData, ttlMs: number): void | Promise<void>
    delete?(key: string): void | Promise<void>
  }
}

export interface TimeoutRouteOptions {
  timeoutMs?: number
  status?: number
  message?: string
}

export interface RouteMetadataOptions {
  auth?: AuthStrategySetting
  role?: string | readonly string[]
  permissions?: string | readonly string[]
  /** Existing rate-limit configuration or a `<limit>/<s|m|h>` shorthand. */
  rateLimit?: RateLimitRouteOptions | `${number}/${"s" | "m" | "h"}` | false
  cache?: boolean | CacheRouteOptions
  timeout?: number | TimeoutRouteOptions | false
  /** Explicit custom provider values. Unknown keys are never auto-enabled. */
  features?: Record<string, unknown>
}

export interface NormalizedRouteMetadata {
  auth?: AuthStrategySetting
  role?: string | readonly string[]
  permissions?: string | readonly string[]
  rateLimit?: RateLimitRouteOptions | `${number}/${"s" | "m" | "h"}` | false
  cache?: boolean | CacheRouteOptions
  timeout?: number | TimeoutRouteOptions | false
  features: Readonly<Record<string, unknown>>
}

export interface DecorationOptions {
  /** Keep framework internals such as `jwt` out of Object.keys(context). */
  enumerable?: boolean
  /** Resolve a decoration on first access for each request context. */
  lazy?: boolean
}

export type RouteOptions<Models extends Record<string, unknown> = {}, MacroNames extends string = never> = {
  summary?: string
  description?: string
  tags?: string[]
  body?: SchemaDefinitionInput | (keyof Models & string)
  params?: SchemaDefinitionInput | (keyof Models & string)
  query?: SchemaDefinitionInput | (keyof Models & string)
  headers?: SchemaDefinitionInput | (keyof Models & string)
  response?: SchemaDefinitionInput | (keyof Models & string) | Record<string | number, SchemaDefinitionInput | (keyof Models & string)>
  /** Additional response contracts keyed by HTTP status (for example 201 or 422). */
  responses?: Record<string | number, SchemaDefinitionInput | (keyof Models & string)>
} & RouteMetadataOptions
  & Partial<Record<MacroNames, boolean>>

export type SchemaInput = import("./schema.ts").Schema | import("./schema.ts").StandardSchema | string
type SchemaDefinitionInput = import("./schema.ts").Schema | import("./schema.ts").StandardSchema

export type SchemaValue<Input, Models extends Record<string, unknown> = {}> = Input extends import("./schema.ts").Schema<infer Value>
  ? Value
  : Input extends import("./schema.ts").StandardSchema<infer Value>
    ? Value
    : Input extends keyof Models ? Models[Input] : unknown

export type PathParams<Path extends string> = Path extends `${string}:${infer Name}/${infer Rest}`
  ? { [K in Name | keyof PathParams<`/${Rest}`>]: string }
  : Path extends `${string}:${infer Name}`
    ? { [K in Name]: string }
    : Path extends `${string}/*`
      ? { "*": string }
      : Record<string, string>

export type RouteContract = {
  response?: unknown
  body?: unknown
  params?: unknown
  query?: unknown
  headers?: unknown
  errors?: unknown
}

type ResponseStatusKey<Key> = Key extends "default" ? Key : Key extends number ? `${Key}` | Key : Key extends `${number}` ? Key : never
type Simplify<Value> = Value extends Record<string, unknown> ? { [Key in keyof Value]: Value[Key] } : Value
type ResponseContractMap<Value, Models extends Record<string, unknown>> = Value extends object
  ? {
      [Key in Extract<keyof Value, string | number> as ResponseStatusKey<Key>]: Simplify<SchemaValue<Value[Key], Models>>
    }
  : {}
type ResponseSuccessMap<Value, Models extends Record<string, unknown>> = {
  [Key in keyof ResponseContractMap<Value, Models> as `${Key & (string | number)}` extends `2${number}${number}` | "default" ? Key : never]: ResponseContractMap<Value, Models>[Key]
}
type ResponseErrorMap<Value, Models extends Record<string, unknown>> = {
  [Key in keyof ResponseContractMap<Value, Models> as `${Key & (string | number)}` extends `2${number}${number}` | "default" ? never : Key]: ResponseContractMap<Value, Models>[Key]
}
type ResponseContractUnion<Value, Models extends Record<string, unknown>> = ResponseContractMap<Value, Models>[keyof ResponseContractMap<Value, Models>]
type ResponseSuccessUnion<Value, Models extends Record<string, unknown>> = ResponseSuccessMap<Value, Models>[keyof ResponseSuccessMap<Value, Models>]
type ResponseErrorUnion<Value, Models extends Record<string, unknown>> = ResponseErrorMap<Value, Models>[keyof ResponseErrorMap<Value, Models>]
type ResponseContractValues<Value, Models extends Record<string, unknown>> = [keyof ResponseContractMap<Value, Models>] extends [never]
  ? SchemaValue<Value, Models>
  : [keyof ResponseSuccessMap<Value, Models>] extends [never]
    ? ResponseContractUnion<Value, Models>
    : ResponseSuccessUnion<Value, Models>
type ResponseErrorValues<Value, Models extends Record<string, unknown>> = [keyof ResponseErrorMap<Value, Models>] extends [never]
  ? unknown
  : ResponseErrorUnion<Value, Models>
type RouteResponseMap<Options extends object, Models extends Record<string, unknown>> = Options extends { responses: infer Responses }
  ? ResponseContractMap<Responses, Models>
  : Options extends { response: infer Response }
    ? ResponseContractMap<Response, Models>
    : {}
type JsonMethod<Body, StatusMap extends object> = [keyof StatusMap] extends [never]
  ? {
      <T = Body>(): Promise<T>
    }
  : {
      <T = Body>(): Promise<T>
      <Status extends keyof StatusMap>(status: Status): Promise<StatusMap[Status]>
    }

export type RouteMap = object

/** Generic plugin contract. Plugin packages use this shape to preserve the
 * host application's route/model/macro generics while adding context fields. */
export type NelysiaPlugin<Added extends object = {}> = (<Extensions extends Record<string, unknown> = {}, Routes extends RouteMap = {}, Models extends Record<string, unknown> = {}, Macros extends string = never>(app: import("./app.ts").Nelysia<Extensions, Routes, Models, Macros>) => import("./app.ts").Nelysia<Extensions & Added, Routes, Models, Macros>) & {
  /** Type-only marker used by `Nelysia.use()` to infer plugin context. */
  readonly __nelysiaPlugin?: Added
}

type ExpandInjectPath<Path extends string> = Path extends `${infer Prefix}:${string}/${infer Rest}`
  ? `${Prefix}${string}/${ExpandInjectPath<Rest>}`
  : Path extends `${infer Prefix}:${string}`
    ? `${Prefix}${string}`
    : Path extends `${infer Prefix}/*`
      ? `${Prefix}/${string}`
      : Path

type InjectRouteOptions<Key extends string, Contract> = Key extends `${infer Method} ${infer Path}`
  ? { method: Method; path: Path | ExpandInjectPath<Path> }
    & (Contract extends { params: infer Params } ? { params?: Params } : { params?: PathParams<Path> })
    & (Contract extends { body: infer Body } ? { body: Body } : { body?: unknown })
    & (Contract extends { query: infer Query } ? { query?: Query } : { query?: Record<string, string> })
    & (Contract extends { headers: infer Headers } ? { headers?: Headers | globalThis.Headers } : { headers?: Record<string, string> | globalThis.Headers })
  : never

export type TypedInjectOptions<Routes extends RouteMap> = string extends keyof Routes ? InjectOptions : keyof Routes extends never
  ? InjectOptions
  : { [Key in Extract<keyof Routes, string>]: InjectRouteOptions<Key, Routes[Key]> }[Extract<keyof Routes, string>] | (InjectOptions & { path?: undefined })

export type InjectResponseBody<Routes extends RouteMap> = Routes[keyof Routes & keyof Routes] extends infer Contract
  ? Contract extends { response: infer Response } ? Response : unknown
  : unknown

type InjectRouteKey<Routes extends RouteMap, Method extends string, Path extends string> = {
  [Key in Extract<keyof Routes, string>]: Key extends `${Method} ${infer Pattern}`
    ? Path extends Pattern | ExpandInjectPath<Pattern> ? Key : never
    : never
}[Extract<keyof Routes, string>]

export type InjectResponseBodyFor<Routes extends RouteMap, Options> = Options extends { method: infer Method extends string; path: infer Path extends string }
  ? Routes[InjectRouteKey<Routes, Method, Path> & keyof Routes] extends infer Contract
    ? Contract extends { response: infer Response } ? Response : unknown
    : unknown
  : unknown

export type InjectResponseStatusesFor<Routes extends RouteMap, Options> = Options extends { method: infer Method extends string; path: infer Path extends string }
  ? Routes[InjectRouteKey<Routes, Method, Path> & keyof Routes] extends infer Contract
    ? Contract extends { responses: infer Responses } ? Responses : {}
    : {}
  : {}

type OptionalContractField<Options extends object, Key extends string, Value> = Options extends Record<Key, infer Input>
  ? { [K in Key]: Value extends never ? unknown : Value }
  : {}

export type RouteContractFor<Method extends string, Path extends string, Options extends object, Result, Models extends Record<string, unknown> = {}> = {
  response: Options extends { response: infer Input } ? ResponseContractValues<Input, Models> : Options extends { responses: infer Responses } ? ResponseContractValues<Responses, Models> : Awaited<Result>
  errors: Options extends { responses: infer Responses } ? ResponseErrorValues<Responses, Models> : Options extends { response: infer Input } ? ResponseErrorValues<Input, Models> : unknown
  responses: RouteResponseMap<Options, Models>
  params: Options extends { params: infer Input } ? SchemaValue<Input, Models> : PathParams<Path>
} & OptionalContractField<Options, "body", SchemaValue<Options extends { body: infer Input } ? Input : never, Models>>
  & OptionalContractField<Options, "query", SchemaValue<Options extends { query: infer Input } ? Input : never, Models>>
  & OptionalContractField<Options, "headers", SchemaValue<Options extends { headers: infer Input } ? Input : never, Models>>

export type AddRoute<Routes extends RouteMap, Method extends string, Path extends string, Options extends object, Result, Models extends Record<string, unknown> = {}> =
  Omit<Routes, `${Method} ${Path}`> & { [Key in `${Method} ${Path}`]: RouteContractFor<Method, Path, Options, Result, Models> }

export type MergeRouteMaps<Left extends RouteMap, Right extends RouteMap> = Omit<Left, keyof Right> & Right

export type ModelValues<Definitions extends Record<string, unknown>> = {
  [Key in keyof Definitions]: SchemaValue<Definitions[Key]>
}

type ExtensionAuth<Extensions extends Record<string, unknown>> = Extensions extends { auth?: infer Auth } ? Exclude<Auth, undefined> : never
type RegisteredAuth<Strategy extends string> = Strategy extends keyof AuthStrategyRegistry ? AuthStrategyRegistry[Strategy] : unknown
type AuthClaims<Extensions extends Record<string, unknown>, Strategy extends string> = [ExtensionAuth<Extensions>] extends [never]
  ? RegisteredAuth<Strategy>
  : ExtensionAuth<Extensions>
type AuthSettingValue<Setting, Extensions extends Record<string, unknown>> = Setting extends { strategy: infer Strategy extends string; optional?: infer Optional }
  ? Optional extends true ? AuthClaims<Extensions, Strategy> | undefined : AuthClaims<Extensions, Strategy>
  : Setting extends "optional" ? ExtensionAuth<Extensions> | undefined
    : Setting extends string | true ? AuthClaims<Extensions, Setting extends string ? Setting : string>
      : ExtensionAuth<Extensions> | undefined
type RouteAuthValue<Extensions extends Record<string, unknown>, Options extends object> = Options extends { auth: infer Setting }
  ? AuthSettingValue<Setting, Extensions>
  : ExtensionAuth<Extensions> | undefined

export type RouteContext<Extensions extends Record<string, unknown>, Options extends object = RouteOptions, Models extends Record<string, unknown> = {}> = Omit<Context, "auth"> & Extensions & {
  auth: RouteAuthValue<Extensions, Options>
  body: Options extends { body: infer Value } ? SchemaValue<Value, Models> : unknown
  params: Options extends { params: infer Value } ? SchemaValue<Value, Models> : Record<string, string>
  query: Options extends { query: infer Value } ? SchemaValue<Value, Models> : ParsedQuery
  headers: Options extends { headers: infer Value } ? SchemaValue<Value, Models> : Headers
}

export interface GuardOptions<Models extends Record<string, unknown> = {}> extends Omit<RouteOptions<Models>, "response"> {
  body?: SchemaDefinitionInput | (keyof Models & string)
  params?: SchemaDefinitionInput | (keyof Models & string)
  query?: SchemaDefinitionInput | (keyof Models & string)
  headers?: SchemaDefinitionInput | (keyof Models & string)
  response?: SchemaDefinitionInput | (keyof Models & string) | Record<string | number, SchemaDefinitionInput | (keyof Models & string)>
  responses?: Record<string | number, SchemaDefinitionInput | (keyof Models & string)>
  beforeHandle?: Hook
}

type GuardField<Contract, Options extends object, Key extends string, Models extends Record<string, unknown>> =
  Contract & (Options extends Record<Key, infer Input> ? { [K in Key]: SchemaValue<Input, Models> } : {})

export type ApplyGuard<Routes extends RouteMap, Options extends object, Models extends Record<string, unknown> = {}> = {
  [Key in keyof Routes]: GuardField<GuardField<GuardField<GuardField<GuardField<Routes[Key], Options, "body", Models>, Options, "params", Models>, Options, "query", Models>, Options, "headers", Models>, Options, "response", Models>
}

export type HookScope = "local" | "scoped" | "global"

export interface HookOptions {
  as?: HookScope
}

export interface MacroDefinition {
  beforeHandle?: Hook
  body?: SchemaInput
  params?: SchemaInput
  query?: SchemaInput
  headers?: SchemaInput
  response?: SchemaInput
}

export interface ResponseData {
  status: number
  headers: Headers
  body: unknown
  readonly [responseMarker]?: true
}

export const responseMarker = Symbol("nelysia.response")

export function requestIdFor(request: RequestData): string {
  return request.requestId ?? request.headers?.get("x-request-id") ?? `req-${request.method}-${request.url}`
}

export class HttpError extends Error {
  readonly status: number
  readonly body?: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

export interface ResponseOptions {
  status?: number
  headers?: HeadersInit
}

export function error(status: number, body: unknown): HttpError {
  const message = typeof body === "string" ? body : `HTTP ${status}`
  return new HttpError(status, message, body)
}

export type ParsedQuery = URLSearchParams & Record<string, string | undefined>

export interface ResponseSetContext {
  status?: number
  headers: Record<string, string>
}

export interface ServerInfo {
  port: number
  hostname: string
  url: string
  server: unknown
  /** Stops the underlying runtime server. Existing `server` access remains supported. */
  stop(): void | Promise<void>
}

export type NelysiaServer = ServerInfo

export interface ListenOptions {
  port: number
  hostname?: string
}

export interface InjectOptions {
  method?: string
  url?: string
  path?: string
  /** Optional route parameters used to expand `:name` and `*` path tokens. */
  params?: Record<string, string>
  headers?: Record<string, string> | Headers
  body?: unknown
  query?: Record<string, string>
}

export interface InjectResponse<Body = unknown, StatusMap extends object = {}> {
  readonly status: number
  readonly statusCode: number
  readonly headers: Headers
  readonly body: unknown
  json: JsonMethod<Body, StatusMap>
  text(): Promise<string>
  bytes(): Promise<Uint8Array>
}

export interface Context {
  request: RequestData
  requestId: string
  clientIp?: string
  env?: unknown
  executionContext?: unknown
  params: Record<string, string>
  query: ParsedQuery
  set: ResponseSetContext
  store: Record<string, unknown>
  body: unknown
  headers: Headers
  cookies: Record<string, string>
  auth?: unknown
  route?: RouteContextInfo
  signal: AbortSignal
  executionControl?: RouteExecutionControl
  logger?: Logger
  files?: Record<string, UploadedFile[]>
  setCookie(name: string, value: string, options?: CookieOptions): void
  deleteCookie(name: string, options?: CookieOptions): void
  response(body: unknown, options?: ResponseOptions): ResponseData
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
  html(body: string, status?: number): ResponseData
  text(body: string, status?: number): ResponseData
  json(body: unknown, status?: number | ResponseOptions): ResponseData
  redirect(url: string, status?: number): ResponseData
  header(name: string, value: string): this
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export interface RouteExecutionControl {
  signal: AbortSignal
  invoke(handler: () => unknown | Promise<unknown>): unknown | Promise<unknown>
  cleanup(): void
}

export interface RouteContextInfo {
  method: HttpMethod
  path: string
  features: Readonly<Record<string, unknown>>
  auth?: AuthStrategySetting
}

export interface RouteFeatureProvider<Value = unknown> {
  beforeHandle?(value: Value): Hook
  afterHandle?(value: Value): AfterHook
}

export interface UploadedFile {
  fieldName: string
  filename: string
  contentType: string
  size: number
  file: File
  storage?: unknown
}

export type Handler<Extensions extends Record<string, unknown> = {}> = (context: Context & Extensions) => unknown | Promise<unknown>
export type Hook = (context: Context) => unknown | Promise<unknown>
export type RouteGuard = (context: Context) => unknown | Promise<unknown>
export type AfterHook = (context: Context, result: ResponseData) => unknown | Promise<unknown>
export type ErrorHandler = (error: unknown, context: Context) => unknown | Promise<unknown>
export type ContextExtension = (context: Context) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>
export type RequestHook = (request: RequestData) => unknown | Promise<unknown>
export type ParseHook = (request: RequestData, contentType: string | null) => unknown | Promise<unknown>
export type TransformHook = Hook
export type MapResponseHook = (context: Context, response: ResponseData) => unknown | Promise<unknown>
export type AfterResponseHook = (context: Context, response: ResponseData) => unknown | Promise<void>

export interface RouteRecord {
  method: HttpMethod
  path: string
  segments: string[]
  params: string[]
  handler: Handler
  requestHooks?: RequestHook[]
  parseHooks?: ParseHook[]
  mapResponseHooks?: MapResponseHook[]
  afterResponseHooks?: AfterResponseHook[]
  hooks: Hook[]
  afterHooks: AfterHook[]
  errorHandlers: ErrorHandler[]
  static: boolean
  wildcard?: boolean
  contextFree?: boolean
  staticValue?: unknown
  auth?: AuthStrategySetting
  role?: string | readonly string[]
  permissions?: string | readonly string[]
  features?: Record<string, unknown>
  metadata?: NormalizedRouteMetadata
  routeGuards?: RouteGuard[]
  summary?: string
  description?: string
  tags?: string[]
  bodySchema?: import("./schema.ts").Schema
  paramsSchema?: import("./schema.ts").Schema
  querySchema?: import("./schema.ts").Schema
  headersSchema?: import("./schema.ts").Schema
  responseSchema?: import("./schema.ts").Schema
  bodyModel?: string
  paramsModel?: string
  queryModel?: string
  headersModel?: string
  responseModel?: string
  responseSchemas?: Record<string, import("./schema.ts").Schema>
  responseModels?: Record<string, string>
}

export interface RouteGraph {
  routes: RouteRecord[]
}

export type ModuleLoadState = "loaded" | "pending" | "rejected"

export interface ModuleGraphNode {
  name?: string
  seed?: unknown
  parent?: string
  dependencies: readonly ModuleGraphNode[]
  routeOwnership: readonly string[]
  lifecycleOwnership: number
  loadState: ModuleLoadState
  loadError?: unknown
}

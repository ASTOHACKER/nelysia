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
}

export type FetchHandler = (request: Request) => Response | Promise<Response>

export interface NelysiaOptions {
  /** Prefix applied to every route registered on this instance. */
  prefix?: string
  /** Stable identity used by module composition and plugin deduplication. */
  name?: string
  /** Optional configuration seed for a named module. */
  seed?: unknown
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

export interface RouteOptions<Models extends Record<string, unknown> = {}> {
  [key: string]: unknown
  summary?: string
  description?: string
  tags?: string[]
  body?: SchemaDefinitionInput | (keyof Models & string)
  params?: SchemaDefinitionInput | (keyof Models & string)
  query?: SchemaDefinitionInput | (keyof Models & string)
  headers?: SchemaDefinitionInput | (keyof Models & string)
  response?: SchemaDefinitionInput | (keyof Models & string)
  /** Additional response contracts keyed by HTTP status (for example 201 or 422). */
  responses?: Record<string | number, SchemaDefinitionInput | (keyof Models & string)>
  auth?: string | boolean | Record<string, unknown>
}

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

export type RouteMap = object

type OptionalContractField<Options extends object, Key extends string, Value> = Options extends Record<Key, infer Input>
  ? { [K in Key]: Value extends never ? unknown : Value }
  : {}

export type RouteContractFor<Method extends string, Path extends string, Options extends object, Result, Models extends Record<string, unknown> = {}> = {
  response: Options extends { response: infer Input } ? SchemaValue<Input, Models> : Awaited<Result>
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

export type RouteContext<Extensions extends Record<string, unknown>, Options extends object = RouteOptions, Models extends Record<string, unknown> = {}> = Context & Extensions & {
  body: Options extends { body: infer Value } ? SchemaValue<Value, Models> : unknown
  params: Options extends { params: infer Value } ? SchemaValue<Value, Models> : Record<string, string>
  query: Options extends { query: infer Value } ? SchemaValue<Value, Models> : ParsedQuery
  headers: Options extends { headers: infer Value } ? SchemaValue<Value, Models> : Headers
}

export interface GuardOptions<Models extends Record<string, unknown> = {}> {
  body?: SchemaDefinitionInput | (keyof Models & string)
  params?: SchemaDefinitionInput | (keyof Models & string)
  query?: SchemaDefinitionInput | (keyof Models & string)
  headers?: SchemaDefinitionInput | (keyof Models & string)
  response?: SchemaDefinitionInput | (keyof Models & string)
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

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
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
}

export interface ListenOptions {
  port: number
  hostname?: string
}

export interface InjectOptions {
  method?: string
  url?: string
  path?: string
  headers?: Record<string, string> | Headers
  body?: unknown
  query?: Record<string, string>
}

export interface InjectResponse {
  readonly status: number
  readonly statusCode: number
  readonly headers: Headers
  readonly body: unknown
  json<T = unknown>(): Promise<T>
  text(): Promise<string>
  bytes(): Promise<Uint8Array>
}

export interface Context {
  readonly [key: string]: unknown
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
  setCookie(name: string, value: string, options?: CookieOptions): void
  deleteCookie(name: string, options?: CookieOptions): void
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
  html(body: string, status?: number): ResponseData
  text(body: string, status?: number): ResponseData
  json(body: unknown, status?: number): ResponseData
  redirect(url: string, status?: number): ResponseData
  header(name: string, value: string): this
}

export type Handler<Extensions extends Record<string, unknown> = Record<string, unknown>> = (context: Context & Extensions) => unknown | Promise<unknown>
export type Hook = (context: Context) => unknown | Promise<unknown>
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
  handler: Handler<any>
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
  auth?: string | boolean | Record<string, unknown>
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

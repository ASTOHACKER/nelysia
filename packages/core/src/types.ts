export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD"

export interface RequestData {
  method: string
  url: string
  requestId?: string
  remoteAddress?: string
  headers?: Headers
  body?: unknown
}

export interface NelysiaOptions {
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

export interface Telemetry {
  onRequest?(context: Context): void | Promise<void>
  onResponse?(context: Context, response: ResponseData): void | Promise<void>
  onError?(context: Context, error: unknown): void | Promise<void>
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

export interface RouteOptions {
  body?: import("./schema.ts").Schema | import("./schema.ts").StandardSchema
  params?: import("./schema.ts").Schema | import("./schema.ts").StandardSchema
  query?: import("./schema.ts").Schema | import("./schema.ts").StandardSchema
  headers?: import("./schema.ts").Schema | import("./schema.ts").StandardSchema
  response?: import("./schema.ts").Schema | import("./schema.ts").StandardSchema
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

export interface Context {
  request: RequestData
  requestId: string
  clientIp?: string
  params: Record<string, string>
  query: ParsedQuery
  body: unknown
  headers: Headers
  cookies: Record<string, string>
  setCookie(name: string, value: string, options?: CookieOptions): void
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
}

export type Handler = (context: Context) => unknown | Promise<unknown>
export type Hook = (context: Context) => unknown | Promise<unknown>
export type AfterHook = (context: Context, result: ResponseData) => unknown | Promise<unknown>
export type ErrorHandler = (error: unknown, context: Context) => unknown | Promise<unknown>

export interface RouteRecord {
  method: HttpMethod
  path: string
  segments: string[]
  params: string[]
  handler: Handler
  hooks: Hook[]
  afterHooks: AfterHook[]
  errorHandlers: ErrorHandler[]
  static: boolean
  wildcard?: boolean
  contextFree?: boolean
  staticValue?: unknown
  bodySchema?: import("./schema.ts").Schema
  paramsSchema?: import("./schema.ts").Schema
  querySchema?: import("./schema.ts").Schema
  headersSchema?: import("./schema.ts").Schema
  responseSchema?: import("./schema.ts").Schema
}

export interface RouteGraph {
  routes: RouteRecord[]
}

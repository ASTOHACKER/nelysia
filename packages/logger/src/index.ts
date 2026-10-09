import type { Logger, Nelysia, NelysiaPlugin } from "../../core/src/index.ts"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  level: LogLevel
  message: string
  fields?: Record<string, unknown>
  timestamp: string
}

export interface LoggerOptions {
  level?: LogLevel
  format?: "auto" | "pretty" | "json"
  startup?: boolean
  routes?: boolean
  requests?: boolean
  errors?: boolean
  sink?: (entry: LogEntry) => void | Promise<void>
  redact?: (key: string, value: unknown) => unknown
}

export type LoggerPlugin = NelysiaPlugin<{ logger: Logger }>

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const sensitiveKey = /authorization|cookie|secret|token|password|api[-_]?key/i

function defaultSink(entry: LogEntry, format: "pretty" | "json"): void {
  const line = format === "json"
    ? JSON.stringify(entry)
    : `[Nelysia] ${entry.level.toUpperCase()} ${entry.message}${entry.fields === undefined ? "" : ` ${JSON.stringify(entry.fields)}`}`
  if (entry.level === "error") console.error(line)
  else if (entry.level === "warn") console.warn(line)
  else console.log(line)
}

function redactValue(value: unknown, redact: (key: string, value: unknown) => unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]"
  const custom = redact(key, value)
  if (custom !== value) return custom
  if (typeof value === "string" && (key === "url" || key === "message" || key === "error")) return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redact, key))
  if (typeof value !== "object" || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) output[childKey] = redactValue(childValue, redact, childKey)
  return output
}

function redactSensitiveText(value: string): string {
  let output = value.replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
  if (!output.startsWith("/") && !/^https?:\/\//i.test(output)) return output
  try {
    const url = new URL(output, "http://nelysia.local")
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveKey.test(key)) url.searchParams.set(key, "[REDACTED]")
    }
    if (url.origin === "http://nelysia.local") return `${url.pathname}${url.search}${url.hash}`
    output = url.toString()
  } catch {
    // Error/message text is allowed to be non-URL text; keep it after bearer
    // token redaction rather than changing the logging contract.
  }
  return output
}

export function logger(options: LoggerOptions = {}): LoggerPlugin {
  const minimum = options.level ?? "info"
  const production = typeof process !== "undefined" && process.env?.NODE_ENV === "production"
  const format = options.format === "auto" || options.format === undefined ? (production ? "json" : "pretty") : options.format
  const sink = options.sink ?? ((entry: LogEntry) => defaultSink(entry, format))
  const redact = options.redact ?? ((_key, value) => value)
  if (!(minimum in levelOrder)) throw new Error("logger level must be debug, info, warn, or error")

  const instance: Logger = {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields)
  }

  function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (levelOrder[level] < levelOrder[minimum]) return
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(fields === undefined ? {} : { fields: redactValue(fields, redact) as Record<string, unknown> })
    }
    try {
      const result = sink(entry)
      if (result && typeof (result as Promise<void>).then === "function") void Promise.resolve(result).catch(() => undefined)
    } catch {
      // Logging must never change application behavior.
    }
  }

  return ((app: Nelysia<any, any, any>) => {
    app.decorate("logger", instance)
    const started = new WeakMap<object, number>()
    if (options.requests !== false || options.errors !== false) {
      app.onBeforeHandle((context) => { started.set(context, performance.now()) })
    }
    if (options.requests !== false) app.onAfterHandle((context, response) => {
      instance.info("request.complete", {
        method: context.request.method,
        path: context.route?.path ?? new URL(context.request.url).pathname,
        url: context.request.url,
        requestId: context.requestId,
        status: response.status,
        durationMs: Math.round((performance.now() - (started.get(context) ?? performance.now())) * 1000) / 1000
      })
    })
    if (options.errors !== false) app.onError((error, context) => {
      instance.error("request.error", {
        method: context.request.method,
        path: context.route?.path ?? new URL(context.request.url).pathname,
        url: context.request.url,
        requestId: context.requestId,
        status: typeof error === "object" && error !== null && "status" in error ? (error as { status?: number }).status : context.set.status ?? 500,
        error: error instanceof Error ? error.message : String(error)
      })
    })
    if (options.startup !== false || options.routes !== false) app.onStart((info) => {
      if (options.startup !== false) instance.info("server.started", { runtime: info.runtime, url: info.url, routeCount: app.routeDiagnostics().length })
      if (options.routes !== false) for (const route of app.routeDiagnostics()) instance.info("route.registered", route)
    })
    return app
  }) as LoggerPlugin
}

export type { Logger }

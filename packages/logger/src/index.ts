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
  colors?: boolean
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

const ansi = {
  brand: "\u001b[38;5;141m",
  dim: "\u001b[90m",
  debug: "\u001b[90m",
  info: "\u001b[36m",
  warn: "\u001b[33m",
  error: "\u001b[31;1m",
  green: "\u001b[32m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  magenta: "\u001b[35m",
  white: "\u001b[37m"
} as const

type AnsiStyle = keyof typeof ansi

function paint(value: string, style: AnsiStyle, enabled: boolean): string {
  return enabled ? `${ansi[style]}${value}\u001b[0m` : value
}

function safeText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
    `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
}

function terminalColors(level: LogLevel): boolean {
  if (typeof process === "undefined" || process.env?.NO_COLOR !== undefined) return false
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout
  return stream?.isTTY === true
}

function methodStyle(method: string): AnsiStyle {
  switch (method.toUpperCase()) {
    case "GET": return "green"
    case "POST": return "cyan"
    case "PUT": return "yellow"
    case "PATCH": return "magenta"
    case "DELETE": return "red"
    default: return "white"
  }
}

function statusStyle(status: number): AnsiStyle {
  if (status >= 500) return "red"
  if (status >= 400) return "yellow"
  if (status >= 300) return "cyan"
  if (status >= 200) return "green"
  return "dim"
}

function durationStyle(durationMs: number): AnsiStyle {
  if (durationMs > 500) return "red"
  if (durationMs > 100) return "yellow"
  return "green"
}

function prettyDetails(entry: LogEntry, colors: boolean): string {
  const fields = entry.fields
  const timestamp = paint(entry.timestamp.replace("T", " ").replace("Z", " UTC"), "dim", colors)
  if (fields === undefined) return timestamp

  if (entry.message === "request.complete" || entry.message === "request.error") {
    const parts = [timestamp]
    const method = fields.method
    const path = fields.path ?? fields.url
    if (typeof method === "string") parts.push(paint(safeText(method), methodStyle(method), colors))
    if (typeof path === "string") parts.push(safeText(path))
    if (typeof fields.status === "number") parts.push(paint(String(fields.status), statusStyle(fields.status), colors))
    if (typeof fields.durationMs === "number") {
      parts.push(paint(`${fields.durationMs}ms`, durationStyle(fields.durationMs), colors))
    }
    if (typeof fields.requestId === "string" && fields.requestId.length > 0) parts.push(paint(`id=${safeText(fields.requestId)}`, "dim", colors))
    if (entry.message === "request.error" && typeof fields.error === "string") parts.push(`-> ${safeText(fields.error)}`)
    return parts.join(" ")
  }

  if (entry.message === "server.started") {
    const parts = [timestamp]
    if (typeof fields.runtime === "string") parts.push(paint(safeText(fields.runtime), "cyan", colors))
    if (typeof fields.url === "string") parts.push(safeText(fields.url))
    if (typeof fields.routeCount === "number") parts.push(`${fields.routeCount} routes`)
    return parts.join(" ")
  }

  if (entry.message === "route.registered") {
    const parts = [timestamp]
    if (typeof fields.method === "string") parts.push(paint(safeText(fields.method), methodStyle(fields.method), colors))
    if (typeof fields.path === "string") parts.push(safeText(fields.path))
    if (typeof fields.lane === "string") parts.push(paint(`[${safeText(fields.lane)}]`, "dim", colors))
    return parts.join(" ")
  }

  return `${timestamp} ${JSON.stringify(fields)}`
}

function defaultSink(entry: LogEntry, format: "pretty" | "json", colors?: boolean): void {
  const colorOutput = format === "pretty" && (colors ?? terminalColors(entry.level))
  const brand = paint("[Nelysia]", "brand", colorOutput)
  const line = format === "json"
    ? JSON.stringify(entry)
    : `${brand} ${paint(entry.level.toUpperCase(), entry.level, colorOutput)} ${safeText(entry.message)} ${prettyDetails(entry, colorOutput)}`
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
  const sink = options.sink ?? ((entry: LogEntry) => defaultSink(entry, format, options.colors))
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

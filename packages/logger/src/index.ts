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
  sink?: (entry: LogEntry) => void | Promise<void>
  redact?: (key: string, value: unknown) => unknown
}

export type LoggerPlugin = NelysiaPlugin<{ logger: Logger }>

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const sensitiveKey = /authorization|cookie|secret|token|password|api[-_]?key/i

function defaultSink(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  if (entry.level === "error") console.error(line)
  else if (entry.level === "warn") console.warn(line)
  else console.log(line)
}

function redactValue(value: unknown, redact: (key: string, value: unknown) => unknown, key = ""): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]"
  const custom = redact(key, value)
  if (custom !== value) return custom
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redact, key))
  if (typeof value !== "object" || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) output[childKey] = redactValue(childValue, redact, childKey)
  return output
}

export function logger(options: LoggerOptions = {}): LoggerPlugin {
  const minimum = options.level ?? "info"
  const sink = options.sink ?? defaultSink
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
      if (result instanceof Promise) void result.catch(() => undefined)
    } catch {
      // Logging must never change application behavior.
    }
  }

  return ((app: Nelysia<any, any, any>) => {
    app.decorate("logger", instance)
    app.onAfterHandle((context, response) => {
      instance.info("request.complete", {
        method: context.request.method,
        url: context.request.url,
        requestId: context.requestId,
        status: response.status
      })
    })
    app.onError((error, context) => {
      instance.error("request.error", {
        method: context.request.method,
        url: context.request.url,
        requestId: context.requestId,
        error: error instanceof Error ? error.message : String(error)
      })
    })
    return app
  }) as LoggerPlugin
}

export type { Logger }

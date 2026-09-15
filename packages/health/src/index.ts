import type { NelysiaPlugin } from "../../core/src/index.ts"

export type HealthCheck = () => boolean | string | Record<string, unknown> | Promise<boolean | string | Record<string, unknown>>

export interface HealthOptions {
  path?: string
  readinessPath?: string
  checks?: Record<string, HealthCheck>
  readiness?(): boolean | Promise<boolean>
  exposeErrors?: boolean
}

export interface HealthStatus {
  status: "ok" | "degraded"
  checks: Record<string, unknown>
}

export type HealthPlugin = NelysiaPlugin

export function health(options: HealthOptions = {}): HealthPlugin {
  const path = options.path ?? "/health"
  const readinessPath = options.readinessPath ?? "/ready"
  if (!path.startsWith("/") || !readinessPath.startsWith("/")) throw new Error("health paths must start with /")
  return ((app: import("../../core/src/app.ts").Nelysia<any, any, any, any>) => {
    app.get(path, async ({ response }) => runChecks(options.checks, options.exposeErrors))
    app.get(readinessPath, async ({ response }) => {
      const ready = await options.readiness?.() ?? true
      const status = await runChecks(options.checks, options.exposeErrors)
      return ready && status.status === "ok" ? status : response(503, { status: "degraded", checks: { ...status.checks, ...(ready ? {} : { readiness: false }) } })
    })
    return app
  }) as HealthPlugin
}

async function runChecks(checks: Record<string, HealthCheck> | undefined, exposeErrors = false): Promise<HealthStatus> {
  const result: Record<string, unknown> = {}
  let healthy = true
  for (const [name, check] of Object.entries(checks ?? {})) {
    try {
      const value = await check()
      result[name] = value
      if (value === false || (typeof value === "object" && value !== null && "ok" in value && (value as { ok?: unknown }).ok === false)) healthy = false
    } catch (error) {
      healthy = false
      result[name] = exposeErrors ? { ok: false, error: error instanceof Error ? error.message : String(error) } : { ok: false }
    }
  }
  return { status: healthy ? "ok" : "degraded", checks: result }
}

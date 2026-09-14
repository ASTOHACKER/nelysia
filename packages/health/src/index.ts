import type { NelysiaPlugin } from "../../core/src/index.ts"

export type HealthCheck = () => boolean | string | Record<string, unknown> | Promise<boolean | string | Record<string, unknown>>

export interface HealthOptions {
  path?: string
  readinessPath?: string
  checks?: Record<string, HealthCheck>
  readiness?(): boolean | Promise<boolean>
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
    app.get(path, async ({ response }) => runChecks(options.checks))
    app.get(readinessPath, async ({ response }) => {
      const ready = await options.readiness?.() ?? true
      return ready ? runChecks(options.checks) : response(503, { status: "degraded", checks: { readiness: false } })
    })
    return app
  }) as HealthPlugin
}

async function runChecks(checks: Record<string, HealthCheck> | undefined): Promise<HealthStatus> {
  const result: Record<string, unknown> = {}
  let healthy = true
  for (const [name, check] of Object.entries(checks ?? {})) {
    try {
      const value = await check()
      result[name] = value
      if (value === false) healthy = false
    } catch (error) {
      healthy = false
      result[name] = { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { status: healthy ? "ok" : "degraded", checks: result }
}

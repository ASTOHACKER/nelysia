import type { Context, Nelysia, NelysiaPlugin, RouteExecutionControl } from "../../core/src/index.ts"

export interface TimeoutOptions {
  timeoutMs?: number
  status?: number
  message?: string
}

export type TimeoutPlugin = NelysiaPlugin

export function timeout(options: TimeoutOptions = {}): TimeoutPlugin {
  const timeoutMs = options.timeoutMs ?? 30_000
  const status = options.status ?? 504
  const message = options.message ?? "Request timed out"
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeout timeoutMs must be positive")
  if (!Number.isInteger(status) || status < 400 || status > 599) throw new Error("timeout status must be an HTTP error status")

  const apply = (config: TimeoutOptions) => (context: Context) => {
    const effectiveTimeout = config.timeoutMs ?? timeoutMs
    const effectiveStatus = config.status ?? status
    const effectiveMessage = config.message ?? message
    if (!Number.isFinite(effectiveTimeout) || effectiveTimeout <= 0) throw new Error("timeout timeoutMs must be positive")
    if (!Number.isInteger(effectiveStatus) || effectiveStatus < 400 || effectiveStatus > 599) throw new Error("timeout status must be an HTTP error status")
    const controller = new AbortController()
    const parentSignal = context.signal
    const abortFromParent = () => controller.abort(parentSignal.reason)
    if (parentSignal.aborted) abortFromParent()
    else parentSignal.addEventListener("abort", abortFromParent, { once: true })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutResponse = context.response(effectiveStatus, { error: "Request Timeout", message: effectiveMessage })
    const timeoutPromise = new Promise<unknown>((resolve) => {
      timer = setTimeout(() => {
        controller.abort(new Error(effectiveMessage))
        resolve(timeoutResponse)
      }, effectiveTimeout)
    })

    const control: RouteExecutionControl = {
      signal: controller.signal,
      invoke(handler) {
        return Promise.race([Promise.resolve().then(handler), timeoutPromise])
      },
      cleanup() {
        if (timer !== undefined) clearTimeout(timer)
        parentSignal.removeEventListener("abort", abortFromParent)
      }
    }
    context.signal = controller.signal
    context.executionControl = control
  }
  return ((app: Nelysia<any, any, any>) => {
    app.registerRouteFeature("timeout", {
      beforeHandle(value) { return apply(typeof value === "number" ? { timeoutMs: value } : value as TimeoutOptions) }
    })
    return app.onBeforeHandle((context) => {
      if (context.route?.features.timeout !== undefined) return
      return apply(options)(context)
    })
  }) as TimeoutPlugin
}

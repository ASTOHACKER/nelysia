import type { Nelysia, NelysiaPlugin, RouteExecutionControl } from "../../core/src/index.ts"

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

  return ((app: Nelysia<any, any, any>) => app.onBeforeHandle((context) => {
    const controller = new AbortController()
    const parentSignal = context.signal
    const abortFromParent = () => controller.abort(parentSignal.reason)
    if (parentSignal.aborted) abortFromParent()
    else parentSignal.addEventListener("abort", abortFromParent, { once: true })

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutResponse = context.response(status, { error: "Request Timeout", message })
    const timeoutPromise = new Promise<unknown>((resolve) => {
      timer = setTimeout(() => {
        controller.abort(new Error(message))
        resolve(timeoutResponse)
      }, timeoutMs)
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
  })) as TimeoutPlugin
}

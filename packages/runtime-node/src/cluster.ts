import cluster from "node:cluster"
import { availableParallelism } from "node:os"
import type { Server } from "node:http"
import { type Nelysia } from "../../core/src/app.ts"
import { createNodeServer } from "./server.ts"

export interface ClusterOptions {
  /** Port every worker listens on (shared by the OS across workers). */
  port: number
  /** Worker count. Defaults to the machine's available parallelism. */
  workers?: number
  /** Fork a replacement when a worker dies. Defaults to true. */
  respawn?: boolean
}

/**
 * Multi-process Node server: the primary forks `workers` processes and every
 * worker serves the same app (each builds its own instance via `createApp`,
 * so every worker gets its own compiled dispatcher).
 *
 * Returns the worker's `Server`, or `undefined` in the primary process.
 *
 * ```ts
 * import { serveClustered } from "@narudom96/nelysia/runtime-node-cluster"
 * import { Nelysia } from "@narudom96/nelysia"
 *
 * serveClustered(() => new Nelysia({ requestId: false }).get("/json", () => ({ ok: true })), {
 *   port: 3000,
 * })
 * ```
 */
export function serveClustered(createApp: () => Nelysia<any, any, any>, options: ClusterOptions): Server | undefined {
  if (cluster.isPrimary) {
    const count = Math.max(1, options.workers ?? availableParallelism())
    for (let i = 0; i < count; i++) cluster.fork()
    if (options.respawn ?? true) cluster.on("exit", () => cluster.fork())
    return undefined
  }
  const server = createNodeServer(createApp()).listen(options.port, () => {
    const address = server.address()
    process.send?.({ nelysiaWorkerListening: true, port: address && typeof address === "object" ? address.port : options.port })
  })
  return server
}

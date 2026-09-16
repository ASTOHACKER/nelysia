import cluster from "node:cluster"
import { Nelysia } from "@narudom96/nelysia"
import { serveClustered } from "@narudom96/nelysia/runtime-node-cluster"

// Smoke entry for multi-process serving (used by tests; not a library API).
// PORT=0 picks an ephemeral port per worker; WORKERS controls fork count.
const server = serveClustered(
  () => new Nelysia({ requestId: false }).get("/json", () => ({ ok: true })),
  {
    port: Number(process.env.PORT ?? 4321),
    workers: Number(process.env.WORKERS ?? 1),
    respawn: false,
  },
)

if (server === undefined) {
  cluster.on("message", (_worker, message) => {
    const port = (message as { nelysiaWorkerListening?: boolean; port?: number } | undefined)?.port
    if ((message as { nelysiaWorkerListening?: boolean } | undefined)?.nelysiaWorkerListening) {
      console.log(`ready:${port}`)
    }
  })
}

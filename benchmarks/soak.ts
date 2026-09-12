import { Nelysia } from "../packages/core/src/index.ts"

const iterations = Number(process.env.SOAK_ITERATIONS ?? 10_000)
const app = new Nelysia().get("/health", ({ requestId }) => ({ ok: true, requestId }))
const before = process.memoryUsage().heapUsed
const started = performance.now()
let failures = 0

for (let index = 0; index < iterations; index++) {
  const response = await app.handle({ method: "GET", url: "/health" })
  if (response.status !== 200 || (response.body as { ok?: boolean }).ok !== true) failures++
}

const elapsed = performance.now() - started
const after = process.memoryUsage().heapUsed
const requestsPerSecond = Math.round(iterations / (elapsed / 1000))
const heapDeltaMb = ((after - before) / 1024 / 1024).toFixed(2)

console.log(JSON.stringify({ iterations, failures, elapsedMs: Number(elapsed.toFixed(2)), requestsPerSecond, heapDeltaMb }))
if (failures > 0) process.exitCode = 1

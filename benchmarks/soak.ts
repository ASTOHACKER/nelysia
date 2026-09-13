import { Nelysia } from "../packages/core/src/index.ts"

// Memory/soak runner: hammers static + dynamic routes and reports heap/RSS drift.
// Defaults stay fast for `npm run release:check`; raise SOAK_ITERATIONS for
// longer runs (e.g. SOAK_ITERATIONS=1000000 for a multi-minute soak).
const iterations = Number(process.env.SOAK_ITERATIONS ?? 10_000)
const routeCount = Number(process.env.SOAK_ROUTES ?? 200)

const app = new Nelysia().get("/health", ({ requestId }) => ({ ok: true, requestId }))
const big = new Nelysia({ requestId: false })
for (let i = 0; i < routeCount; i++) big.get(`/s${i}`, () => "ok")
for (let i = 0; i < routeCount; i++) big.get(`/u${i}/:id`, ({ params }) => params.id)

const heapBefore = process.memoryUsage().heapUsed
const rssBefore = process.memoryUsage().rss
const started = performance.now()
let failures = 0

for (let index = 0; index < iterations; index++) {
  const response = await app.handle({ method: "GET", url: "/health" })
  if (response.status !== 200 || (response.body as { ok?: boolean }).ok !== true) failures++
  const dynamic = await big.handle({ method: "GET", url: `/u${routeCount - 1}/42` })
  if (dynamic.status !== 200 || dynamic.body !== "42") failures++
}

const elapsed = performance.now() - started
const heapAfter = process.memoryUsage().heapUsed
const rssAfter = process.memoryUsage().rss
const requestsPerSecond = Math.round((iterations * 2) / (elapsed / 1000))
const heapDeltaMb = ((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)
const rssDeltaMb = ((rssAfter - rssBefore) / 1024 / 1024).toFixed(2)

console.log(JSON.stringify({ iterations: iterations * 2, failures, elapsedMs: Number(elapsed.toFixed(2)), requestsPerSecond, heapDeltaMb, rssDeltaMb }))
if (failures > 0) process.exitCode = 1

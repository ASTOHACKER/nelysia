import { Nelysia } from "../packages/core/src/index.ts"

// Memory/soak runner: hammers static + dynamic routes and reports heap/RSS drift.
// Defaults stay fast for `npm run release:check`; use SOAK_REQUESTS for exact
// request-count gates or SOAK_DURATION_MS for a time-based production run.
const iterations = Number(process.env.SOAK_ITERATIONS ?? 10_000)
const requestTarget = process.env.SOAK_REQUESTS === undefined ? iterations * 2 : Number(process.env.SOAK_REQUESTS)
const durationTarget = process.env.SOAK_DURATION_MS === undefined ? undefined : Number(process.env.SOAK_DURATION_MS)
const sampleEvery = Number(process.env.SOAK_SAMPLE_EVERY ?? 100_000)
const routeCount = Number(process.env.SOAK_ROUTES ?? 200)

const app = new Nelysia().get("/health", ({ requestId }) => ({ ok: true, requestId }))
const big = new Nelysia({ requestId: false })
for (let i = 0; i < routeCount; i++) big.get(`/s${i}`, () => "ok")
for (let i = 0; i < routeCount; i++) big.get(`/u${i}/:id`, ({ params }) => params.id)

const heapBefore = process.memoryUsage().heapUsed
const rssBefore = process.memoryUsage().rss
const started = performance.now()
let failures = 0
let runtimeErrors = 0
const memorySamples: Array<{ requests: number; heapUsed: number; rss: number }> = []
process.on("uncaughtException", (error) => {
  runtimeErrors++
  console.error("uncaughtException:", error)
  process.exitCode = 1
})
process.on("unhandledRejection", (error) => {
  runtimeErrors++
  console.error("unhandledRejection:", error)
  process.exitCode = 1
})

let requests = 0
let nextSample = sampleEvery
while (requests < requestTarget && (durationTarget === undefined || performance.now() - started < durationTarget)) {
  const response = await app.handle({ method: "GET", url: "/health" })
  if (response.status !== 200 || (response.body as { ok?: boolean }).ok !== true) failures++
  requests++
  if (requests >= requestTarget || (durationTarget !== undefined && performance.now() - started >= durationTarget)) break
  const dynamic = await big.handle({ method: "GET", url: `/u${routeCount - 1}/42` })
  if (dynamic.status !== 200 || dynamic.body !== "42") failures++
  requests++
  if (requests >= nextSample) {
    const usage = process.memoryUsage()
    memorySamples.push({ requests, heapUsed: usage.heapUsed, rss: usage.rss })
    nextSample += sampleEvery
  }
}

const elapsed = performance.now() - started
const heapAfter = process.memoryUsage().heapUsed
const rssAfter = process.memoryUsage().rss
const requestsPerSecond = Math.round(requests / (elapsed / 1000))
const heapDeltaMb = ((heapAfter - heapBefore) / 1024 / 1024).toFixed(2)
const rssDeltaMb = ((rssAfter - rssBefore) / 1024 / 1024).toFixed(2)

console.log(JSON.stringify({ iterations: requests, requests, failures, runtimeErrors, elapsedMs: Number(elapsed.toFixed(2)), requestsPerSecond, heapDeltaMb, rssDeltaMb, memorySamples }))
if (failures > 0 || runtimeErrors > 0 || (durationTarget !== undefined && requests === 0)) process.exitCode = 1

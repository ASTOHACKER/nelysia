import { createNodeServer } from "../packages/runtime-node/src/server.ts"
import { Nelysia } from "../packages/core/src/index.ts"
import { cpus, platform, release, totalmem } from "node:os"

/**
 * Runtime contract gate for the roadmap. It deliberately exercises both
 * entrypoints that a release can ship: zero-port `app.inject()` and the real
 * Node adapter started on an ephemeral port. The burst sizes are configurable
 * for local iteration, but the default set matches the roadmap evidence gate.
 */
const fuzzCases = positiveInteger(process.env.RUNTIME_FUZZ_CASES ?? "1000", "RUNTIME_FUZZ_CASES")
const burstTargets = (process.env.RUNTIME_BURSTS ?? "10000,50000,100000")
  .split(",")
  .map((value) => positiveInteger(value.trim(), "RUNTIME_BURSTS"))

const app = new Nelysia({ requestId: false })
  .get("/static", () => "ok")
  .get("/users/:id", ({ params }) => ({ id: params.id }))

const report: {
  generatedAt: string
  node: string
  platform: string
  cpu: string | undefined
  cpuCount: number
  memoryGb: number
  requestIdPolicy: string
  fuzzCases: number
  burstTargets: number[]
  fuzz: { failures: number; statusMismatches: number; injectMs: number; networkMs: number; routeMix: Record<string, number> }
  bursts: Array<{ requests: number; failures: number; elapsedMs: number; requestsPerSecond: number; heapBeforeKb: number; heapAfterKb: number; rssBeforeKb: number; rssAfterKb: number }>
  runtimeErrors: number
  processExit: "success" | "failure"
} = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model,
  cpuCount: cpus().length,
  memoryGb: Number((totalmem() / 1024 ** 3).toFixed(2)),
  requestIdPolicy: "disabled for deterministic response comparison",
  fuzzCases,
  burstTargets,
  fuzz: { failures: 0, statusMismatches: 0, injectMs: 0, networkMs: 0, routeMix: {} },
  bursts: [],
  runtimeErrors: 0,
  processExit: "failure"
}

const injectStarted = performance.now()
const expected = await app.injectUntyped({ method: "GET", path: "/static" })
if (expected.status !== 200 || await expected.text() !== "ok") report.fuzz.failures++
report.fuzz.injectMs = Number((performance.now() - injectStarted).toFixed(2))

const server = createNodeServer(app)
const serverError = (error: unknown) => {
  report.runtimeErrors++
  console.error("runtime error:", error)
}
process.on("uncaughtException", serverError)
process.on("unhandledRejection", serverError)

try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("runtime contract server did not expose an ephemeral port")
  const baseUrl = `http://127.0.0.1:${address.port}`

  const networkStarted = performance.now()
  for (let index = 0; index < fuzzCases; index++) {
    const path = fuzzPath(index)
    const route = path.startsWith("/static") ? "static" : path.startsWith("/users/") && path.split("/").length === 3 ? "dynamic" : "404"
    report.fuzz.routeMix[route] = (report.fuzz.routeMix[route] ?? 0) + 1
    const injected = await app.injectUntyped({ method: "GET", path })
    const network = await fetch(baseUrl + path)
    const injectedBody = await injected.text()
    const networkBody = await network.text()
    if (injected.status !== network.status) report.fuzz.statusMismatches++
    if (injected.status !== network.status || injectedBody !== networkBody) report.fuzz.failures++
  }
  report.fuzz.networkMs = Number((performance.now() - networkStarted).toFixed(2))

  for (const target of burstTargets) {
    const before = process.memoryUsage()
    const started = performance.now()
    let failures = 0
    for (let index = 0; index < target; index++) {
      const response = await app.injectUntyped({ method: "GET", path: index % 2 === 0 ? "/static" : `/users/${index}` })
      if (response.status !== 200) failures++
    }
    const elapsedMs = performance.now() - started
    const after = process.memoryUsage()
    report.bursts.push({
      requests: target,
      failures,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      requestsPerSecond: Math.round(target / (elapsedMs / 1000)),
      heapBeforeKb: Math.round(before.heapUsed / 1024),
      heapAfterKb: Math.round(after.heapUsed / 1024),
      rssBeforeKb: Math.round(before.rss / 1024),
      rssAfterKb: Math.round(after.rss / 1024)
    })
  }
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  process.removeListener("uncaughtException", serverError)
  process.removeListener("unhandledRejection", serverError)
}

report.processExit = report.fuzz.failures > 0 || report.bursts.some((burst) => burst.failures > 0) || report.runtimeErrors > 0 ? "failure" : "success"
console.log(JSON.stringify(report, null, 2))
if (report.processExit === "failure") process.exitCode = 1

function fuzzPath(index: number): string {
  switch (index % 6) {
    case 0: return "/static"
    case 1: return "/static/"
    case 2: return `/users/${encodeURIComponent(`user-${index}`)}`
    case 3: return `/users/${encodeURIComponent(`slash/${index}`)}`
    case 4: return `/missing/${index}`
    default: return `/users/a/${index}`
  }
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must contain positive integers`)
  return parsed
}

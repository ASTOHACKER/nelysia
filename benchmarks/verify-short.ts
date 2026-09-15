import { Nelysia, t } from "../packages/core/src/index.ts"
import { jwt, signJwt } from "../packages/jwt/src/index.ts"
import { cpus, platform, release, totalmem } from "node:os"
import { readFile } from "node:fs/promises"

type WorkloadName = "static" | "params" | "query" | "body" | "schema" | "jwt" | "hooks" | "combined"
interface Workload {
  name: WorkloadName
  request(): { method: string; url: string; headers?: Headers; body?: unknown }
  app: Nelysia<any, any, any>
}

const warmupMs = Number(process.env.VERIFY_WARMUP_MS ?? 2500)
const durationMs = Number(process.env.VERIFY_DURATION_MS ?? 5000)
const repeats = Number(process.env.VERIFY_REPEATS ?? 3)
const concurrency = Number(process.env.VERIFY_CONCURRENCY ?? 50)
const routeCounts = (process.env.VERIFY_ROUTE_COUNTS ?? "1,10,100,500").split(",").map(Number).filter((value) => Number.isInteger(value) && value > 0)
const baselinePath = process.env.VERIFY_BASELINE

interface BaselineSample {
  routeCount: number
  workload: WorkloadName
  medianRps: number
}

interface RegressionResult {
  routeCount: number
  workload: WorkloadName
  baselineRps: number
  currentRps: number
  dropPercent: number
  status: "pass" | "investigate" | "block"
}

const baseline = await loadBaseline(baselinePath)
const regressions: RegressionResult[] = []

if (![warmupMs, durationMs, repeats, concurrency].every((value) => Number.isFinite(value) && value > 0)) throw new Error("verification timing values must be positive")

const results: Record<string, unknown>[] = []
for (const routeCount of routeCounts) {
  for (const workload of await createWorkloads(routeCount)) {
    const samples: number[] = []
    const latencies: number[] = []
    let failures = 0
    for (let repeat = 0; repeat < repeats; repeat++) {
      await runFor(workload, warmupMs, concurrency, false, latencies)
      const before = process.memoryUsage()
      const sample = await runFor(workload, durationMs, concurrency, true, latencies)
      const after = process.memoryUsage()
      samples.push(sample.requests / (durationMs / 1000))
      failures += sample.failures
      results.push({
        routeCount,
        workload: workload.name,
        repeat: repeat + 1,
        requests: sample.requests,
        failures: sample.failures,
        rps: Math.round(sample.requests / (durationMs / 1000)),
        rssBeforeKb: Math.round(before.rss / 1024),
        rssAfterKb: Math.round(after.rss / 1024),
        heapBeforeKb: Math.round(before.heapUsed / 1024),
        heapAfterKb: Math.round(after.heapUsed / 1024)
      })
    }
    samples.sort((left, right) => left - right)
    const median = samples[Math.floor(samples.length / 2)] ?? 0
    const relevantLatencies = latencies.slice().sort((left, right) => left - right)
    const medianRps = Math.round(median)
    const baselineRps = baseline.get(`${routeCount}:${workload.name}`)
    if (baselineRps !== undefined && baselineRps > 0) {
      const dropPercent = Number(Math.max(0, ((baselineRps - medianRps) / baselineRps) * 100).toFixed(2))
      const status = dropPercent > 5 ? "block" : dropPercent > 2 ? "investigate" : "pass"
      regressions.push({ routeCount, workload: workload.name, baselineRps, currentRps: medianRps, dropPercent, status })
    }
    console.log(JSON.stringify({
      routeCount,
      workload: workload.name,
      medianRps,
      minRps: Math.round(samples[0] ?? 0),
      maxRps: Math.round(samples.at(-1) ?? 0),
      p95Ms: percentile(relevantLatencies, 0.95),
      p99Ms: percentile(relevantLatencies, 0.99),
      failures,
      warmupMs,
      durationMs,
      repeats,
      concurrency
    }))
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  runtime: typeof Bun === "undefined" ? "node" : `bun ${Bun.version}`,
  platform: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model,
  cpuCount: cpus().length,
  memoryGb: Number((totalmem() / 1024 ** 3).toFixed(2)),
  warmupMs,
  durationMs,
  repeats,
  concurrency,
  routeCounts,
  samples: results,
  ...(baselinePath === undefined ? {} : { baselinePath, regressions })
}
console.error(JSON.stringify(output))
if (results.some((result) => result.failures !== 0) || regressions.some((result) => result.status === "block")) process.exitCode = 1

async function runFor(workload: Workload, duration: number, workers: number, countFailures: boolean, latencies: number[]): Promise<{ requests: number; failures: number }> {
  const end = performance.now() + duration
  let requests = 0
  let failures = 0
  const jobs = Array.from({ length: workers }, async () => {
    while (performance.now() < end) {
      const started = performance.now()
      try {
        const response = await workload.app.handle(workload.request())
        if (response.status !== 200) failures++
        else requests++
      } catch {
        failures++
      }
      if (countFailures && latencies.length < 10_000) latencies.push(performance.now() - started)
    }
  })
  await Promise.all(jobs)
  return { requests, failures }
}

async function createWorkloads(routeCount: number): Promise<Workload[]> {
  const staticApp = withExtraRoutes(new Nelysia({ requestId: false }).get("/static", () => ({ ok: true })), routeCount)
  const paramsApp = withExtraRoutes(new Nelysia({ requestId: false }).get("/users/:id", ({ params }) => ({ id: params.id })), routeCount)
  const queryApp = withExtraRoutes(new Nelysia({ requestId: false }).get("/query", ({ query }) => ({ value: query.value })), routeCount)
  const bodyApp = withExtraRoutes(new Nelysia({ requestId: false }).post("/body", ({ body }) => body), routeCount)
  const schemaApp = withExtraRoutes(new Nelysia({ requestId: false }).get("/schema", ({ query }) => ({ value: query.value }), { query: t.Object({ value: t.String() }) }), routeCount)
  const secret = "short-verification-secret-123456"
  const jwtApp = withExtraRoutes(new Nelysia({ requestId: false }).use(jwt<{ sub: string }>({ secret })).get("/jwt", ({ auth }) => ({ sub: auth.sub }), { auth: "jwt" }), routeCount)
  const hooksApp = withExtraRoutes(new Nelysia({ requestId: false }).onBeforeHandle(() => undefined).get("/hooks", () => ({ ok: true })), routeCount)
  const combinedApp = withExtraRoutes(new Nelysia({ requestId: false }).use(jwt<{ sub: string }>({ secret })).onBeforeHandle(() => undefined).get("/combined", ({ auth, query }) => ({ sub: auth.sub, value: query.value }), { auth: "jwt", query: t.Object({ value: t.String() }) }), routeCount)
  const jwtToken = await signJwt({ sub: "benchmark" }, secret)

  return [
    { name: "static", app: staticApp, request: () => ({ method: "GET", url: "/static" }) },
    { name: "params", app: paramsApp, request: () => ({ method: "GET", url: "/users/42" }) },
    { name: "query", app: queryApp, request: () => ({ method: "GET", url: "/query?value=ok" }) },
    { name: "body", app: bodyApp, request: () => ({ method: "POST", url: "/body", body: { value: "ok" } }) },
    { name: "schema", app: schemaApp, request: () => ({ method: "GET", url: "/schema?value=ok" }) },
    { name: "jwt", app: jwtApp, request: () => ({ method: "GET", url: "/jwt", headers: new Headers({ authorization: `Bearer ${jwtToken}` }) }) },
    { name: "hooks", app: hooksApp, request: () => ({ method: "GET", url: "/hooks" }) },
    { name: "combined", app: combinedApp, request: () => ({ method: "GET", url: "/combined?value=ok", headers: new Headers({ authorization: `Bearer ${jwtToken}` }) }) }
  ]
}

function withExtraRoutes(app: Nelysia<any, any, any>, routeCount: number): Nelysia<any, any, any> {
  for (let index = 1; index < routeCount; index++) app.get(`/extra-${index}`, () => "ok")
  return app
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  return Number((values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? 0).toFixed(3))
}

async function loadBaseline(path: string | undefined): Promise<Map<string, number>> {
  if (path === undefined) return new Map()
  const parsed = JSON.parse(await readFile(path, "utf8")) as { samples?: unknown } | unknown[]
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.samples) ? parsed.samples : []
  const output = new Map<string, number>()
  for (const value of rows) {
    if (typeof value !== "object" || value === null) continue
    const row = value as Partial<BaselineSample>
    if (Number.isInteger(row.routeCount) && typeof row.workload === "string" && typeof row.medianRps === "number" && Number.isFinite(row.medianRps)) {
      output.set(`${row.routeCount}:${row.workload}`, row.medianRps)
    }
  }
  if (output.size === 0) throw new Error(`Benchmark baseline ${path} has no usable routeCount/workload/medianRps samples`)
  return output
}

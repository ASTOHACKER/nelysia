import { Nelysia } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { Elysia } from "elysia"

const durationMs = Number(process.env.BENCH_DURATION_MS ?? 5000)
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 20)
const repeats = Number(process.env.BENCH_REPEATS ?? 3)
const routePath = process.env.BENCH_CASE === "dynamic" ? "/users/:id" : "/json"
const requestPath = process.env.BENCH_CASE === "dynamic" ? "/users/42" : "/json"
const nelysiaLabel = routePath === "/json" ? "nelysia-bun-static-compiled" : "nelysia-bun-params-compiled"

for (const framework of ["raw-bun", nelysiaLabel, "elysia-bun"]) {
  const results: BenchResult[] = []
  for (let repeat = 0; repeat < repeats; repeat++) {
    if (framework === "elysia-bun") {
      const app = new Elysia().get(routePath, (context: { params?: Record<string, string> }) => routePath === "/json" ? { message: "hello", value: 42 } : { id: context.params?.id ?? "42" }).listen(0)
      const port = app.server?.port
      if (!port) throw new Error("Elysia did not expose a listening port")
      results.push(await benchmark(port, () => app.stop()))
      continue
    }
    const app = new Nelysia()
    if (routePath === "/json") app.getStatic(routePath, { message: "hello", value: 42 })
    else app.get(routePath, ({ params }) => ({ id: params.id }))
    const handler = framework === "raw-bun"
      ? async () => new Response('{"message":"hello","value":42}', { headers: { "content-type": "application/json" } })
      : createCompiledBunHandler(app)
    const server = Bun.serve({ port: 0, fetch: handler })
    results.push(await benchmark(server.port, () => server.stop()))
  }
  const throughput = results.map((result) => result.requestsPerSecond).sort((a, b) => a - b)
  const latencies = results.map((result) => result.averageLatency).sort((a, b) => a - b)
  console.log(`${framework}\tmedian ${median(throughput).toFixed(0)} req/s\tmedian avg latency ${median(latencies).toFixed(2)} ms\tp95 latency ${percentile(results.map((result) => result.p95Latency), 0.5).toFixed(2)} ms\tfailures ${results.reduce((sum, result) => sum + result.failures, 0)}\tsamples ${results.map((result) => result.requestsPerSecond.toFixed(0)).join(",")}`)
}

interface BenchResult {
  requestsPerSecond: number
  averageLatency: number
  p95Latency: number
  failures: number
}

async function benchmark(port: number, stop: () => void): Promise<BenchResult> {
  await waitUntilReady(port)
  const warmupEnd = performance.now() + 1000
  while (performance.now() < warmupEnd) {
    const response = await fetch(`http://127.0.0.1:${port}${requestPath}`)
    await response.arrayBuffer()
  }
  const end = performance.now() + durationMs
  let requests = 0
  let failures = 0
  let latencyTotal = 0
  const latencies: number[] = []
  const workers = Array.from({ length: concurrency }, async () => {
    while (performance.now() < end) {
      const started = performance.now()
      try {
        const response = await fetch(`http://127.0.0.1:${port}${requestPath}`)
        await response.arrayBuffer()
        if (!response.ok) failures++
        else {
          requests++
          const latency = performance.now() - started
          latencyTotal += latency
          latencies.push(latency)
        }
      } catch {
        failures++
      }
    }
  })
  await Promise.all(workers)
  stop()
  return {
    requestsPerSecond: requests / (durationMs / 1000),
    averageLatency: latencyTotal / Math.max(requests, 1),
    p95Latency: percentile(latencies.sort((a, b) => a - b), 0.95),
    failures
  }
}

function median(values: number[]): number {
  return percentile(values, 0.5)
}

async function waitUntilReady(port: number): Promise<void> {
  const deadline = performance.now() + 5000
  while (true) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${requestPath}`)
      await response.arrayBuffer()
      return
    } catch {
      if (performance.now() > deadline) throw new Error(`benchmark server on ${port} did not become ready`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

function percentile(values: number[], rank: number): number {
  if (values.length === 0) return 0
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * rank))]
}

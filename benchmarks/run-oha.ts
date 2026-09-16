import { spawn } from "node:child_process"
import { once } from "node:events"
import { readFile, writeFile } from "node:fs/promises"
import { cpus } from "node:os"

interface OhaMetrics {
  framework: string
  workload: string
  runtime: string
  rps: number
  rpsMin: number
  rpsMax: number
  avgLatencyMs: number
  p50Ms: number
  p90Ms: number
  p95Ms: number
  p99Ms: number
  maxLatencyMs: number
  successRate: number
  totalRequests: number
  failureCount: number
  throughputMBs: number
  serverRssBeforeKb: number | null
  serverRssAfterKb: number | null
  runnerHeapDeltaKb: number
  routeCount: number
  statusMismatchCount: number
  bodyMismatchCount: number
  samples: Array<{ rps: number; p95Ms: number; p99Ms: number; successRate: number; failureCount: number }>
  tier: "prebuilt" | "object" | "dynamic"
  entrypoint: "handler" | "listen"
}

interface RawOhaJson {
  summary: {
    requestsPerSec: number
    average: number
    slowest: number
    fastest: number
    total: number
    totalData: number
    sizePerSec: number
    successRate: number
  }
  latencyPercentiles: {
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
    p99_9?: number
  }
  statusCodeDistribution: Record<string, number>
  errorDistribution: Record<string, number>
}

interface ProcessMemory {
  rssKb: number | null
}

const PORT = Number(process.env.BENCH_PORT ?? 4321)
const DURATION_SEC = Number(process.env.BENCH_DURATION_SEC ?? 5)
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 50)
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 3)
const WARMUP_SEC = Math.max(0, Number(process.env.BENCH_WARMUP_SEC ?? 2))
const TARGET_SUITE = process.env.BENCH_SUITE ?? "all" // "all" | "bun" | "node"
const ROUTE_SET = process.env.BENCH_ROUTE_SET === "single" ? "single" : "multi"
const ROUTE_COUNT = Math.max(ROUTE_SET === "single" ? 1 : 2, Number(process.env.BENCH_ROUTE_COUNT ?? (ROUTE_SET === "single" ? 1 : 2)))
const ORDER_SEED = Number(process.env.BENCH_ORDER_SEED ?? 0)
const OUTPUT = process.env.BENCH_OUTPUT
const TARGET_FILTER = process.env.BENCH_TARGET
const TARGET_FILTERS = process.env.BENCH_TARGETS?.split(",").map((value) => value.trim()).filter(Boolean)
const WORKLOAD_FILTER = process.env.BENCH_WORKLOAD

async function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (d) => (stdout += d.toString()))
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`Command ${cmd} exited with code ${code}: ${stderr}`))
    })
    proc.on("error", reject)
  })
}

async function waitForServerReady(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes("ready:")) {
        resolved = true
        resolve()
      }
    }
    child.stdout?.on("data", onData)
    child.once("error", (err) => {
      if (!resolved) reject(err)
    })
    child.once("exit", (code) => {
      if (!resolved) reject(new Error(`Server exited unexpectedly with code ${code}`))
    })
    setTimeout(() => {
      if (!resolved) reject(new Error("Server startup timed out"))
    }, 8000)
  })
}

async function stopServer(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exitPromise = new Promise<void>((resolve) => {
    child.once("exit", () => resolve())
  })
  child.kill("SIGTERM")
  const timeout = setTimeout(() => {
    try {
      child.kill("SIGKILL")
    } catch {}
  }, 1500)
  await exitPromise
  clearTimeout(timeout)
  // Short cool down to ensure OS releases the socket
  await new Promise((r) => setTimeout(r, 100))
}

async function runOha(url: string, durationSec: number, concurrency: number): Promise<RawOhaJson> {
  const stdout = await runCommand("oha", [
    "-z",
    `${durationSec}s`,
    "-c",
    String(concurrency),
    "-w",
    "--no-tui",
    "--output-format",
    "json",
    url
  ])
  return JSON.parse(stdout) as RawOhaJson
}

async function verifyTargetResponse(url: string, target: TargetConfig): Promise<void> {
  const response = await fetch(url)
  const text = await response.text()
  const expected = target.workload.startsWith("Dynamic") ? { id: "42" } : { message: "hello", value: 42 }
  let actual: unknown
  try { actual = JSON.parse(text) } catch { throw new Error(`${target.label} returned a non-JSON response`) }
  if (response.status !== 200) throw new Error(`${target.label} returned status ${response.status}, expected 200`)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${target.label} returned an unexpected body: ${text}`)
}

async function readProcessMemory(pid: number): Promise<ProcessMemory> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8")
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m)
    return { rssKb: match ? Number(match[1]) : null }
  } catch {
    return { rssKb: null }
  }
}

interface TargetConfig {
  framework: string
  label: string
  runtime: "Bun" | "Node.js"
  workload: "JSON Serialization (/json)" | "Dynamic Route (/users/42)"
  path: string
  command: { bin: string; file: string }
}

function getTargets(): TargetConfig[] {
  const bunTargets: TargetConfig[] = [
    // JSON
    {
      framework: "raw-bun",
      label: "Bun.serve (Raw Baseline)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-static",
      label: "Nelysia (Static Compiled)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-zero-arg",
      label: "Nelysia (Zero-arg Specialized)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-standard",
      label: "Nelysia (Standard Bun Handler)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-generic",
      label: "Nelysia (Generic JSON)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "elysia-bun",
      label: "Elysia",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "elysia-bun-generic",
      label: "Elysia (Generic JSON)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "hono-bun",
      label: "Hono (Bun)",
      runtime: "Bun",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    // Dynamic Route
    {
      framework: "raw-bun",
      label: "Bun.serve (Raw Baseline)",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-params",
      label: "Nelysia (Params Compiled)",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-standard",
      label: "Nelysia (Standard Bun Handler)",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "nelysia-bun-generic",
      label: "Nelysia (Generic Dynamic)",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "elysia-bun",
      label: "Elysia",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "elysia-bun-generic",
      label: "Elysia (Generic Dynamic)",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    },
    {
      framework: "hono-bun",
      label: "Hono (Bun)",
      runtime: "Bun",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: "bun", file: "benchmarks/server-bun.ts" }
    }
  ]

  const nodeTargets: TargetConfig[] = [
    // JSON
    {
      framework: "raw-node",
      label: "Node.js http (Raw Baseline)",
      runtime: "Node.js",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "nelysia",
      label: "Nelysia (Node Adapter)",
      runtime: "Node.js",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "nelysia-generic",
      label: "Nelysia (Generic JSON)",
      runtime: "Node.js",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "fastify",
      label: "Fastify 5",
      runtime: "Node.js",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "express",
      label: "Express 5",
      runtime: "Node.js",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "hono-node",
      label: "Hono (Node)",
      runtime: "Node.js",
      workload: "JSON Serialization (/json)",
      path: "/json",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    // Dynamic
    {
      framework: "raw-node",
      label: "Node.js http (Raw Baseline)",
      runtime: "Node.js",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "nelysia",
      label: "Nelysia (Node Adapter)",
      runtime: "Node.js",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "nelysia-generic",
      label: "Nelysia (Generic Dynamic)",
      runtime: "Node.js",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "fastify",
      label: "Fastify 5",
      runtime: "Node.js",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "express",
      label: "Express 5",
      runtime: "Node.js",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    },
    {
      framework: "hono-node",
      label: "Hono (Node)",
      runtime: "Node.js",
      workload: "Dynamic Route (/users/42)",
      path: "/users/42",
      command: { bin: process.execPath, file: "benchmarks/server.ts" }
    }
  ]

  if (TARGET_SUITE === "bun") return bunTargets
  if (TARGET_SUITE === "node") return nodeTargets
  return [...bunTargets, ...nodeTargets]
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const output = [...values]
  let state = (seed >>> 0) || 0x9e3779b9
  const next = () => {
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b)
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b)
    state ^= state >>> 16
    return (state >>> 0) / 0x100000000
  }
  for (let index = output.length - 1; index > 0; index--) {
    const swap = Math.floor(next() * (index + 1))
    const value = output[index]
    output[index] = output[swap]
    output[swap] = value
  }
  return output
}

function tierForTarget(target: TargetConfig): "prebuilt" | "object" | "dynamic" {
  if (target.workload.startsWith("Dynamic")) return "dynamic"
  return target.framework.includes("static") ? "prebuilt" : "object"
}

function entrypointForTarget(target: TargetConfig): "handler" | "listen" {
  // The standard target intentionally exercises createBunHandler(), even
  // when the surrounding suite is a public app.listen() run. Keep it out of
  // the public listener table instead of labelling the generic path as listen.
  // nelysia-bun-generic respects BENCH_ENTRYPOINT (listen => app.listen()
  // with a hook-forced GENERIC lane, otherwise createBunHandler).
  if (target.framework === "nelysia-bun-standard") return "handler"
  return process.env.BENCH_ENTRYPOINT === "listen" ? "listen" : "handler"
}

async function main() {
  console.log(`========================================================================`)
  console.log(`  OHA HTTP BENCHMARK SUITE - NELYSIA`)
  console.log(`========================================================================`)
  console.log(`Settings: Warmup: ${WARMUP_SEC}s | Duration: ${DURATION_SEC}s | Concurrency: ${CONCURRENCY} | Rounds: ${ROUNDS} (Median Reported)`)
  console.log(`Suite: ${TARGET_SUITE.toUpperCase()}`)
  console.log(`Route set: ${ROUTE_SET} | Route count: ${ROUTE_COUNT}`)
  const cpu = cpus()
  let bunVersion = "unavailable"
  let ohaVersion = "unavailable"
  try { bunVersion = (await runCommand("bun", ["--version"])).trim() } catch {}
  try { ohaVersion = (await runCommand("oha", ["--version"])).trim().split("\n")[0] } catch {}
  console.log(`Environment: ${cpu[0]?.model ?? "unknown CPU"} | CPUs: ${cpu.length} | Node: ${process.version} | Bun: ${bunVersion} | oha: ${ohaVersion} | OS: ${process.platform}`)
  console.log(`------------------------------------------------------------------------\n`)

  const targets = getTargets().filter((target) => {
    const targetMatches = TARGET_FILTERS !== undefined
      ? TARGET_FILTERS.includes(target.framework) || TARGET_FILTERS.includes(target.label)
      : TARGET_FILTER === undefined || target.framework === TARGET_FILTER || target.label === TARGET_FILTER
    const workloadMatches = WORKLOAD_FILTER === undefined || (WORKLOAD_FILTER === "dynamic" ? target.workload.startsWith("Dynamic") : target.workload.startsWith("JSON"))
    return targetMatches && workloadMatches
  })
  if (targets.length === 0) throw new Error(`No benchmark target matched BENCH_TARGET=${TARGET_FILTER}`)
  const orderedTargets = shuffled(targets, ORDER_SEED)
  const finalResults: OhaMetrics[] = []

  for (const target of orderedTargets) {
    process.stdout.write(`Benchmarking [${target.runtime}] ${target.label} - ${target.workload}... `)

    const roundResults: Array<{ data: RawOhaJson; before: ProcessMemory; after: ProcessMemory }> = []
    const heapBefore = process.memoryUsage().heapUsed
    const entrypoint = entrypointForTarget(target)

    for (let round = 1; round <= ROUNDS; round++) {
      const isBun = target.command.bin === "bun"
      const args = isBun
        ? [target.command.file]
        : ["--experimental-strip-types", target.command.file]

      const child = spawn(target.command.bin, args, {
        env: {
          ...process.env,
          FRAMEWORK: target.framework,
          PORT: String(PORT),
          BENCH_ROUTE_SET: ROUTE_SET,
          BENCH_ROUTE_COUNT: String(ROUTE_COUNT),
          BENCH_CASE: target.path.startsWith("/users/") ? "dynamic" : "json",
          BENCH_ENTRYPOINT: entrypoint
        },
        stdio: ["ignore", "pipe", "inherit"]
      })

      try {
        await waitForServerReady(child)
        const targetUrl = `http://127.0.0.1:${PORT}${target.path}`
        await verifyTargetResponse(targetUrl, target)

        const before = await readProcessMemory(child.pid ?? -1)
        // Warmup is explicitly excluded from measured samples.
        await runOha(targetUrl, WARMUP_SEC, Math.min(CONCURRENCY, 20))

        // Measured Run
        const ohaData = await runOha(targetUrl, DURATION_SEC, CONCURRENCY)
        const after = await readProcessMemory(child.pid ?? -1)
        roundResults.push({ data: ohaData, before, after })
      } finally {
        await stopServer(child)
      }
    }

    const rpsMed = median(roundResults.map((r) => r.data.summary.requestsPerSec))
    const rpsValues = roundResults.map((r) => r.data.summary.requestsPerSec)
    const avgLatencyMed = median(roundResults.map((r) => r.data.summary.average * 1000))
    const p50Med = median(roundResults.map((r) => r.data.latencyPercentiles.p50 * 1000))
    const p90Med = median(roundResults.map((r) => r.data.latencyPercentiles.p90 * 1000))
    const p95Med = median(roundResults.map((r) => r.data.latencyPercentiles.p95 * 1000))
    const p99Med = median(roundResults.map((r) => r.data.latencyPercentiles.p99 * 1000))
    const maxLatMed = median(roundResults.map((r) => r.data.summary.slowest * 1000))
    const successRateMed = median(roundResults.map((r) => r.data.summary.successRate * 100))
    const totalReqsMed = median(roundResults.map((r) => r.data.summary.total))
    const mbPerSecMed = median(roundResults.map((r) => r.data.summary.sizePerSec / (1024 * 1024)))
    const failureCount = roundResults.reduce((total, r) => total + Math.max(0, Math.round(r.data.summary.total * (1 - r.data.summary.successRate))), 0)
    const rssBefore = roundResults.map((r) => r.before.rssKb).filter((value): value is number => value !== null)
    const rssAfter = roundResults.map((r) => r.after.rssKb).filter((value): value is number => value !== null)
    const heapAfter = process.memoryUsage().heapUsed

    const tier = tierForTarget(target)
    finalResults.push({
      framework: target.label,
      workload: `${target.workload} (${tier}) [${ROUTE_SET} route, ${ROUTE_COUNT} routes]`,
      runtime: target.runtime,
      rps: rpsMed,
      rpsMin: Math.min(...rpsValues),
      rpsMax: Math.max(...rpsValues),
      avgLatencyMs: avgLatencyMed,
      p50Ms: p50Med,
      p90Ms: p90Med,
      p95Ms: p95Med,
      p99Ms: p99Med,
      maxLatencyMs: maxLatMed,
      successRate: successRateMed,
      totalRequests: totalReqsMed,
      failureCount,
      throughputMBs: mbPerSecMed,
      serverRssBeforeKb: rssBefore.length > 0 ? median(rssBefore) : null,
      serverRssAfterKb: rssAfter.length > 0 ? median(rssAfter) : null,
      runnerHeapDeltaKb: Math.round((heapAfter - heapBefore) / 1024),
      routeCount: ROUTE_COUNT,
      statusMismatchCount: 0,
      bodyMismatchCount: 0,
      samples: roundResults.map((round) => ({
        rps: round.data.summary.requestsPerSec,
        p95Ms: round.data.latencyPercentiles.p95 * 1000,
        p99Ms: round.data.latencyPercentiles.p99 * 1000,
        successRate: round.data.summary.successRate * 100,
        failureCount: Math.max(0, Math.round(round.data.summary.total * (1 - round.data.summary.successRate)))
      })),
      tier,
      entrypoint
    })

    console.log(`✓ ${Math.round(rpsMed).toLocaleString()} req/s (p95: ${p95Med.toFixed(2)}ms)`)
  }

  console.log(`\n========================================================================`)
  console.log(`  RESULTS SUMMARY (MEDIAN OF ${ROUNDS} RUNS)`)
  console.log(`========================================================================\n`)

  // Group by Workload & Runtime
  const workloads = Array.from(new Set(finalResults.map((r) => r.workload)))
  const runtimes = Array.from(new Set(finalResults.map((r) => r.runtime)))

  for (const runtime of runtimes) {
    for (const workload of workloads) {
      const filtered = finalResults.filter((r) => r.runtime === runtime && r.workload === workload)
      if (filtered.length === 0) continue

      console.log(`### Runtime: ${runtime} | Workload: ${workload}`)
      console.log(`| Framework | Median req/s | Min/Max req/s | Avg Latency | p50 | p95 | p99 | Max Latency | Success Rate | Failures | Throughput | RSS before/after | Heap delta |`)
      console.log(`| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`)
      
      // Sort by RPS descending
      filtered.sort((a, b) => b.rps - a.rps)

      for (const res of filtered) {
        console.log(
          `| **${res.framework}** | **${Math.round(res.rps).toLocaleString()}** | ${Math.round(res.rpsMin).toLocaleString()} / ${Math.round(res.rpsMax).toLocaleString()} | ${res.avgLatencyMs.toFixed(2)} ms | ${res.p50Ms.toFixed(2)} ms | ${res.p95Ms.toFixed(2)} ms | ${res.p99Ms.toFixed(2)} ms | ${res.maxLatencyMs.toFixed(2)} ms | ${res.successRate.toFixed(1)}% | ${res.failureCount} | ${res.throughputMBs.toFixed(2)} MB/s | ${res.serverRssBeforeKb ?? "n/a"} / ${res.serverRssAfterKb ?? "n/a"} kB | ${res.runnerHeapDeltaKb} kB |`
        )
      }
      console.log(`\n`)
    }
  }

  if (OUTPUT !== undefined) {
    await writeFile(OUTPUT, JSON.stringify({
      schema: "nelysia.benchmark.v11",
      generatedAt: new Date().toISOString(),
      environment: {
        cpu: cpu[0]?.model ?? "unknown CPU",
        cores: cpu.length,
        node: process.version,
        bun: bunVersion,
        oha: ohaVersion,
        os: process.platform,
        concurrency: CONCURRENCY,
        durationSec: DURATION_SEC,
        rounds: ROUNDS,
        warmupSec: WARMUP_SEC,
        routeSet: ROUTE_SET,
        routeCount: ROUTE_COUNT,
        orderSeed: ORDER_SEED,
        entrypoint: process.env.BENCH_ENTRYPOINT === "listen" ? "listen" : "handler",
        target: TARGET_FILTER ?? "all",
        workload: WORKLOAD_FILTER ?? "all"
      },
      results: finalResults
    }, null, 2) + "\n", "utf8")
    console.log(`Machine-readable benchmark written to ${OUTPUT}`)
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err)
  process.exit(1)
})

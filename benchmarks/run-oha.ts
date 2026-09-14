import { spawn } from "node:child_process"
import { once } from "node:events"
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

const PORT = Number(process.env.BENCH_PORT ?? 4321)
const DURATION_SEC = Number(process.env.BENCH_DURATION_SEC ?? 5)
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 50)
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 3)
const TARGET_SUITE = process.env.BENCH_SUITE ?? "all" // "all" | "bun" | "node"
const ROUTE_SET = process.env.BENCH_ROUTE_SET === "single" ? "single" : "multi"

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
      framework: "elysia-bun",
      label: "Elysia",
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
      framework: "elysia-bun",
      label: "Elysia",
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

async function main() {
  console.log(`========================================================================`)
  console.log(`  OHA HTTP BENCHMARK SUITE - NELYSIA`)
  console.log(`========================================================================`)
  console.log(`Settings: Duration: ${DURATION_SEC}s | Concurrency: ${CONCURRENCY} | Rounds: ${ROUNDS} (Median Reported)`)
  console.log(`Suite: ${TARGET_SUITE.toUpperCase()}`)
  console.log(`Route set: ${ROUTE_SET}`)
  const cpu = cpus()
  let bunVersion = "unavailable"
  let ohaVersion = "unavailable"
  try { bunVersion = (await runCommand("bun", ["--version"])).trim() } catch {}
  try { ohaVersion = (await runCommand("oha", ["--version"])).trim().split("\n")[0] } catch {}
  console.log(`Environment: ${cpu[0]?.model ?? "unknown CPU"} | CPUs: ${cpu.length} | Node: ${process.version} | Bun: ${bunVersion} | oha: ${ohaVersion} | OS: ${process.platform}`)
  console.log(`------------------------------------------------------------------------\n`)

  const targets = getTargets()
  const finalResults: OhaMetrics[] = []

  for (const target of targets) {
    process.stdout.write(`Benchmarking [${target.runtime}] ${target.label} - ${target.workload}... `)

    const roundResults: RawOhaJson[] = []

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
          BENCH_CASE: target.path.startsWith("/users/") ? "dynamic" : "json"
        },
        stdio: ["ignore", "pipe", "inherit"]
      })

      try {
        await waitForServerReady(child)
        const targetUrl = `http://127.0.0.1:${PORT}${target.path}`

        // Warmup (1s)
        await runOha(targetUrl, 1, Math.min(CONCURRENCY, 20))

        // Measured Run
        const ohaData = await runOha(targetUrl, DURATION_SEC, CONCURRENCY)
        roundResults.push(ohaData)
      } finally {
        await stopServer(child)
      }
    }

    const rpsMed = median(roundResults.map((r) => r.summary.requestsPerSec))
    const rpsValues = roundResults.map((r) => r.summary.requestsPerSec)
    const avgLatencyMed = median(roundResults.map((r) => r.summary.average * 1000))
    const p50Med = median(roundResults.map((r) => r.latencyPercentiles.p50 * 1000))
    const p90Med = median(roundResults.map((r) => r.latencyPercentiles.p90 * 1000))
    const p95Med = median(roundResults.map((r) => r.latencyPercentiles.p95 * 1000))
    const p99Med = median(roundResults.map((r) => r.latencyPercentiles.p99 * 1000))
    const maxLatMed = median(roundResults.map((r) => r.summary.slowest * 1000))
    const successRateMed = median(roundResults.map((r) => r.summary.successRate * 100))
    const totalReqsMed = median(roundResults.map((r) => r.summary.total))
    const mbPerSecMed = median(roundResults.map((r) => r.summary.sizePerSec / (1024 * 1024)))
    const failureCount = roundResults.reduce((total, r) => total + Math.max(0, Math.round(r.summary.total * (1 - r.summary.successRate))), 0)

    finalResults.push({
      framework: target.label,
      workload: `${target.workload} [${ROUTE_SET} route]`,
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
      throughputMBs: mbPerSecMed
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
      console.log(`| Framework | Median req/s | Min/Max req/s | Avg Latency | p50 | p95 | p99 | Max Latency | Success Rate | Failures | Throughput |`)
      console.log(`| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`)
      
      // Sort by RPS descending
      filtered.sort((a, b) => b.rps - a.rps)

      for (const res of filtered) {
        console.log(
          `| **${res.framework}** | **${Math.round(res.rps).toLocaleString()}** | ${Math.round(res.rpsMin).toLocaleString()} / ${Math.round(res.rpsMax).toLocaleString()} | ${res.avgLatencyMs.toFixed(2)} ms | ${res.p50Ms.toFixed(2)} ms | ${res.p95Ms.toFixed(2)} ms | ${res.p99Ms.toFixed(2)} ms | ${res.maxLatencyMs.toFixed(2)} ms | ${res.successRate.toFixed(1)}% | ${res.failureCount} | ${res.throughputMBs.toFixed(2)} MB/s |`
        )
      }
      console.log(`\n`)
    }
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err)
  process.exit(1)
})

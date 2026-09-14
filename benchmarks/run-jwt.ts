import { spawn } from "node:child_process"
import { signJwt } from "../packages/jwt/src/index.ts"

interface JwtBenchResult {
  framework: string
  scenario: string
  rps: number
  avgLatencyMs: number
  p50Ms: number
  p90Ms: number
  p95Ms: number
  p99Ms: number
  statusCode: number
  failureCount: number
}

const JWT_SECRET = "nelysia-benchmark-secret-key-1234567890"
const PORT = Number(process.env.BENCH_PORT ?? 4340)
const DURATION_SEC = Number(process.env.BENCH_DURATION_SEC ?? 3)
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 50)
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 1)

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
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ready:")) {
        resolved = true
        resolve()
      }
    })
    child.once("error", (err) => { if (!resolved) reject(err) })
    child.once("exit", (code) => { if (!resolved) reject(new Error(`Server exited with ${code}`)) })
    setTimeout(() => { if (!resolved) reject(new Error("Timeout")) }, 8000)
  })
}

async function stopServer(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exitPromise = new Promise<void>((resolve) => {
    child.once("exit", () => resolve())
  })
  child.kill("SIGTERM")
  const timeout = setTimeout(() => {
    try { child.kill("SIGKILL") } catch {}
  }, 1500)
  await exitPromise
  clearTimeout(timeout)
  await new Promise((r) => setTimeout(r, 100))
}

async function main() {
  console.log(`========================================================================`)
  console.log(`  JWT BENCHMARK SUITE: NELYSIA vs ELYSIA vs HONO`)
  console.log(`========================================================================`)
  console.log(`Settings: Duration: ${DURATION_SEC}s | Concurrency: ${CONCURRENCY} | Rounds: ${ROUNDS}`)
  console.log(`Scenarios: no-auth, valid-jwt, missing-jwt, invalid-jwt, expired-jwt`)
  console.log(`------------------------------------------------------------------------\n`)

  const validToken = await signJwt({ sub: "user-1", name: "Alice" }, JWT_SECRET, { expiresIn: 3600 })
  const expiredToken = await signJwt({ sub: "user-1", name: "Alice" }, JWT_SECRET, { expiresIn: -3600 })
  const invalidToken = await signJwt({ sub: "user-1", name: "Alice" }, "wrong-secret-key-0000000000", { expiresIn: 3600 })

  const frameworks = [
    { id: "nelysia", name: "Nelysia (@nelysia/jwt)" },
    { id: "hono", name: "Hono (hono/jwt)" },
    { id: "elysia", name: "Elysia (WebCrypto JWT)" }
  ]

  const scenarios = [
    { id: "no-auth", label: "1. No Auth (/public)", path: "/public", header: undefined, expectedStatus: 200 },
    { id: "valid-jwt", label: "2. Valid JWT (/profile)", path: "/profile", header: `Bearer ${validToken}`, expectedStatus: 200 },
    { id: "missing-jwt", label: "3. Missing JWT (/profile)", path: "/profile", header: undefined, expectedStatus: 401 },
    { id: "invalid-jwt", label: "4. Invalid JWT (/profile)", path: "/profile", header: `Bearer ${invalidToken}`, expectedStatus: 401 },
    { id: "expired-jwt", label: "5. Expired JWT (/profile)", path: "/profile", header: `Bearer ${expiredToken}`, expectedStatus: 401 }
  ]

  const results: JwtBenchResult[] = []

  for (const fw of frameworks) {
    console.log(`>>> Testing Framework: ${fw.name}...`)

    const child = spawn("bun", ["benchmarks/server-jwt.ts"], {
      env: { ...process.env, FRAMEWORK: fw.id, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "inherit"]
    })

    try {
      await waitForServerReady(child)

      for (const sc of scenarios) {
        for (let round = 1; round <= ROUNDS; round++) {
          process.stdout.write(`    Testing ${sc.label} (round ${round}/${ROUNDS})... `)
        const url = `http://127.0.0.1:${PORT}${sc.path}`
        const ohaArgs = [
          "-z", `${DURATION_SEC}s`,
          "-c", String(CONCURRENCY),
          "-w",
          "--no-tui",
          "--output-format", "json"
        ]
        if (sc.header) {
          ohaArgs.push("-H", `authorization: ${sc.header}`)
        }
        ohaArgs.push(url)

        // Warmup (1s)
        const warmupArgs = ["-z", "1s", "-c", "10", "-w", "--no-tui"]
        if (sc.header) warmupArgs.push("-H", `authorization: ${sc.header}`)
        warmupArgs.push(url)
        await runCommand("oha", warmupArgs)

        // Measured run
        const rawJson = await runCommand("oha", ohaArgs)
        const parsed = JSON.parse(rawJson)

        const rps = parsed.summary.requestsPerSec
        const avg = parsed.summary.average * 1000
        const p50 = (parsed.latencyPercentiles.p50 ?? 0) * 1000
        const p90 = (parsed.latencyPercentiles.p90 ?? 0) * 1000
        const p95 = (parsed.latencyPercentiles.p95 ?? 0) * 1000
        const p99 = (parsed.latencyPercentiles.p99 ?? 0) * 1000
        const status = Number(Object.keys(parsed.statusCodeDistribution)[0] ?? sc.expectedStatus)

        const statusFailures = Object.entries(parsed.statusCodeDistribution ?? {}).reduce((total, [code, count]) => total + (Number(code) === sc.expectedStatus ? 0 : Number(count)), 0)
        const networkFailures = Math.max(0, Math.round(parsed.summary.total * (1 - parsed.summary.successRate)))
        results.push({
          framework: fw.name,
          scenario: sc.label,
          rps,
          avgLatencyMs: avg,
          p50Ms: p50,
          p90Ms: p90,
          p95Ms: p95,
          p99Ms: p99,
          statusCode: status,
          failureCount: networkFailures + statusFailures
        })

        console.log(`✓ ${Math.round(rps).toLocaleString()} req/s (p95: ${p95.toFixed(2)}ms) [${status}]`)
        }
      }
    } finally {
      await stopServer(child)
    }
    console.log(``)
  }

  console.log(`\n========================================================================`)
  console.log(`  JWT BENCHMARK RESULTS SUMMARY`)
  console.log(`========================================================================\n`)

  const scenarioLabels = scenarios.map((s) => s.label)

  for (const scLabel of scenarioLabels) {
    const subset = results.filter((r) => r.scenario === scLabel)
    const frameworkNames = [...new Set(subset.map((r) => r.framework))]

    console.log(`### Scenario: ${scLabel}`)
    console.log(`| Framework | Median req/s | Min/Max req/s | Avg Latency | p50 | p95 | p99 | HTTP Status | Failures |`)
    console.log(`| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |`)
    for (const framework of frameworkNames) {
      const rounds = subset.filter((r) => r.framework === framework)
      const r = rounds[0]
      const rpsValues = rounds.map((value) => value.rps)
      const med = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle] }
      console.log(
        `| **${framework}** | **${Math.round(med(rpsValues)).toLocaleString()}** | ${Math.round(Math.min(...rpsValues)).toLocaleString()} / ${Math.round(Math.max(...rpsValues)).toLocaleString()} | ${med(rounds.map((value) => value.avgLatencyMs)).toFixed(2)} ms | ${med(rounds.map((value) => value.p50Ms)).toFixed(2)} ms | ${med(rounds.map((value) => value.p95Ms)).toFixed(2)} ms | ${med(rounds.map((value) => value.p99Ms)).toFixed(2)} ms | ${r.statusCode} | ${rounds.reduce((total, value) => total + value.failureCount, 0)} |`
      )
    }
    console.log(`\n`)
  }
}

main().catch((err) => {
  console.error("JWT Benchmark failed:", err)
  process.exit(1)
})

import { spawn } from "node:child_process"

interface TebResult {
  framework: string
  testType: string
  concurrency: number
  rps: number
  avgLatencyMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  mbPerSec: number
}

const PORT = Number(process.env.BENCH_PORT ?? 4390)
const DURATION_SEC = Number(process.env.BENCH_DURATION_SEC ?? 3)
const CONCURRENCY_LIST = (process.env.BENCH_CONCURRENCIES ?? "50,100,250,500")
  .split(",")
  .map(Number)

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
  console.log(`  TECHEMPOWER (ROUND 22 SPEC) BENCHMARK SUITE - PLAINTEXT & JSON`)
  console.log(`========================================================================`)
  console.log(`Duration per test: ${DURATION_SEC}s | Concurrency list: [${CONCURRENCY_LIST.join(", ")}]`)
  console.log(`Tests: Plaintext (/plaintext) & JSON Serialization (/json)`)
  console.log(`------------------------------------------------------------------------\n`)

  const frameworks = [
    { id: "nelysia-static", label: "Nelysia (Static Compiled)" },
    { id: "nelysia-route", label: "Nelysia (Route Compiled)" },
    { id: "nelysia-standard", label: "Nelysia (Standard Handler)" },
    { id: "elysia", label: "Elysia 2.0" },
    { id: "raw-bun", label: "Bun.serve (Raw Baseline)" }
  ]

  const tests = [
    { type: "Plaintext (/plaintext)", path: "/plaintext" },
    { type: "JSON (/json)", path: "/json" }
  ]

  const allResults: TebResult[] = []

  for (const fw of frameworks) {
    console.log(`>>> Starting: ${fw.label}...`)
    const child = spawn("bun", ["benchmarks/server-techempower.ts"], {
      env: { ...process.env, FRAMEWORK: fw.id, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "inherit"]
    })

    try {
      await waitForServerReady(child)

      for (const t of tests) {
        for (const c of CONCURRENCY_LIST) {
          process.stdout.write(`    [${t.type} @ c=${c}]... `)
          const url = `http://127.0.0.1:${PORT}${t.path}`

          // Warmup (1s)
          await runCommand("oha", ["-z", "1s", "-c", String(Math.min(c, 20)), "-w", "--no-tui", url])

          // Measured run
          const raw = await runCommand("oha", [
            "-z", `${DURATION_SEC}s`,
            "-c", String(c),
            "-w",
            "--no-tui",
            "--output-format", "json",
            url
          ])
          const data = JSON.parse(raw)

          const rps = data.summary.requestsPerSec
          const avg = data.summary.average * 1000
          const p50 = (data.latencyPercentiles.p50 ?? 0) * 1000
          const p95 = (data.latencyPercentiles.p95 ?? 0) * 1000
          const p99 = (data.latencyPercentiles.p99 ?? 0) * 1000
          const mbps = (data.summary.sizePerSec ?? 0) / (1024 * 1024)

          allResults.push({
            framework: fw.label,
            testType: t.type,
            concurrency: c,
            rps,
            avgLatencyMs: avg,
            p50Ms: p50,
            p95Ms: p95,
            p99Ms: p99,
            mbPerSec: mbps
          })

          console.log(`✓ ${Math.round(rps).toLocaleString()} req/s (p95: ${p95.toFixed(2)}ms)`)
        }
      }
    } finally {
      await stopServer(child)
    }
    console.log(``)
  }

  console.log(`\n========================================================================`)
  console.log(`  TECHEMPOWER BENCHMARK RESULTS SUMMARY`)
  console.log(`========================================================================\n`)

  for (const t of tests) {
    console.log(`### Test Type: ${t.type}\n`)

    for (const c of CONCURRENCY_LIST) {
      const subset = allResults.filter((r) => r.testType === t.type && r.concurrency === c)
      subset.sort((a, b) => b.rps - a.rps)

      console.log(`#### Concurrency: ${c} Connections`)
      console.log(`| Rank | Framework | Requests/sec | Avg Latency | p50 | p95 | p99 | Throughput |`)
      console.log(`| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`)
      subset.forEach((r, idx) => {
        console.log(
          `| **#${idx + 1}** | **${r.framework}** | **${Math.round(r.rps).toLocaleString()}** | ${r.avgLatencyMs.toFixed(2)} ms | ${r.p50Ms.toFixed(2)} ms | ${r.p95Ms.toFixed(2)} ms | ${r.p99Ms.toFixed(2)} ms | ${r.mbPerSec.toFixed(2)} MB/s |`
        )
      })
      console.log(``)
    }
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err)
  process.exit(1)
})

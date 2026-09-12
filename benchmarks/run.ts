import { spawn } from "node:child_process"
import { once } from "node:events"
import { performance } from "node:perf_hooks"

const frameworks = ["raw-node", "nelysia", "fastify", "express"]
const port = 4310
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 5000)
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 20)
const repeats = Number(process.env.BENCH_REPEATS ?? 3)

for (const framework of frameworks) {
  const samples: number[] = []
  let totalFailures = 0
  for (let repeat = 0; repeat < repeats; repeat++) {
    const child = spawn(process.execPath, ["--experimental-strip-types", "benchmarks/server.ts"], {
      env: { ...process.env, FRAMEWORK: framework, PORT: String(port) },
      stdio: ["ignore", "pipe", "inherit"]
    })
    await waitUntilReady(child)
    await fetch(`http://127.0.0.1:${port}/json`)
    const end = performance.now() + durationMs
    let requests = 0
    let failures = 0
    let latencyTotal = 0
    const workers = Array.from({ length: concurrency }, async () => {
      while (performance.now() < end) {
        const started = performance.now()
        try {
          const response = await fetch(`http://127.0.0.1:${port}/json`)
          await response.arrayBuffer()
          if (!response.ok) failures++
          else {
            requests++
            latencyTotal += performance.now() - started
          }
        } catch {
          failures++
        }
      }
    })
    await Promise.all(workers)
    child.kill("SIGTERM")
    await once(child, "exit")
    const seconds = durationMs / 1000
    samples.push(requests / seconds)
    totalFailures += failures
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)] ?? 0
  console.log(`${framework}\tmedian ${median.toFixed(0)} req/s\tsamples ${samples.map((sample) => sample.toFixed(0)).join(",")}\tfailures ${totalFailures}`)
}

async function waitUntilReady(child: ReturnType<typeof spawn>): Promise<void> {
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("ready:")) resolve()
    })
    child.once("error", reject)
    child.once("exit", (code) => reject(new Error(`benchmark server exited with ${code}`)))
  })
  await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error("server startup timeout")), 5000))])
}

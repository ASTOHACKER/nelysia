import { spawn } from "node:child_process"
import { once } from "node:events"
import { performance } from "node:perf_hooks"

const frameworks = ["raw-node", "nelysia", "fastify", "express"]
const port = 4310
const durationMs = Number(process.env.BENCH_DURATION_MS ?? 5000)
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 20)
const repeats = Number(process.env.BENCH_REPEATS ?? 3)

// Interleaved: rotate frameworks every repeat so time-varying machine noise
// hits all frameworks equally instead of confounding one framework's block.
const collected = new Map<string, { samples: number[]; failures: number }>(
  frameworks.map((framework) => [framework, { samples: [], failures: 0 }]),
)
const blockSize = Math.max(1, Math.min(repeats, Number(process.env.BENCH_BLOCK ?? 10)))
for (let base = 0; base < repeats; base += blockSize) {
  for (const framework of frameworks) {
    const entry = collected.get(framework)!
    const child = spawn(process.execPath, ["--experimental-strip-types", "benchmarks/server.ts"], {
      env: { ...process.env, FRAMEWORK: framework, PORT: String(port) },
      stdio: ["ignore", "pipe", "inherit"]
    })
    await waitUntilReady(child)
    await fetch(`http://127.0.0.1:${port}/json`)
    for (let i = 0; i < blockSize && base + i < repeats; i++) {
      const end = performance.now() + durationMs
      let requests = 0
      let failures = 0
      const workers = Array.from({ length: concurrency }, async () => {
        while (performance.now() < end) {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/json`)
            await response.arrayBuffer()
            if (!response.ok) failures++
            else requests++
          } catch {
            failures++
          }
        }
      })
      await Promise.all(workers)
      const seconds = durationMs / 1000
      entry.samples.push(requests / seconds)
      entry.failures += failures
    }
    child.kill("SIGTERM")
    await once(child, "exit")
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  console.error(`[progress] block ${Math.floor(base / blockSize) + 1}/${Math.ceil(repeats / blockSize)} completed (${Math.min(base + blockSize, repeats)}/${repeats} repeats)`)
}
for (const framework of frameworks) {
  const { samples, failures } = collected.get(framework)!
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)] ?? 0
  console.log(`${framework}\tmedian ${median.toFixed(0)} req/s\tsamples ${samples.map((sample) => sample.toFixed(0)).join(",")}\tfailures ${failures}`)
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

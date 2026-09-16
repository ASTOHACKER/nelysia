import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../..", import.meta.url))

export function verifyWinMatrix(matrix, packageVersion = "1.2.0") {
  const failures = []
  const requiredAxes = ["bun", "node", "fetch", "memory", "lifecycle", "ecosystem", "soak24h", "dx"]

  if (matrix?.schema !== "nelysia.win-matrix.v1") failures.push("manifest: unsupported schema")
  if (matrix?.packageVersion !== packageVersion) failures.push(`manifest: package version must be ${packageVersion}`)
  if (matrix?.baseline?.name !== "Elysia" || matrix?.baseline?.version !== "2.0.0-exp.60") {
    failures.push("manifest: baseline must be Elysia 2.0.0-exp.60")
  }
  if (matrix?.status !== "PASS") failures.push(`manifest: status is ${matrix?.status ?? "missing"}`)

  for (const axis of requiredAxes) {
    if (!matrix?.axes?.[axis]) failures.push(`axis missing: ${axis}`)
  }

  const bun = matrix?.axes?.bun
  if (bun) {
    requirePass(failures, "bun", bun)
    if (!Number.isInteger(bun.seeds) || bun.seeds < 3) failures.push("bun: at least 3 seeds are required")
    if (!finite(bun.spreadPercent) || bun.spreadPercent > 10) failures.push("bun: seed spread must be <= 10%")
    checkCorrectness(failures, "bun", bun.correctness)
    const workloads = Array.isArray(bun.workloads) ? bun.workloads : []
    const names = new Set(workloads.map((workload) => workload?.name))
    for (const name of ["zero-arg", "params", "generic-json", "generic-dynamic"]) {
      if (!names.has(name)) failures.push(`bun: missing workload ${name}`)
    }
    for (const workload of workloads) {
      const label = `bun/${workload?.name ?? "unnamed"}`
      if (!finite(workload?.nelysiaRps) || !finite(workload?.baselineRps) || workload.baselineRps <= 0) {
        failures.push(`${label}: RPS evidence is incomplete`)
      } else if (workload.nelysiaRps < workload.baselineRps) {
        failures.push(`${label}: RPS is below Elysia baseline`)
      }
      checkLatency(failures, label, workload, "p95")
      checkLatency(failures, label, workload, "p99")
    }
  }

  const node = matrix?.axes?.node
  if (node) {
    if (requirePass(failures, "node", node)) {
      if (finite(node.nelysiaRps) && finite(node.fastifyRps) && node.nelysiaRps < node.fastifyRps) {
        failures.push("node: throughput is below Fastify")
      }
      if (finite(node.nelysiaRps) && finite(node.rawNodeRps) && node.nelysiaRps < node.rawNodeRps * 0.98) {
        failures.push("node: throughput is more than 2% below raw Node")
      }
    }
  }

  const fetch = matrix?.axes?.fetch
  if (fetch) {
    if (requirePass(failures, "fetch", fetch)) {
      checkCorrectness(failures, "fetch", fetch.correctness)
      if (finite(fetch.latencyRatio) && fetch.latencyRatio > 1.02) failures.push("fetch: latency is more than 2% above baseline")
      if (finite(fetch.startupRatio) && fetch.startupRatio > 1.02) failures.push("fetch: startup is more than 2% above baseline")
    }
  }

  const memory = matrix?.axes?.memory
  if (memory) {
    if (requirePass(failures, "memory", memory)) {
      if (finite(memory.rssRegressionPercent) && memory.rssRegressionPercent > 0) failures.push("memory: RSS regressed from clean baseline")
      if (finite(memory.heapRegressionPercent) && memory.heapRegressionPercent > 0) failures.push("memory: heap regressed from clean baseline")
      if (memory.soakMemoryGrowth === true) failures.push("memory: soak shows continuous growth")
    }
  }

  requirePass(failures, "lifecycle", matrix?.axes?.lifecycle)

  const ecosystem = matrix?.axes?.ecosystem
  if (ecosystem) {
    if (requirePass(failures, "ecosystem", ecosystem)) {
      if (ecosystem.packageExports?.passed !== ecosystem.packageExports?.required || ecosystem.packageExports?.required !== 25) {
        failures.push("ecosystem: package exports must pass 25/25")
      }
      if (ecosystem.frameworkFixtures?.passed !== ecosystem.frameworkFixtures?.required || ecosystem.frameworkFixtures?.required !== 5) {
        failures.push("ecosystem: framework fixtures must pass 5/5")
      }
      if (ecosystem.integrationsSmoke !== true) failures.push("ecosystem: integration smoke is incomplete")
    }
  }

  const soak = matrix?.axes?.soak24h
  if (soak) {
    if (requirePass(failures, "soak24h", soak)) {
      if (soak.failures !== 0) failures.push("soak24h: failures must be zero")
      if (soak.unhandledErrors !== 0) failures.push("soak24h: unhandled errors must be zero")
      if (soak.memoryGrowth === true) failures.push("soak24h: memory growth is abnormal")
    }
  }

  const dx = matrix?.axes?.dx
  if (dx) {
    if (requirePass(failures, "dx", dx)) {
      for (const check of ["typecheck", "tests", "docs", "packageConsumer"]) {
        if (dx[check] !== true) failures.push(`dx: ${check} did not pass`)
      }
    }
  }

  return { ok: failures.length === 0, failures }
}

function requirePass(failures, label, axis) {
  const pass = axis?.status === "PASS"
  if (!pass) failures.push(`${label}: status is ${axis?.status ?? "missing"}`)
  return pass
}

function checkCorrectness(failures, label, correctness) {
  if (!correctness || correctness.failures !== 0 || correctness.statusMismatches !== 0 || correctness.bodyMismatches !== 0) {
    failures.push(`${label}: correctness requires 0 failures, status mismatches, and body mismatches`)
  }
}

function checkLatency(failures, label, workload, percentile) {
  const actual = workload?.[`nelysia${capitalize(percentile)}Ms`]
  const baseline = workload?.[`baseline${capitalize(percentile)}Ms`]
  if (!finite(actual) || !finite(baseline) || baseline <= 0) {
    failures.push(`${label}: ${percentile} latency evidence is incomplete`)
  } else if (actual > baseline * 1.02) {
    failures.push(`${label}: ${percentile} latency is more than 2% above Elysia baseline`)
  }
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1)
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value)
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  if (!input) {
    console.error("usage: node spec/scripts/check-win-matrix.mjs <manifest.json>")
    process.exitCode = 2
  } else {
    const matrix = JSON.parse(await readFile(resolve(process.cwd(), input), "utf8"))
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
    const result = verifyWinMatrix(matrix, packageJson.version)
    if (!result.ok) {
      console.error(result.failures.join("\n"))
      process.exitCode = 1
    } else {
      console.log("win matrix passed: all release blockers have evidence")
    }
  }
}

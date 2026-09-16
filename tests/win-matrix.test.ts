import assert from "node:assert/strict"
import test from "node:test"
import { verifyWinMatrix } from "../spec/scripts/check-win-matrix.mjs"

function completeMatrix() {
  return {
    schema: "nelysia.win-matrix.v1",
    packageVersion: "1.2.0",
    baseline: { name: "Elysia", version: "2.0.0-exp.60" },
    status: "PASS",
    axes: {
      bun: {
        status: "PASS",
        seeds: 3,
        spreadPercent: 8,
        correctness: { failures: 0, statusMismatches: 0, bodyMismatches: 0 },
        workloads: [
          { name: "zero-arg", nelysiaRps: 100, baselineRps: 100, nelysiaP95Ms: 1, baselineP95Ms: 1, nelysiaP99Ms: 1, baselineP99Ms: 1 },
          { name: "params", nelysiaRps: 100, baselineRps: 100, nelysiaP95Ms: 1, baselineP95Ms: 1, nelysiaP99Ms: 1, baselineP99Ms: 1 },
          { name: "generic-json", nelysiaRps: 100, baselineRps: 100, nelysiaP95Ms: 1, baselineP95Ms: 1, nelysiaP99Ms: 1, baselineP99Ms: 1 },
          { name: "generic-dynamic", nelysiaRps: 100, baselineRps: 100, nelysiaP95Ms: 1, baselineP95Ms: 1, nelysiaP99Ms: 1, baselineP99Ms: 1 }
        ]
      },
      node: { status: "PASS", nelysiaRps: 100, fastifyRps: 90, rawNodeRps: 100 },
      fetch: { status: "PASS", correctness: { failures: 0, statusMismatches: 0, bodyMismatches: 0 }, latencyRatio: 1, startupRatio: 1 },
      memory: { status: "PASS", rssRegressionPercent: 0, heapRegressionPercent: 0, soakMemoryGrowth: false },
      lifecycle: { status: "PASS" },
      ecosystem: { status: "PASS", packageExports: { passed: 25, required: 25 }, frameworkFixtures: { passed: 5, required: 5 }, integrationsSmoke: true },
      soak24h: { status: "PASS", failures: 0, unhandledErrors: 0, memoryGrowth: false },
      dx: { status: "PASS", typecheck: true, tests: true, docs: true, packageConsumer: true }
    }
  }
}

test("win matrix accepts a complete, passing manifest", () => {
  const result = verifyWinMatrix(completeMatrix())
  assert.equal(result.ok, true, result.failures.join("\n"))
  assert.deepEqual(result.failures, [])
})

test("win matrix rejects pending release blockers", () => {
  const matrix = completeMatrix()
  matrix.status = "BLOCKED"
  matrix.axes.node.status = "PENDING"
  matrix.axes.fetch.status = "PENDING"
  matrix.axes.soak24h.status = "PENDING"

  const result = verifyWinMatrix(matrix)
  assert.equal(result.ok, false)
  assert.match(result.failures.join("\n"), /node: status is PENDING/)
  assert.match(result.failures.join("\n"), /fetch: status is PENDING/)
  assert.match(result.failures.join("\n"), /soak24h: status is PENDING/)
})

test("win matrix rejects latency, correctness, and stability regressions", () => {
  const matrix = completeMatrix()
  matrix.axes.bun.spreadPercent = 11
  matrix.axes.bun.correctness.bodyMismatches = 1
  matrix.axes.bun.workloads[0].nelysiaP99Ms = 1.03

  const result = verifyWinMatrix(matrix)
  assert.equal(result.ok, false)
  assert.match(result.failures.join("\n"), /bun: seed spread/)
  assert.match(result.failures.join("\n"), /bun: correctness/)
  assert.match(result.failures.join("\n"), /zero-arg: p99 latency/)
})

import { readFile } from "node:fs/promises"

const files = process.argv.slice(2)
const failures = []
if (files.length < 3) failures.push("expected three benchmark JSON files for the three-seed runtime gate")
const reports = []

for (const file of files) {
  try {
    const report = JSON.parse(await readFile(file, "utf8"))
    reports.push({ file, report })
    const environment = report.environment ?? {}
    if (report.schema !== "nelysia.benchmark.v11") failures.push(`${file}: unexpected benchmark schema`)
    if (environment.routeSet !== "multi" || environment.routeCount !== 2) failures.push(`${file}: expected routeSet=multi and routeCount=2`)
    if (environment.entrypoint !== "listen") failures.push(`${file}: expected app.listen() entrypoint`)
    for (const result of report.results ?? []) {
      if (result.runtime !== "Bun") continue
      if (result.routeCount !== 2) failures.push(`${file}: ${result.framework} has routeCount=${result.routeCount}`)
      if (result.failureCount !== 0 || result.successRate !== 100) failures.push(`${file}: ${result.framework} has request failures`)
      if ((result.statusMismatchCount ?? 0) !== 0) failures.push(`${file}: ${result.framework} has status mismatches`)
      if ((result.bodyMismatchCount ?? 0) !== 0) failures.push(`${file}: ${result.framework} has body mismatches`)
    }
  } catch (error) {
    failures.push(`${file}: cannot read benchmark JSON (${error.message})`)
  }
}

const byLabel = (report, label, workload) => report.results?.find((result) => {
  const nameMatches = result.runtime === "Bun" && (result.framework === label || result.label === label)
  return nameMatches && result.workload.startsWith(workload)
})
const requiredTargets = [
  ["Nelysia (Zero-arg Specialized)", "JSON"],
  ["Nelysia (Params Compiled)", "Dynamic"],
  ["Nelysia (Generic JSON)", "JSON"],
  ["Nelysia (Generic Dynamic)", "Dynamic"],
  ["Elysia", "JSON"],
  ["Elysia", "Dynamic"],
  ["Elysia (Generic JSON)", "JSON"],
  ["Elysia (Generic Dynamic)", "Dynamic"]
]
for (const { file, report } of reports) {
  for (const [label, workload] of requiredTargets) if (byLabel(report, label, workload) === undefined) failures.push(`${file}: missing ${label} ${workload}`)
}

// A seed changes target order and therefore captures normal process-level
// noise. Correctness is required for every seed; throughput gates use the
// median across all seeds and the spread check below still rejects unstable
// runs. This keeps a single noisy Elysia/Nelysia process from deciding parity.
const aggregate = (label, workload) => {
  const values = reports.map(({ report }) => byLabel(report, label, workload)?.rps).filter((value) => Number.isFinite(value))
  return values.length === reports.length ? median(values) : undefined
}
checkRelativeAggregate("zero-arg compiled", aggregate("Nelysia (Zero-arg Specialized)", "JSON"), aggregate("Elysia", "JSON"), 0.02)
checkRelativeAggregate("params compiled", aggregate("Nelysia (Params Compiled)", "Dynamic"), aggregate("Elysia", "Dynamic"), 0.02)
checkFloorAggregate("generic JSON", aggregate("Nelysia (Generic JSON)", "JSON"), aggregate("Elysia (Generic JSON)", "JSON"), 0.90)
checkFloorAggregate("generic dynamic", aggregate("Nelysia (Generic Dynamic)", "Dynamic"), aggregate("Elysia (Generic Dynamic)", "Dynamic"), 0.90)

for (const [label, workload] of requiredTargets) {
  const values = reports.map(({ report }) => byLabel(report, label, workload)?.rps).filter((value) => Number.isFinite(value))
  if (values.length !== reports.length) continue
  const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const spread = (Math.max(...values) - Math.min(...values)) / median
  if (spread > 0.10) failures.push(`${label} ${workload}: three-seed RPS spread ${(spread * 100).toFixed(2)}% exceeds 10%`)
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  console.error("no-performance-claim")
  process.exitCode = 1
} else {
  console.log(`Runtime parity gate passed across ${reports.length} Bun app.listen() seeds: per-seed correctness, aggregate compiled ±2%, aggregate generic >=90%, and <=10% seed spread`)
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function checkRelativeAggregate(label, nelysia, reference, threshold) {
  if (!nelysia || !reference) return
  const difference = Math.abs(nelysia / reference - 1)
  if (!Number.isFinite(difference) || difference > threshold) failures.push(`aggregate: ${label} is ${(difference * 100).toFixed(2)}% outside ±${threshold * 100}%`)
}

function checkFloorAggregate(label, nelysia, reference, floor) {
  if (!nelysia || !reference) return
  const ratio = nelysia / reference
  if (!Number.isFinite(ratio) || ratio < floor) failures.push(`aggregate: ${label} is ${(ratio * 100).toFixed(2)}% of Elysia, below ${(floor * 100).toFixed(0)}% gate`)
}

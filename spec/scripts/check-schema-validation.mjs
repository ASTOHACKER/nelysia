import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const file = resolve(process.argv[2] ?? "docs/benchmark-schema-validation-2026-10-09.json")
const failures = []
let report
try {
  report = JSON.parse(await readFile(file, "utf8"))
} catch (error) {
  failures.push(`${file}: cannot read benchmark (${error.message})`)
}

if (report) {
  if (report.schema !== "nelysia.schema-validation.v1") failures.push("benchmark: unexpected schema")
  if (report.target?.typebox !== "1.3.30") failures.push("benchmark: TypeBox target must be 1.3.30")
  if (!Number.isInteger(report.iterations) || report.iterations <= 0) failures.push("benchmark: iterations must be positive")
  if (report.correctness?.failures !== 0 || report.correctness?.mismatches !== 0) failures.push("benchmark: correctness gate failed")
  for (const lane of ["generic", "aot"]) {
    const result = report[lane]
    if (!result || !Number.isFinite(result.validationsPerSecond) || !Number.isFinite(result.nsPerValidation)) failures.push(`benchmark: missing ${lane} performance evidence`)
    if (result && (!Number.isFinite(result.heapDeltaBytes) || !Number.isFinite(result.rssDeltaBytes))) failures.push(`benchmark: missing ${lane} memory evidence`)
  }
  if (!Number.isFinite(report.performance?.overheadPercent)) failures.push("benchmark: missing overhead evidence")
  if (typeof report.claim !== "string" || !report.claim.includes("not a release")) failures.push("benchmark: performance claim guard is missing")
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  console.error("schema validation benchmark verification failed")
  process.exitCode = 1
} else {
  console.log(`Schema validation benchmark verification passed for ${report.iterations} iterations; correctness and cost evidence are recorded separately`)
}

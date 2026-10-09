import { readFile, writeFile } from "node:fs/promises"
import { cpus, platform, release } from "node:os"
import { t } from "../packages/core/src/schema.ts"
import { normalizeSchemaIR } from "../packages/core/src/schema-ir.ts"
import { validateSchema } from "../packages/core/src/schema-validator.ts"
import { createGeneratedValidator } from "../packages/compiler/src/dispatcher.ts"

const iterations = positiveInteger(process.env.SCHEMA_BENCH_ITERATIONS ?? "50000", "SCHEMA_BENCH_ITERATIONS")
const seed = Number(process.env.SCHEMA_BENCH_SEED ?? "20261009")
const packageVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version as string
const schema = t.Object({
  id: t.String({ minLength: 1, maxLength: 36 }),
  count: t.Integer({ minimum: 1, maximum: 1000 }),
  tags: t.Array(t.String({ minLength: 1, maxLength: 12 }), { maxItems: 4 }),
  metadata: t.Record(t.String({ maxLength: 24 })),
})
const normalized = normalizeSchemaIR(schema)
const generated = createGeneratedValidator(schema.definition!)
const valid = { id: "user-1", count: 7, tags: ["api", "typed"], metadata: { source: "fuzz" } }
const invalid = { id: "", count: 0, tags: ["this-value-is-too-long"], metadata: { source: "fuzz" } }

const genericCorrect = rejects(() => validateSchema(invalid, normalized))
const aotCorrect = rejects(() => generated.validate(invalid))
let mismatches = 0
for (const value of [valid, invalid, { ...valid, count: 1001 }, { ...valid, tags: ["ok", "ok", "ok", "ok", "overflow"] }]) {
  const generic = outcome(() => validateSchema(value, normalized))
  const aot = outcome(() => generated.validate(value))
  if (generic !== aot) mismatches++
}

warmup(() => validateSchema(valid, normalized))
warmup(() => generated.validate(valid))
const generic = measure(() => validateSchema(valid, normalized), iterations)
const aot = measure(() => generated.validate(valid), iterations)
const report = {
  schema: "nelysia.schema-validation.v1",
  generatedAt: new Date().toISOString(),
  packageVersion,
  target: { typebox: "1.3.30", seed, workload: "object+array+record primitive constraints" },
  environment: { node: process.version, platform: `${platform()} ${release()}`, cpu: cpus()[0]?.model, cpuCount: cpus().length },
  iterations,
  correctness: { genericRejectedInvalid: genericCorrect, aotRejectedInvalid: aotCorrect, mismatches, failures: genericCorrect && aotCorrect && mismatches === 0 ? 0 : 1 },
  generic,
  aot,
  performance: { overheadPercent: Number(((aot.nsPerValidation / generic.nsPerValidation - 1) * 100).toFixed(2)) },
  claim: "directional validation-cost evidence only; not a release or universal performance claim",
}

const output = JSON.stringify(report, null, 2)
if (process.env.SCHEMA_BENCH_OUTPUT) await writeFile(process.env.SCHEMA_BENCH_OUTPUT, `${output}\n`)
console.log(output)
if (report.correctness.failures !== 0) process.exitCode = 1

function measure(run: () => unknown, count: number) {
  const before = process.memoryUsage()
  const started = performance.now()
  for (let index = 0; index < count; index++) run()
  const elapsedMs = performance.now() - started
  const after = process.memoryUsage()
  return {
    elapsedMs: Number(elapsedMs.toFixed(3)),
    validationsPerSecond: Math.round(count / (elapsedMs / 1000)),
    nsPerValidation: Number(((elapsedMs * 1_000_000) / count).toFixed(2)),
    heapDeltaBytes: after.heapUsed - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss,
  }
}

function warmup(run: () => unknown): void {
  for (let index = 0; index < 2000; index++) run()
}

function outcome(run: () => unknown): boolean {
  try { run(); return true } catch { return false }
}

function rejects(run: () => unknown): boolean {
  return !outcome(run)
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

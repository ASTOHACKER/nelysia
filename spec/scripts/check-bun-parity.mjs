import { readFile } from "node:fs/promises"

const files = process.argv.slice(2)
const failures = []
if (files.length < 3) failures.push("expected at least three benchmark JSON files for consecutive-run verification")

for (const file of files) {
  let report
  try {
    report = JSON.parse(await readFile(file, "utf8"))
  } catch (error) {
    failures.push(`${file}: cannot read benchmark JSON (${error.message})`)
    continue
  }

  const environment = report.environment ?? {}
  if (report.schema !== "nelysia.benchmark.v11") failures.push(`${file}: unexpected benchmark schema`)
  if (environment.routeSet !== "multi" || environment.routeCount !== 2) failures.push(`${file}: expected multi route fixture with routeCount=2`)
  if (environment.entrypoint !== undefined && environment.entrypoint !== "listen") failures.push(`${file}: expected app.listen() entrypoint`)

  const objectResults = report.results?.filter((result) => result.runtime === "Bun" && result.tier === "object") ?? []
  const dynamicResults = report.results?.filter((result) => result.runtime === "Bun" && result.tier === "dynamic") ?? []
  const nelysiaObject = objectResults.find((result) => result.framework === "Nelysia (Zero-arg Specialized)")
  const elysiaObject = objectResults.find((result) => result.framework === "Elysia")
  const nelysiaDynamic = dynamicResults.find((result) => result.framework === "Nelysia (Params Compiled)")
  const elysiaDynamic = dynamicResults.find((result) => result.framework === "Elysia")

  for (const result of report.results ?? []) {
    // Standard Bun Handler is a documented createBunHandler() lane (handler
    // entrypoint by design); parity gate enforces app.listen() for the rest,
    // including the hook-forced Generic lane which respects BENCH_ENTRYPOINT.
    if (result.framework !== "Nelysia (Standard Bun Handler)" && result.entrypoint !== "listen") failures.push(`${file}: ${result.framework} was not measured through app.listen()`)
    if (result.routeCount !== 2) failures.push(`${file}: ${result.framework} has routeCount=${result.routeCount}, expected 2`)
    if (result.failureCount !== 0 || result.successRate !== 100) failures.push(`${file}: ${result.framework} has request failures`)
    if ((result.statusMismatchCount ?? 0) !== 0) failures.push(`${file}: ${result.framework} has status mismatches`)
    if ((result.bodyMismatchCount ?? 0) !== 0) failures.push(`${file}: ${result.framework} has body mismatches`)
  }

  checkParity(file, "zero-arg object", nelysiaObject, elysiaObject)
  checkParity(file, "dynamic params", nelysiaDynamic, elysiaDynamic)
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  console.error("no-performance-claim")
  process.exitCode = 1
} else {
  console.log(`Bun parity verification passed for ${files.length} consecutive app.listen() runs; no performance claim beyond the recorded fixture`)
}

function checkParity(file, label, nelysia, elysia) {
  if (!nelysia || !elysia) {
    failures.push(`${file}: missing ${label} Nelysia/Elysia results`)
    return
  }
  const difference = Math.abs(nelysia.rps / elysia.rps - 1)
  if (!Number.isFinite(difference) || difference > 0.02) failures.push(`${file}: ${label} parity is ${(difference * 100).toFixed(2)}% outside ±2%`)
}

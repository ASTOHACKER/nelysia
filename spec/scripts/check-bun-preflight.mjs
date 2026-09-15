#!/usr/bin/env node

import { readFile } from "node:fs/promises"

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error("Usage: node spec/scripts/check-bun-preflight.mjs <public-json> [<public-json> ...] [--generic <generic-json> ...]")
  process.exit(1)
}

const genericIndex = files.indexOf("--generic")
const publicFiles = genericIndex === -1 ? files : files.slice(0, genericIndex)
const genericFiles = genericIndex === -1 ? [] : files.slice(genericIndex + 1)

const expectedEnvironment = {
  routeSet: "multi",
  routeCount: 2,
  entrypoint: "listen",
  concurrency: 50,
  durationSec: 5,
  rounds: 5,
  warmupSec: 2
}

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"))
const reports = await Promise.all([...publicFiles, ...genericFiles].map(readJson))
const failures = []
const publicReports = reports.slice(0, publicFiles.length)
const genericReports = reports.slice(publicFiles.length)

function checkEnvironment(report, file, entrypoint) {
  const environment = report.environment ?? {}
  for (const [key, expected] of Object.entries({ ...expectedEnvironment, entrypoint })) {
    if (environment[key] !== expected) failures.push(`${file}: environment.${key} expected ${expected}, got ${environment[key]}`)
  }
}

function checkResult(result, file, expectedEntrypoint) {
  if (result.entrypoint !== expectedEntrypoint) failures.push(`${file}: ${result.framework} entrypoint expected ${expectedEntrypoint}, got ${result.entrypoint}`)
  if (result.routeCount !== expectedEnvironment.routeCount) failures.push(`${file}: ${result.framework} routeCount expected ${expectedEnvironment.routeCount}, got ${result.routeCount}`)
  if (result.failureCount !== 0) failures.push(`${file}: ${result.framework} failureCount is ${result.failureCount}`)
  if (result.statusMismatchCount !== 0) failures.push(`${file}: ${result.framework} statusMismatchCount is ${result.statusMismatchCount}`)
  if (result.bodyMismatchCount !== 0) failures.push(`${file}: ${result.framework} bodyMismatchCount is ${result.bodyMismatchCount}`)
  if (result.successRate !== 100) failures.push(`${file}: ${result.framework} successRate is ${result.successRate}`)
}

function findResult(report, predicate, file) {
  const result = report.results?.find(predicate)
  if (!result) failures.push(`${file}: required benchmark result is missing`)
  return result
}

const publicSamples = []
for (let index = 0; index < publicReports.length; index++) {
  const file = publicFiles[index]
  const report = publicReports[index]
  checkEnvironment(report, file, "listen")
  for (const result of report.results ?? []) {
    const expectedEntrypoint = result.framework === "Nelysia (Standard Bun Handler)" ? "handler" : "listen"
    checkResult(result, file, expectedEntrypoint)
  }

  const zeroArg = findResult(report, (result) => result.framework === "Nelysia (Zero-arg Specialized)" && result.tier === "object", file)
  const dynamic = findResult(report, (result) => result.framework === "Nelysia (Params Compiled)" && result.tier === "dynamic", file)
  const elysiaObject = findResult(report, (result) => result.framework === "Elysia" && result.tier === "object", file)
  const elysiaDynamic = findResult(report, (result) => result.framework === "Elysia" && result.tier === "dynamic", file)
  if (zeroArg && elysiaObject && dynamic && elysiaDynamic) {
    publicSamples.push({
      file,
      zeroArgRps: zeroArg.rps,
      elysiaObjectRps: elysiaObject.rps,
      dynamicRps: dynamic.rps,
      elysiaDynamicRps: elysiaDynamic.rps
    })
  }
}

for (let index = 0; index < genericReports.length; index++) {
  const file = genericFiles[index]
  const report = genericReports[index]
  checkEnvironment(report, file, "handler")
  for (const result of report.results ?? []) checkResult(result, file, "handler")
}

const withinTwoPercent = (actual, expected) => Math.abs(actual / expected - 1) <= 0.02
const parity = publicSamples.map((sample) => ({
  file: sample.file,
  zeroArgVsElysia: sample.zeroArgRps / sample.elysiaObjectRps - 1,
  dynamicVsElysia: sample.dynamicRps / sample.elysiaDynamicRps - 1
}))

const hasThreeSeeds = publicSamples.length >= 3
const parityPasses = hasThreeSeeds && parity.every((sample) => withinTwoPercent(sample.zeroArgVsElysia + 1, 1) && withinTwoPercent(sample.dynamicVsElysia + 1, 1))
const status = failures.length > 0 ? "block" : parityPasses ? "pass" : "no-performance-claim"
const output = {
  schema: "nelysia.bun.preflight-verifier.v1",
  status,
  publicSamples,
  parity,
  requiredPublicSeeds: 3,
  observedPublicSeeds: publicSamples.length,
  genericSamples: genericReports.length,
  failures,
  policy: status === "no-performance-claim"
    ? "Correctness evidence is valid, but three stable public listen samples within +/-2% are not established; do not claim speedup."
    : status === "pass"
      ? "Public Bun listen parity is within +/-2% for three samples and correctness checks pass."
      : "Correctness or benchmark contract failed; block release."
}

console.log(JSON.stringify(output, null, 2))
process.exitCode = status === "pass" ? 0 : status === "no-performance-claim" ? 2 : 1

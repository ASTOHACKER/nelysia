import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const manifestPath = resolve(process.argv[2] ?? "docs/schema-compatibility.json")
const failures = []
const requiredConstructors = [
  "String", "Number", "Integer", "Boolean", "BigInt", "Null", "Never", "Ref", "Cyclic",
  "Object", "Array", "Tuple", "Literal", "Union", "Nullable", "Optional", "Any", "Unknown", "Date",
  "TemplateLiteral", "Partial", "Pick", "Omit", "Intersect", "Enum", "Record", "Required", "Readonly", "Composite"
]
const requiredRuntimes = ["generic", "bun", "node", "fetch"]
const requiredAdapters = ["bun", "node", "fetch"]
const requiredCases = [
  "primitive-options", "object-required", "array-options", "tuple", "record", "union-nullable-intersect",
  "template-literal", "refs-cyclic", "standard-fallback", "response-schema", "errors", "head-options-405", "mounts-request-id"
]

let manifest
let packageJson
try {
  packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"))
} catch (error) {
  failures.push(`package.json: cannot read package metadata (${error.message})`)
}
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"))
} catch (error) {
  failures.push(`${manifestPath}: cannot read manifest (${error.message})`)
}

if (manifest) {
  if (manifest.schema !== "nelysia.schema-compatibility.v1") failures.push("manifest: unexpected schema")
  if (manifest.target?.typebox !== "1.3.30") failures.push("manifest: TypeBox target must be 1.3.30")
  if (manifest.status !== "PASS") failures.push(`manifest: status is ${manifest.status ?? "missing"}`)
  if (!manifest.packageVersion) failures.push("manifest: packageVersion is required")
  if (packageJson && manifest.packageVersion !== packageJson.version) failures.push(`manifest: packageVersion must match package.json (${packageJson.version})`)

  const constructors = new Map((manifest.constructors ?? []).map((entry) => [entry.name, entry]))
  for (const name of requiredConstructors) {
    const entry = constructors.get(name)
    if (!entry) failures.push(`constructors: missing ${name}`)
    else {
      if (entry.status !== "supported") failures.push(`constructors: ${name} is not marked supported`)
      if (!Array.isArray(entry.coveredBy) || entry.coveredBy.length === 0) failures.push(`constructors: ${name} has no runtime coverage`)
      if (entry.reference !== "pass") failures.push(`constructors: ${name} reference result is not pass`)
      if (entry.aot !== "compiled" && entry.aot !== "reference") failures.push(`constructors: ${name} has invalid AOT classification`)
    }
  }

  const cases = new Set(manifest.cases ?? [])
  for (const name of requiredCases) if (!cases.has(name)) failures.push(`cases: missing ${name}`)

  const runtimeResults = new Map((manifest.runtimeResults ?? []).map((entry) => [entry.runtime, entry]))
  for (const runtime of requiredRuntimes) {
    const result = runtimeResults.get(runtime)
    if (!result) {
      failures.push(`runtime: missing ${runtime}`)
      continue
    }
    if (result.status !== "pass") failures.push(`runtime: ${runtime} did not pass`)
    for (const field of ["failures", "statusMismatch", "bodyMismatch", "errorMismatch"]) {
      if (result[field] !== 0) failures.push(`runtime: ${runtime} has ${field}=${result[field] ?? "missing"}`)
    }
    if (result.caseCount !== requiredCases.length) failures.push(`runtime: ${runtime} caseCount must be ${requiredCases.length}`)
    if (typeof result.evidence !== "string" || result.evidence.length === 0) failures.push(`runtime: ${runtime} is missing evidence`)
  }

  const lanes = new Set((manifest.aotResults ?? []).map((entry) => entry.lane))
  for (const lane of ["compiled", "specialized", "generic"]) if (!lanes.has(lane)) failures.push(`AOT: missing ${lane} result`)
  for (const result of manifest.aotResults ?? []) {
    if (result.status !== "pass") failures.push(`AOT: ${result.lane} did not pass`)
    if (result.fallback === true) {
      const diagnostic = result.diagnostic
      if (!diagnostic || diagnostic.expected !== true || typeof diagnostic.code !== "string" || typeof diagnostic.route !== "string" || typeof diagnostic.field !== "string") {
        failures.push(`AOT: ${result.lane} has a silent or incomplete fallback diagnostic`)
      }
    }
    if (result.fallback === false && result.diagnostic !== null) failures.push(`AOT: ${result.lane} has an unexpected diagnostic`)
  }

  const diagnostics = manifest.fallbackDiagnostics ?? []
  if (diagnostics.length === 0) failures.push("fallback: expected at least one explicit unsupported/reference diagnostic")
  for (const diagnostic of diagnostics) {
    if (diagnostic.expected !== true || typeof diagnostic.code !== "string" || typeof diagnostic.route !== "string" || typeof diagnostic.field !== "string") failures.push("fallback: incomplete diagnostic")
  }

  const adapters = new Map((manifest.adapters ?? []).map((entry) => [entry.runtime, entry]))
  for (const runtime of requiredAdapters) {
    const adapter = adapters.get(runtime)
    if (!adapter) failures.push(`adapter: missing ${runtime}`)
    else if (adapter.status !== "pass" || typeof adapter.evidence !== "string" || adapter.evidence.length === 0) failures.push(`adapter: ${runtime} has no passing evidence`)
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  console.error("schema compatibility verification failed")
  process.exitCode = 1
} else {
  console.log(`Schema compatibility verification passed for ${manifest.cases.length} cases, ${manifest.constructors.length} constructors, and ${requiredAdapters.length} adapters`)
}

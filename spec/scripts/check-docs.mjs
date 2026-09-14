import { readFile } from "node:fs/promises"

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"))
const docs = await Promise.all([
  readFile(new URL("../../README.md", import.meta.url), "utf8"),
  readFile(new URL("../../docs/DOCUMENTATION_EN.md", import.meta.url), "utf8"),
  readFile(new URL("../../docs/DOCUMENTATION_TH.md", import.meta.url), "utf8"),
  readFile(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
  readFile(new URL("../../docs/release-status.md", import.meta.url), "utf8"),
  readFile(new URL("../../docs/index.html", import.meta.url), "utf8")
])
const text = docs.join("\n")
const failures = []

for (const exportPath of Object.keys(packageJson.exports)) {
  const specifier = exportPath === "." ? packageJson.name : `${packageJson.name}${exportPath.slice(1)}`
  if (!text.includes(specifier)) failures.push(`missing documented export: ${specifier}`)
}
for (const stale of ["sourceToSource: false", "arbitrary source-to-source route generation remains deferred", "supported static and params-only GET routes produce a standalone artifact"]) {
  if (text.includes(stale)) failures.push(`stale documentation claim: ${stale}`)
}
if (!text.includes("NELY101") || !text.includes("NELY111")) failures.push("compiler reason-code range is not documented")
if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exitCode = 1
} else {
  console.log(`documentation check passed for ${Object.keys(packageJson.exports).length} package exports`)
}

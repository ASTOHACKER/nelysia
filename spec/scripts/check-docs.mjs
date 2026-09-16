import { readFile, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"))
const winMatrixPath = resolve(fileURLToPath(new URL("../..", import.meta.url)), "docs/benchmark-win-matrix-2026-09-16.json")
const winMatrix = JSON.parse(await readFile(winMatrixPath, "utf8"))
const { verifyWinMatrix } = await import("./check-win-matrix.mjs")
const root = fileURLToPath(new URL("../..", import.meta.url))
const indexPath = resolve(root, "docs/index.html")
const documentationFiles = [
  "README.md",
  "docs/README.md",
  "docs/DOCUMENTATION_EN.md",
  "docs/DOCUMENTATION_TH.md",
  "docs/ARCHITECTURE.md",
  "docs/release-status.md",
  "docs/roadmap-v1.md",
  "docs/v1.0.md",
  "docs/compatibility.md",
  "docs/benchmark-latest-readable-2026-09-16.md",
  "docs/index.html",
  "docs/reference/versioning.md",
  "docs/core/route-options.md",
  "docs/core/errors.md",
  "docs/auth/overview.md",
  "docs/auth/jwt.md",
  "docs/auth/better-auth.md",
  "docs/auth/session.md",
  "docs/auth/roles-permissions.md",
  "docs/plugins/authoring-plugins.md"
]
const docs = await Promise.all(documentationFiles.map((file) => readFile(resolve(root, file), "utf8")))
const text = docs.join("\n")
const failures = []
const html = await readFile(indexPath, "utf8")
const currentVersion = `v${packageJson.version}`

for (const file of ["README.md", "docs/README.md", "docs/DOCUMENTATION_EN.md", "docs/DOCUMENTATION_TH.md", "docs/index.html", "docs/reference/versioning.md", "docs/release-status.md"]) {
  if (!textFor(file).includes(currentVersion)) failures.push(`current version is missing from ${file}: ${currentVersion}`)
}

const releaseStatus = textFor("docs/release-status.md")
if (!releaseStatus.includes("Current package: `1.2.0`")) failures.push("release status does not identify v1.2.0 as current")
if (!releaseStatus.includes("Next Workspace") || !releaseStatus.includes("BLOCKED") || !releaseStatus.includes("NO PERFORMANCE CLAIM")) {
  failures.push("release status is missing the unreleased Win Matrix blocker state")
}
for (const [file, marker] of [["docs/roadmap-v1.md", "Historical Roadmap"], ["docs/v1.0.md", "Historical"], ["docs/compatibility.md", "historically"]]) {
  if (!textFor(file).includes(marker)) failures.push(`historical documentation marker is missing from ${file}`)
}
const currentBenchmark = textFor("docs/benchmark-latest-readable-2026-09-16.md")
for (const required of ["BLOCKED", "Bun", "AMD Ryzen", "seeds", "npm run benchmark:verify:win-matrix"]) {
  if (!currentBenchmark.includes(required)) failures.push(`current benchmark evidence is missing ${required}`)
}
const winMatrixResult = verifyWinMatrix(winMatrix, packageJson.version)
const docsDeclareBlocked = currentBenchmark.includes("BLOCKED") && currentBenchmark.includes("NO PERFORMANCE CLAIM")
if (winMatrixResult.ok === docsDeclareBlocked) {
  failures.push(`Win Matrix documentation status does not match verifier: verifier=${winMatrixResult.ok ? "PASS" : "BLOCKED"}, docs=${docsDeclareBlocked ? "BLOCKED" : "PASS"}`)
}

for (const exportPath of Object.keys(packageJson.exports)) {
  const specifier = exportPath === "." ? packageJson.name : `${packageJson.name}${exportPath.slice(1)}`
  if (!text.includes(specifier)) failures.push(`missing documented export: ${specifier}`)
}
for (const stale of [
  "sourceToSource: false",
  "arbitrary source-to-source route generation remains deferred",
  "supported static and params-only GET routes produce a standalone artifact",
  "Contract frozen; release pending",
  "Current v0.6 workspace gate",
  "current non-24-hour v0.6 workspace-gate",
  "current additive v0.6 workspace gate",
  "Current v1.0 release-line verification gate",
  "current v1.0 release-line verification gate"
]) {
  if (text.includes(stale)) failures.push(`stale documentation claim: ${stale}`)
}
if (!text.includes("NELY101") || !text.includes("NELY111") || !text.includes("NELY112") || !text.includes("NELY113") || !text.includes("NELY114") || !text.includes("NELY115")) failures.push("compiler reason-code range is not documented")

// Keep the local portal useful when opened from file:// with no network. This
// validates both the file target and the fragment target for every relative
// link in the portal; external CDN/GitHub links are intentionally out of scope.
const htmlIds = new Set([...html.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)].map((match) => match[1]))
const localLinks = [...html.matchAll(/\bhref=["']([^"']+)["']/g)]
const targetCache = new Map()
for (const [, href] of localLinks) {
  if (href.startsWith("http:") || href.startsWith("https:") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue
  const [rawFile, rawFragment] = href.split("#", 2)
  const fragment = rawFragment === undefined ? undefined : decodeURIComponent(rawFragment)
  const filePath = rawFile.length === 0 ? indexPath : resolve(root, "docs", rawFile)
  let target
  if (targetCache.has(filePath)) target = targetCache.get(filePath)
  else {
    try {
      target = await readFile(filePath, "utf8")
    } catch {
      failures.push(`broken documentation link: ${href}`)
      continue
    }
    targetCache.set(filePath, target)
  }
  if (fragment === undefined || fragment.length === 0) continue
  if (filePath === indexPath) {
    if (!htmlIds.has(fragment)) failures.push(`missing portal anchor: ${href}`)
    continue
  }
  if (!hasMarkdownAnchor(target, fragment)) failures.push(`missing documentation anchor: ${href}`)
}

// Validate local Markdown links in the modular reference pages as well. These
// pages are intentionally usable from file:// without a network connection.
for (const file of documentationFiles.filter((value) => value.startsWith("docs/") && value.endsWith(".md"))) {
  const source = textFor(file)
  for (const [, href] of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (href.startsWith("http:") || href.startsWith("https:") || href.startsWith("mailto:") || href.startsWith("#")) continue
    const [rawTarget, rawFragment] = href.split("#", 2)
    const targetPath = resolve(root, file.substring(0, file.lastIndexOf("/")), rawTarget)
    let target
    try {
      const metadata = await stat(targetPath)
      if (metadata.isDirectory()) continue
      target = await readFile(targetPath, "utf8")
    } catch {
      failures.push(`broken modular documentation link: ${file} -> ${href}`)
      continue
    }
    if (rawFragment) {
      const fragment = decodeURIComponent(rawFragment)
      const anchorExists = targetPath.endsWith(".html")
        ? new RegExp(`\\b(?:id|name)=["']${escapeRegExp(fragment)}["']`).test(target)
        : hasMarkdownAnchor(target, fragment)
      if (!anchorExists) failures.push(`missing modular documentation anchor: ${file} -> ${href}`)
    }
  }
}

const copyBars = (html.match(/class="code-bar"/g) ?? []).length
const copyButtons = (html.match(/navigator\.clipboard\?\.writeText|navigator\.clipboard\.writeText/g) ?? []).length
if (copyBars === 0 || copyButtons === 0) failures.push("code-copy controls are not wired")
const englishLabels = (html.match(/data-lang="en"/g) ?? []).length
const thaiLabels = (html.match(/data-lang="th"/g) ?? []).length
if (englishLabels === 0 || thaiLabels === 0 || !html.includes('id="btn-en"') || !html.includes('id="btn-th"')) failures.push("bilingual language toggle/content is incomplete")
if (!html.includes(`Current package`) || !html.includes(`24-hour soak`) || !html.includes(`Production readiness`)) failures.push("current release status box is incomplete")

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exitCode = 1
} else {
  console.log(`documentation check passed for ${Object.keys(packageJson.exports).length} package exports, ${localLinks.length} local portal links, ${copyBars} copy controls, and EN/TH content`)
}

function textFor(file) {
  return docs[documentationFiles.indexOf(file)] ?? ""
}

function hasMarkdownAnchor(source, fragment) {
  if (source.includes(`](#${fragment})`)) return true
  const headings = [...source.matchAll(/^#{1,6}\s+(.+)$/gm)]
  return headings.some(([, heading]) => markdownSlug(heading) === fragment)
}

function markdownSlug(value) {
  return value
    .replace(/[`*_~]/g, "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

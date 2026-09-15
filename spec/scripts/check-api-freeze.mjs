import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const checklist = await readFile(resolve(root, "docs/api-freeze-checklist.md"), "utf8")
const unchecked = checklist.match(/^- \[ \] /gm) ?? []

if (unchecked.length > 0) {
  console.error(`API freeze is not ready: ${unchecked.length} checklist items remain unchecked`)
  process.exitCode = 1
} else {
  console.log("API freeze checklist passed: all contract and prerequisite items are checked")
}

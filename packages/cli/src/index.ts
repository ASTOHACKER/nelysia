#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { compile, generateBuildArtifact, inspect } from "../../compiler/src/index.ts"

const args = process.argv.slice(2)
const command = args[0]
const targetIndex = args.indexOf("--target")
const target = (targetIndex === -1 ? "bun" : args[targetIndex + 1]) as "bun" | "node"
const entry = args.find((arg, index) => index > 0 && !arg.startsWith("--") && args[index - 1] !== "--target") ?? "src/app.ts"

if (!command || !["inspect", "build"].includes(command) || !["bun", "node"].includes(target)) {
  console.error("Usage: nelysia <inspect|build> [entry] [--target bun|node]")
  process.exitCode = 1
} else {
  const module = await import(pathToFileURL(resolve(entry)).href)
  if (!module.app || typeof module.app.handle !== "function") {
    throw new Error(`Entry ${entry} must export an app instance as 'app'`)
  }
  const compiled = compile(module.app)
  if (command === "inspect") {
    console.log(inspect(compiled))
  } else {
    await mkdir("dist", { recursive: true })
    await mkdir(".nelysia-cache", { recursive: true })
    const artifact = generateBuildArtifact({ entry: relativeImport("dist", resolve(entry)), target, compiled })
    await writeFile(`dist/${artifact.manifest.artifact}`, artifact.source)
    await writeFile(`dist/${artifact.manifest.sourceMap}`, artifact.sourceMap + "\n")
    await writeFile("dist/manifest.json", JSON.stringify(artifact.manifest, null, 2) + "\n")
    await writeFile(`.nelysia-cache/${artifact.manifest.cacheKey}.json`, JSON.stringify(artifact.manifest, null, 2) + "\n")
    console.log(`Nelysia build: wrote dist/${artifact.manifest.artifact} and dist/manifest.json (target: ${target})`)
  }
}

function relativeImport(from: string, to: string): string {
  const path = relative(resolve(from), to).replaceAll("\\", "/")
  return path.startsWith(".") ? path : `./${path}`
}

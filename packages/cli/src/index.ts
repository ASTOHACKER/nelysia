#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { compile, generateBuildArtifact, inspect } from "../../compiler/src/index.ts"
import { generateClientTypes } from "../../openapi/src/index.ts"

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]
  const targetIndex = args.indexOf("--target")
  const targetValue = targetIndex === -1 ? "bun" : args[targetIndex + 1]
  const target = targetValue as "bun" | "node"
  const entry = positional(args, 1) ?? "src/app.ts"
  const allowedOptions = command === "inspect"
    ? new Set(["--target"])
    : command === "build"
      ? new Set(["--target", "--out"])
      : command === "generate"
        ? new Set(["--dir"])
        : command === "client" ? new Set(["--out", "--force"]) : new Set<string>()
  const optionError = validateOptions(args, allowedOptions)

  if (optionError !== undefined || !command || !["inspect", "build", "generate", "client"].includes(command) || (command !== "generate" && command !== "client" && !["bun", "node"].includes(targetValue))) {
    console.error(optionError ?? "Invalid command or target")
    console.error("Usage: nelysia <inspect|build> [entry] [--target bun|node] [--out dist] | nelysia generate feature <name> [--dir src/modules] | nelysia client <entry> --out <file> [--force]")
    process.exitCode = 1
  } else if (command === "generate") {
    if (args[1] !== "feature" || !args[2]) throw new Error("Usage: nelysia generate feature <name> [--dir src/modules]")
    const directoryIndex = args.indexOf("--dir")
    const directory = directoryIndex === -1 ? "src/modules" : args[directoryIndex + 1]
    if (!directory) throw new Error("--dir requires a directory")
    const files = await generateFeatureModule(args[2], directory)
    console.log(`Nelysia feature module: generated ${files.length} files in ${join(directory, args[2])}`)
  } else if (command === "client") {
    const clientEntry = positional(args, 1)
    const outIndex = args.indexOf("--out")
    const out = outIndex === -1 ? undefined : args[outIndex + 1]
    if (!clientEntry || !out) throw new Error("Usage: nelysia client <entry> --out <file> [--force]")
    await generateClientFile(clientEntry, out, args.includes("--force"))
    console.log(`Nelysia client: wrote ${out}`)
  } else {
    const module = await import(pathToFileURL(resolve(entry)).href)
    if (!module.app || typeof module.app.handle !== "function") throw new Error(`Entry ${entry} must export an app instance as 'app'`)
    await module.app.modules
    const compiled = compile(module.app)
    if (command === "inspect") console.log(inspect(compiled))
    else {
      const outIndex = args.indexOf("--out")
      const outputDirectory = outIndex === -1 ? "dist" : args[outIndex + 1]
      if (!outputDirectory) throw new Error("--out requires a directory")
      await mkdir(outputDirectory, { recursive: true })
      await mkdir(".nelysia-cache", { recursive: true })
      const artifact = generateBuildArtifact({ entry: relativeImport(outputDirectory, resolve(entry)), target, compiled })
      await writeFile(join(outputDirectory, artifact.manifest.artifact), artifact.source)
      await writeFile(join(outputDirectory, artifact.manifest.sourceMap), artifact.sourceMap + "\n")
      await writeFile(join(outputDirectory, "manifest.json"), JSON.stringify(artifact.manifest, null, 2) + "\n")
      await writeFile(`.nelysia-cache/${artifact.manifest.cacheKey}.json`, JSON.stringify(artifact.manifest, null, 2) + "\n")
      console.log(`Nelysia build: wrote ${join(outputDirectory, artifact.manifest.artifact)} and ${join(outputDirectory, "manifest.json")} (target: ${target})`)
    }
  }
}

function validateOptions(args: string[], allowed: Set<string>): string | undefined {
  const valueOptions = new Set(["--target", "--out", "--dir"])
  for (let index = 1; index < args.length; index++) {
    const argument = args[index]
    if (!argument.startsWith("--")) continue
    if (!allowed.has(argument)) return `Invalid argument: ${argument}`
    if (valueOptions.has(argument) && (args[index + 1] === undefined || args[index + 1].startsWith("--"))) return `${argument} requires a value`
    if (valueOptions.has(argument)) index++
  }
  return undefined
}

export async function generateClientFile(entry: string, output: string, force = false): Promise<void> {
  const outputPath = resolve(output)
  if (!force) {
    try {
      await access(outputPath)
      throw new Error(`Refusing to overwrite existing client file: ${output}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Refusing to overwrite")) throw error
    }
  }
  const module = await import(pathToFileURL(resolve(entry)).href)
  if (!module.app || typeof module.app.handle !== "function") throw new Error(`Entry ${entry} must export an app instance as 'app'`)
  await module.app.modules
  const source = `import { createTypedClient, type ClientOptions } from "@narudom96/nelysia/client"\n\n${generateClientTypes(module.app)}\nexport const createClient = (baseUrl: string, options?: ClientOptions) => createTypedClient<NelysiaRoutes>(baseUrl, options)\n`
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, source, { flag: force ? "w" : "wx" })
}

export async function generateFeatureModule(name: string, root = "src/modules"): Promise<string[]> {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Feature name must use kebab-case")
  const directory = join(root, name)
  const files: Record<string, string> = {
    "index.ts": `import { Nelysia, t } from "@narudom96/nelysia"\nimport { ${camelCase(name)}Service } from "./service.js"\n\nconst ${camelCase(name)}Model = t.Object({ id: t.String() })\n\nexport const ${camelCase(name)} = new Nelysia({ name: "${name}", prefix: "/${name}" })\n  .model({ ${pascalCase(name)}: ${camelCase(name)}Model })\n  .get("/", () => ${camelCase(name)}Service.list(), { response: "${pascalCase(name)}" })\n`,
    "model.ts": `import { t } from "@narudom96/nelysia"\n\nexport const ${pascalCase(name)}Model = t.Object({ id: t.String() })\n`,
    "service.ts": `export const ${camelCase(name)}Service = {\n  list() {\n    return [] as { id: string }[]\n  }\n}\n`,
    "repository.ts": `export interface ${pascalCase(name)}Repository {\n  list(): Promise<{ id: string }[]>\n}\n`,
    "test.ts": `import test from "node:test"\nimport assert from "node:assert/strict"\nimport { ${camelCase(name)} } from "./index.js"\n\ntest("${name} module contract", async () => {\n  const response = await ${camelCase(name)}.inject({ method: "GET", path: "/" })\n  assert.equal(response.status, 200)\n})\n`
  }
  await mkdir(directory, { recursive: true })
  for (const [file, content] of Object.entries(files)) await writeFile(join(directory, file), content, { flag: "wx" })
  return Object.keys(files)
}

function relativeImport(from: string, to: string): string {
  const path = relative(resolve(from), to).replaceAll("\\", "/")
  return path.startsWith(".") ? path : `./${path}`
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function pascalCase(value: string): string {
  const camel = camelCase(value)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function positional(args: string[], start: number): string | undefined {
  const optionValues = new Set(["--target", "--dir", "--out"])
  for (let index = start; index < args.length; index++) {
    const arg = args[index]
    if (arg.startsWith("--")) {
      if (optionValues.has(arg)) index++
      continue
    }
    return arg
  }
}

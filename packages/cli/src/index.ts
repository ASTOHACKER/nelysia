#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { realpathSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { compile, generateBuildArtifact, inspect, unsupportedRouteDiagnostic } from "../../compiler/src/index.ts"
import { generateClientTypes } from "../../openapi/src/index.ts"
import type { ServerInfo } from "../../core/src/types.ts"

if (isCliEntrypoint()) await main()

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) }
  catch { return false }
}

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
        : command === "client" ? new Set(["--out", "--force"])
          : command === "dev" ? new Set(["--target", "--port"])
      : command === "create" ? new Set(["--dir"]) : command === "doctor" ? new Set(["--strict"]) : new Set<string>()
  const optionError = validateOptions(args, allowedOptions)
  const supportedCommands = ["inspect", "build", "generate", "client", "routes", "doctor", "create", "dev"]

  if (optionError !== undefined || !command || !supportedCommands.includes(command) || (["inspect", "build", "dev"].includes(command) && !["bun", "node"].includes(targetValue))) {
    console.error(optionError ?? "Invalid command or target")
    console.error("Usage: nelysia <routes|inspect|doctor|dev|build> [entry] [--target bun|node] [--port 3000] | nelysia create <name> [--dir .] | nelysia generate feature <name> [--dir src/modules] | nelysia client <entry> --out <file> [--force]")
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
  } else if (command === "create") {
    const name = positional(args, 1)
    if (!name) throw new Error("Usage: nelysia create <name> [--dir .]")
    const directoryIndex = args.indexOf("--dir")
    const root = directoryIndex === -1 ? "." : args[directoryIndex + 1]
    if (!root) throw new Error("--dir requires a directory")
    const files = await createProject(name, root)
    console.log(`Nelysia project: created ${resolve(root, name)} (${files.length} files)`)
  } else if (command === "routes") {
    const app = await loadApplication(entry)
    console.log(formatRoutes(app))
  } else if (command === "doctor") {
    try {
      const app = await loadApplication(entry)
      const report = await doctor(app, { strict: args.includes("--strict") })
      console.log(report.output)
      if (!report.ok) process.exitCode = 1
    } catch (error) {
      console.error(["Nelysia Doctor", "", `✗ Failed to load ${entry}: ${error instanceof Error ? error.message : String(error)}`].join("\n"))
      process.exitCode = 1
    }
  } else if (command === "dev") {
    const app = await loadApplication(entry)
    const portValue = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3000"
    const port = Number(portValue)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be an integer between 0 and 65535")
    await new Promise<void>((resolveReady) => {
      app.listen(port, (info: ServerInfo) => {
        console.log(`Nelysia dev server listening on ${info.url}`)
        resolveReady()
      })
    })
  } else {
    const app = await loadApplication(entry)
    const compiled = compile(app)
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
  const valueOptions = new Set(["--target", "--out", "--dir", "--port"])
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
  const app = await loadApplication(entry)
  const source = `import { createTypedClient, type ClientOptions } from "@narudom96/nelysia/client"\n\n${generateClientTypes(app)}\nexport const createClient = (baseUrl: string, options?: ClientOptions) => createTypedClient<NelysiaRoutes>(baseUrl, options)\n`
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

export async function createProject(name: string, root = "."): Promise<string[]> {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("Project name must use kebab-case")
  const packageJson = await readPackageMetadata()
  const directory = resolve(root, name)
  try {
    await access(directory)
    throw new Error(`Refusing to overwrite existing project: ${directory}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing to overwrite")) throw error
  }
  const src = join(directory, "src")
  await mkdir(src, { recursive: true })
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name, private: true, type: "module", scripts: { dev: "nelysia dev", build: "nelysia build" }, dependencies: { "@narudom96/nelysia": `^${packageJson.version ?? "1.0.0"}` } }, null, 2) + "\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true }, include: ["src/**/*.ts"] }, null, 2) + "\n",
    "src/app.ts": `import { Nelysia } from "@narudom96/nelysia"\n\nexport const app = new Nelysia()\n  .get("/health", () => ({ status: "ok" }))\n`
  }
  for (const [file, content] of Object.entries(files)) await writeFile(join(directory, file), content, { flag: "wx" })
  return Object.keys(files)
}

export async function loadApplication(entry: string): Promise<any> {
  const module = await import(pathToFileURL(resolve(entry)).href)
  if (!module.app || typeof module.app.handle !== "function") throw new Error(`Entry ${entry} must export an app instance as 'app'`)
  await module.app.modules
  return module.app
}

export function formatRoutes(app: { graph: { routes: readonly { method: string; path: string }[] } }): string {
  const compiled = compile(app as any)
  const rows = compiled.analyses.map((route) => `${route.method.padEnd(7)} ${route.path.padEnd(28)} ${route.lane.padEnd(11)} ${route.reason}`)
  return ["METHOD  PATH                         LANE        COMPILER REASON", ...rows].join("\n")
}

export async function doctor(app: { graph: { routes: readonly { method: string; path: string }[] } }, options: { strict?: boolean } = {}): Promise<{ ok: boolean; output: string }> {
  const packageJson = await readPackageMetadata()
  const hasTsconfig = await access(resolve("tsconfig.json")).then(() => true, () => false)
  const routes = app.graph.routes
  const keys = routes.map((route) => `${route.method} ${route.path}`)
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
  const compiled = compile(app as any)
  const counts: Record<string, number> = {}
  for (const route of compiled.analyses) counts[route.lane] = (counts[route.lane] ?? 0) + 1
  const internals = app as unknown as {
    authStrategyProviders?: Map<string, unknown>
    routeFeatureProviders?: Map<string, unknown>
    configurationDiagnostics?: readonly string[]
  }
  const authProviders = internals.authStrategyProviders?.size ?? 0
  const featureProviders = internals.routeFeatureProviders?.size ?? 0
  const configurationDiagnostics = internals.configurationDiagnostics ?? []
  const routeWarnings = compiled.analyses.filter((route) => route.lane === "GENERIC")
  const routeErrors = routes.flatMap((route) => {
    const detailed = route as typeof route & { auth?: unknown; features?: Record<string, unknown> }
    const auth = detailed.auth
    const authStrategy = typeof auth === "string" ? auth : auth && typeof auth === "object" && "strategy" in auth ? (auth as { strategy?: string }).strategy : undefined
    const features = detailed.features && typeof detailed.features === "object" ? Object.keys(detailed.features) : []
    const missingAuth = authStrategy !== undefined && !internals.authStrategyProviders?.has(authStrategy)
    const missingFeatures = features.filter((name) => !internals.routeFeatureProviders?.has(name))
    return [
      ...(missingAuth ? [`${route.method} ${route.path} requires auth provider "${authStrategy}"`] : []),
      ...missingFeatures.map((name) => `${route.method} ${route.path} requires feature provider "${name}"`)
    ]
  })
  const checks = [
    `✓ Node ${process.version}`,
    `✓ Nelysia version ${packageJson.version ?? "unknown"}`,
    `${hasTsconfig ? "✓" : "⚠"} TypeScript configuration ${hasTsconfig ? "detected" : "not found"}`,
    `${Object.keys(packageJson.exports ?? {}).length === 25 ? "✓" : "⚠"} Package exports: ${Object.keys(packageJson.exports ?? {}).length}`,
    `${duplicates.length === 0 ? "✓" : "✗"} No duplicate routes`,
    "",
    `Routes: ${routes.length} total`,
    `Providers: ${authProviders} auth, ${featureProviders} feature`,
    `✓ ${counts.COMPILED ?? 0} compiled`,
    `✓ ${counts.SPECIALIZED ?? 0} specialized`,
    `${(counts.GENERIC ?? 0) > 0 ? "⚠" : "✓"} ${counts.GENERIC ?? 0} generic${(counts.GENERIC ?? 0) > 0 ? " (GENERIC fallback)" : ""}`,
    ...routeWarnings.map((route) => `WARN ${route.method} ${route.path} uses generic lane because ${route.reason}`),
    ...routeWarnings.map((route) => {
      const source = routes.find((candidate) => candidate.method === route.method && candidate.path === route.path)
      return source === undefined ? `WARN ${route.method} ${route.path} uses generic lane` : `WARN ${unsupportedRouteDiagnostic(source as any).code} ${unsupportedRouteDiagnostic(source as any).reason}`
    }),
    ...configurationDiagnostics.map((diagnostic) => `ERROR ${diagnostic}`),
    ...routeErrors.map((diagnostic) => `ERROR ${diagnostic}`)
  ]
  const errors = configurationDiagnostics.length + routeErrors.length + (Object.keys(packageJson.exports ?? {}).length === 25 ? 0 : 1)
  const ok = duplicates.length === 0 && hasTsconfig && errors === 0 && (!options.strict || (counts.GENERIC ?? 0) === 0)
  return { ok, output: ["Nelysia Doctor", "", ...checks].join("\n") }
}

async function readPackageMetadata(): Promise<{ version?: string; exports?: Record<string, string> }> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const candidates = [resolve(moduleDirectory, "../../../package.json"), resolve(moduleDirectory, "../../../../package.json")]
  for (const packagePath of candidates) {
    try {
      return JSON.parse(await readFile(packagePath, "utf8")) as { version?: string; exports?: Record<string, string> }
    } catch {
      // Source and packed CLI layouts have different relative roots.
    }
  }
  return {}
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
  const optionValues = new Set(["--target", "--dir", "--out", "--port"])
  for (let index = start; index < args.length; index++) {
    const arg = args[index]
    if (arg.startsWith("--")) {
      if (optionValues.has(arg)) index++
      continue
    }
    return arg
  }
}

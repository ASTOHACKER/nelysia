import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createProject, doctor, formatRoutes, generateFeatureModule } from "../packages/cli/src/index.ts"
import { Nelysia } from "../packages/core/src/index.ts"

const execFileAsync = promisify(execFile)

test("generates a feature module scaffold without overwriting files", async () => {
  const root = await mkdtemp(join(tmpdir(), "nelysia-cli-"))
  const files = await generateFeatureModule("user-profile", root)
  assert.deepEqual(files, ["index.ts", "model.ts", "service.ts", "repository.ts", "test.ts"])
  assert.match(await readFile(join(root, "user-profile", "index.ts"), "utf8"), /prefix: "\/user-profile"/)
  await assert.rejects(() => generateFeatureModule("user-profile", root), /already exists|EEXIST/)
})

test("client command imports an entry, awaits modules, and protects generated output", async () => {
  const root = await mkdtemp(join(tmpdir(), "nelysia-client-cli-"))
  const entry = join(root, "app.ts")
  const output = join(root, "generated", "nelysia-client.ts")
  const core = join(process.cwd(), "packages/core/src/index.ts")
  await writeFile(entry, `import { Nelysia } from ${JSON.stringify(core)}\nexport const app = new Nelysia().get("/ping", () => "pong")\n`)
  const cli = join(process.cwd(), "packages/cli/src/index.ts")
  const args = ["--experimental-strip-types", cli, "client", entry, "--out", output]
  await execFileAsync(process.execPath, args)
  const generated = await readFile(output, "utf8")
  assert.match(generated, /interface NelysiaRoutes/)
  assert.match(generated, /GET \/ping/)
  const compileRoot = await mkdtemp(join(process.cwd(), ".nelysia-generated-client-"))
  const tsconfig = join(compileRoot, "tsconfig.json")
  await writeFile(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: true,
      paths: { "@narudom96/nelysia/client": [join(process.cwd(), "packages/client/src/index.ts")] }
    },
    include: [output]
  }))
  await execFileAsync(join(process.cwd(), "node_modules/.bin/tsc"), ["-p", tsconfig, "--noEmit"])
  await rm(compileRoot, { recursive: true, force: true })
  await assert.rejects(() => execFileAsync(process.execPath, args), /Refusing to overwrite|existing client file/)
  await execFileAsync(process.execPath, [...args, "--force"])
})

test("CLI reports invalid arguments with a non-zero exit code", async () => {
  const cli = join(process.cwd(), "packages/cli/src/index.ts")
  await assert.rejects(
    () => execFileAsync(process.execPath, ["--experimental-strip-types", cli, "build", "--target", "deno"]),
    (error: unknown) => {
      assert.equal((error as { code?: number }).code, 1)
      assert.match(String((error as { stderr?: string }).stderr), /Invalid command or target/)
      return true
    }
  )
})

test("CLI command entrypoints cover inspect, routes, doctor, generate, create, build, and dev", async () => {
  const root = await mkdtemp(join(tmpdir(), "nelysia-cli-commands-"))
  const entry = join(root, "app.ts")
  const cli = join(process.cwd(), "packages/cli/src/index.ts")
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }))
  await writeFile(entry, `import { Nelysia } from ${JSON.stringify(join(process.cwd(), "packages/core/src/index.ts"))}\nexport const app = new Nelysia().get("/health", () => "ok")\n`)
  const runCli = (args: string[]) => execFileAsync(process.execPath, ["--experimental-strip-types", cli, ...args], { cwd: root })

  try {
    const inspected = await runCli(["inspect", entry, "--target", "node"])
    assert.match(inspected.stdout, /GET \/health[\s\S]*Lane: COMPILED/)

    const routes = await runCli(["routes", entry])
    assert.match(routes.stdout, /GET\s+\/health\s+COMPILED/)

    const report = await runCli(["doctor", entry])
    assert.match(report.stdout, /Nelysia Doctor[\s\S]*TypeScript configuration detected/)

    const generatedDirectory = join(root, "modules")
    await runCli(["generate", "feature", "audit", "--dir", generatedDirectory])
    assert.match(await readFile(join(generatedDirectory, "audit", "index.ts"), "utf8"), /export const audit/)

    await runCli(["create", "created-app", "--dir", root])
    assert.match(await readFile(join(root, "created-app", "src/app.ts"), "utf8"), /export const app/)

    const outputDirectory = join(root, "dist")
    const built = await runCli(["build", entry, "--target", "node", "--out", outputDirectory])
    assert.match(built.stdout, /Nelysia build: wrote/)
    assert.match(await readFile(join(outputDirectory, "manifest.json"), "utf8"), /"generation": "standalone"/)

    const dev = spawn(process.execPath, ["--experimental-strip-types", cli, "dev", entry, "--target", "node", "--port", "0"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CLI dev server did not start")), 5000)
      dev.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("Nelysia dev server listening")) {
          clearTimeout(timer)
          resolve()
        }
      })
      dev.once("error", (error) => { clearTimeout(timer); reject(error) })
      dev.once("exit", (code) => { if (code !== null && code !== 0) { clearTimeout(timer); reject(new Error(`CLI dev exited with ${code}`)) } })
    })
    dev.kill("SIGTERM")
    await new Promise<void>((resolve) => {
      if (dev.exitCode !== null) resolve()
      else dev.once("exit", () => resolve())
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("routes and doctor commands expose public execution lanes", async () => {
  const app = new Nelysia()
    .get("/health", () => "ok")
    .get("/users/:id", ({ params }) => params.id)
  const routes = formatRoutes(app)
  assert.match(routes, /GET\s+\/health\s+COMPILED/)
  assert.match(routes, /GET\s+\/users\/:id\s+SPECIALIZED/)
  const report = await doctor(app)
  assert.equal(report.ok, true)
  assert.match(report.output, /Nelysia Doctor/)
  assert.match(report.output, /2 total/)
})

test("create command scaffolds an isolated project", async () => {
  const root = await mkdtemp(join(tmpdir(), "nelysia-create-cli-"))
  const files = await createProject("demo-api", root)
  assert.deepEqual(files, ["package.json", "tsconfig.json", "src/app.ts"])
  const source = await readFile(join(root, "demo-api", "src/app.ts"), "utf8")
  assert.match(source, /export const app/)
  assert.doesNotMatch(source, /app\.listen\(/)
  await assert.rejects(() => createProject("demo-api", root), /Refusing to overwrite/)
  await rm(root, { recursive: true, force: true })
})

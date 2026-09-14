import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
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
  assert.match(await readFile(join(root, "demo-api", "src/app.ts"), "utf8"), /export const app/)
  await assert.rejects(() => createProject("demo-api", root), /Refusing to overwrite/)
  await rm(root, { recursive: true, force: true })
})

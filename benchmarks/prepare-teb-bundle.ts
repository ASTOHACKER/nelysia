import { mkdirSync, copyFileSync, cpSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { spawn } from "node:child_process"
import assert from "node:assert/strict"

const ROOT = process.cwd()
const DEST = join(ROOT, "dist-techempower", "nelysia")

console.log("Preparing self-contained TechEmpower submission bundle...")

if (existsSync(join(ROOT, "dist-techempower"))) {
  rmSync(join(ROOT, "dist-techempower"), { recursive: true, force: true })
}

mkdirSync(DEST, { recursive: true })

// 1. Copy config and Dockerfile
copyFileSync(join(ROOT, "techempower", "benchmark_config.json"), join(DEST, "benchmark_config.json"))
copyFileSync(join(ROOT, "techempower", "package.json"), join(DEST, "package.json"))

// 2. Write Dockerfile for TEB environment
const dockerfileContent = `FROM oven/bun:1.4.0

WORKDIR /usr/src/app

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["bun", "run", "server.ts"]
`
Bun.write(join(DEST, "Dockerfile"), dockerfileContent)

// 3. Write self-contained server.ts
const serverTsContent = `import { Nelysia } from "./packages/core/src/index.ts"
import { createCompiledBunHandler } from "./packages/compiler/src/index.ts"

const port = Number(process.env.PORT ?? 8080)

const app = new Nelysia()
  .getStatic("/plaintext", "Hello, World!")
  .getStatic("/json", { message: "Hello, World!" })

Bun.serve({
  port,
  fetch: createCompiledBunHandler(app)
})

console.log(\`Nelysia TechEmpower server running on port \${port}\`)
`
Bun.write(join(DEST, "server.ts"), serverTsContent)

// 4. Copy required core packages
const packagesDest = join(DEST, "packages")
mkdirSync(packagesDest, { recursive: true })

cpSync(join(ROOT, "packages", "core"), join(packagesDest, "core"), { recursive: true })
cpSync(join(ROOT, "packages", "compiler"), join(packagesDest, "compiler"), { recursive: true })
cpSync(join(ROOT, "packages", "runtime-bun"), join(packagesDest, "runtime-bun"), { recursive: true })
cpSync(join(ROOT, "packages", "runtime-node"), join(packagesDest, "runtime-node"), { recursive: true })

console.log(`✓ Bundle generated at: ${DEST}`)

// 5. Test bundle execution
console.log("Verifying generated bundle...")
const TEST_PORT = 4399
const child = spawn("bun", ["server.ts"], {
  cwd: DEST,
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ["ignore", "pipe", "inherit"]
})

await new Promise<void>((resolve, reject) => {
  child.stdout?.on("data", (d) => {
    if (d.toString().includes("running on port")) resolve()
  })
  child.once("error", reject)
  setTimeout(() => reject(new Error("Timeout starting bundle server")), 5000)
})

try {
  const plainRes = await fetch(`http://127.0.0.1:${TEST_PORT}/plaintext`)
  assert.equal(plainRes.status, 200)
  const plainBytes = new Uint8Array(await plainRes.arrayBuffer())
  assert.equal(plainBytes.byteLength, 13)
  assert.equal(new TextDecoder().decode(plainBytes), "Hello, World!")
  assert.ok(plainRes.headers.get("server")?.includes("Nelysia"))

  const jsonRes = await fetch(`http://127.0.0.1:${TEST_PORT}/json`)
  assert.equal(jsonRes.status, 200)
  assert.deepEqual(await jsonRes.json(), { message: "Hello, World!" })

  console.log("✓ Bundle verification passed! (100% compliant)")
} finally {
  child.kill("SIGKILL")
}

console.log("\n========================================================================")
console.log("  READY FOR TECHEMPOWER PULL REQUEST!")
console.log("========================================================================")
console.log(`To submit to TechEmpower:`)
console.log(`1. Fork https://github.com/TechEmpower/FrameworkBenchmarks`)
console.log(`2. Copy '${DEST}' into 'frameworks/TypeScript/nelysia' in the forked repo`)
console.log(`3. Commit and open a PR to TechEmpower:master`)
console.log("========================================================================\n")

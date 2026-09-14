import { mkdtemp, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)
const packageNames = [
  "@narudom96/nelysia",
  "@narudom96/nelysia/plugins",
  "@narudom96/nelysia/observability",
  "@narudom96/nelysia/runtime-fetch",
  "@narudom96/nelysia/runtime-node",
  "@narudom96/nelysia/runtime-bun",
  "@narudom96/nelysia/runtime-node-cluster",
  "@narudom96/nelysia/graphql",
  "@narudom96/nelysia/drizzle",
  "@narudom96/nelysia/prisma",
  "@narudom96/nelysia/better-auth",
  "@narudom96/nelysia/runtime-vercel",
  "@narudom96/nelysia/runtime-cloudflare",
  "@narudom96/nelysia/compiler",
  "@narudom96/nelysia/openapi",
  "@narudom96/nelysia/jwt",
  "@narudom96/nelysia/client"
]
const tempRoot = await mkdtemp("/tmp/nelysia-package-imports-")
const projectRoot = join(tempRoot, "project")

try {
  await run("mkdir", [projectRoot])
  await run("npm", ["pack", "--pack-destination", tempRoot], { cwd: process.cwd() })
  const archive = (await readdir(tempRoot)).find((entry) => entry.endsWith(".tgz"))
  if (!archive) throw new Error("npm pack did not produce a tarball")
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(tempRoot, archive), "--prefix", projectRoot], { cwd: process.cwd() })

  const source = `const names = ${JSON.stringify(packageNames)}; for (const name of names) await import(name); console.log(names.length)`
  for (const [runtime, args] of [
    ["node", ["--input-type=module", "-e", source]],
    ["bun", ["-e", source]],
    ["deno", ["eval", "--node-modules-dir=manual", source]]
  ]) {
    const result = await run(runtime, args, { cwd: projectRoot })
    if (result.stdout.trim().split("\n").at(-1) !== String(packageNames.length)) throw new Error(`${runtime} did not import every package export`)
    console.log(`${runtime} fresh imports: ${packageNames.length}`)
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

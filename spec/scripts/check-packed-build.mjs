import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)
const root = process.cwd()
const tempRoot = await mkdtemp(join(tmpdir(), "nelysia-packed-build-"))
const project = join(tempRoot, "consumer")
const port = 39000 + Math.floor(Math.random() * 1000)

try {
  await mkdir(join(project, "src"), { recursive: true })
  const packed = await run("npm", ["pack", "--pack-destination", tempRoot], { cwd: root })
  const archive = packed.stdout.trim().split("\n").at(-1)
  if (!archive) throw new Error("npm pack did not produce an archive")
  const archivePath = join(tempRoot, archive)
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "nelysia-packed-consumer", private: true, type: "module" }, null, 2))
  await writeFile(join(project, "src", "app.mjs"), `import { Nelysia } from "@narudom96/nelysia"\nexport const app = new Nelysia().state("version", 1).get("/version", ({ store }) => ({ version: store.version }))\n`)
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", archivePath, "--prefix", project], { cwd: root })
  const build = await run(join(project, "node_modules/.bin/nelysia"), ["build", "src/app.mjs", "--target", "node", "--out", "dist"], { cwd: project })
  if (!build.stdout.includes("Nelysia build:")) throw new Error(`packed CLI did not report a build: ${build.stdout}${build.stderr}`)
  const outputFiles = await readdir(join(project, "dist"))
  const generated = await readFile(join(project, "dist", "server.node.ts"), "utf8").catch(() => {
    throw new Error(`packed build did not write server.node.ts; files: ${outputFiles.join(", ")}; output: ${build.stdout}${build.stderr}`)
  })
  if (!generated.includes("@narudom96/nelysia/runtime-node")) throw new Error("packed build used a repository-relative runtime import")

  const server = spawn(process.execPath, [join(project, "dist", "server.node.ts")], {
    cwd: project,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  })
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("packed generated server did not start")), 5000)
      server.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("compiled Node server listening")) {
          clearTimeout(timer)
          resolve()
        }
      })
      server.once("error", (error) => { clearTimeout(timer); reject(error) })
      server.once("exit", (code) => { if (code !== null && code !== 0) { clearTimeout(timer); reject(new Error(`server exited with ${code}`)) } })
    })
    const response = await fetch(`http://127.0.0.1:${port}/version`)
    if (response.status !== 200 || JSON.stringify(await response.json()) !== JSON.stringify({ version: 1 })) throw new Error("packed generated server returned an unexpected response")
  } finally {
    server.kill("SIGTERM")
    await new Promise((resolve) => server.once("exit", resolve))
  }
  console.log("packed consumer build + generated Node server smoke passed")
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

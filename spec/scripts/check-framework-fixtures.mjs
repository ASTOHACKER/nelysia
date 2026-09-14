import { spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

const fixtures = [
  { name: "astro", port: 4321, devArgs: ["--host", "127.0.0.1", "--port"] },
  { name: "nextjs", port: 4322, devArgs: ["--port"] },
  { name: "nuxt", port: 4323, devArgs: ["--host", "127.0.0.1", "--port"] },
  { name: "sveltekit", port: 4324, devArgs: ["--host", "127.0.0.1", "--port"] },
  { name: "tanstack-start", port: 4325, devArgs: ["--host", "127.0.0.1", "--port"] }
]

const command = process.platform === "win32" ? "npm.cmd" : "npm"

async function run(name, args, cwd, options = {}) {
  const child = spawn(command, args, {
    cwd,
    detached: options.detached ?? false,
    stdio: options.detached ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code, signal) => resolve({ code, signal }))
  })
  if (exit.code !== 0) {
    throw new Error(`${name} failed (${exit.code ?? exit.signal})\n${stdout}${stderr}`)
  }
  return { child, stdout, stderr }
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === "win32") child.kill()
    else process.kill(-child.pid, "SIGTERM")
  } catch {
    child.kill()
  }
  await delay(250)
}

async function smoke(fixture) {
  const cwd = new URL(`../../examples/${fixture.name}/`, import.meta.url)
  await access(new URL("node_modules/", cwd)).catch(() => {
    throw new Error(`${fixture.name} dependencies are missing; run npm install in examples/${fixture.name}`)
  })
  const fixturePath = fileURLToPath(cwd)
  await run(`${fixture.name} build`, ["run", "build"], fixturePath)
  if (fixture.name === "astro") {
    // Astro keeps a project-local dev daemon; stop a previous fixture run so
    // this check always owns the process and port it is about to probe.
    await run("astro dev stop", ["exec", "--", "astro", "dev", "stop"], fixturePath).catch(() => {})
  }

  const child = spawn(command, ["run", "dev", "--", ...fixture.devArgs, String(fixture.port)], {
    cwd: fixturePath,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  })
  let output = ""
  child.stdout.on("data", (chunk) => { output += chunk })
  child.stderr.on("data", (chunk) => { output += chunk })
  try {
    let response
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        response = await fetch(`http://127.0.0.1:${fixture.port}/api/nelysia`)
        break
      } catch {
        await delay(500)
      }
    }
    if (!response) throw new Error(`${fixture.name} did not start\n${output}`)
    const body = await response.json()
    if (response.status !== 200 || body.runtime !== fixture.name || body.ok !== true) {
      throw new Error(`${fixture.name} returned ${response.status}: ${JSON.stringify(body)}\n${output}`)
    }
    console.log(`${fixture.name}: build + HTTP smoke passed`)
  } finally {
    await stop(child)
  }
}

for (const fixture of fixtures) await smoke(fixture)
console.log(`framework fixtures: ${fixtures.length}/${fixtures.length} passed`)

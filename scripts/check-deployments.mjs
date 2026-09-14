import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const run = promisify(execFile)
const root = process.cwd()
const moduleUrl = (file) => pathToFileURL(join(root, file)).href
const core = moduleUrl("packages/core/src/index.ts")
const fetchRuntime = moduleUrl("packages/runtime-fetch/src/server.ts")
const bunRuntime = moduleUrl("packages/runtime-bun/src/server.ts")
const nodeRuntime = moduleUrl("packages/runtime-node/src/server.ts")
const cloudflareRuntime = moduleUrl("packages/runtime-cloudflare/src/index.ts")
const vercelRuntime = moduleUrl("packages/runtime-vercel/src/index.ts")

const sourceFor = (mode) => {
  const imports = `import { Nelysia } from ${JSON.stringify(core)}\n`
  const app = `const app = new Nelysia().get("/health", ({ env, executionContext }) => ({ ok: true, mode: ${JSON.stringify(mode)}, hasEnv: env !== undefined, hasExecutionContext: executionContext !== undefined }))\n`
  if (mode === "node") return `${imports}import { createNodeServer } from ${JSON.stringify(nodeRuntime)}\n${app}const server = createNodeServer(app); await new Promise((resolve) => server.listen(0, resolve)); const port = server.address().port; const response = await fetch("http://127.0.0.1:" + port + "/health"); if (response.status !== 200 || !(await response.json()).ok) throw new Error("Node smoke failed"); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); console.log("node deployment smoke: PASS")\n`
  if (mode === "bun") return `${imports}import { createBunHandler } from ${JSON.stringify(bunRuntime)}\n${app}const response = await createBunHandler(app)(new Request("http://localhost/health")); if (response.status !== 200 || !(await response.json()).ok) throw new Error("Bun smoke failed"); console.log("bun deployment smoke: PASS")\n`
  if (mode === "deno") return `${imports}import { createFetchHandler } from ${JSON.stringify(fetchRuntime)}\n${app}const response = await createFetchHandler(app)(new Request("http://localhost/health")); if (response.status !== 200 || !(await response.json()).ok) throw new Error("Deno smoke failed"); console.log("deno deployment smoke: PASS")\n`
  if (mode === "cloudflare") return `${imports}import { createCloudflareHandler } from ${JSON.stringify(cloudflareRuntime)}\n${app}const response = await createCloudflareHandler(app)(new Request("http://localhost/health"), { REGION: "test" }, {}); const body = await response.json(); if (response.status !== 200 || !body.ok || !body.hasEnv || !body.hasExecutionContext) throw new Error("Cloudflare smoke failed"); console.log("cloudflare deployment smoke: PASS")\n`
  return `${imports}import { createVercelHandler } from ${JSON.stringify(vercelRuntime)}\n${app}const response = await createVercelHandler(app)(new Request("http://localhost/health")); if (response.status !== 200 || !(await response.json()).ok) throw new Error("Vercel smoke failed"); console.log("vercel deployment smoke: PASS")\n`
}

const checks = [
  [process.execPath, ["--experimental-strip-types", "--input-type=module", "-e"], ["node"]],
  ["bun", ["-e"], ["bun"]],
  ["deno", ["eval", "--node-modules-dir=manual"], ["deno"]],
  [process.execPath, ["--experimental-strip-types", "--input-type=module", "-e"], ["cloudflare", "vercel"]]
]

for (const [command, args, modes] of checks) {
  for (const mode of modes) {
    try {
      const result = await run(command, [...args, sourceFor(mode)], { cwd: root })
      process.stdout.write(result.stdout)
    } catch (error) {
      console.error(`${mode} deployment smoke failed`)
      console.error(error?.stderr ?? error)
      process.exitCode = 1
      break
    }
  }
  if (process.exitCode) break
}

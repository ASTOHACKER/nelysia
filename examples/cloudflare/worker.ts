import { Nelysia } from "@narudom96/nelysia"
import { createCloudflareWorker } from "@narudom96/nelysia/runtime-cloudflare"

const app = new Nelysia().get("/", ({ env, executionContext }) => ({
  runtime: "cloudflare",
  ok: true,
  region: env && typeof env === "object" && "REGION" in env ? (env as { REGION?: string }).REGION : undefined,
  hasExecutionContext: executionContext !== undefined
}))

export default createCloudflareWorker(app)

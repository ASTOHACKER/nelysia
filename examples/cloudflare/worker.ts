import { Nelysia } from "../../packages/core/src/index.ts"
import { createCloudflareWorker } from "../../packages/runtime-cloudflare/src/index.ts"

const app = new Nelysia().get("/", ({ env, executionContext }) => ({
  runtime: "cloudflare",
  ok: true,
  region: env && typeof env === "object" && "REGION" in env ? (env as { REGION?: string }).REGION : undefined,
  hasExecutionContext: executionContext !== undefined
}))

export default createCloudflareWorker(app)

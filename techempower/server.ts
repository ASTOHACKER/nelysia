import { Nelysia } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"

const port = Number(process.env.PORT ?? 8080)

const app = new Nelysia()
  .getStatic("/plaintext", "Hello, World!")
  .getStatic("/json", { message: "Hello, World!" })

Bun.serve({
  port,
  fetch: createCompiledBunHandler(app)
})

console.log(`Nelysia TechEmpower server running on port ${port}`)

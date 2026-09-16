import { createBunHandler } from "@narudom96/nelysia/runtime-bun"
import { app } from "./app.ts"

const runtime = globalThis as typeof globalThis & {
  Bun: { serve(options: { port: number; fetch(request: Request): Promise<Response> }): { port: number } }
}

const server = runtime.Bun.serve({ port: 3000, fetch: createBunHandler(app) })
console.log(`Nelysia Bun listening on http://localhost:${server.port}`)

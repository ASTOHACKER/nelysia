import { createBunHandler } from "@narudom96/nelysia/runtime-bun"
import { app } from "./app.ts"

const runtime = globalThis as typeof globalThis & {
  Bun: { serve(options: { port: number; fetch(request: Request): Promise<Response> }): { port: number; stop(): void } }
}

const server = runtime.Bun.serve({ port: 0, fetch: createBunHandler(app) })
const response = await fetch(`http://localhost:${server.port}/users/42`)
const body = await response.text()
server.stop()

if (response.status !== 200 || body !== '{"id":"42"}') {
  throw new Error(`Unexpected response: ${response.status} ${body}`)
}

console.log("Bun HTTP smoke test: PASS")

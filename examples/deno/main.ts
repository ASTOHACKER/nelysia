import { Nelysia } from "../../packages/core/src/index.ts"
import { createFetchHandler } from "../../packages/runtime-fetch/src/server.ts"

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): unknown }

const app = new Nelysia().get("/", () => ({ runtime: "deno", ok: true }))
Deno.serve(createFetchHandler(app))

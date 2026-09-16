import { Nelysia } from "../../packages/core/src/index.ts"
import { createFetchHandler } from "../../packages/runtime-fetch/src/server.ts"
// NOTE: Deno pins these monorepo-relative source imports on purpose — the
// built dist-package .d.ts files use extensionless relative imports, which
// `deno check` cannot resolve. Consumers should import the published package
// (`@narudom96/nelysia` + `@narudom96/nelysia/runtime-fetch` from the release tarball).

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): unknown }

const app = new Nelysia().get("/", () => ({ runtime: "deno", ok: true }))
Deno.serve(createFetchHandler(app))

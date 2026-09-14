import "@tanstack/react-start/server-only"
import { Nelysia } from "@narudom96/nelysia"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"

const app = new Nelysia().get("/api/nelysia", () => ({ runtime: "tanstack-start", ok: true }))

export const fetchHandler = createFetchHandler(app)

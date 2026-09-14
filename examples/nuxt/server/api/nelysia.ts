import { Nelysia } from "@narudom96/nelysia"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { defineEventHandler, toWebRequest, type H3Event } from "h3"

const app = new Nelysia().get("/api/nelysia", () => ({ runtime: "nuxt", ok: true }))

// H3 v1 exposes the Web-standard Request through toWebRequest. This also
// works when Nitro is running on Node and event.req is an IncomingMessage.
export type NitroEvent = H3Event
export const fetchHandler = createFetchHandler(app)
export const handler = defineEventHandler((event: NitroEvent) => fetchHandler(toWebRequest(event)))
export default handler

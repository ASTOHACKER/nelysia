import { Nelysia } from "@narudom96/nelysia"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import * as h3 from "h3"
import type { H3Event } from "h3"

const app = new Nelysia().get("/api/nelysia", () => ({ runtime: "nuxt", ok: true }))

type RequestConverter = (event: H3Event) => Request
const h3Converters = h3 as unknown as { toRequest?: RequestConverter; toWebRequest?: RequestConverter }
const toFetchRequest = h3Converters.toRequest ?? h3Converters.toWebRequest
if (!toFetchRequest) throw new Error("The installed H3 version has no Web Request converter")

export type NitroEvent = H3Event
export const fetchHandler = createFetchHandler(app)
export const handler = h3.defineEventHandler((event: NitroEvent) => fetchHandler(toFetchRequest(event)))
export default handler

import { HttpError, type Nelysia } from "../../core/src/app.ts"

export function createFetchHandler(app: Nelysia): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      let body: unknown
      if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
        const text = await request.text()
        if (new TextEncoder().encode(text).byteLength > app.bodyLimit) throw new HttpError(413, "Request body is too large")
        body = text || undefined
        if (request.headers.get("content-type")?.includes("application/json") && text) {
          try { body = JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
        }
      }
      const result = await app.handle({ method: request.method, url: request.url, headers: request.headers, body })
      if (result.body instanceof Response) return result.body
      if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
      const output = typeof result.body === "string" ? result.body : result.body === undefined ? null : JSON.stringify(result.body)
      if (result.body !== undefined && result.body !== null && typeof result.body !== "string") result.headers.set("content-type", "application/json; charset=utf-8")
      return new Response(output, { status: result.status, headers: result.headers })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      return Response.json({ error: status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request" }, { status })
    }
  }
}

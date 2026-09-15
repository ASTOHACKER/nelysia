import { HttpError } from "./types.ts"

export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  return mediaType === "application/json" || mediaType.endsWith("+json")
}

export function isMultipartContentType(contentType: string | null | undefined): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "multipart/form-data"
}

export async function parseWebRequestBody(request: Request, limit: number): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD" || request.body === null) return undefined
  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new HttpError(413, "Request body is too large")
  if (isMultipartContentType(request.headers.get("content-type"))) {
    const bytes = await readBounded(request.body, limit)
    if (bytes.byteLength === 0) return undefined
    const copy = new Request(request.url, { method: request.method, headers: request.headers, body: bytes as BodyInit })
    return copy.formData()
  }
  const bytes = await readBounded(request.body, limit)
  if (bytes.byteLength === 0) return undefined
  const text = new TextDecoder().decode(bytes)
  if (isJsonContentType(request.headers.get("content-type"))) {
    try { return JSON.parse(text) } catch { throw new HttpError(400, "Malformed JSON body") }
  }
  return text
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) {
        await reader.cancel("body limit exceeded").catch(() => undefined)
        throw new HttpError(413, "Request body is too large")
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return output
}

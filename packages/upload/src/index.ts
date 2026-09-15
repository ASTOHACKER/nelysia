import { HttpError, type Context, type Nelysia, type NelysiaPlugin, type UploadedFile } from "../../core/src/index.ts"

export interface UploadStorage {
  store(file: UploadedFile, context: Context): unknown | Promise<unknown>
  remove?(stored: unknown, context: Context): void | Promise<void>
}

export interface UploadOptions {
  maxFileSize?: number
  maxFiles?: number
  fields?: string[]
  storage?: UploadStorage
}

export interface UploadContext {
  files?: Record<string, UploadedFile[]>
}

export type UploadPlugin = NelysiaPlugin<UploadContext>

export function memoryStorage(): UploadStorage {
  return { store: (file) => file.file }
}

export function diskStorage(root: string): UploadStorage {
  return {
    async store(file) {
      const { mkdir, writeFile } = await import("node:fs/promises")
      const { join } = await import("node:path")
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`
      await mkdir(root, { recursive: true })
      const path = join(root, safeName)
      try {
        await writeFile(path, new Uint8Array(await file.file.arrayBuffer()))
        return { path, filename: file.filename, contentType: file.contentType, size: file.size }
      } catch (error) {
        const { unlink } = await import("node:fs/promises")
        await unlink(path).catch(() => {})
        throw error
      }
    },
    async remove(stored) {
      const path = typeof stored === "object" && stored !== null && "path" in stored ? (stored as { path?: unknown }).path : undefined
      if (typeof path !== "string") return
      const { unlink } = await import("node:fs/promises")
      await unlink(path).catch(() => {})
    }
  }
}

export function upload(options: UploadOptions = {}): UploadPlugin {
  const maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024
  const maxFiles = options.maxFiles ?? 10
  const allowedFields = options.fields === undefined ? undefined : new Set(options.fields)
  if (!Number.isFinite(maxFileSize) || maxFileSize < 1) throw new Error("upload maxFileSize must be positive")
  if (!Number.isInteger(maxFiles) || maxFiles < 1) throw new Error("upload maxFiles must be a positive integer")

  return ((app: Nelysia<any, any, any>) => app.onBeforeHandle(async (context) => {
    if (!(context.body instanceof FormData)) return
    const files: Record<string, UploadedFile[]> = {}
    const stored: Array<{ value: unknown; context: Context }> = []
    let count = 0
    try {
      for (const [fieldName, value] of context.body.entries()) {
        if (!(value instanceof File)) continue
        if (allowedFields !== undefined && !allowedFields.has(fieldName)) throw new HttpError(400, `Unexpected upload field: ${fieldName}`)
        count++
        if (count > maxFiles) throw new HttpError(413, "Too many uploaded files")
        if (value.size > maxFileSize) throw new HttpError(413, "Uploaded file is too large")
        const item: UploadedFile = { fieldName, filename: value.name, contentType: value.type || "application/octet-stream", size: value.size, file: value }
        const target = files[fieldName] ?? (files[fieldName] = [])
        if (options.storage !== undefined) {
          const storedValue = await options.storage.store(item, context)
          item.storage = storedValue
          stored.push({ value: storedValue, context })
        }
        target.push(item)
      }
      context.files = files
    } catch (error) {
      if (options.storage?.remove !== undefined) {
        for (const item of stored.reverse()) {
          // Cleanup is best effort: preserve the original storage/validation
          // failure and still attempt every already-created object.
          try { await options.storage.remove(item.value, item.context) } catch { /* continue cleanup */ }
        }
      }
      throw error
    }
  })) as UploadPlugin
}

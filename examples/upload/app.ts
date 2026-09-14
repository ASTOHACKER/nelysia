import { Nelysia } from "../../packages/core/src/index.ts"
import { memoryStorage, upload } from "../../packages/upload/src/index.ts"

export const app = new Nelysia()
  .use(upload({
    fields: ["avatar"],
    maxFileSize: 2 * 1024 * 1024,
    maxFiles: 1,
    storage: memoryStorage()
  }))
  .post("/upload", ({ files }) => ({
    files: Object.values(files ?? {}).flat().map(({ fieldName, filename, contentType, size }) => ({ fieldName, filename, contentType, size }))
  }))

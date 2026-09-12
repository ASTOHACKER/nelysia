export interface ServerHandle {
  close?(callback?: (error?: Error) => void): void
  closeIdleConnections?(): void
  stop?(closeActiveConnections?: boolean): void | Promise<void>
}

export async function gracefulShutdown(server: ServerHandle, timeoutMs = 10_000): Promise<void> {
  if (server.stop) {
    await server.stop(true)
    return
  }
  const close = server.close
  if (!close) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server shutdown timed out after ${timeoutMs}ms`)), timeoutMs)
    close.call(server, (error) => {
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    })
    server.closeIdleConnections?.()
  })
}

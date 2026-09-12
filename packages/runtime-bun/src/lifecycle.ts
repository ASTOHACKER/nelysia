export async function closeBunServer(server: { stop(closeActiveConnections?: boolean): void }): Promise<void> {
  server.stop(true)
}

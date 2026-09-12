export interface ClientResponse<T> {
  data?: T
  error?: { status: number; body: unknown }
  response: Response
}

export function createClient(baseUrl: string) {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<ClientResponse<T>> => {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const value = await response.json().catch(() => undefined)
    return response.ok ? { data: value as T, response } : { error: { status: response.status, body: value }, response }
  }
  return {
    request,
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path)
  }
}

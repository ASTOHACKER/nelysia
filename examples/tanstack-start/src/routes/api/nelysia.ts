import { createFileRoute } from "@tanstack/react-router"
import { createServerOnlyFn } from "@tanstack/react-start"

// TanStack Start server handlers receive an object containing Request.
const getFetchHandler = createServerOnlyFn(async () => (await import("./-nelysia.server.ts")).fetchHandler)
export const fetchHandler = async (request: Request) => (await getFetchHandler())(request)
export const server = {
  handlers: {
    GET: ({ request }: { request: Request }) => fetchHandler(request),
    POST: ({ request }: { request: Request }) => fetchHandler(request)
  }
}

// TanStack Start's plugin augments this API with its server-handler types.
// The root package typecheck does not load that plugin augmentation, so keep
// the runtime call typed at the framework boundary here.
const createServerFileRoute = createFileRoute as unknown as (path: string) => (options: { server: typeof server }) => unknown
export const Route = createServerFileRoute("/api/nelysia")({ server })

import type { Nelysia } from "../../core/src/app.ts"
import type { Schema } from "../../core/src/schema.ts"

export interface OpenAPIOptions {
  title?: string
  version?: string
  path?: string
}

export interface OpenAPIUiOptions {
  path?: string
  specPath?: string
  title?: string
}

export function generateOpenAPI(app: Nelysia, options: OpenAPIOptions = {}) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of app.graph.routes) {
    const response: Record<string, unknown> = { description: "Successful response" }
    if (route.responseSchema) response.content = { "application/json": { schema: definition(route.responseSchema) } }
    const operation: Record<string, unknown> = { responses: { "200": response } }
    if (route.paramsSchema) operation.parameters = parameters(route.paramsSchema)
    if (route.querySchema) operation.parameters = [...(operation.parameters as unknown[] ?? []), ...queryParameters(route.querySchema)]
    if (route.bodySchema) operation.requestBody = { required: true, content: { "application/json": { schema: definition(route.bodySchema) } } }
    const path = paths[route.path] ?? (paths[route.path] = {})
    path[route.method.toLowerCase()] = operation
  }
  return {
    openapi: "3.1.0",
    info: { title: options.title ?? "Nelysia API", version: options.version ?? "0.1.0" },
    paths
  }
}

export function openapi(options: OpenAPIOptions = {}) {
  return (app: Nelysia): Nelysia => {
    const path = options.path ?? "/openapi.json"
    app.get(path, () => generateOpenAPI(app, options))
    return app
  }
}

export function openapiUi(options: OpenAPIUiOptions = {}) {
  return (app: Nelysia): Nelysia => {
    const path = options.path ?? "/docs"
    const specPath = options.specPath ?? "/openapi.json"
    const title = options.title ?? "Nelysia API"
    app.get(path, ({ response }) => response(200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;font-family:system-ui,sans-serif}redoc{display:block}</style></head><body><redoc spec-url="${escapeHtml(specPath)}"></redoc><script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script></body></html>`, { "content-type": "text/html; charset=utf-8" }))
    return app
  }
}

export function generateClientTypes(app: Nelysia): string {
  const methods = app.graph.routes.map((route) => `  ${route.method} ${JSON.stringify(route.path)}: { response: unknown }`).join("\n")
  return `export interface NelysiaRoutes {\n${methods}\n}\n`
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function definition(schema: Schema): Record<string, unknown> {
  return schema.definition ?? { type: schema.kind === "standard" ? "object" : schema.kind }
}

function parameters(schema: Schema): unknown[] {
  const properties = definition(schema).properties as Record<string, unknown> | undefined
  return Object.entries(properties ?? {}).map(([name, value]) => ({ name, in: "path", required: true, schema: value }))
}

function queryParameters(schema: Schema): unknown[] {
  const properties = definition(schema).properties as Record<string, unknown> | undefined
  return Object.entries(properties ?? {}).map(([name, value]) => ({ name, in: "query", required: true, schema: value }))
}

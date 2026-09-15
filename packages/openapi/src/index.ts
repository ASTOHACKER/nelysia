import type { Nelysia } from "../../core/src/app.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "../../core/src/schema.ts"

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

export interface SwaggerUiOptions {
  path?: string
  specPath?: string
  title?: string
}

export function generateOpenAPI(app: Nelysia<any, any, any>, options: OpenAPIOptions = {}) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of app.graph.routes) {
    const responseFor = (status: string, schema?: Schema, model?: string): Record<string, unknown> => {
      const response: Record<string, unknown> = { description: status === "200" ? "Successful response" : `Response ${status}` }
      if (schema !== undefined) response.content = { "application/json": { schema: definition(schema, model) } }
      return response
    }
    const responses: Record<string, unknown> = route.responseSchema !== undefined || route.responseSchemas === undefined
      ? { "200": responseFor("200", route.responseSchema, route.responseModel) }
      : {}
    for (const [status, schema] of Object.entries(route.responseSchemas ?? {})) responses[status] = responseFor(status, schema, route.responseModels?.[status])
    const operation: Record<string, unknown> = { responses }
    if (route.summary) operation.summary = route.summary
    if (route.description) operation.description = route.description
    if (route.tags) operation.tags = route.tags
    if (route.auth) operation.security = route.auth === true ? [{ bearerAuth: [] }] : [{ [typeof route.auth === "string" ? route.auth : "bearerAuth"]: [] }]
     if (route.params.length > 0) operation.parameters = route.params.filter((name) => name !== "*").map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }))
     if (route.paramsSchema) {
       const existing = new Set((operation.parameters as Array<{ name: string }> | undefined)?.map((parameter) => parameter.name))
       operation.parameters = [...(operation.parameters as unknown[] ?? []), ...parameters(route.paramsSchema, "path").filter((parameter) => !existing.has((parameter as { name: string }).name))]
     }
     if (route.querySchema) operation.parameters = [...(operation.parameters as unknown[] ?? []), ...parameters(route.querySchema, "query")]
     if (route.headersSchema) operation.parameters = [...(operation.parameters as unknown[] ?? []), ...parameters(route.headersSchema, "header")]
     if (route.bodySchema) operation.requestBody = { required: true, content: { "application/json": { schema: definition(route.bodySchema, route.bodyModel) } } }
     const openapiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/\*$/, "/{path}")
     const path = paths[openapiPath] ?? (paths[openapiPath] = {})
    path[route.method.toLowerCase()] = operation
  }
   const schemas = Object.fromEntries([...app.modelDefinitions].map(([name, schema]) => [name, definition(normalizeModel(schema))]))
   return {
     openapi: "3.1.0",
     info: { title: options.title ?? "Nelysia API", version: options.version ?? "1.0.0" },
     paths,
     ...(Object.keys(schemas).length > 0 ? { components: { schemas } } : {})
  }
}

export function openapi(options: OpenAPIOptions = {}) {
  return (app: Nelysia<any, any, any>): Nelysia<any, any, any> => {
    const path = options.path ?? "/openapi.json"
    app.get(path, () => generateOpenAPI(app, options))
    return app
  }
}

export function openapiUi(options: OpenAPIUiOptions = {}) {
  return (app: Nelysia<any, any, any>): Nelysia<any, any, any> => {
    const path = options.path ?? "/docs"
    const specPath = options.specPath ?? "/openapi.json"
    const title = options.title ?? "Nelysia API"
    app.get(path, ({ response }) => response(200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;font-family:system-ui,sans-serif}redoc{display:block}</style></head><body><redoc spec-url="${escapeHtml(specPath)}"></redoc><script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script></body></html>`, { "content-type": "text/html; charset=utf-8" }))
    return app
  }
}

export function swaggerUi(options: SwaggerUiOptions = {}) {
  return (app: Nelysia<any, any, any>): Nelysia<any, any, any> => {
    const path = options.path ?? "/swagger"
    const specPath = options.specPath ?? "/openapi.json"
    const title = options.title ?? "Nelysia Swagger UI"
    app.get(path, ({ response }) => response(200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" /></head><body><div id="swagger-ui"></div><script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.ui = SwaggerUIBundle({ url: ${JSON.stringify(specPath)}, dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis], layout: 'BaseLayout' });</script></body></html>`, { "content-type": "text/html; charset=utf-8" }))
    return app
  }
}

export function generateClientTypes(app: Nelysia<any, any, any>): string {
  const modelNames = new Map([...app.modelDefinitions].map(([name]) => [name, safeTypeName(name)]))
  const models = [...app.modelDefinitions].map(([name, schema]) => `export type ${modelNames.get(name)} = ${schemaType(normalizeModel(schema).definition)}\n`).join("")
  const methods = app.graph.routes.map((route) => {
    const responseEntries = Object.entries(route.responseSchemas ?? {})
    const responseType = (schema: Schema, status: string) => route.responseModels?.[status]
      ? modelNames.get(route.responseModels[status]) ?? safeTypeName(route.responseModels[status])
      : schemaType(schema.definition)
    const successResponses = responseEntries.filter(([status]) => status === "default" || /^2\d\d$/.test(status))
    const errorResponses = responseEntries.filter(([status]) => !successResponses.some(([success]) => success === status))
    const response = route.responseModel
      ? modelNames.get(route.responseModel) ?? safeTypeName(route.responseModel)
      : route.responseSchema
        ? schemaType(route.responseSchema.definition)
        : successResponses.length > 0
          ? successResponses.map(([status, schema]) => responseType(schema, status)).join(" | ")
          : responseEntries.length > 0 ? responseEntries.map(([status, schema]) => responseType(schema, status)).join(" | ") : "unknown"
    const body = route.bodyModel ? modelNames.get(route.bodyModel) ?? safeTypeName(route.bodyModel) : (route.bodySchema ? schemaType(route.bodySchema.definition) : undefined)
    const params = route.params.length > 0 ? `; params: { ${route.params.map((name) => `${JSON.stringify(name)}: string`).join("; ")} }` : ""
    const query = route.querySchema ? `; query: ${schemaType(route.querySchema.definition)}` : ""
    const headers = route.headersSchema ? `; headers: ${schemaType(route.headersSchema.definition)}` : ""
    const statusMap = responseEntries.length > 0
      ? `; responses: { ${responseEntries.map(([status, schema]) => `${JSON.stringify(status)}: ${responseType(schema, status)}`).join("; ")} }`
      : ""
    const errorMap = errorResponses.length > 0
      ? `; errors: { ${errorResponses.map(([status, schema]) => `${JSON.stringify(status)}: ${responseType(schema, status)}`).join("; ")} }`
      : ""
    return `  ${JSON.stringify(`${route.method} ${route.path}`)}: { response: ${response}${body === undefined ? "" : `; body: ${body}`}${params}${query}${headers}${statusMap}${errorMap} }`
  }).join("\n")
  return `${models}\nexport interface NelysiaRoutes {\n${methods}\n}\n`
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function definition(schema: Schema, model?: string): Record<string, unknown> {
  if (model) return { "$ref": `#/components/schemas/${model}` }
  return schema.definition ?? { type: schema.kind === "standard" ? "object" : schema.kind }
}

function normalizeModel(schema: Schema | StandardSchema): Schema {
  return "validate" in schema ? schema : fromStandardSchema(schema)
}

function parameters(schema: Schema, location: "path" | "query" | "header"): unknown[] {
  const properties = definition(schema).properties as Record<string, unknown> | undefined
  const required = new Set((definition(schema).required as string[] | undefined) ?? [])
  return Object.entries(properties ?? {}).map(([name, value]) => ({ name, in: location, required: location === "path" || required.has(name), schema: value }))
}

function schemaType(definition: Record<string, unknown> | undefined): string {
  if (!definition) return "unknown"
  if (typeof definition.$ref === "string") return definition.$ref.split("/").at(-1) ?? "unknown"
  if (Array.isArray(definition.enum)) return definition.enum.map((value) => JSON.stringify(value)).join(" | ") || "never"
  if ("const" in definition) return JSON.stringify(definition.const)
  if (Array.isArray(definition.anyOf)) return definition.anyOf.map((item) => schemaType(item as Record<string, unknown>)).join(" | ")
  if (Array.isArray(definition.allOf)) return definition.allOf.map((item) => schemaType(item as Record<string, unknown>)).join(" & ")
  if (Array.isArray(definition.prefixItems)) return `[${definition.prefixItems.map((item) => schemaType(item as Record<string, unknown>)).join(", ")}]`
  if (definition.type === "array") return `${schemaType(definition.items as Record<string, unknown> | undefined)}[]`
  if (definition.type === "object") {
    const properties = definition.properties as Record<string, Record<string, unknown>> | undefined
    const required = new Set((definition.required as string[] | undefined) ?? [])
    if (!properties && definition.additionalProperties && typeof definition.additionalProperties === "object") return `Record<string, ${schemaType(definition.additionalProperties as Record<string, unknown>)}>`
    if (!properties) return "Record<string, unknown>"
    return `{ ${Object.entries(properties).map(([name, value]) => `${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${schemaType(value)}`).join("; ")} }`
  }
  if (definition.type === "string") return "string"
  if (definition.type === "number" || definition.type === "integer") return "number"
  if (definition.type === "boolean") return "boolean"
  if (definition.type === "null") return "null"
  return "unknown"
}

function safeTypeName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_$]/g, "_")
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `Model_${normalized}`
}

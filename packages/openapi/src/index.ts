import type { Nelysia } from "../../core/src/app.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "../../core/src/schema.ts"
import { normalizeSchemaIR, schemaIRChild, type SchemaIR, type SchemaIRNode } from "../../core/src/schema-ir.ts"

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

export type SchemaOutputDialect = "openapi-3.0" | "openapi-3.1" | "json-schema-2020-12"

export interface SchemaConversionContext {
  readonly dialect?: SchemaOutputDialect
  readonly components?: Record<string, unknown>
  readonly definitions?: Readonly<Record<string, Schema | SchemaIR | SchemaIRNode>>
  readonly stable?: boolean
}

type SchemaInput = Schema | SchemaIR | SchemaIRNode
type ConversionMode = "openapi" | "json-schema"

interface ConversionState {
  readonly mode: ConversionMode
  readonly dialect: SchemaOutputDialect
  readonly components?: Record<string, unknown>
  readonly definitions: Readonly<Record<string, SchemaIRNode | SchemaIR | Schema>>
  readonly activeComponents: Set<string>
}

export function schemaToOpenAPI(input: SchemaInput, context: SchemaConversionContext = {}): Record<string, unknown> {
  return convertSchema(input, { ...context, dialect: context.dialect ?? "openapi-3.1" }, "openapi")
}

export function schemaToJSONSchema(input: SchemaInput, context: SchemaConversionContext = {}): Record<string, unknown> {
  return convertSchema(input, { ...context, dialect: context.dialect ?? "json-schema-2020-12" }, "json-schema")
}

function convertSchema(input: SchemaInput, context: SchemaConversionContext, mode: ConversionMode): Record<string, unknown> {
  const ir = toSchemaIR(input)
  const state: ConversionState = {
    mode,
    dialect: context.dialect ?? (mode === "openapi" ? "openapi-3.1" : "json-schema-2020-12"),
    components: context.components,
    definitions: { ...ir.definitions, ...(context.definitions ?? {}) },
    activeComponents: new Set(),
  }
  const output = convertNode(ir.root, state, true)
  return context.stable === false ? output : stableOutput(output)
}

function toSchemaIR(input: SchemaInput): SchemaIR {
  if (isSchemaIR(input)) return input
  if (isSchemaIRNode(input)) return { root: input, definitions: {}, capability: input.capability, hash: "" }
  return normalizeSchemaIR(input)
}

function isSchemaIR(input: SchemaInput): input is SchemaIR {
  return typeof input === "object" && input !== null && "root" in input && "definitions" in input && "hash" in input
}

function isSchemaIRNode(input: SchemaInput): input is SchemaIRNode {
  return typeof input === "object" && input !== null && "children" in input && "capability" in input
}

function convertNode(node: SchemaIRNode, state: ConversionState, inlineRoot = false, asComponent = false): Record<string, unknown> {
  if (node.ref) {
    const name = referenceName(node.ref)
    const target = name ? lookupDefinition(name, state) : undefined
    if (target && state.components) return { $ref: registerComponent(target, state, name) }
    return { $ref: referenceFor(node.ref, state) }
  }
  if (node.id && !inlineRoot && state.components) return { $ref: registerComponent(node, state) }

  const definition = node.definition
  const metadata = metadataFrom(definition, asComponent)
  switch (node.kind) {
    case "any":
    case "unknown":
      return metadata
    case "never":
      return { ...metadata, not: {} }
    case "literal":
      return { ...metadata, const: definition.const }
    case "enum":
      return { ...metadata, enum: Array.isArray(definition.enum) ? definition.enum : [] }
    case "object":
      return convertObject(node, metadata, state)
    case "record":
      if (isRecord(definition.patternProperties)) {
        const output: Record<string, unknown> = {
          ...metadata,
          patternProperties: Object.fromEntries(Object.entries(definition.patternProperties).map(([pattern, value]) => [pattern, convertRaw(value, state)])),
          type: "object",
        }
        if (Object.prototype.hasOwnProperty.call(definition, "additionalProperties")) {
          const additional = definition.additionalProperties
          output.additionalProperties = typeof additional === "boolean" ? additional : convertRaw(additional, state)
        }
        return output
      }
      return { ...metadata, additionalProperties: node.children[0] ? convertNode(node.children[0], state) : convertRaw(definition.additionalProperties, state), type: "object" }
    case "array":
      return { ...metadata, items: node.children[0] ? convertNode(node.children[0], state) : convertRaw(definition.items, state), type: "array" }
    case "tuple":
      return convertTuple(node, metadata, state)
    case "union":
      return { ...metadata, anyOf: node.children.map((child) => convertNode(child, state)) }
    case "nullable":
      return convertNullable(node, metadata, state)
    case "intersect":
      return { ...metadata, allOf: node.children.map((child) => convertNode(child, state)) }
    case "template-literal":
      return { ...metadata, pattern: definition.pattern, type: "string" }
    case "standard":
      return convertRaw(definition, state)
    default:
      return { ...metadata, ...convertRaw(definition, state) }
  }
}

function convertObject(node: SchemaIRNode, metadata: Record<string, unknown>, state: ConversionState): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const rawProperties = isRecord(node.definition.properties) ? node.definition.properties : {}
  for (const key of Object.keys(rawProperties)) {
    const child = schemaIRChild(node, key)
    properties[key] = child ? convertNode(child, state) : convertRaw(rawProperties[key], state)
  }
  const required = Array.isArray(node.definition.required)
    ? node.definition.required.filter((key): key is string => typeof key === "string")
    : Object.keys(rawProperties).filter((key) => !schemaIRChild(node, key)?.optional)
  const output: Record<string, unknown> = { ...metadata, properties, required, type: "object" }
  if (Object.prototype.hasOwnProperty.call(node.definition, "additionalProperties")) {
    const additional = node.definition.additionalProperties
    output.additionalProperties = typeof additional === "boolean" ? additional : convertRaw(additional, state)
  }
  if (isRecord(node.definition.patternProperties)) {
    output.patternProperties = Object.fromEntries(Object.entries(node.definition.patternProperties).map(([pattern, value]) => [pattern, convertRaw(value, state)]))
  }
  return output
}

function convertTuple(node: SchemaIRNode, metadata: Record<string, unknown>, state: ConversionState): Record<string, unknown> {
  const items = node.children.map((child) => convertNode(child, state))
  const output: Record<string, unknown> = { ...metadata, maxItems: node.definition.maxItems ?? items.length, minItems: node.definition.minItems ?? items.length, type: "array" }
  if (state.mode === "openapi" && state.dialect === "openapi-3.0") output.items = items
  else {
    output.items = false
    output.prefixItems = items
  }
  return output
}

function convertNullable(node: SchemaIRNode, metadata: Record<string, unknown>, state: ConversionState): Record<string, unknown> {
  const inner = node.children[0] ? convertNode(node.children[0], state) : convertRaw(node.definition.anyOf, state)
  if (state.mode === "openapi" && state.dialect === "openapi-3.0" && isRecord(inner) && !Array.isArray(inner.anyOf)) return { ...inner, ...metadata, nullable: true }
  return { ...metadata, anyOf: [inner, { type: "null" }] }
}

function metadataFrom(definition: Readonly<Record<string, unknown>>, asComponent: boolean): Record<string, unknown> {
  const structural = new Set(["type", "properties", "required", "additionalProperties", "patternProperties", "items", "prefixItems", "anyOf", "oneOf", "allOf", "not", "const", "enum"])
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(definition)) {
    if (structural.has(key) || key.startsWith("x-nelysia-") || (asComponent && key === "$id")) continue
    output[key] = value
  }
  return output
}

function registerComponent(node: SchemaIRNode, state: ConversionState, componentName = node.id): string {
  const name = componentName as string
  const prefix = state.mode === "openapi" ? "#/components/schemas/" : "#/$defs/"
  if (!state.components) return `${prefix}${name}`
  if (!Object.prototype.hasOwnProperty.call(state.components, name) && !state.activeComponents.has(name)) {
    state.activeComponents.add(name)
    state.components[name] = stableOutput(convertNode(node, state, true, true))
    state.activeComponents.delete(name)
  }
  return `${prefix}${name}`
}

function lookupDefinition(name: string, state: ConversionState): SchemaIRNode | undefined {
  const value = state.definitions[name] ?? state.definitions[`#/$defs/${name}`] ?? state.definitions[`#/components/schemas/${name}`]
  if (!value) return undefined
  if (isSchemaIR(value)) return value.root
  if (isSchemaIRNode(value)) return value
  return normalizeSchemaIR(value).root
}

function referenceName(reference: string): string | undefined {
  if (reference.startsWith("#/$defs/")) return reference.slice("#/$defs/".length)
  if (reference.startsWith("#/components/schemas/")) return reference.slice("#/components/schemas/".length)
  if (reference.startsWith("#/")) return undefined
  return reference
}

function referenceFor(reference: string, state: ConversionState): string {
  if (reference.startsWith("#/") || reference.includes("://")) return reference
  return `${state.mode === "openapi" ? "#/components/schemas/" : "#/$defs/"}${reference}`
}

function convertRaw(value: unknown, state: ConversionState): Record<string, unknown> {
  if (!isRecord(value)) return {}
  if (typeof value.$ref === "string") return { ...value, $ref: referenceFor(value.$ref, state) }
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === "anyOf" || key === "oneOf" || key === "allOf" || key === "prefixItems") output[key] = Array.isArray(entry) ? entry.map((item) => convertRaw(item, state)) : entry
    else if (key === "items" || key === "additionalProperties") output[key] = isRecord(entry) ? convertRaw(entry, state) : entry
    else if (key === "properties") output[key] = isRecord(entry) ? Object.fromEntries(Object.entries(entry).map(([property, value]) => [property, convertRaw(value, state)])) : entry
    else if (key === "patternProperties") output[key] = isRecord(entry) ? Object.fromEntries(Object.entries(entry).map(([pattern, value]) => [pattern, convertRaw(value, state)])) : entry
    else if (key.startsWith("x-nelysia-")) continue
    else if (key === "type" && (entry === "any" || entry === "unknown")) continue
    else if (key === "type" && entry === "never") { output.not = {}; continue }
    else output[key] = entry
  }
  return output
}

function stableOutput<T>(value: T, parentKey?: string): T {
  if (Array.isArray(value)) {
    const output = value.map((entry) => stableOutput(entry))
    if (parentKey === "required") output.sort((left, right) => String(left).localeCompare(String(right)))
    return output as T
  }
  if (!isRecord(value)) return value
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) output[key] = stableOutput(value[key], key)
  return output as T
}

export function generateOpenAPI(app: Nelysia<any, any, any>, options: OpenAPIOptions = {}) {
  const paths: Record<string, Record<string, unknown>> = {}
  const components: Record<string, unknown> = {}
  for (const [name, source] of app.modelDefinitions) {
    if (!Object.prototype.hasOwnProperty.call(components, name)) components[name] = schemaToOpenAPI(normalizeSchemaIR(normalizeModel(source)), { components })
  }
  for (const route of app.graph.routes) {
    const responseFor = (status: string, schema?: Schema, model?: string): Record<string, unknown> => {
      const response: Record<string, unknown> = { description: status === "200" ? "Successful response" : `Response ${status}` }
      if (schema !== undefined) response.content = { "application/json": { schema: definition(schema, model, components) } }
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
       operation.parameters = [...(operation.parameters as unknown[] ?? []), ...parameters(route.paramsSchema, "path", components).filter((parameter) => !existing.has((parameter as { name: string }).name))]
     }
     if (route.querySchema) operation.parameters = [...(operation.parameters as unknown[] ?? []), ...parameters(route.querySchema, "query", components)]
     if (route.headersSchema) operation.parameters = [...(operation.parameters as unknown[] ?? []), ...parameters(route.headersSchema, "header", components)]
     if (route.bodySchema) operation.requestBody = { required: true, content: { "application/json": { schema: definition(route.bodySchema, route.bodyModel, components) } } }
     const openapiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/\*$/, "/{path}")
     const path = paths[openapiPath] ?? (paths[openapiPath] = {})
    path[route.method.toLowerCase()] = operation
  }
   const schemas = components
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

function definition(schema: Schema, model?: string, components?: Record<string, unknown>): Record<string, unknown> {
  if (model) return { "$ref": `#/components/schemas/${model}` }
  const output = schemaToOpenAPI(normalizeSchemaIR(schema), { components, stable: false })
  return preserveSchemaOrder(output, schema.definition)
}

function normalizeModel(schema: Schema | StandardSchema): Schema {
  return "validate" in schema ? schema : fromStandardSchema(schema)
}

function parameters(schema: Schema, location: "path" | "query" | "header", components?: Record<string, unknown>): unknown[] {
  const converted = definition(schema, undefined, components)
  const properties = converted.properties as Record<string, unknown> | undefined
  const required = new Set((converted.required as string[] | undefined) ?? [])
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

function preserveSchemaOrder(output: Record<string, unknown>, source: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!source) return output
  const result = { ...output }
  if (isRecord(source.properties) && isRecord(output.properties)) {
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(source.properties)) {
      const converted = output.properties[key]
      properties[key] = isRecord(converted) && isRecord(value) ? preserveSchemaOrder(converted, value) : converted
    }
    result.properties = properties
    if (Array.isArray(source.required)) result.required = [...source.required]
  }
  if (isRecord(source.items) && isRecord(output.items)) result.items = preserveSchemaOrder(output.items, source.items)
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) {
    const sourceEntries = source[key]
    const outputEntries = output[key]
    if (Array.isArray(sourceEntries) && Array.isArray(outputEntries)) {
      result[key] = outputEntries.map((entry, index) => isRecord(entry) && isRecord(sourceEntries[index]) ? preserveSchemaOrder(entry, sourceEntries[index] as Record<string, unknown>) : entry)
    }
  }
  if (isRecord(source.additionalProperties) && isRecord(output.additionalProperties)) result.additionalProperties = preserveSchemaOrder(output.additionalProperties, source.additionalProperties)
  return result
}

function safeTypeName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_$]/g, "_")
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `Model_${normalized}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

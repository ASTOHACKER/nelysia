import type { Schema } from "./schema.ts"
import { HttpError } from "./types.ts"

export type SchemaCapability = "compiled" | "reference" | "unsupported"

export interface SchemaIRNode {
  readonly kind: string
  readonly definition: Readonly<Record<string, unknown>>
  readonly children: readonly SchemaIRNode[]
  readonly childKeys: readonly string[]
  readonly options: Readonly<Record<string, unknown>>
  readonly capability: SchemaCapability
  readonly optional?: boolean
  readonly id?: string
  readonly ref?: string
}

export interface SchemaIR {
  readonly root: SchemaIRNode
  readonly definitions: Readonly<Record<string, SchemaIRNode>>
  readonly capability: SchemaCapability
  readonly hash: string
}

export type SchemaReference = Schema | SchemaIR | SchemaIRNode
export type SchemaReferenceRegistry = ReadonlyMap<string, SchemaReference> | Readonly<Record<string, SchemaReference>>

type SchemaWithChildren = Schema & {
  readonly shape?: Record<string, Schema>
  readonly item?: Schema
  readonly items?: readonly Schema[]
  readonly inner?: Schema
  readonly templateParts?: readonly (string | Schema)[]
}

const compiledKinds = new Set([
  "any",
  "unknown",
  "never",
  "null",
  "boolean",
  "string",
  "number",
  "integer",
  "bigint",
  "date",
  "object",
  "array",
  "tuple",
  "record",
  "enum",
  "literal",
  "union",
  "intersect",
  "nullable",
  "optional",
  "template-literal",
])

const referenceKinds = new Set(["standard", "ref"])

/**
 * Normalize a public schema into the immutable representation shared by the
 * reference validator, compiler, and OpenAPI adapters.
 */
export function normalizeSchemaIR(schema: Schema): SchemaIR {
  const definitions = new Map<string, SchemaIRNode>()
  const root = normalizeNode(schema, definitions, new Set())
  const definitionRecord: Record<string, SchemaIRNode> = {}
  for (const [id, node] of definitions) definitionRecord[id] = node
  const result = {
    root,
    definitions: freezeValue(definitionRecord),
    capability: root.capability,
    hash: schemaIRHash(root),
  }
  return freezeValue(result)
}

export function schemaCapability(ir: SchemaIR | SchemaIRNode): SchemaCapability {
  return "root" in ir ? ir.root.capability : ir.capability
}

export function resolveSchemaReference(id: string, registry: SchemaReferenceRegistry): SchemaIRNode {
  const value = lookupReference(id, registry)
  if (!value) throw new HttpError(400, `Unknown schema reference: ${id}`)
  if (isSchemaIR(value)) return value.root
  if (isSchemaIRNode(value)) return value
  return normalizeSchemaIR(value).root
}

export function schemaIRHash(ir: SchemaIR | SchemaIRNode): string {
  const node = "root" in ir ? ir.root : ir
  const serialized = stableSerialize(node)
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function normalizeNode(schema: Schema, definitions: Map<string, SchemaIRNode>, active: Set<Schema>): SchemaIRNode {
  if (active.has(schema)) {
    const definition = normalizeDefinition(schema.definition ?? { type: schema.kind })
    return freezeValue({
      kind: schema.kind,
      definition,
      children: [],
      childKeys: [],
      options: normalizeOptions(definition),
      capability: "reference",
      optional: schema.optional,
      id: readString(definition.$id),
      ref: readString(definition.$ref),
    })
  }

  active.add(schema)
  const definition = normalizeDefinition(schema.definition ?? { type: schema.kind })
  const childInfo = getChildSchemas(schema)
  const children = childInfo.schemas.map((child) => normalizeNode(child, definitions, active))
  const node = freezeValue({
    kind: schema.kind,
    definition,
    children,
    childKeys: childInfo.keys,
    options: normalizeOptions(definition),
    capability: classifyCapability(schema.kind, definition, children),
    optional: schema.optional,
    id: readString(definition.$id),
    ref: readString(definition.$ref),
  })
  active.delete(schema)
  if (node.id) definitions.set(node.id, node)
  return node
}

function getChildSchemas(schema: Schema): { readonly schemas: readonly Schema[]; readonly keys: readonly string[] } {
  const source = schema as SchemaWithChildren
  if (source.shape && isRecord(source.shape)) {
    const keys = Object.keys(source.shape).sort()
    return { schemas: keys.map((key) => source.shape?.[key]).filter((child): child is Schema => child !== undefined), keys }
  }
  if (source.items && Array.isArray(source.items)) return { schemas: source.items, keys: [] }
  if (source.templateParts && Array.isArray(source.templateParts)) return { schemas: source.templateParts.filter((part): part is Schema => typeof part !== "string"), keys: [] }
  if (source.item) return { schemas: [source.item], keys: [] }
  if (source.inner) return { schemas: [source.inner], keys: [] }
  return { schemas: [], keys: [] }
}

function classifyCapability(kind: string, definition: Readonly<Record<string, unknown>>, children: readonly SchemaIRNode[]): SchemaCapability {
  if (kind === "standard" || referenceKinds.has(kind)) return "reference"
  if (!compiledKinds.has(kind) || definition.$custom !== undefined) return "unsupported"
  if (children.some((child) => child.capability === "unsupported")) return "unsupported"
  if (children.some((child) => child.capability === "reference")) return "reference"
  return "compiled"
}

function normalizeDefinition(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return freezeValue(cloneJson(value) as Record<string, unknown>)
}

function normalizeOptions(definition: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const options: Record<string, unknown> = {}
  for (const key of Object.keys(definition).sort()) options[key] = definition[key]
  return freezeValue(options)
}

function cloneJson(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return { $type: "bigint", value: value.toString() }
  if (value instanceof Date) return value.toISOString()
  if (value instanceof RegExp) return { source: value.source, flags: value.flags }
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry, active))
  if (typeof value !== "object") return String(value)
  if (active.has(value)) return { $ref: "#cycle" }
  active.add(value)
  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = cloneJson((value as Record<string, unknown>)[key], active)
  }
  active.delete(value)
  return output
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "bigint") return `{"$bigint":${JSON.stringify(value.toString())}}`
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`
  }
  return JSON.stringify(String(value))
}

function freezeValue<T>(value: T, active = new Set<object>()): T {
  if (value === null || typeof value !== "object") return value
  if (active.has(value)) return value
  active.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) freezeValue(entry, active)
  } else {
    for (const entry of Object.values(value as Record<string, unknown>)) freezeValue(entry, active)
  }
  active.delete(value)
  return Object.freeze(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function lookupReference(id: string, registry: SchemaReferenceRegistry): SchemaReference | undefined {
  const candidates = [id, id.replace(/^#\/(?:\$defs|components\/schemas)\//, "")]
  for (const candidate of candidates) {
    const value = registry instanceof Map ? registry.get(candidate) : (registry as Readonly<Record<string, SchemaReference>>)[candidate]
    if (value !== undefined) return value
  }
  return undefined
}

function isSchemaIR(value: SchemaReference): value is SchemaIR {
  return typeof value === "object" && value !== null && "root" in value && "hash" in value
}

function isSchemaIRNode(value: SchemaReference): value is SchemaIRNode {
  return typeof value === "object" && value !== null && "children" in value && "capability" in value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

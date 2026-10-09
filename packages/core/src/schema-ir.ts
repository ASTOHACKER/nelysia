import type { Schema } from "./schema.ts"

export type SchemaCapability = "compiled" | "reference" | "unsupported"

export interface SchemaIRNode {
  readonly kind: string
  readonly definition: Readonly<Record<string, unknown>>
  readonly children: readonly SchemaIRNode[]
  readonly options: Readonly<Record<string, unknown>>
  readonly capability: SchemaCapability
  readonly id?: string
  readonly ref?: string
}

export interface SchemaIR {
  readonly root: SchemaIRNode
  readonly definitions: Readonly<Record<string, SchemaIRNode>>
  readonly capability: SchemaCapability
  readonly hash: string
}

type SchemaWithChildren = Schema & {
  readonly shape?: Record<string, Schema>
  readonly item?: Schema
  readonly items?: readonly Schema[]
  readonly inner?: Schema
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
])

const referenceKinds = new Set(["standard"])

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
      options: normalizeOptions(definition),
      capability: "reference",
      id: readString(definition.$id),
      ref: readString(definition.$ref),
    })
  }

  active.add(schema)
  const definition = normalizeDefinition(schema.definition ?? { type: schema.kind })
  const childSchemas = getChildSchemas(schema)
  const children = childSchemas.map((child) => normalizeNode(child, definitions, active))
  const node = freezeValue({
    kind: schema.kind,
    definition,
    children,
    options: normalizeOptions(definition),
    capability: classifyCapability(schema.kind, definition, children),
    id: readString(definition.$id),
    ref: readString(definition.$ref),
  })
  active.delete(schema)
  if (node.id) definitions.set(node.id, node)
  return node
}

function getChildSchemas(schema: Schema): readonly Schema[] {
  const source = schema as SchemaWithChildren
  if (source.shape && isRecord(source.shape)) return Object.values(source.shape)
  if (source.items && Array.isArray(source.items)) return source.items
  if (source.item) return [source.item]
  if (source.inner) return [source.inner]
  return []
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

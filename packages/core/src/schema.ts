import { HttpError } from "./types.ts"
import { validateSchemaOptions } from "./schema-validator.ts"
import { normalizeSchemaIR, type SchemaIR } from "./schema-ir.ts"
import { validateSchema, validateSchemaAsync } from "./schema-validator.ts"

export interface Schema<T = unknown> {
  readonly kind: string
  readonly optional?: boolean
  validate(value: unknown, path?: string): T | Promise<T>
  readonly definition?: Record<string, unknown>
  readonly shape?: Readonly<Record<string, Schema>>
  readonly item?: Schema
  readonly items?: readonly Schema[]
  readonly inner?: Schema
  readonly templateParts?: readonly (string | Schema)[]
}

export interface StandardSchema<T = unknown> {
  readonly "~standard": {
    readonly version: 1
    readonly validate: (value: unknown) => T | { value: T } | Promise<T | { value: T } | { issues: readonly { message: string; path?: readonly (string | number)[] }[] }> | { issues: readonly { message: string; path?: readonly (string | number)[] }[] }
  }
}

export interface SchemaOptions {
  readonly [key: string]: unknown
  readonly $schema?: string
  readonly $id?: string
  readonly title?: string
  readonly description?: string
  readonly default?: unknown
  readonly examples?: unknown
  readonly readOnly?: boolean
  readonly writeOnly?: boolean
}

export interface NumberOptions extends SchemaOptions {
  readonly exclusiveMaximum?: number
  readonly exclusiveMinimum?: number
  readonly maximum?: number
  readonly minimum?: number
  readonly multipleOf?: number
}

export interface StringOptions extends SchemaOptions {
  readonly format?: string
  readonly minLength?: number
  readonly maxLength?: number
  readonly pattern?: string | RegExp
}

export interface ObjectOptions extends SchemaOptions {
  readonly additionalProperties?: boolean
  readonly maxProperties?: number
  readonly minProperties?: number
}

export interface ArrayOptions extends SchemaOptions {
  readonly maxItems?: number
  readonly minItems?: number
  readonly uniqueItems?: boolean
}

export interface BigIntOptions extends SchemaOptions {
  readonly exclusiveMaximum?: bigint
  readonly exclusiveMinimum?: bigint
  readonly maximum?: bigint
  readonly minimum?: bigint
  readonly multipleOf?: bigint
}

export interface TupleOptions extends SchemaOptions {
  readonly maxItems?: number
  readonly minItems?: number
}

export interface RecordOptions extends SchemaOptions {
  readonly maxProperties?: number
  readonly minProperties?: number
}

export interface TemplateLiteralOptions extends StringOptions {}

export type Infer<S extends Schema> = S extends Schema<infer T> ? T : never

type UnionToIntersection<Value> = (Value extends unknown ? (argument: Value) => void : never) extends ((argument: infer Intersection) => void) ? Intersection : never

type ShapeInfer<Shape extends Record<string, Schema>> = {
  [K in keyof Shape as Shape[K]["optional"] extends true ? never : K]: Infer<Shape[K]>
} & {
  [K in keyof Shape as Shape[K]["optional"] extends true ? K : never]?: Infer<Shape[K]>
}

type ObjectSchema<Shape extends Record<string, Schema>> = Schema<ShapeInfer<Shape>> & { readonly shape: Shape }

type TupleInfer<Items extends readonly Schema[]> = { -readonly [K in keyof Items]: Infer<Items[K]> }

type RemoveOptional<SchemaType extends Schema> = Schema<Exclude<Infer<SchemaType>, undefined>>

type RequiredShape<Shape extends Record<string, Schema>> = {
  [K in keyof Shape]: RemoveOptional<Shape[K]>
}

type CompositeInfer<Items extends readonly Schema[]> = UnionToIntersection<Infer<Items[number]>>

let cyclicSchemaId = 0

const primitive = <T>(kind: string, check: (value: unknown) => value is T, options: SchemaOptions = {}): Schema<T> => {
  validateSchemaOptions(options, kind)
  const schema: Schema<T> = {
    kind,
    definition: schemaDefinition(kind, options),
    validate(value, path = "body") {
      if (!check(value)) throw new HttpError(400, `${path} must be ${kind}`)
      return validateSchema(value, normalized, { path }) as T
    }
  }
  const normalized = normalizeSchemaIR(schema)
  return schema
}

function runtimeSchema<T, Extra extends object = {}>(schema: Omit<Schema<T>, "validate"> & Extra): Schema<T> & Extra {
  let normalized: SchemaIR
  const result = {
    ...schema,
    validate(value: unknown, path = "body") {
      return validateSchema(value, normalized, { path }) as T
    }
  } as Schema<T> & Extra
  normalized = normalizeSchemaIR(result)
  return result
}

function schemaWithOptions(definition: Record<string, unknown>, options: SchemaOptions): Record<string, unknown> {
  const output = { ...definition }
  applySchemaOptions(output, options)
  return output
}

export const t = {
  String: (options?: StringOptions) => primitive("string", (value): value is string => typeof value === "string", options),
  Number: (options?: NumberOptions) => primitive("number", (value): value is number => typeof value === "number" && Number.isFinite(value), options),
  Integer: (options?: NumberOptions) => primitive("integer", (value): value is number => typeof value === "number" && Number.isInteger(value), options),
  Boolean: (options?: SchemaOptions) => primitive("boolean", (value): value is boolean => typeof value === "boolean", options),
  BigInt: (options?: BigIntOptions) => {
    validateSchemaOptions(options ?? {}, "bigint")
    return runtimeSchema<bigint>({
      kind: "bigint",
      definition: { ...schemaDefinition("integer", options ?? {}), "x-nelysia-kind": "bigint" },
    })
  },
  Null: (options?: SchemaOptions) => runtimeSchema<null>({ kind: "null", definition: schemaDefinition("null", options ?? {}) }),
  Never: (options?: SchemaOptions) => runtimeSchema<never>({ kind: "never", definition: schemaDefinition("never", options ?? {}) }),
  Ref: (id: string, options?: SchemaOptions): Schema<unknown> => {
    if (!id) throw new TypeError("Schema reference id must not be empty")
    let normalized: SchemaIR
    const schema: Schema<unknown> = {
      kind: "ref",
      definition: schemaWithOptions({ $ref: id }, options ?? {}),
      validate(value, path = "body") {
        return validateSchema(value, normalized, { path })
      }
    }
    normalized = normalizeSchemaIR(schema)
    return schema
  },
  Cyclic: <T extends Schema>(builder: (self: Schema) => T, options: SchemaOptions = {}): T => {
    const id = typeof options.$id === "string" && options.$id.length > 0 ? options.$id : `NelysiaCyclic${++cyclicSchemaId}`
    const self = t.Ref(id)
    const target = builder(self)
    const definition = schemaWithOptions({ ...(target.definition ?? { type: target.kind }), $id: id }, options)
    let normalized: SchemaIR
    const schema = {
      ...target,
      definition,
      validate(value: unknown, path = "body") {
        const maxDepth = typeof options.maxDepth === "number" ? options.maxDepth : 32
        return validateSchema(value, normalized, { path, references: { [id]: normalized }, maxDepth }) as Infer<T>
      }
    } as T
    normalized = normalizeSchemaIR(schema)
    return schema
  },
  Object: <Shape extends Record<string, Schema>>(shape: Shape, options: ObjectOptions = {}): ObjectSchema<Shape> => {
    validateSchemaOptions(options, "object")
    let normalized: SchemaIR
    const schema: ObjectSchema<Shape> = {
      kind: "object",
      shape,
      definition: { ...schemaDefinition("object", options), properties: Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.definition ?? { type: schema.kind }]),), required: Object.entries(shape).filter(([, schema]) => !schema.optional).map(([key]) => key) },
      async validate(value, path = "body") {
        if (normalized.capability === "compiled") return await validateSchemaAsync(value, normalized, { path }) as ShapeInfer<Shape>
        if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(400, `${path} must be object`)
        const input = value as Record<string, unknown>
        const keys = Object.keys(input)
        if (typeof options.minProperties === "number" && keys.length < options.minProperties) throw new HttpError(400, `${path} must have at least ${options.minProperties} properties`)
        if (typeof options.maxProperties === "number" && keys.length > options.maxProperties) throw new HttpError(400, `${path} must have at most ${options.maxProperties} properties`)
        const extraKeys = keys.filter((key) => !Object.prototype.hasOwnProperty.call(shape, key))
        if (options.additionalProperties === false && extraKeys.length > 0) throw new HttpError(400, `${path} must not contain additional properties`)
        const output: Record<string, unknown> = {}
        for (const [key, schema] of Object.entries(shape)) {
          const field = input[key]
          if (field === undefined && schema.optional) continue
          setSafeProperty(output, key, await schema.validate(field, `${path}.${key}`))
        }
        if (options.additionalProperties === true) for (const key of extraKeys) setSafeProperty(output, key, input[key])
        return output as ShapeInfer<Shape>
      }
    }
    normalized = normalizeSchemaIR(schema)
    return schema
  },
  Array: <Item extends Schema>(item: Item, options: ArrayOptions = {}): Schema<Infer<Item>[]> & { readonly item: Item } => {
    validateSchemaOptions(options, "array")
    let normalized: SchemaIR
    const schema: Schema<Infer<Item>[]> & { readonly item: Item } = {
      kind: "array",
      item,
      definition: { ...schemaDefinition("array", options), items: item.definition ?? { type: item.kind } },
      async validate(value, path = "body") {
        if (normalized.capability === "compiled") return await validateSchemaAsync(value, normalized, { path }) as Infer<Item>[]
        if (!Array.isArray(value)) throw new HttpError(400, `${path} must be array`)
        if (typeof options.minItems === "number" && value.length < options.minItems) throw new HttpError(400, `${path} has too few items; minimum is ${options.minItems}`)
        if (typeof options.maxItems === "number" && value.length > options.maxItems) throw new HttpError(400, `${path} has too many items; maximum is ${options.maxItems}`)
        if (options.uniqueItems === true) {
          const seen = new Set<string>()
          for (const entry of value) {
            const identity = JSON.stringify(entry) ?? String(entry)
            if (seen.has(identity)) throw new HttpError(400, `${path} must contain unique items`)
            seen.add(identity)
          }
        }
        return Promise.all(value.map((entry, index) => item.validate(entry, `${path}.${index}`))) as Promise<Infer<Item>[]>
      }
    }
    normalized = normalizeSchemaIR(schema)
    return schema
  },
  Tuple: <Items extends readonly Schema[]>(items: Items, options: TupleOptions = {}): Schema<TupleInfer<Items>> & { readonly items: Items } => {
    validateSchemaOptions(options, "tuple")
    const definition = {
      ...schemaDefinition("array", options),
      prefixItems: items.map((item) => item.definition ?? { type: item.kind }),
      minItems: options.minItems ?? items.length,
      maxItems: options.maxItems ?? items.length,
    }
    return runtimeSchema<TupleInfer<Items>, { readonly items: Items }>({ kind: "tuple", items, definition })
  },
  Literal: <T extends string | number | boolean | null>(value: T, options?: SchemaOptions): Schema<T> => ({
    kind: "literal",
    definition: schemaWithOptions({ const: value }, options ?? {}),
    validate(input, path = "body") {
      if (input !== value) throw new HttpError(400, `${path} must be ${String(value)}`)
      return value
    }
  }),
  Union: <Items extends readonly Schema[]>(items: Items, options?: SchemaOptions): Schema<Infer<Items[number]>> & { readonly items: Items } => ({
    kind: "union",
    items,
    definition: schemaWithOptions({ anyOf: items.map((item) => item.definition ?? { type: item.kind }) }, options ?? {}),
    async validate(value, path = "body") {
      for (const item of items) {
        try { return await item.validate(value, path) as Infer<Items[number]> } catch { /* try next branch */ }
      }
      throw new HttpError(400, `${path} does not match any allowed value`)
    }
  }),
  Nullable: <Item extends Schema>(item: Item, options?: SchemaOptions): Schema<Infer<Item> | null> & { readonly inner: Item } => ({
    kind: "nullable",
    inner: item,
    definition: schemaWithOptions({ anyOf: [item.definition ?? { type: item.kind }, { type: "null" }] }, options ?? {}),
    validate(value, path = "body") {
      if (value === null) return null
      return item.validate(value, path) as Infer<Item> | Promise<Infer<Item>>
    }
  }),
  Optional: <Item extends Schema>(item: Item, options?: SchemaOptions): Schema<Infer<Item> | undefined> & { readonly optional: true; readonly inner: Item } => ({
    kind: item.kind,
    optional: true,
    inner: item,
    definition: schemaWithOptions(item.definition ?? { type: item.kind }, options ?? {}),
    validate(value, path = "body") {
      if (value === undefined) return undefined
      return item.validate(value, path) as Infer<Item> | Promise<Infer<Item>>
    }
  }),
  Any: (options?: SchemaOptions): Schema<unknown> => ({ kind: "any", definition: schemaDefinition("any", options ?? {}), validate: (value) => value }),
  Unknown: (options?: SchemaOptions): Schema<unknown> => ({ kind: "unknown", definition: schemaDefinition("unknown", options ?? {}), validate: (value) => value }),
  Date: (options?: SchemaOptions): Schema<Date> => ({
    kind: "date",
    definition: schemaWithOptions({ type: "string", format: "date-time" }, options ?? {}),
    validate(value, path = "body") {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new HttpError(400, `${path} must be date`)
      return value
    }
  }),
  TemplateLiteral: <Parts extends readonly (string | Schema)[]>(parts: Parts, options: TemplateLiteralOptions = {}): Schema<string> & { readonly templateParts: Parts } => {
    validateSchemaOptions(options, "template-literal")
    const generatedPattern = `^${parts.map(templateFragment).join("")}$`
    const definition = schemaWithOptions({ type: "string", pattern: generatedPattern, "x-templateLiteral": true }, options)
    return runtimeSchema<string, { readonly templateParts: Parts }>({ kind: "template-literal", templateParts: parts, definition })
  },
  Partial: <Shape extends Record<string, Schema>>(schema: ObjectSchema<Shape>, options?: ObjectOptions): Schema<Partial<ShapeInfer<Shape>>> => {
    const shape = Object.fromEntries(Object.entries(schema.shape).map(([key, item]) => [key, t.Optional(item)])) as Shape
    return t.Object(shape, options) as Schema<Partial<ShapeInfer<Shape>>>
  },
  Pick: <Shape extends Record<string, Schema>, Keys extends readonly (keyof Shape)[]>(schema: ObjectSchema<Shape>, keys: Keys, options?: ObjectOptions): Schema<Pick<ShapeInfer<Shape>, Extract<Keys[number], keyof ShapeInfer<Shape>>>> => {
    const shape = Object.fromEntries(keys.map((key) => [key, schema.shape[key]])) as Pick<Shape, Keys[number]>
    return t.Object(shape, options) as unknown as Schema<Pick<ShapeInfer<Shape>, Extract<Keys[number], keyof ShapeInfer<Shape>>>>
  },
  Omit: <Shape extends Record<string, Schema>, Keys extends readonly (keyof Shape)[]>(schema: ObjectSchema<Shape>, keys: Keys, options?: ObjectOptions): Schema<Omit<ShapeInfer<Shape>, Extract<Keys[number], keyof ShapeInfer<Shape>>>> => {
    const excluded = new Set(keys)
    const shape = Object.fromEntries(Object.entries(schema.shape).filter(([key]) => !excluded.has(key))) as Omit<Shape, Keys[number]>
    return t.Object(shape, options) as unknown as Schema<Omit<ShapeInfer<Shape>, Extract<Keys[number], keyof ShapeInfer<Shape>>>>
  },
  Intersect: <Items extends readonly Schema[]>(items: Items, options?: SchemaOptions): Schema<UnionToIntersection<Infer<Items[number]>>> & { readonly items: Items } => ({
    kind: "intersect",
    items,
    definition: schemaWithOptions({ allOf: items.map((item) => item.definition ?? { type: item.kind }) }, options ?? {}),
    async validate(value, path = "body") {
      let output = value
      for (const item of items) {
        const validated = await item.validate(output, path)
        output = typeof output === "object" && output !== null && typeof validated === "object" && validated !== null
          ? { ...(output as Record<string, unknown>), ...(validated as Record<string, unknown>) }
          : validated
      }
      return output as UnionToIntersection<Infer<Items[number]>>
    }
  }),
  Enum: <Values extends readonly (string | number)[]>(values: Values, options?: SchemaOptions): Schema<Values[number]> => ({
    kind: "enum",
    definition: schemaWithOptions({ enum: [...values] }, options ?? {}),
    validate(value, path = "body") {
      if (!values.includes(value as Values[number])) throw new HttpError(400, `${path} must be one of ${values.join(", ")}`)
      return value as Values[number]
    }
  }),
  Record: <Item extends Schema>(item: Item, options: RecordOptions = {}): Schema<Record<string, Infer<Item>>> & { readonly item: Item } => {
    validateSchemaOptions(options, "record")
    const definition = {
      ...schemaDefinition("object", options),
      additionalProperties: item.definition ?? { type: item.kind },
    }
    return runtimeSchema<Record<string, Infer<Item>>, { readonly item: Item }>({ kind: "record", item, definition })
  },
  Required: <Shape extends Record<string, Schema>>(schema: ObjectSchema<Shape>, options: ObjectOptions = {}): ObjectSchema<RequiredShape<Shape>> => {
    const shape = Object.fromEntries(Object.entries(schema.shape).map(([key, item]) => [key, unwrapOptional(item)])) as RequiredShape<Shape>
    return t.Object(shape, { ...schemaOptionsFromDefinition(schema.definition), ...options }) as ObjectSchema<RequiredShape<Shape>>
  },
  Readonly: <Shape extends Record<string, Schema>>(schema: ObjectSchema<Shape>, options: ObjectOptions = {}): Schema<Readonly<ShapeInfer<Shape>>> => {
    const definition = schemaOptionsFromDefinition(schema.definition)
    return t.Object(schema.shape, { ...definition, ...options, readOnly: true }) as Schema<Readonly<ShapeInfer<Shape>>>
  },
  Composite: <Items extends readonly ObjectSchema<Record<string, Schema>>[]>(items: Items, options: ObjectOptions = {}): Schema<CompositeInfer<Items>> => {
    const shape: Record<string, Schema> = {}
    for (const item of items) {
      if (!item.shape) throw new TypeError("Composite requires object schemas")
      for (const [key, value] of Object.entries(item.shape)) shape[key] = value
    }
    return t.Object(shape, options) as Schema<CompositeInfer<Items>>
  },
}

function schemaDefinition(kind: string, options: SchemaOptions): Record<string, unknown> {
  const definition: Record<string, unknown> = { type: kind }
  applySchemaOptions(definition, options)
  return definition
}

function applySchemaOptions(definition: Record<string, unknown>, options: SchemaOptions): void {
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (typeof value === "bigint") {
      definition[key] = value.toString()
      definition[`x-${key}Type`] = "bigint"
    } else if (key === "pattern" && value instanceof RegExp) {
      definition[key] = value.source
      definition["x-patternFlags"] = value.flags
    } else {
      definition[key] = value
    }
  }
}

function schemaOptionsFromDefinition(definition: Record<string, unknown> | undefined): SchemaOptions {
  if (!definition) return {}
  const structural = new Set(["type", "properties", "required", "items", "prefixItems", "anyOf", "allOf", "const", "enum", "additionalProperties", "x-templateLiteral"])
  const options: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(definition)) {
    if (!structural.has(key) && !key.startsWith("x-")) options[key] = value
  }
  return options
}

function unwrapOptional(schema: Schema): Schema {
  return schema.optional === true && schema.inner ? schema.inner : schema
}

function templateFragment(part: string | Schema): string {
  if (typeof part === "string") return escapePattern(part)
  if (part.kind === "literal") return escapePattern(String(part.definition?.const ?? ""))
  if (part.kind === "enum" && Array.isArray(part.definition?.enum)) return `(?:${part.definition.enum.map((value) => escapePattern(String(value))).join("|")})`
  if (part.kind === "integer" || part.kind === "number") return "-?(?:0|[1-9]\\d*)(?:\\.\\d+)?"
  if (part.kind === "boolean") return "(?:true|false)"
  return ".*"
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function validatePrimitiveOptions(kind: string, value: unknown, options: SchemaOptions, path: string): void {
  if (kind === "string" && typeof value === "string") {
    if (typeof options.minLength === "number" && value.length < options.minLength) throw new HttpError(400, `${path} is too short; minimum length is ${options.minLength}`)
    if (typeof options.maxLength === "number" && value.length > options.maxLength) throw new HttpError(400, `${path} is too long; maximum length is ${options.maxLength}`)
    if (options.pattern instanceof RegExp) {
      if (!new RegExp(options.pattern.source, options.pattern.flags).test(value)) throw new HttpError(400, `${path} has an invalid format`)
    } else if (typeof options.pattern === "string") {
      if (!new RegExp(options.pattern).test(value)) throw new HttpError(400, `${path} has an invalid format`)
    }
    if (typeof options.format === "string") validateStringFormat(value, options.format, path)
    return
  }
  if ((kind !== "number" && kind !== "integer") || typeof value !== "number") return
  if (typeof options.minimum === "number" && value < options.minimum) throw new HttpError(400, `${path} is below minimum`)
  if (typeof options.maximum === "number" && value > options.maximum) throw new HttpError(400, `${path} is above maximum`)
  if (typeof options.exclusiveMinimum === "number" && value <= options.exclusiveMinimum) throw new HttpError(400, `${path} is below exclusive minimum`)
  if (typeof options.exclusiveMaximum === "number" && value >= options.exclusiveMaximum) throw new HttpError(400, `${path} is above exclusive maximum`)
  if (typeof options.multipleOf === "number" && options.multipleOf > 0) {
    const quotient = value / options.multipleOf
    if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * Math.max(1, Math.abs(quotient))) throw new HttpError(400, `${path} must be a multiple of ${options.multipleOf}`)
  }
}

function validateStringFormat(value: string, format: string, path: string): void {
  if (format === "date-time" && Number.isNaN(Date.parse(value))) throw new HttpError(400, `${path} has an invalid format`)
  if (format === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)))) throw new HttpError(400, `${path} has an invalid format`)
  if (format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(400, `${path} has an invalid format`)
  if (format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, `${path} has an invalid format`)
  if (format === "url" || format === "uri") {
    try { new URL(value) } catch { throw new HttpError(400, `${path} has an invalid format`) }
  }
}

function setSafeProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true })
    return
  }
  target[key] = value
}

export function fromStandardSchema<T>(schema: StandardSchema<T>): Schema<T> {
  const definition = inferPropertyDefinition(schema)

  return {
    kind: "standard",
    definition,
    async validate(value, path = "body") {
      const result = await schema["~standard"].validate(value)
      if (typeof result === "object" && result !== null && "issues" in result) {
        const issue = result.issues[0]
        const issuePath = issue?.path?.map((part) => String(part)).join(".")
        throw new HttpError(400, `${path}${issuePath ? `.${issuePath}` : ""}: ${issue?.message ?? "Invalid value"}`)
      }
      if (typeof result === "object" && result !== null && "value" in result) return result.value as T
      return result as T
    }
  }
}

function inferPropertyDefinition(field: unknown): Record<string, unknown> | undefined {
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, unknown>
    if (f.optional === true) return inferPropertyDefinition({ ...f, optional: undefined })
    if (isRecord(f.definition)) return decorateDefinition(f.definition, f)
    const rawDef = isRecord(f._def) ? f._def : undefined
    const source = rawDef ?? f
    const shapeValue = source.shape ?? f.shape
    const shape = typeof shapeValue === "function" ? (shapeValue as () => unknown)() : shapeValue
    if (typeof shape === "object" && shape !== null) {
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape as Record<string, unknown>)) {
        const property = inferPropertyDefinition(value) ?? { type: "string" }
        properties[key] = property
        if (!isOptionalStandardField(value)) required.push(key)
      }
      return decorateDefinition({ type: "object", properties, required }, f)
    }
    const typeName = typeof source.typeName === "string" ? source.typeName : typeof source.type === "string" ? source.type : ""
    const normalizedType = typeName.replace(/^Zod/, "").toLowerCase()
    const inner = source.innerType ?? source.wrapped ?? source.item ?? source.element
    if (normalizedType === "optional" || normalizedType === "default") return inferPropertyDefinition(inner)
    if (normalizedType === "nullable") {
      const innerDefinition = inferPropertyDefinition(inner) ?? {}
      return decorateDefinition({ anyOf: [innerDefinition, { type: "null" }] }, f)
    }
    if (normalizedType === "array") return decorateDefinition({ type: "array", items: inferPropertyDefinition(source.items ?? source.type) ?? {} }, f)
    if (normalizedType === "union") return decorateDefinition({ anyOf: toDefinitions(source.options ?? source.anyOf) }, f)
    if (normalizedType === "intersection" || normalizedType === "intersect") return decorateDefinition({ allOf: toDefinitions(source.types ?? source.items) }, f)
    if (normalizedType === "tuple") return decorateDefinition({ type: "array", prefixItems: toDefinitions(source.items), minItems: Array.isArray(source.items) ? source.items.length : undefined }, f)
    if (normalizedType === "literal") return decorateDefinition({ const: source.value ?? source.const }, f)
    if (normalizedType === "enum") return decorateDefinition({ enum: Array.isArray(source.values) ? source.values : isRecord(source.entries) ? Object.values(source.entries) : [] }, f)
    if (normalizedType === "record" || normalizedType === "map") return decorateDefinition({ type: "object", additionalProperties: inferPropertyDefinition(source.value ?? source.values ?? source.valueType) ?? {} }, f)
    if (typeof f.type === "string") return decorateDefinition({ type: normalizeOpenApiType(f.type) }, f)
    if (typeof source.typeName === "string") return decorateDefinition({ type: normalizeOpenApiType(normalizedType) }, f)
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toDefinitions(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((item) => inferPropertyDefinition(item) ?? {}) : []
}

function normalizeOpenApiType(value: string): string {
  if (value === "date" || value === "datetime" || value === "date-time") return "string"
  if (value === "integer") return "integer"
  if (value === "int" || value === "float" || value === "double") return "number"
  return value === "object" || value === "string" || value === "number" || value === "boolean" || value === "null" ? value : "string"
}

function decorateDefinition(definition: Record<string, unknown>, metadata: Record<string, unknown>): Record<string, unknown> {
  const output = { ...definition }
  const keys: Array<[string, string]> = [
    ["description", "description"], ["examples", "examples"], ["default", "default"],
    ["minimum", "minimum"], ["maximum", "maximum"], ["min", "minimum"], ["max", "maximum"],
    ["minLength", "minLength"], ["maxLength", "maxLength"], ["minItems", "minItems"], ["maxItems", "maxItems"],
    ["pattern", "pattern"], ["format", "format"]
  ]
  for (const [source, target] of keys) if (metadata[source] !== undefined) output[target] = metadata[source]
  if (metadata.integer === true || metadata.isInt === true) output.type = "integer"
  if (metadata.date === true || metadata.datetime === true) { output.type = "string"; output.format = "date-time" }
  return output
}

function isOptionalStandardField(field: unknown): boolean {
  if (typeof field !== "object" || field === null) return false
  if ((field as Record<string, unknown>).optional === true) return true
  const def = (field as Record<string, unknown>)._def
  if (typeof def !== "object" || def === null) return false
  return (def as Record<string, unknown>).typeName === "ZodOptional"
}

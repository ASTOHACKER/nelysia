import { HttpError } from "./types.ts"
import { resolveSchemaReference, type SchemaIR, type SchemaIRNode, type SchemaReferenceRegistry } from "./schema-ir.ts"

export interface SchemaValidationOptions {
  readonly path?: string
  readonly references?: SchemaReferenceRegistry
  readonly maxDepth?: number
}

export type SchemaFormatValidator = (value: string) => boolean

const formatRegistry = new Map<string, SchemaFormatValidator>([
  ["date", isDate],
  ["date-time", isDateTime],
  ["email", (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)],
  ["uuid", (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)],
  ["url", isUrl],
  ["uri", isUrl],
  ["ipv4", isIPv4],
  ["ipv6", isIPv6],
  ["hostname", isHostname],
])

export function registerSchemaFormat(name: string, validator: SchemaFormatValidator): void {
  if (!name || typeof validator !== "function") throw new TypeError("Schema format registration requires a name and validator")
  formatRegistry.set(name, validator)
}

export function validateSchemaFormat(name: string, value: string): boolean {
  const validator = formatRegistry.get(name)
  return validator ? validator(value) : true
}

export function validateSchema(value: unknown, ir: SchemaIR | SchemaIRNode, options: SchemaValidationOptions = {}): unknown {
  const node = "root" in ir ? ir.root : ir
  return evaluate(value, node, options.path ?? "body", { references: options.references, depth: 0, maxDepth: options.maxDepth ?? 32 })
}

export async function validateSchemaAsync(value: unknown, ir: SchemaIR | SchemaIRNode, options: SchemaValidationOptions = {}): Promise<unknown> {
  return validateSchema(value, ir, options)
}

export function validateSchemaOptions(options: Record<string, unknown>, kind: string): void {
  const nonNegative = ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"]
  for (const key of nonNegative) {
    const value = options[key]
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      throw new TypeError(`${kind} ${key} must be a non-negative integer`)
    }
  }
  if (typeof options.minLength === "number" && typeof options.maxLength === "number" && options.minLength > options.maxLength) {
    throw new TypeError(`${kind} minLength cannot exceed maxLength`)
  }
  if (typeof options.minItems === "number" && typeof options.maxItems === "number" && options.minItems > options.maxItems) {
    throw new TypeError(`${kind} minItems cannot exceed maxItems`)
  }
  if (typeof options.minProperties === "number" && typeof options.maxProperties === "number" && options.minProperties > options.maxProperties) {
    throw new TypeError(`${kind} minProperties cannot exceed maxProperties`)
  }
  if (kind === "bigint") {
    for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]) {
      if (options[key] !== undefined && typeof options[key] !== "bigint") throw new TypeError(`${kind} ${key} must be a bigint`)
    }
    if (typeof options.multipleOf === "bigint" && options.multipleOf <= 0n) throw new TypeError(`${kind} multipleOf must be greater than zero`)
    if (typeof options.minimum === "bigint" && typeof options.maximum === "bigint" && options.minimum > options.maximum) throw new TypeError(`${kind} minimum cannot exceed maximum`)
    return
  }
  if (options.multipleOf !== undefined && (typeof options.multipleOf !== "number" || !Number.isFinite(options.multipleOf) || options.multipleOf <= 0)) {
    throw new TypeError(`${kind} multipleOf must be greater than zero`)
  }
  for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]) {
    if (options[key] !== undefined && (typeof options[key] !== "number" || !Number.isFinite(options[key] as number))) {
      throw new TypeError(`${kind} ${key} must be a finite number`)
    }
  }
  if (typeof options.minimum === "number" && typeof options.maximum === "number" && options.minimum > options.maximum) {
    throw new TypeError(`${kind} minimum cannot exceed maximum`)
  }
}

interface EvaluationState {
  readonly references?: SchemaReferenceRegistry
  readonly depth: number
  readonly maxDepth: number
}

function evaluate(value: unknown, node: SchemaIRNode, path: string, state: EvaluationState): unknown {
  if (node.ref) {
    if (!state.references) throw new HttpError(400, `Unknown schema reference: ${node.ref}`)
    if (state.depth >= state.maxDepth) reject(path, `exceeds schema reference depth ${state.maxDepth}`)
    return evaluate(value, resolveSchemaReference(node.ref, state.references), path, { ...state, depth: state.depth + 1 })
  }
  if (node.optional && value === undefined) return undefined
  if (node.kind === "optional" && value === undefined) return undefined

  switch (node.kind) {
    case "any":
    case "unknown":
      return value
    case "never":
      fail(path, "never")
    case "null":
      if (value !== null) fail(path, "null")
      return value
    case "boolean":
      if (typeof value !== "boolean") fail(path, "boolean")
      return value
    case "string":
      return validateString(value, node, path)
    case "template-literal":
      return validateString(value, node, path)
    case "number":
      return validateNumber(value, node, path, false)
    case "integer":
      return validateNumber(value, node, path, true)
    case "bigint":
      return validateBigInt(value, node, path)
    case "date":
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(path, "date")
      return value
    case "literal":
      if (value !== node.definition.const) fail(path, String(node.definition.const))
      return value
    case "enum":
      if (!Array.isArray(node.definition.enum) || !node.definition.enum.some((entry) => Object.is(entry, value))) fail(path, "one of the allowed values")
      return value
    case "object":
      return validateObject(value, node, path, state)
    case "record":
      return validateRecord(value, node, path, state)
    case "array":
      return validateArray(value, node, path, state)
    case "tuple":
      return validateTuple(value, node, path, state)
    case "union":
      for (const child of node.children) {
        try { return evaluate(value, child, path, state) } catch { /* try the next branch */ }
      }
      fail(path, "one of the allowed values")
    case "nullable":
      return value === null ? null : evaluate(value, node.children[0] ?? node, path, state)
    case "intersect": {
      let output = value
      for (const child of node.children) {
        const validated = evaluate(output, child, path, state)
        output = isRecord(output) && isRecord(validated) ? mergeSafe(output, validated) : validated
      }
      return output
    }
    case "standard":
      fail(path, "a supported runtime schema")
    default:
      fail(path, "a supported runtime schema")
  }
}

function validateString(value: unknown, node: SchemaIRNode, path: string): string {
  if (typeof value !== "string") fail(path, "string")
  const definition = node.definition
  const length = Array.from(value).length
  if (typeof definition.minLength === "number" && length < definition.minLength) reject(path, `is too short; minimum length is ${definition.minLength}`)
  if (typeof definition.maxLength === "number" && length > definition.maxLength) reject(path, `is too long; maximum length is ${definition.maxLength}`)
  if (typeof definition.pattern === "string") {
    const flags = typeof definition["x-patternFlags"] === "string" ? definition["x-patternFlags"] : ""
    let matched = false
    try { matched = new RegExp(definition.pattern, flags).test(value) } catch { fail(path, "a valid pattern") }
    if (!matched) reject(path, "has an invalid format")
  }
  if (typeof definition.format === "string" && !validateSchemaFormat(definition.format, value)) fail(path, `a string with format ${definition.format}`)
  return value
}

function validateNumber(value: unknown, node: SchemaIRNode, path: string, integer: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) fail(path, integer ? "integer" : "number")
  const definition = node.definition
  if (typeof definition.minimum === "number" && value < definition.minimum) reject(path, "is below minimum")
  if (typeof definition.maximum === "number" && value > definition.maximum) reject(path, "is above maximum")
  if (typeof definition.exclusiveMinimum === "number" && value <= definition.exclusiveMinimum) reject(path, "is below exclusive minimum")
  if (typeof definition.exclusiveMaximum === "number" && value >= definition.exclusiveMaximum) reject(path, "is above exclusive maximum")
  if (typeof definition.multipleOf === "number") {
    const quotient = value / definition.multipleOf
    if (Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * Math.max(1, Math.abs(quotient))) reject(path, `must be a multiple of ${definition.multipleOf}`)
  }
  return value
}

function validateBigInt(value: unknown, node: SchemaIRNode, path: string): bigint {
  if (typeof value !== "bigint") fail(path, "bigint")
  const definition = node.definition
  const minimum = toBigInt(definition.minimum)
  const maximum = toBigInt(definition.maximum)
  const exclusiveMinimum = toBigInt(definition.exclusiveMinimum)
  const exclusiveMaximum = toBigInt(definition.exclusiveMaximum)
  const multipleOf = toBigInt(definition.multipleOf)
  if (minimum !== undefined && value < minimum) reject(path, "is below minimum")
  if (maximum !== undefined && value > maximum) reject(path, "is above maximum")
  if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) reject(path, "is below exclusive minimum")
  if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) reject(path, "is above exclusive maximum")
  if (multipleOf !== undefined && value % multipleOf !== 0n) reject(path, `must be a multiple of ${multipleOf}`)
  return value
}

function validateObject(value: unknown, node: SchemaIRNode, path: string, state: EvaluationState): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "object")
  const keys = Object.keys(value)
  const definition = node.definition
  if (typeof definition.minProperties === "number" && keys.length < definition.minProperties) fail(path, `an object with at least ${definition.minProperties} properties`)
  if (typeof definition.maxProperties === "number" && keys.length > definition.maxProperties) fail(path, `an object with at most ${definition.maxProperties} properties`)
  const properties = isRecord(definition.properties) ? definition.properties : {}
  const required = new Set(Array.isArray(definition.required) ? definition.required.map(String) : [])
  const extraKeys = keys.filter((key) => !Object.prototype.hasOwnProperty.call(properties, key))
  if (definition.additionalProperties === false && extraKeys.length > 0) fail(path, "an object without additional properties")
  const output: Record<string, unknown> = {}
  for (let index = 0; index < node.childKeys.length; index++) {
    const key = node.childKeys[index]
    const child = node.children[index]
    if (!key || !child) continue
    const present = Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined
    if (!present && !required.has(key)) continue
    if (!present && required.has(key)) fail(`${path}.${key}`, "a value")
    setSafeProperty(output, key, evaluate(value[key], child, `${path}.${key}`, state))
  }
  if (definition.additionalProperties === true) {
    for (const key of extraKeys) setSafeProperty(output, key, value[key])
  }
  return output
}

function validateRecord(value: unknown, node: SchemaIRNode, path: string, state: EvaluationState): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "object")
  const keys = Object.keys(value)
  const definition = node.definition
  if (typeof definition.minProperties === "number" && keys.length < definition.minProperties) reject(path, `must have at least ${definition.minProperties} properties`)
  if (typeof definition.maxProperties === "number" && keys.length > definition.maxProperties) reject(path, `must have at most ${definition.maxProperties} properties`)
  const child = node.children[0]
  if (!child) return { ...value }
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) setSafeProperty(output, key, evaluate(entry, child, `${path}.${key}`, state))
  return output
}

function toBigInt(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value)
  return undefined
}

function validateArray(value: unknown, node: SchemaIRNode, path: string, state: EvaluationState): unknown[] {
  if (!Array.isArray(value)) fail(path, "array")
  const definition = node.definition
  if (typeof definition.minItems === "number" && value.length < definition.minItems) reject(path, `has too few items; minimum is ${definition.minItems}`)
  if (typeof definition.maxItems === "number" && value.length > definition.maxItems) reject(path, `has too many items; maximum is ${definition.maxItems}`)
  if (definition.uniqueItems === true) assertUnique(value, path)
  const child = node.children[0]
  if (!child) return [...value]
  return value.map((entry, index) => evaluate(entry, child, `${path}.${index}`, state))
}

function validateTuple(value: unknown, node: SchemaIRNode, path: string, state: EvaluationState): unknown[] {
  if (!Array.isArray(value)) fail(path, "array")
  const definition = node.definition
  const minItems = typeof definition.minItems === "number" ? definition.minItems : node.children.length
  const maxItems = typeof definition.maxItems === "number" ? definition.maxItems : node.children.length
  if (value.length < minItems || value.length > maxItems) fail(path, `an array with length between ${minItems} and ${maxItems}`)
  return value.map((entry, index) => {
    const child = node.children[index]
    return child ? evaluate(entry, child, `${path}.${index}`, state) : entry
  })
}

function assertUnique(value: readonly unknown[], path: string): void {
  const identities = new Set(value.map((entry) => stableValue(entry)))
  if (identities.size !== value.length) fail(path, "an array with unique items")
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return `${typeof value}:${String(value)}`
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${key}:${stableValue(record[key])}`).join(",")}}`
}

function mergeSafe(first: Record<string, unknown>, second: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(first)) setSafeProperty(output, key, value)
  for (const [key, value] of Object.entries(second)) setSafeProperty(output, key, value)
  return output
}

function setSafeProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true })
    return
  }
  target[key] = value
}

function fail(path: string, expected: string): never {
  throw new HttpError(400, `${path} must be ${expected}`)
}

function reject(path: string, message: string): never {
  throw new HttpError(400, `${path} ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && !Number.isNaN(Date.parse(value))
}

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol.length > 1
  } catch {
    return false
  }
}

function isIPv4(value: string): boolean {
  const parts = value.split(".")
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}

function isIPv6(value: string): boolean {
  if (!value.includes(":")) return false
  try {
    return new URL(`http://[${value}]/`).hostname.replace(/[\[\]]/g, "") === value
  } catch {
    return false
  }
}

function isHostname(value: string): boolean {
  return value.length <= 253 && value.split(".").every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
}

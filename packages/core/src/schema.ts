import { HttpError } from "./types.ts"

export interface Schema<T = unknown> {
  readonly kind: string
  validate(value: unknown, path?: string): T | Promise<T>
  readonly definition?: Record<string, unknown>
}

export interface StandardSchema<T = unknown> {
  readonly "~standard": {
    readonly version: 1
    readonly validate: (value: unknown) => T | { value: T } | Promise<T | { value: T } | { issues: readonly { message: string; path?: readonly (string | number)[] }[] }> | { issues: readonly { message: string; path?: readonly (string | number)[] }[] }
  }
}

export type Infer<S extends Schema> = S extends Schema<infer T> ? T : never

const primitive = <T>(kind: string, check: (value: unknown) => value is T): Schema<T> => ({
  kind,
  definition: { type: kind },
  validate(value, path = "body") {
    if (!check(value)) throw new HttpError(400, `${path} must be ${kind}`)
    return value
  }
})

export const t = {
  String: () => primitive("string", (value): value is string => typeof value === "string"),
  Number: () => primitive("number", (value): value is number => typeof value === "number" && Number.isFinite(value)),
  Boolean: () => primitive("boolean", (value): value is boolean => typeof value === "boolean"),
  Object: <Shape extends Record<string, Schema>>(shape: Shape): Schema<{ [K in keyof Shape]: Infer<Shape[K]> }> => ({
    kind: "object",
    definition: { type: "object", properties: Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.definition ?? { type: schema.kind }]),), required: Object.keys(shape) },
    async validate(value, path = "body") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new HttpError(400, `${path} must be object`)
      const output: Record<string, unknown> = {}
      for (const [key, schema] of Object.entries(shape)) output[key] = await schema.validate((value as Record<string, unknown>)[key], `${path}.${key}`)
      return output as { [K in keyof Shape]: Infer<Shape[K]> }
    }
  })
}

export function fromStandardSchema<T>(schema: StandardSchema<T>): Schema<T> {
  let definition: Record<string, unknown> | undefined
  const raw = schema as unknown as Record<string, unknown>
  const shape = raw.shape ?? (typeof (raw._def as Record<string, unknown>)?.shape === "function" ? (raw._def as { shape: () => unknown }).shape() : (raw._def as Record<string, unknown>)?.shape)
  if (typeof shape === "object" && shape !== null) {
    const properties: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(shape as Record<string, unknown>)) {
      properties[key] = { type: inferPropertyType(val) }
    }
    definition = { type: "object", properties, required: Object.keys(properties) }
  }

  return {
    kind: "standard",
    definition,
    async validate(value, path = "body") {
      const result = await schema["~standard"].validate(value)
      if (typeof result === "object" && result !== null && "issues" in result) {
        const issue = result.issues[0]
        throw new HttpError(400, `${path}: ${issue?.message ?? "Invalid value"}`)
      }
      if (typeof result === "object" && result !== null && "value" in result) return result.value as T
      return result as T
    }
  }
}

function inferPropertyType(field: unknown): string {
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, unknown>
    if (typeof f.type === "string") return f.type
    if (typeof f._def === "object" && f._def !== null) {
      const typeName = (f._def as Record<string, unknown>).typeName
      if (typeof typeName === "string") return typeName.replace(/^Zod/, "").toLowerCase()
    }
  }
  return "string"
}

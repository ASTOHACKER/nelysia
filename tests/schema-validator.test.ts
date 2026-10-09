import assert from "node:assert/strict"
import test from "node:test"
import { t } from "../packages/core/src/index.ts"
import type { Schema } from "../packages/core/src/schema.ts"
import { normalizeSchemaIR } from "../packages/core/src/schema-ir.ts"
import { registerSchemaFormat, validateSchema, validateSchemaAsync } from "../packages/core/src/schema-validator.ts"

test("validates primitive types and numeric boundaries", () => {
  const integer = normalizeSchemaIR(t.Integer({ minimum: 1, maximum: 5, exclusiveMinimum: 0, exclusiveMaximum: 6, multipleOf: 0.5 }))

  assert.equal(validateSchema(2, integer), 2)
  assert.throws(() => validateSchema(0, integer), /minimum/)
  assert.throws(() => validateSchema(6, integer), /maximum/)
  assert.throws(() => validateSchema(2.1, integer), /integer/)
  assert.throws(() => validateSchema(2.25, normalizeSchemaIR(t.Number({ multipleOf: 0.5 }))), /multiple/)
  assert.throws(() => validateSchema(Infinity, normalizeSchemaIR(t.Number())), /number/)
})

test("uses Unicode string length, pattern flags, and registered formats", () => {
  const unicode = normalizeSchemaIR(t.String({ minLength: 1, maxLength: 1 }))
  assert.equal(validateSchema("😀", unicode), "😀")
  assert.throws(() => validateSchema("😀😀", unicode), /too long/)

  const pattern = normalizeSchemaIR(t.String({ pattern: /^ada$/i }))
  assert.equal(validateSchema("ADA", pattern), "ADA")
  assert.throws(() => validateSchema("grace", pattern), /format/)

  const formats: ReadonlyArray<[string, string]> = [
    ["date", "2026-10-09"],
    ["date-time", "2026-10-09T12:00:00Z"],
    ["email", "ada@example.com"],
    ["uuid", "550e8400-e29b-41d4-a716-446655440000"],
    ["url", "https://example.com/users"],
    ["uri", "https://example.com/users"],
    ["ipv4", "127.0.0.1"],
    ["ipv6", "::1"],
    ["hostname", "api.example.com"],
  ]
  for (const [format, valid] of formats) {
    const schema = normalizeSchemaIR(t.String({ format }))
    assert.equal(validateSchema(valid, schema), valid, `format ${format} should accept a valid value`)
    assert.throws(() => validateSchema("not valid", schema), new RegExp(format === "date-time" ? "format" : "format"), `format ${format} should reject an invalid value`)
  }

  registerSchemaFormat("test-token", (value) => value.startsWith("tok_"))
  const registered = normalizeSchemaIR(t.String({ format: "test-token" }))
  assert.equal(validateSchema("tok_123", registered), "tok_123")
  assert.throws(() => validateSchema("bad", registered), /format/)
})

test("validates arrays, tuple limits, uniqueness, and async output", async () => {
  const array = normalizeSchemaIR(t.Array(t.Integer({ minimum: 1 }), { minItems: 1, maxItems: 2, uniqueItems: true }))
  assert.deepEqual(validateSchema([1, 2], array), [1, 2])
  assert.throws(() => validateSchema([], array), /too few/)
  assert.throws(() => validateSchema([1, 1], array), /unique/)

  const tuple: Schema = {
    kind: "tuple",
    items: [t.String(), t.Integer()],
    definition: {
      type: "array",
      prefixItems: [{ type: "string" }, { type: "integer" }],
      minItems: 2,
      maxItems: 2,
    },
    validate(value) { return value as unknown[] },
  }
  const tupleIR = normalizeSchemaIR(tuple)
  assert.deepEqual(validateSchema(["id", 1], tupleIR), ["id", 1])
  assert.throws(() => validateSchema(["id"], tupleIR), /items|length/)
  assert.throws(() => validateSchema(["id", "bad"], tupleIR), /integer/)
  assert.deepEqual(await validateSchemaAsync([1], normalizeSchemaIR(t.Array(t.Integer()))), [1])
})

test("validates object required and additional-property rules with stable paths", async () => {
  const schema = t.Object({
    profile: t.Object({ age: t.Integer({ minimum: 18 }) }),
    nickname: t.Optional(t.String()),
  }, { additionalProperties: false })
  const ir = normalizeSchemaIR(schema)

  assert.deepEqual(await validateSchemaAsync({ profile: { age: 20 } }, ir), { profile: { age: 20 } })
  assert.throws(() => validateSchema({ profile: { age: 12 } }, ir), /body\.profile\.age/)
  assert.throws(() => validateSchema({ profile: { age: 20 }, extra: true }, ir), /additional/)

  const keepExtra = normalizeSchemaIR(t.Object({ id: t.String() }, { additionalProperties: true }))
  assert.deepEqual(validateSchema({ id: "1", extra: 2 }, keepExtra), { id: "1", extra: 2 })
})

test("validates unions, intersections, and safe object keys", () => {
  const union = normalizeSchemaIR(t.Union([t.String(), t.Integer()] as const))
  assert.equal(validateSchema("ok", union), "ok")
  assert.equal(validateSchema(2, union), 2)
  assert.throws(() => validateSchema(false, union), /allowed value/)

  const intersection = normalizeSchemaIR(t.Intersect([
    t.Object({ id: t.String() }),
    t.Object({ active: t.Boolean() }),
  ] as const))
  assert.deepEqual(validateSchema({ id: "1", active: true }, intersection), { id: "1", active: true })

  const safe = normalizeSchemaIR(t.Object({
    ["__proto__"]: t.String(),
    constructor: t.String(),
    prototype: t.String(),
  }))
  const output = validateSchema(JSON.parse('{"__proto__":"safe","constructor":"ok","prototype":"yes"}'), safe) as Record<string, unknown>
  assert.equal(Object.getPrototypeOf(output), Object.prototype)
  assert.equal(Object.prototype.hasOwnProperty.call(output, "__proto__"), true)
  assert.equal(output.constructor, "ok")
  assert.equal(output.prototype, "yes")
})

test("rejects invalid schema options during construction", () => {
  assert.throws(() => t.String({ minLength: -1 }), /minLength/)
  assert.throws(() => t.Array(t.String(), { maxItems: -1 }), /maxItems/)
  assert.throws(() => t.Number({ multipleOf: 0 }), /multipleOf/)
})

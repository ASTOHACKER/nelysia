import assert from "node:assert/strict"
import test from "node:test"
import { t } from "../packages/core/src/schema.ts"
import { normalizeSchemaIR } from "../packages/core/src/schema-ir.ts"
import { schemaToJSONSchema, schemaToOpenAPI } from "../packages/openapi/src/index.ts"

test("converts the canonical IR to stable OpenAPI 3.1 schemas", () => {
  const schema = t.Object({
    users: t.Array(t.Object({
      id: t.String({ format: "uuid", minLength: 1, examples: ["00000000-0000-4000-8000-000000000000"] }),
      score: t.Number({ minimum: 1, multipleOf: 0.5, default: 1 }),
    })),
    tags: t.Record(t.String({ minLength: 1 }), { minProperties: 1 }),
    tuple: t.Tuple([t.String(), t.Number()] as const),
    choice: t.Union([t.Literal("a"), t.Literal("b")] as const),
    merged: t.Intersect([t.Object({ left: t.Boolean() }), t.Object({ right: t.Null() })] as const),
  }, { additionalProperties: false, title: "Payload", readOnly: true })

  const output = schemaToOpenAPI(normalizeSchemaIR(schema))
  assert.deepEqual(output, {
    additionalProperties: false,
    properties: {
      choice: { anyOf: [{ const: "a" }, { const: "b" }] },
      merged: { allOf: [
        { properties: { left: { type: "boolean" } }, required: ["left"], type: "object" },
        { properties: { right: { type: "null" } }, required: ["right"], type: "object" },
      ] },
      tags: { additionalProperties: { minLength: 1, type: "string" }, minProperties: 1, type: "object" },
      tuple: { items: false, maxItems: 2, minItems: 2, prefixItems: [{ type: "string" }, { type: "number" }], type: "array" },
      users: { items: { properties: { id: { examples: ["00000000-0000-4000-8000-000000000000"], format: "uuid", minLength: 1, type: "string" }, score: { default: 1, minimum: 1, multipleOf: 0.5, type: "number" } }, required: ["id", "score"], type: "object" }, type: "array" },
    },
    required: ["choice", "merged", "tags", "tuple", "users"],
    readOnly: true,
    title: "Payload",
    type: "object",
  })
  assert.equal(JSON.stringify(output), JSON.stringify(schemaToOpenAPI(normalizeSchemaIR(schema))))
})

test("converts refs and ids into reusable OpenAPI components without duplicates", () => {
  const user = t.Object({ name: t.String() }, { $id: "User", description: "A user" })
  const root = t.Object({ owner: user, backup: t.Ref("User") })
  const components: Record<string, unknown> = {}
  const output = schemaToOpenAPI(normalizeSchemaIR(root), { components })

  assert.deepEqual(output, {
    properties: { backup: { $ref: "#/components/schemas/User" }, owner: { $ref: "#/components/schemas/User" } },
    required: ["backup", "owner"],
    type: "object",
  })
  assert.deepEqual(components, {
    User: { description: "A user", properties: { name: { type: "string" } }, required: ["name"], type: "object" },
  })

  const externalComponents: Record<string, unknown> = {}
  assert.deepEqual(schemaToOpenAPI(normalizeSchemaIR(t.Ref("User")), { components: externalComponents, definitions: { User: user } }), { $ref: "#/components/schemas/User" })
  assert.deepEqual(externalComponents.User, components.User)
})

test("supports JSON Schema output and keeps tuple, record, defaults, and flags", () => {
  const schema = t.Object({
    value: t.String({ pattern: /^(foo|bar)$/iu, default: "foo", writeOnly: true }),
    pair: t.Tuple([t.Integer(), t.Boolean()] as const),
    values: t.Record(t.Number()),
  })
  const output = schemaToJSONSchema(normalizeSchemaIR(schema))
  assert.deepEqual(output, {
    properties: {
      pair: { items: false, maxItems: 2, minItems: 2, prefixItems: [{ type: "integer" }, { type: "boolean" }], type: "array" },
      value: { default: "foo", pattern: "^(foo|bar)$", writeOnly: true, "x-patternFlags": "iu", type: "string" },
      values: { additionalProperties: { type: "number" }, type: "object" },
    },
    required: ["pair", "value", "values"],
    type: "object",
  })
  assert.deepEqual(schemaToJSONSchema(normalizeSchemaIR(t.Never())), { not: {} })
  assert.deepEqual(schemaToJSONSchema(normalizeSchemaIR(t.Any())), {})
})

test("supports OpenAPI 3.0 nullable and tuple compatibility mode", () => {
  const schema = t.Object({ value: t.Nullable(t.String()), pair: t.Tuple([t.String(), t.Number()] as const) })
  const output = schemaToOpenAPI(normalizeSchemaIR(schema), { dialect: "openapi-3.0" })
  assert.deepEqual(output, {
    properties: {
      pair: { items: [{ type: "string" }, { type: "number" }], maxItems: 2, minItems: 2, type: "array" },
      value: { nullable: true, type: "string" },
    },
    required: ["pair", "value"],
    type: "object",
  })
})

import assert from "node:assert/strict"
import test from "node:test"
import { t } from "../packages/core/src/index.ts"
import type { Schema } from "../packages/core/src/schema.ts"
import { normalizeSchemaIR, schemaCapability, schemaIRHash } from "../packages/core/src/schema-ir.ts"

test("normalizes primitive and nested definitions", () => {
  const schema = t.Object({
    id: t.Integer({ minimum: 1 }),
    name: t.String({ minLength: 1 }),
  }, {
    $id: "User",
    title: "User",
    additionalProperties: false,
  })

  const ir = normalizeSchemaIR(schema)

  assert.equal(ir.root.kind, "object")
  assert.equal(ir.root.id, "User")
  assert.equal(ir.root.children.length, 2)
  assert.equal(ir.root.children[0]?.kind, "integer")
  assert.equal(ir.root.children[1]?.kind, "string")
  assert.equal(ir.root.definition.type, "object")
  assert.equal(ir.root.definition.additionalProperties, false)
  assert.equal(ir.root.options.title, "User")
  assert.equal(ir.root.options.$id, "User")
  assert.equal(ir.capability, "compiled")
})

test("produces stable hashes independent of key insertion order", () => {
  const first = normalizeSchemaIR(t.String({ title: "Name", minLength: 1, description: "A name" }))
  const second = normalizeSchemaIR(t.String({ description: "A name", minLength: 1, title: "Name" }))

  assert.equal(schemaIRHash(first), schemaIRHash(second))
})

test("classifies unsupported custom validators", () => {
  const custom: Schema<string> = {
    kind: "custom",
    definition: { type: "string", $custom: "runtime" },
    validate(value) {
      return String(value)
    },
  }

  const ir = normalizeSchemaIR(custom)

  assert.equal(schemaCapability(ir), "unsupported")
  assert.equal(ir.root.capability, "unsupported")
})

test("preserves schema metadata without mutation", () => {
  const schema = t.String({
    $id: "Name",
    title: "Name",
    description: "Display name",
    examples: ["Ada"],
    default: "Guest",
    minLength: 1,
  })
  const ir = normalizeSchemaIR(schema)

  assert.equal(Object.isFrozen(ir), true)
  assert.equal(Object.isFrozen(ir.root), true)
  assert.equal(Object.isFrozen(ir.root.definition), true)
  assert.equal(Object.isFrozen(ir.root.options), true)
  assert.deepEqual(ir.root.options.examples, ["Ada"])
  assert.equal(schema.definition?.description, "Display name")

  assert.throws(() => {
    ;(ir.root.definition as Record<string, unknown>).description = "changed"
  }, TypeError)
  assert.equal(schema.definition?.description, "Display name")
})

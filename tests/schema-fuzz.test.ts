import assert from "node:assert/strict"
import test from "node:test"
import { t } from "../packages/core/src/schema.ts"
import { normalizeSchemaIR } from "../packages/core/src/schema-ir.ts"
import { validateSchema } from "../packages/core/src/schema-validator.ts"
import { createGeneratedValidator } from "../packages/compiler/src/dispatcher.ts"

test("deterministic schema fuzz keeps generated and reference validators aligned", () => {
  const schema = t.Object({
    name: t.String({ minLength: 1, maxLength: 8 }),
    count: t.Integer({ minimum: 0, maximum: 10 }),
    tags: t.Array(t.String({ maxLength: 4 }), { maxItems: 3 }),
  }, { additionalProperties: false })
  const normalized = normalizeSchemaIR(schema)
  const generated = createGeneratedValidator(schema.definition!)
  let mismatches = 0

  for (const seed of [0x12345678, 0x9e3779b9, 0xdeadbeef]) {
    const random = seeded(seed)
    for (let index = 0; index < 300; index++) {
      const value = fuzzValue(random, index)
      const reference = outcome(() => validateSchema(value, normalized))
      const compiled = outcome(() => generated.validate(value))
      if (reference.ok !== compiled.ok) mismatches++
    }
  }

  assert.equal(mismatches, 0)
})

test("fuzz cases preserve safe prototype keys and Unicode code-point boundaries", async () => {
  const schema = t.Object({
    text: t.String({ minLength: 2, maxLength: 2 }),
    payload: t.Record(t.Unknown()),
  }, { additionalProperties: false })
  const valid = JSON.parse('{"text":"😀a","payload":{"__proto__":{"polluted":true},"constructor":"safe"}}')
  assert.deepEqual(await schema.validate(valid), valid)
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  await assert.rejects(async () => await schema.validate({ text: "😀", payload: {} }), /length|short/)
})

test("recursive fuzz cases use the same bounded reference semantics", async () => {
  const schema = t.Cyclic((self) => t.Object({ value: t.String(), next: t.Optional(self) }), { $id: "FuzzNode", maxDepth: 8 })
  let valid: Record<string, unknown> = { value: "0" }
  for (let index = 1; index < 5; index++) valid = { value: String(index), next: valid }
  assert.deepEqual(await schema.validate(valid), valid)
  assert.throws(() => schema.validate({ value: "ok", next: { value: 1 } }), /must be string/)

  let deep: Record<string, unknown> = { value: "0" }
  for (let index = 0; index < 20; index++) deep = { value: String(index), next: deep }
  assert.throws(() => schema.validate(deep), /schema reference depth/)
})

function fuzzValue(random: () => number, index: number): unknown {
  const unicode = ["Ada", "😀a", "é", "", "超"]
  const names = [unicode[index % unicode.length], `n${Math.floor(random() * 20)}`, 42]
  const count = index % 5 === 0 ? -1 : index % 7 === 0 ? 11 : Math.floor(random() * 11)
  const tags = index % 11 === 0 ? ["ok", "too-long"] : index % 13 === 0 ? "not-array" : ["a", "b"].slice(0, index % 3)
  if (index % 17 === 0) return { name: names[2], count, tags }
  if (index % 19 === 0) return { name: names[0], count, tags, extra: true }
  return { name: names[0], count, tags }
}

function outcome(run: () => unknown): { ok: boolean } {
  try {
    run()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state)
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
    return ((state ^ (state >>> 14)) >>> 0) / 0x100000000
  }
}

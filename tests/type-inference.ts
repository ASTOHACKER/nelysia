import { Nelysia, t } from "../packages/core/src/index.ts"
import type { Infer } from "../packages/core/src/index.ts"

type RoutesOf<App> = App extends Nelysia<any, infer Routes, any, any> ? Routes : never
type Assert<T extends true> = T
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value ? true : false

const responseApp = new Nelysia().get("/item", () => ({ id: "item-1" }), {
  response: t.Object({ id: t.String() })
})
type DirectResponse = RoutesOf<typeof responseApp>["GET /item"]["response"]
const directResponse: DirectResponse = { id: "item-1" }
void directResponse
// @ts-expect-error inline response schemas must infer their object shape
const invalidDirectResponse: DirectResponse = { id: 42 }
void invalidDirectResponse

const intersectApp = new Nelysia().post("/combined", ({ body }) => body, {
  body: t.Intersect([t.Object({ id: t.String() }), t.Object({ count: t.Number() })] as const)
})
type IntersectBody = RoutesOf<typeof intersectApp>["POST /combined"]["body"]
const intersectBody: IntersectBody = { id: "item-1", count: 1 }
void intersectBody
// @ts-expect-error intersect schemas must require fields from every branch
const invalidIntersectBody: IntersectBody = { id: "item-1" }
void invalidIntersectBody

const lazyApp = new Nelysia().use(Promise.resolve(new Nelysia().get("/lazy", () => "loaded")))
type LazyRoutes = RoutesOf<typeof lazyApp>
type LazyRouteIsVisible = Assert<HasKey<LazyRoutes, "GET /lazy">>
void (null as unknown as LazyRouteIsVisible)

const mountedApp = new Nelysia().mountLazy("/admin", () => new Nelysia().get("/users", () => "users"))
type MountedRoutes = RoutesOf<typeof mountedApp>
type MountedRouteIsVisible = Assert<HasKey<MountedRoutes, "GET /admin/users">>
void (null as unknown as MountedRouteIsVisible)

const responseAndErrorsApp = new Nelysia().post("/response-and-errors", () => ({ id: "item-1" }), {
  response: t.Object({ id: t.String() }),
  responses: { 400: t.Object({ error: t.String() }) }
})
type ResponseAndErrorsRoutes = RoutesOf<typeof responseAndErrorsApp>
type ResponseAndErrorsContract = ResponseAndErrorsRoutes["POST /response-and-errors"]
const responseAndErrorsBody: ResponseAndErrorsContract["response"] = { id: "item-1" }
void responseAndErrorsBody
const responseAndErrorsStatus: ResponseAndErrorsContract["responses"][400] = { error: "bad request" }
void responseAndErrorsStatus

const constrainedApp = new Nelysia().post("/constraints", ({ body }) => body, {
  body: t.Object({
    count: t.Number({ minimum: 1 }),
    name: t.String({ minLength: 1 })
  })
})
type ConstrainedBody = RoutesOf<typeof constrainedApp>["POST /constraints"]["body"]
const constrainedBody: ConstrainedBody = { count: 1, name: "Ada" }
void constrainedBody

const compositeOptionsApp = new Nelysia().post("/composite-options", ({ body }) => body, {
  body: t.Object({
    items: t.Array(t.Integer({ minimum: 1 }), { minItems: 1 }),
    name: t.String({ format: "email" })
  }, { additionalProperties: false })
})
type CompositeOptionsBody = RoutesOf<typeof compositeOptionsApp>["POST /composite-options"]["body"]
const compositeOptionsBody: CompositeOptionsBody = { items: [1], name: "ada@example.com" }
void compositeOptionsBody

const schemaSurface = t.Object({
  text: t.String(),
  count: t.Number(),
  integer: t.Integer(),
  enabled: t.Boolean(),
  maybe: t.Nullable(t.String()),
  optional: t.Optional(t.String()),
  literal: t.Literal("ready"),
  choice: t.Union([t.String(), t.Number()] as const),
  values: t.Enum(["one", "two"] as const),
  records: t.Record(t.String()),
  when: t.Date(),
  unknown: t.Unknown(),
  anything: t.Any(),
})
type SchemaSurface = Infer<typeof schemaSurface>
const schemaSurfaceValue: SchemaSurface = {
  text: "hello",
  count: 1.5,
  integer: 2,
  enabled: true,
  maybe: null,
  literal: "ready",
  choice: 3,
  values: "one",
  records: { key: "value" },
  when: new Date(),
  unknown: { nested: true },
  anything: Symbol("value"),
}
void schemaSurfaceValue

const tupleSchema = t.Tuple([t.String(), t.Integer()] as const)
type TupleValue = Infer<typeof tupleSchema>
const tupleValue: TupleValue = ["id", 1]
void tupleValue
// @ts-expect-error tuple item order and length must be preserved
const invalidTupleValue: TupleValue = [1, "id"]
void invalidTupleValue

const bigintSchema = t.BigInt({ minimum: 1n })
const bigintValue: Infer<typeof bigintSchema> = 2n
void bigintValue
// @ts-expect-error bigint schemas must not infer number values
const invalidBigintValue: Infer<typeof bigintSchema> = 2
void invalidBigintValue

const transformSource = t.Object({ id: t.String(), name: t.Optional(t.String()) })
const requiredSchema = t.Required(transformSource)
const readonlySchema = t.Readonly(transformSource)
const compositeSchema = t.Composite([t.Object({ id: t.String() }), t.Object({ active: t.Boolean() })] as const)
const templateSchema = t.TemplateLiteral([t.Literal("user-"), t.Integer()] as const)
const requiredValue: Infer<typeof requiredSchema> = { id: "1", name: "Ada" }
const readonlyValue: Infer<typeof readonlySchema> = { id: "1" }
const compositeValue: Infer<typeof compositeSchema> = { id: "1", active: true }
const templateValue: Infer<typeof templateSchema> = "user-42"
void requiredValue
void readonlyValue
void compositeValue
void templateValue
// @ts-expect-error Required must make the optional property required
const invalidRequiredValue: Infer<typeof requiredSchema> = { id: "1" }
void invalidRequiredValue
// @ts-expect-error Composite must require properties from every object branch
const invalidCompositeValue: Infer<typeof compositeSchema> = { id: "1" }
void invalidCompositeValue

async function responseAndErrorsInjectChecks() {
  const result = await responseAndErrorsApp.inject({ method: "POST", path: "/response-and-errors" })
  const success = await result.json()
  type _Success = Assert<typeof success extends { id: string } ? true : false>
  void (null as unknown as _Success)
  const failure = await result.json(400)
  type _Failure = Assert<typeof failure extends { error: string } ? true : false>
  void (null as unknown as _Failure)
  // @ts-expect-error undocumented response status must be rejected
  await result.json(500)
}
void responseAndErrorsInjectChecks

import { Nelysia, t } from "../packages/core/src/index.ts"

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

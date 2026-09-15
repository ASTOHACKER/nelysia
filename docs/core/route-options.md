# Route Options Reference

This is the v1.0.0 route-option contract. ตัวอย่างและคำอธิบายภาษาไทยอยู่ใน
หน้าเดียวกันเพื่อให้อ่านแบบ offline ได้

## English

### Shape

```ts
type RouteOptions<Models extends Record<string, unknown> = {}, MacroNames extends string = never> = {
  summary?: string
  description?: string
  tags?: string[]
  body?: Schema | StandardSchema | keyof Models
  params?: Schema | StandardSchema | keyof Models
  query?: Schema | StandardSchema | keyof Models
  headers?: Schema | StandardSchema | keyof Models
  response?: Schema | StandardSchema | keyof Models | Record<string | number, Schema | StandardSchema | keyof Models>
  responses?: Record<string | number, Schema | StandardSchema | keyof Models>
  auth?: AuthStrategyName | "optional" | boolean | AuthStrategyDescriptor | string
  role?: string | readonly string[]
  permissions?: string | readonly string[]
  rateLimit?: RateLimitRouteOptions | `${number}/${"s" | "m" | "h"}` | false
  cache?: boolean | CacheRouteOptions
  timeout?: number | TimeoutRouteOptions | false
  features?: Record<string, unknown>
} & Partial<Record<MacroNames, boolean>>
```

`Schema` is the built-in schema contract; `StandardSchema` is accepted for
compatible external schemas. `Models` enables a named model instead of an
inline schema. Registered macros add their own typed boolean keys; unknown
macro names are not silently accepted by the type.

### Behavior and inheritance

Application options are inherited by a group, then by a route:
`application → parent group → child group → route`. The closest value wins.
Objects are shallow-merged. Arrays and newly declared permissions replace the
previous value. A feature can be disabled at a nearer level with `false` where
that option supports it (`rateLimit` and `timeout`; `cache: false` disables
cache). A route with no option does not activate a provider.

`auth`, `rateLimit`, `cache`, `timeout`, and custom `features` require the
corresponding provider/plugin to be registered. Missing providers fail during
registration with the route and feature name; they do not fall back silently.

### Input schemas and metadata

`params`, `query`, `body`, and `headers` validate the matching request data.
`response` may be a single contract or a status map; `responses` adds status
contracts and is normalized with the existing response behavior. Validation
failures use the framework's `400` error path. No new automatic query/body
coercion is implied.

`summary`, `description`, and `tags` are descriptive metadata used by OpenAPI
and tooling. They do not add runtime work to a route that has no active feature.

### Example

```ts
const app = new Nelysia({ routeOptions: { timeout: 5_000 } })
  .group("/api", (api) => api
    .guard({ auth: "jwt", cache: false })
    .post("/orders/:id", ({ params, body }) => ({ id: params.id, body }), {
      params: t.Object({ id: t.String() }),
      body: t.Object({ total: t.Number() }),
      response: { 201: t.Object({ id: t.String(), body: t.Unknown() }), 400: t.String() },
      role: ["user", "admin"],
      permissions: ["orders:write"],
      summary: "Create an order"
    }))
```

Compiler-supported schemas can use compiled/specialized lanes. Transforms,
custom runtime behavior, native `Response`, streams and custom serializers
fall back to generic execution; the manifest records the reason.

## ภาษาไทย

### รูปแบบและชนิดข้อมูล

Route options ของ v1.0.0 มี `params`, `query`, `body`, `headers`, `response`,
`responses`, metadata (`summary`, `description`, `tags`), auth/authorization,
`rateLimit`, `cache`, `timeout`, `features` และ macro key ที่ plugin ลงทะเบียน
ไว้จริงเท่านั้น ตาม shape ในตัวอย่างภาษาอังกฤษด้านบน

`Schema` คือ schema ในตัว และ `StandardSchema` คือ schema ภายนอกที่เข้ากันได้
การอ้างชื่อ model ใช้ `keyof Models` เพื่อคง type inference และ macro ที่ยังไม่
ลงทะเบียนจะถูกตรวจจับโดย TypeScript แทนการยอมรับด้วย index signature กว้าง

### ค่าเริ่มต้นและการสืบทอด

ลำดับคือ `application → parent group → child group → route` โดยค่าที่ใกล้ route
ที่สุดชนะ object จะ merge แบบ shallow ส่วน array และ permissions ที่ประกาศใหม่
จะแทนค่าก่อนหน้า ใช้ `false` ปิด feature ที่รองรับ เช่น `rateLimit: false`,
`timeout: false` และ `cache: false` หากไม่มี option ก็ไม่เปิด provider และไม่
เพิ่ม parser/guard/timer/allocation บน hot path

หากใช้ auth, rate limit, cache, timeout หรือ `features` ต้องลงทะเบียน provider
ก่อน มิฉะนั้น registration จะ fail พร้อมชื่อ route และ feature ไม่ fallback เงียบ

### Validation และผลต่อ performance

schema ของ params/query/body/headers ตรวจข้อมูลส่วนนั้นๆ และ failure ใช้ status
`400` ตาม generic path โดยไม่มีการเพิ่ม query/body coercion อัตโนมัติ
`summary`, `description`, `tags` เป็น metadata สำหรับ OpenAPI/tooling

schema subset ที่ compiler พิสูจน์ได้อาจเข้า compiled/specialized lane แต่
transform, custom behavior, native `Response`, stream และ custom serializer จะ
fallback เป็น generic พร้อมเหตุผลใน manifest

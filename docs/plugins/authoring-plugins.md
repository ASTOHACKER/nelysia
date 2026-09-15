# Authoring Typed Plugins

## English

### Contract and factory

```ts
import type { NelysiaPlugin } from "@narudom96/nelysia"

type MetricsContext = { metrics: { count(name: string): void } }

export const metrics = (): NelysiaPlugin<MetricsContext> => (app) =>
  app.decorate("metrics", { count: (name) => console.log(name) })
```

`NelysiaPlugin<Added>` is a generic app transformer. Return the app after
registering routes, hooks, state or decorations so host generics remain intact.
`decorate()` adds application capabilities to context; `state()` is available
through `context.store` and legacy aliases remain for compatibility.

### Composition and lifecycle

Use `app.use(plugin)`, another Nelysia instance, or `Promise<plugin/app>` for
composition. Use `.mount(prefix, appOrHandler)` for a prefix, `.group()` for a
scoped route subtree, and `.lazy()`/`.mountLazy()` for deferred modules.

Hooks can be `local` (this module's routes), `scoped` (the subtree), or `global`
(the application). Route guards run after matching and before parsing where the
feature supports it. A provider must be registered before route metadata uses
its feature; registration fails with the route and feature name if it is absent.

### Production rules and tests

Make registration idempotent, avoid wrapping handlers repeatedly, clean up
resources on failure, and make optional features opt-in so unused routes have no
guard/parser/timer/allocation overhead. Redact authorization, cookies and
secrets in logs. Validate options at registration and return stable public errors.

```ts
const app = new Nelysia().use(metrics())
const response = await app.injectTyped({ method: "GET", path: "/health" })
```

Test a plugin with `inject()` for an untyped request or `injectTyped()` for the
route map's compile-time inputs and outputs. Also test duplicate registration,
scope isolation, async rejection and cleanup.

## ภาษาไทย

`NelysiaPlugin<Added>` คือ function ที่รับ app แล้วคืน app โดย generic `Added`
ใช้บอก field ที่ plugin เพิ่มใน context ควร register route, hook, state หรือ
decoration แล้ว return app เพื่อรักษา type inference ของ host app

ใช้ `use(plugin)`, Nelysia instance หรือ `Promise<plugin/app)` ได้ ใช้ `mount()`
เมื่อต้องการ prefix, `group()` เมื่อต้องการ subtree และ `.lazy()` /
`.mountLazy()` เมื่อต้องการโหลด module ช้าลง

กำหนด scope ของ hook ให้ตรงเจตนา: `local` เฉพาะ route ใน module, `scoped` ครอบ
subtree และ `global` ครอบทั้ง application provider ต้องลงทะเบียนก่อน metadata
ของ route ไม่เช่นนั้น fail ตอน registration พร้อมชื่อ feature

plugin production ควร idempotent, ไม่ wrap handler ซ้ำ, cleanup เมื่อ init fail,
redact authorization/cookie/secret และไม่สร้าง guard/parser/timer เมื่อ feature
ไม่ได้เปิดใช้ ทดสอบด้วย `inject()` และ `injectTyped()` รวมถึง duplicate registration,
scope leakage, async rejection และ cleanup

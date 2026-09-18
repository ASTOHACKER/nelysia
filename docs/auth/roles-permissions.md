# Roles and Permissions

## English

```ts
import { roles, requireRole } from "@narudom96/nelysia/roles"

const app = new Nelysia()
  .use(roles({
    resolveRoles: ({ auth }) => auth?.roles ?? [],
    permissions: { "orders:write": ["admin", "editor"] }
  }))
  .get("/admin", ({ permissions }) => permissions.roles, { role: "admin" })
  .post("/orders", ({ permissions }) => permissions.require("editor"), {
    permissions: "orders:write"
  })
  .guard({ beforeHandle: requireRole("admin", "support") }, (staff) =>
    staff.get("/staff", () => "ok"))
```

`permissions.has(role)` checks one role. `permissions.can(permission)` checks
whether at least one current role is allowed by the configured permission map.
`permissions.require(...roles)` and `requireRole(...roles)` use OR semantics:
one required role is enough. Route metadata `permissions` is the required
permission set; when multiple permissions are declared, all must pass.

Authorization failures return `403`. Unknown permissions deny by default. The
roles plugin resolves roles per request and adds no work when it is not used.

`{ role }` route metadata composes with authentication: pair it with an `auth`
strategy (for example `{ auth: "jwt", role: "admin" }`) so roles resolve from
the authenticated caller. A standalone `{ role: "admin" }` without `auth`
returns `401` even when the role resolves — verified with header-resolved
roles. To guard a route without an auth strategy, call
`permissions.require(...roles)` inside the handler instead.

## ภาษาไทย

plugin `roles()` ใช้ `resolveRoles(context)` เพื่อคืน role ของ request และรับ map
`permissions` ที่กำหนดว่า permission ใดให้ role ใด `permissions.has(role)` ตรวจ
role เดียว, `can(permission)` ตรวจว่ามี role ใด role หนึ่งได้รับ permission และ
`require(...roles)` / `requireRole(...roles)` ใช้ OR คือผ่านอย่างน้อยหนึ่ง role

ถ้าประกาศ permissions หลายค่าใน route ต้องผ่านทุกค่าตาม AND semantics; permission
ที่ไม่รู้จัก deny โดย default และ failure ด้าน authorization คืน `403` ส่วนการไม่มี
credential หรือ authentication ไม่ผ่านเป็น `401`

`{ role }` ใน route metadata ออกแบบมาให้ใช้คู่กับ authentication เช่น
`{ auth: "jwt", role: "admin" }` เพื่อให้ role มาจากผู้เรียกที่ยืนยันตัวตนแล้ว
ถ้าใช้ `{ role: "admin" }` เดี่ยว ๆ โดยไม่มี `auth` จะตอบ `401` แม้ role จะ
resolve ได้ครบ (เทสจริงยืนยันด้วย header-resolved roles) ถ้าอยากกัน route
โดยไม่มี auth strategy ให้เรียก `permissions.require(...roles)` ใน handler แทน

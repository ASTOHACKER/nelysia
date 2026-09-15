# Cookie Sessions

## English

```ts
import { session } from "@narudom96/nelysia/session"

const app = new Nelysia()
  .use(session<{ userId: string }>({ ttlSeconds: 3600, cookieName: "sid" }))
  .get("/login", async ({ session }) => {
    const id = await session.set({ userId: "u_1" })
    return { id }
  })
  .get("/me", ({ session, auth }) => ({ id: session.id, auth }), { auth: "session" })
```

`SessionStore<Value>` implements `get(id)`, `set(id, value, ttlMs?)`, and
`delete(id)`. `memorySessionStore()` is the default. `SessionApi` provides
`id`, `get()`, `set(value)`, and `destroy()`.

Defaults are cookie `nelysia_session`, TTL `86400` seconds, HttpOnly/Lax/path `/`.
The store is the authority for expiration and values; use a durable store for
multiple processes. Missing/expired required sessions return `401`; optional
session auth leaves `auth` undefined.

## ภาษาไทย

`session()` เพิ่ม `context.session` และลงทะเบียน strategy ชื่อ `session` โดย
default ใช้ memory store, cookie ชื่อ `nelysia_session`, TTL 86400 วินาที และ
cookie เป็น HttpOnly, SameSite Lax, path `/`

`SessionStore` ต้องมี `get`, `set`, `delete`; `SessionApi` มี `id`, `get()`,
`set(value)`, `destroy()` การใช้หลาย process ควรเปลี่ยนเป็น durable/custom store

ถ้า session หายหรือหมดอายุบน route ที่บังคับ จะได้ `401`; optional auth จะปล่อยให้
`auth` เป็น `undefined` และยังทำงานต่อ

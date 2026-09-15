# Better Auth Integration

## English

Nelysia's Better Auth integration is deliberately small. It accepts a handler
and mounts it as a catch-all route; it does not create a second Better Auth
implementation.

```ts
import { betterAuthPlugin } from "@narudom96/nelysia/better-auth"

const app = new Nelysia().use(betterAuthPlugin({
  handler: (request) => betterAuth.handler(request),
  getSession: (request) => betterAuth.api.getSession({ headers: request.headers })
}, "/api/auth"))
```

`handler(request)` receives the method, URL, headers and body forwarded by the
plugin. The default prefix is `/api/auth`. If `getSession` is supplied, the
plugin registers the `session` auth provider so `auth: "session"` can protect a
route. Without it, the integration is handler-only; do not claim route-level
session authentication.

## ภาษาไทย

integration นี้มีหน้าที่รับ `handler(request)` แล้ว mount เป็น catch-all route
เท่านั้น ไม่ได้สร้างระบบ Better Auth ซ้ำเอง ค่า prefix เริ่มต้นคือ `/api/auth`
และสามารถเปลี่ยนเป็น prefix อื่นได้

หากส่ง `getSession(request)` มาด้วย plugin จะลงทะเบียน `session` provider ทำให้
route ที่ใช้ `auth: "session"` ตรวจ session ได้ ถ้าไม่ส่ง `getSession` จะเป็น
handler-only integration และห้ามอ้างว่าใช้ route-level session auth ได้

```ts
const auth = betterAuthPlugin({
  handler: (request) => authHandler(request),
  getSession: (request) => resolveSession(request)
})
const app = new Nelysia().use(auth)
```

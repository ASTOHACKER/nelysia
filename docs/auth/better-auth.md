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

Two call shapes exist — pick the right one:

```ts
// Handler-only: mounts every Better Auth endpoint, no route-level session auth.
app.use(betterAuthPlugin(auth))

// Full: catch-all PLUS the "session" strategy for { auth: "session" } routes.
app.use(betterAuthPlugin({
  handler: (request) => auth.handler(request),
  getSession: (request) => auth.api.getSession({ headers: request.headers })
}))
```

A bare Better Auth instance has `.handler()` but no `.getSession(request)`,
so the first form never registers the `session` strategy. The guard resolves
the session with a synthetic `GET` request carrying only the headers (no
body); a missing or expired session returns `401` with body
`{ error: "Unauthorized" }`, and a valid one is exposed as `context.auth`.

## ภาษาไทย

integration นี้มีหน้าที่รับ `handler(request)` แล้ว mount เป็น catch-all route
เท่านั้น ไม่ได้สร้างระบบ Better Auth ซ้ำเอง ค่า prefix เริ่มต้นคือ `/api/auth`
และสามารถเปลี่ยนเป็น prefix อื่นได้

หากส่ง `getSession(request)` มาด้วย plugin จะลงทะเบียน `session` provider ทำให้
route ที่ใช้ `auth: "session"` ตรวจ session ได้ ถ้าไม่ส่ง `getSession` จะเป็น
handler-only integration และห้ามอ้างว่าใช้ route-level session auth ได้

มีสองท่าเรียก — เลือกให้ถูกงาน:

```ts
// Handler-only: mount ทุก endpoint ของ Better Auth แต่ไม่มี session guard
app.use(betterAuthPlugin(auth))

// เต็ม: catch-all บวก strategy "session" สำหรับ route { auth: "session" }
app.use(betterAuthPlugin({
  handler: (request) => auth.handler(request),
  getSession: (request) => auth.api.getSession({ headers: request.headers })
}))
```

instance ของ Better Auth มี `.handler()` แต่ไม่มี `.getSession(request)` ดังนั้น
ท่าแรกจะไม่ลงทะเบียน strategy `session` ให้ guard resolve session ด้วย request
`GET` จำลองที่มีแค่ headers (ไม่มี body) ถ้า session หายหรือหมดอายุจะตอบ `401`
พร้อม body `{ error: "Unauthorized" }` ถ้าผ่านจะได้ค่าอยู่ใน `context.auth`

```ts
const auth = betterAuthPlugin({
  handler: (request) => authHandler(request),
  getSession: (request) => resolveSession(request)
})
const app = new Nelysia().use(auth)
```

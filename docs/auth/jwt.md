# JWT Authentication

## English

### Setup and typed claims

```ts
import { jwt } from "@narudom96/nelysia/jwt"

type Claims = { sub: string; role: "user" | "admin"; exp?: number }

const app = new Nelysia()
  .use(jwt<Claims>({ secret: process.env.JWT_SECRET! , issuer: "nelysia" }))
  .get("/me", ({ auth, jwt }) => auth, { auth: "jwt" })
```

The plugin is a `JwtPlugin<Claims>` (the runtime instance is exposed as
`JwtPluginInstance<Claims>` through `ctx.jwt`). `jwt.sign()` reuses the imported
`CryptoKey`; `jwt.verify()` returns `{ valid, payload?, reason? }`.

Only `HS256` is accepted. The header, three token segments, canonical base64url,
JSON, signature and claims are checked strictly. `exp`, `nbf`, `issuer`, and
`audience` are enforced when configured; without issuer/audience options those
claims are not required. `reason` remains `invalid`, `expired`, or `malformed`.

### Public and protected routes

For a public route, the JWT guard is not run: Nelysia does not read
`Authorization`, verify a token, or allocate an auth payload. On a protected
route, the guard runs after route matching and before body parsing/validation.
Missing or invalid credentials return `401`; invalid algorithm, `none`, malformed
segments and cross-request state cannot bypass the guard.

```ts
const token = await app.jwt.sign({ sub: "u_1", role: "user" })
const result = await app.jwt.verify(token)
```

## ภาษาไทย

ติดตั้งด้วย `jwt<Claims>()` แล้วกำหนด `secret` และอาจกำหนด `issuer`, `audience`,
`expiresIn`, `name` หรือ `headerName` ได้ `ctx.jwt` มี type เป็น
`JwtPluginInstance<Claims>` และ `ctx.auth` เป็น `Claims` ใน protected route

รองรับเฉพาะ HS256, ตรวจ header/segment/base64url/JSON/signature อย่าง strict และ
ตรวจ `exp`, `nbf`, issuer, audience เมื่อกำหนด option ไว้ ถ้าไม่กำหนด issuer หรือ
audience จะไม่บังคับ claim นั้น เหตุผลของ verify ยังคงมี `invalid`, `expired`,
`malformed`

public route ไม่อ่าน `Authorization`, ไม่ verify token และไม่สร้าง auth payload
ส่วน protected route ตรวจหลัง match แต่ก่อน parse body/validation credential ที่
ขาดหรือผิดคืน `401` และ algorithm `none` หรือ token ที่ malformed จะ bypass ไม่ได้

```ts
app.get("/admin", ({ auth }) => ({ subject: auth.sub }), {
  auth: { strategy: "jwt", role: "admin" }
})
```

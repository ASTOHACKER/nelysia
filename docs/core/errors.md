# Errors and Responses

## English

### Constructing an HTTP error

```ts
import { error, HttpError } from "@narudom96/nelysia"

app.get("/account", ({ auth }) => {
  if (!auth) throw error(401, { error: "Unauthorized" })
  if (!auth.active) return error(403, { error: "Forbidden" })
  return { ok: true }
})
```

`error(status, body)` returns an `HttpError`. `HttpError` also accepts
`new HttpError(status, message, body)`. Returning or throwing it enters the
same error response path; use throwing when a helper must stop the current
handler. The body is preserved as the error payload.

Framework-raised failures (schema validation, malformed JSON, body limits)
are constructed as `HttpError(status, message)` with no body attached, so
`err.body` is `undefined` inside `onError` — build the public error shape
from `err.status` and `err.message` yourself (see the status table below).

### Status behavior

| Status | Typical source |
| --- | --- |
| `400` | params/query/body/headers validation failure |
| `401` | missing or invalid required credentials |
| `403` | authenticated caller lacks role/permission |
| `404` | no route, or custom `notFound` response |
| `405` | path exists but method is not allowed |
| `500` | unhandled handler/plugin error |
| `504` | timeout feature reaches its configured deadline |

An explicit `.options()` route runs before automatic `204 + Allow`. `Response`
and `ReadableStream` values pass through without being wrapped, so status,
headers and streaming semantics remain intact. Use `context.set.status` and
`context.set.headers` for response metadata when returning a normal value.

### Error lifecycle and safe payloads

`onError` can observe or map failures according to its lifecycle scope. Keep
production payloads stable and non-sensitive: do not return secrets, tokens or
stack traces. Log the original error in a protected sink and return a public
error code/message.

`inject()` exposes the response status, headers and body. Typed inject/client
contracts infer declared success and error response shapes; runtime errors that
are not declared still use the normal status path.

## ภาษาไทย

### สร้างและส่ง error

`error(status, body)` คืน `HttpError` และสามารถ `throw` หรือ `return` ได้ทั้งคู่
เช่น `throw error(401, { error: "Unauthorized" })` หรือ `return error(403,
{ error: "Forbidden" })` โดย body จะถูกใช้เป็น payload ของ response เดียวกัน
`HttpError` รับ `(status, message, body?)` โดยตรงได้เช่นกัน

error ที่ framework โยนเอง (validation ตก, JSON ผิดรูป, body เกิน limit) สร้าง
แบบ `HttpError(status, message)` โดยไม่มี body — ใน `onError` จะเห็น `err.body`
เป็น `undefined` ต้องปั้น shape จาก `err.status`/`err.message` เอง

`400` มาจาก validation ของ request, `401` คือยังไม่มีหรือ credential ไม่ถูกต้อง,
`403` คือผ่าน authentication แล้วแต่ role/permission ไม่ผ่าน, `404` คือไม่พบ
route, `405` คือ method ไม่อนุญาต, `500` คือ error ที่ไม่ถูกจัดการ และ `504` คือ
timeout ถึง deadline

`.options()` ที่ประกาศเองทำงานก่อน automatic `204 + Allow`; `Response` และ
`ReadableStream` ถูกส่งต่อโดยไม่ห่อใหม่ จึงรักษา status/header/stream ได้
ส่วน response ปกติใช้ `context.set.status` และ `context.set.headers` ได้

### `onError` และความปลอดภัย

`onError` สังเกตหรือแปลง failure ได้ตาม scope ของ lifecycle ควรส่งเฉพาะ
payload ที่ปลอดภัยต่อผู้ใช้จริง ไม่เปิดเผย secret, token หรือ stack trace ให้
เก็บ error ต้นฉบับใน sink ที่จำกัดสิทธิ์แทน

`inject()` อ่าน status, headers และ body ได้ ส่วน typed inject/client จะ infer
success/error ที่ประกาศไว้ หากเป็น error ที่ไม่ได้ประกาศจะใช้ status path ปกติ

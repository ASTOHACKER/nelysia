# Authentication and Authorization Overview

## English

Authentication answers “who is this?” Authorization answers “may this caller
perform this action?”. Keep them separate in route metadata and in your handler.

| Need | Choose | Important contract |
| --- | --- | --- |
| Stateless bearer token | [JWT](./jwt.md) | strict HS256, typed claims |
| First-party cookie sessions | [Session](./session.md) | cookie + `SessionStore` |
| Better Auth integration | [Better Auth](./better-auth.md) | catch-all handler; route auth needs `getSession` |
| Roles/permissions | [Roles](./roles-permissions.md) | authorization after authentication |

Required credentials that are missing or invalid return `401`. A valid caller
without the required role/permission returns `403`. `auth: "optional"` allows
anonymous access only when exactly one provider is active; a supplied but invalid
credential is still rejected, not converted to anonymous.

Providers are registered by plugins. A named strategy without a provider fails
at route registration and identifies the strategy. The core does not import
Better Auth or a session store, so routes that do not declare auth add no auth
guard or credential work.

```ts
app.get("/public", () => "ok")
app.get("/me", ({ auth }) => auth, { auth: "jwt" })
app.get("/preview", ({ auth }) => auth ?? { anonymous: true }, { auth: "optional" })
```

## ภาษาไทย

Authentication ตอบว่า “ผู้เรียกคือใคร” ส่วน Authorization ตอบว่า “ผู้เรียกทำ
สิ่งนี้ได้หรือไม่” จึงควรแยกสองเรื่องนี้ออกจากกัน

เลือก JWT เมื่อใช้ bearer token แบบ stateless, Session เมื่อใช้ cookie/store ของ
ระบบเอง และ Better Auth เมื่อต้องการ catch-all handler ของ Better Auth หากจะใช้
`auth: "session"` กับ route ต้องมี session resolver/provider จริงก่อน ไม่ควร
อ้างว่า handler-only integration ให้ route-level auth ได้เอง

credential ที่ขาดหรือไม่ถูกต้องคือ `401`; ผู้ใช้ที่ยืนยันตัวตนแล้วแต่ role หรือ
permission ไม่ผ่านคือ `403`; `auth: "optional"` ใช้ได้เมื่อมี provider ที่ active
เพียงหนึ่งตัว และ credential ที่ส่งมาแต่ผิดยังต้อง reject

plugin เป็นผู้ลงทะเบียน provider ถ้า route ระบุ strategy ที่ยังไม่มี จะ fail ตอน
registration พร้อมชื่อ strategy ส่วน public route ที่ไม่ประกาศ auth จะไม่อ่าน
credential และไม่มี auth overhead เพิ่ม

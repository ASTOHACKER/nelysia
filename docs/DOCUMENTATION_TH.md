# คู่มือการใช้งานอย่างละเอียด Nelysia (ภาษาไทย)

> **เวอร์ชัน:** 0.1.4 (Latest Release)  
> **รันไทม์ที่รองรับ:** Bun 1.4+, Node.js 22+, และ Web Fetch Standard (Vercel, Cloudflare, Deno)  
> **ภาษา:** TypeScript / JavaScript (ESM)

---

## สารบัญ

1. [บทนำและสถาปัตยกรรม (Introduction & Architecture)](#1-บทนำและสถาปัตยกรรม)
2. [ข้อกำหนดและการติดตั้ง (Installation & Prerequisites)](#2-ข้อกำหนดและการติดตั้ง)
3. [เริ่มต้นใช้งานอย่างรวดเร็ว (Quick Start)](#3-เริ่มต้นใช้งานอย่างรวดเร็ว)
4. [แกนหลักของแอปพลิเคชัน (`Nelysia`)](#4-แกนหลักของแอปพลิเคชัน-nelysia)
   - [การตั้งค่า Option ต่างๆ](#การตั้งค่า-option-ต่างๆ)
   - [เมธอดสำหรับ Routing](#เมธอดสำหรับ-routing)
   - [การจัดกลุ่ม Route ด้วย `group`](#การจัดกลุ่ม-route-ด้วย-group)
   - [การปรับแต่งหน้า 404 ด้วย `notFound`](#การปรับแต่งหน้า-404-ด้วย-notfound)
   - [การรวม Sub-App ด้วย `mount`](#การรวม-sub-app-ด้วย-mount)
   - [การเปิดเซิร์ฟเวอร์ด้วย `listen`](#การเปิดเซิร์ฟเวอร์ด้วย-listen)
   - [กลไก Plugin (`use`) และขอบเขต Lifecycle](#กลไก-plugin-use-และขอบเขต-lifecycle)
5. [Request Context (`Context`)](#5-request-context-context)
   - [ข้อมูลใน Context](#ข้อมูลใน-context)
   - [การอ่าน Query ด้วย Proxy Destructuring](#การอ่าน-query-ด้วย-proxy-destructuring)
   - [การตั้งค่า Status และ Headers ด้วย `context.set`](#การตั้งค่า-status-และ-headers-ด้วย-contextset)
   - [การแชร์ข้อมูลภายใน Request ด้วย `context.store`](#การแชร์ข้อมูลภายใน-request-ด้วย-contextstore)
   - [ฟังก์ชันอำนวยความสะดวกสำหรับ Response Shorthands](#ฟังก์ชันอำนวยความสะดวกสำหรับ-response-shorthands)
   - [การจัดการ Cookies และ `deleteCookie`](#การจัดการ-cookies)
   - [การส่ง Response กลับในรูปแบบต่างๆ](#การส่ง-response-กลับในรูปแบบต่างๆ)
6. [การตรวจสอบข้อมูลและ Schema Validation](#6-การตรวจสอบข้อมูลและ-schema-validation)
   - [เครื่องมือสร้าง Schema ในตัว (`t`)](#เครื่องมือสร้าง-schema-ในตัว-t)
   - [การเชื่อมต่อกับ Standard Schema (Zod, Valibot, ArkType)](#การเชื่อมต่อกับ-standard-schema-zod-valibot-arktype)
   - [จุดที่สามารถ Validate ได้ทั้ง 5 จุด](#จุดที่สามารถ-validate-ได้ทั้ง-5-จุด)
7. [Lifecycle Hooks และการดักจับข้อผิดพลาด (Error Handling)](#7-lifecycle-hooks-และการดักจับข้อผิดพลาด)
   - [`onBeforeHandle`](#onbeforehandle)
   - [`onAfterHandle`](#onafterhandle)
   - [`onError` และ `HttpError`](#onerror-และ-httperror)
   - [ลำดับการทำงานของ Request (Execution Flow)](#ลำดับการทำงานของ-request-execution-flow)
   - [การปิดเซิร์ฟเวอร์อย่างปลอดภัย (`gracefulShutdown`)](#การปิดเซิร์ฟเวอร์อย่างปลอดภัย-gracefulshutdown)
8. [การใช้งาน WebSockets](#8-การใช้งาน-websockets)
9. [ระบบปลั๊กอิน (Plugins Ecosystem)](#9-ระบบปลั๊กอิน-plugins-ecosystem)
   - [ระบบความปลอดภัย CORS (`cors`)](#ระบบความปลอดภัย-cors-cors)
   - [HTTP Security Headers (`securityHeaders`)](#http-security-headers-securityheaders)
   - [การให้บริการโฟลเดอร์ไฟล์ Static (`staticDirectory`)](#การให้บริการโฟลเดอร์ไฟล์-static-staticdirectory)
   - [การจำกัดจำนวน Request (`rateLimit`)](#การจำกัดจำนวน-request-ratelimit)
   - [การให้บริการไฟล์ Static เดี่ยว (`staticFile`)](#การให้บริการไฟล์-static-staticfiles)
   - [การบีบอัดข้อมูล Gzip (`compression`)](#การบีบอัดข้อมูล-gzip-compression)
10. [OpenAPI 3.1 และหน้าเอกสาร Redoc / Swagger UI](#10-openapi-31-และหน้าเอกสาร-redoc--swagger-ui)
    - [สร้างเอกสาร OpenAPI อัตโนมัติและ Route Metadata](#สร้างเอกสาร-openapi-อัตโนมัติและ-route-metadata)
    - [เปิดหน้าเว็บ Redoc UI (`openapiUi`)](#เปิดหน้าเว็บ-redoc-ui-openapiui)
    - [เปิดหน้าเว็บ Swagger UI (`swaggerUi`)](#เปิดหน้าเว็บ-swagger-ui-swaggerui)
    - [สร้าง TypeScript Interface สำหรับ Client](#สร้าง-typescript-interface-สำหรับ-client)
11. [ระบบ Observability & OpenTelemetry Tracing](#11-ระบบ-observability--opentelemetry-tracing)
12. [การเชื่อมต่อกับ GraphQL](#12-การเชื่อมต่อกับ-graphql)
13. [การเชื่อมต่อฐานข้อมูล (Drizzle & Prisma)](#13-การเชื่อมต่อฐานข้อมูล-drizzle--prisma)
14. [การยืนยันตัวตนด้วย Better Auth](#14-การยืนยันตัวตนด้วย-better-auth)
15. [การเชื่อมต่อ AI SDK](#15-การเชื่อมต่อ-ai-sdk)
16. [Nelysia Client SDK (`@nelysia/client`)](#16-nelysia-client-sdk-nelysiaclient)
17. [ระบบคอมไพเลอร์และเครื่องมือ CLI (`nelysia`)](#17-ระบบคอมไพเลอร์และเครื่องมือ-cli-nelysia)
    - [การจัดหมวดหมู่ Route (Compiled vs Specialized vs Generic)](#การจัดหมวดหมู่-route)
    - [Standalone Generation](#standalone-generation-เส้นทางที่รองรับ)
    - [คำสั่ง CLI (`inspect`, `build`)](#คำสั่ง-cli)
    - [Build Manifest และ Cache](#build-manifest-และ-cache)
18. [รันไทม์ที่รองรับและ Adapter](#18-รันไทม์ที่รองรับและ-adapter)
19. [การเชื่อมต่อกับ Full-Stack Web Frameworks](#19-การเชื่อมต่อกับ-full-stack-web-frameworks)
    - [Next.js App Router](#nextjs-app-router)
    - [Nuxt](#nuxt)
    - [SvelteKit](#sveltekit)
    - [Astro](#astro)
    - [TanStack Start](#tanstack-start)
20. [การทดสอบประสิทธิภาพและ Soak Testing (Benchmark)](#20-การทดสอบประสิทธิภาพและ-soak-testing)
21. [คู่มือการย้ายโค้ด (Migration Guide)](#21-คู่มือการย้ายโค้ด-migration-guide)
22. [คู่มือปรับประสิทธิภาพ (Performance Tuning)](#22-คู่มือปรับประสิทธิภาพ-performance-tuning)
23. [เช็กลิสต์ Deploy ขึ้น Production](#23-เช็กลิสต์-deploy-ขึ้น-production)
24. [แก้ปัญหาและ FAQ (Troubleshooting)](#24-แก้ปัญหาและ-faq-troubleshooting)

---

## 1. บทนำและสถาปัตยกรรม

**Nelysia** คือ TypeScript Backend Framework รุ่นใหม่ที่ออกแบบภายใต้แนวคิด **Compiler-First** สำหรับรันไทม์ยุคใหม่อย่าง Bun และ Node.js (รวมถึง Cloudflare Workers, Vercel Edge, และ Deno) โดยมีจุดเด่นคือ:

1. **Compiler-First Specialization**: Nelysia วิเคราะห์ Route กราฟล่วงหน้าตั้งแต่ตอนคอมไพล์ เส้นทางใดที่เป็นค่าคงที่ (Static) จะถูกคอมไพล์ให้ตอบสนองทันทีโดยไม่ต้องสร้าง Context Object ใหม่ (`compiled`), เส้นทางที่ต้องการแค่ Parameter จะตัดขั้นตอนอ่าน Cookie/Query ออก (`specialized`), และเส้นทางที่มี Middleware ซับซ้อนจะรันผ่าน Generic Pipeline ตามปกติ (`generic`)
2. **Deterministic Route Resolution**: การค้นหา Route แบบ Static ใช้ Hash Map ซึ่งทำงานได้ที่ความเร็ว $O(1)$ ส่วน Dynamic Parameter ถูก Match อย่างแม่นยำ พร้อมระบบตอบกลับ `405 Method Not Allowed` และ `Allow Header` อัตโนมัติเมื่อใช้ Method ผิด ตลอดจนการรองรับ `OPTIONS` และ `HEAD` ในตัว
3. **Web Standards Compatibility**: อิงตามมาตรฐานสากล เช่น `Request`, `Response`, `Headers`, และ `ReadableStream` ทำให้ทำงานได้ข้ามระบบอย่างสมบูรณ์แบบ

---

## 2. ข้อกำหนดและการติดตั้ง

### ข้อกำหนดของระบบ
- **Node.js**: เวอร์ชัน `v22.0.0` ขึ้นไป (รองรับการตัด type แบบ native ผ่าน `--experimental-strip-types`)
- **Bun**: เวอร์ชัน `v1.4.0` ขึ้นไป (สำหรับผู้ที่ต้องการประสิทธิภาพระดับสูงสุด)
- **TypeScript**: `v5.0+`

### การเรียกใช้ Packages (หลัง Build แพ็กเกจ)

ซอร์สโค้ดอยู่ใน `packages/*/src/*.ts` เมื่อสั่ง `npm run package:build` จะได้ไฟล์ JavaScript พร้อม Type Declaration ใน `dist-package/` และ `exports` ใน `package.json` จะชี้ไปที่ไฟล์ที่ build แล้ว:

```json
{
  "exports": {
    ".": "./dist-package/packages/core/src/index.js",
    "./plugins": "./dist-package/packages/plugins/src/index.js",
    "./observability": "./dist-package/packages/observability/src/index.js",
    "./runtime-fetch": "./dist-package/packages/runtime-fetch/src/server.js",
    "./graphql": "./dist-package/packages/integrations-graphql/src/index.js",
    "./drizzle": "./dist-package/packages/integrations-drizzle/src/index.js",
    "./prisma": "./dist-package/packages/integrations-prisma/src/index.js",
    "./better-auth": "./dist-package/packages/integrations-better-auth/src/index.js",
    "./runtime-vercel": "./dist-package/packages/runtime-vercel/src/index.js",
    "./runtime-cloudflare": "./dist-package/packages/runtime-cloudflare/src/index.js",
    "./compiler": "./dist-package/packages/compiler/src/index.js",
    "./openapi": "./dist-package/packages/openapi/src/index.js",
    "./client": "./dist-package/packages/client/src/index.js"
  }
}
```

> ระหว่างพัฒนาใน monorepo นี้ให้ import จาก path ต้นฉบับ เช่น `../../packages/core/src/index.ts` โดยตรง

---

## 3. เริ่มต้นใช้งานอย่างรวดเร็ว

### สร้างไฟล์ `src/app.ts`

> **คำแนะนำ:** ควร `export const app` เสมอ เพื่อให้ตัว CLI และคอมไพเลอร์สามารถนำแอปไปวิเคราะห์ Route หรือ Build เป็น Bundle ได้โดยไม่เริ่มรัน Port ค้างไว้

```ts
import { Nelysia } from "@narudom96/nelysia"

export const app = new Nelysia()
  .get("/", ({ html }) => html("<h1>สวัสดีจาก Nelysia v0.1.4!</h1>"))
  .get("/users/:id", ({ params, query }) => ({
    id: params.id,
    filter: query.filter ?? "default",
    timestamp: Date.now()
  }))

// สั่งเปิดเซิร์ฟเวอร์พร้อม Callback แสดง URL
if (import.meta.main || process.env.NODE_ENV !== "test") {
  app.listen(3000, ({ port, url }) => {
    console.log(`🚀 Nelysia กำลังทำงานที่ ${url} (port ${port})`)
  })
}
```

### สั่งรันแอปพลิเคชัน

```bash
# รันด้วย Node.js 22+
node --experimental-strip-types src/app.ts

# หรือรันด้วย Bun
bun run src/app.ts
```

### ทดสอบการเรียกใช้งาน

```bash
curl http://localhost:3000/
# ผลลัพธ์: <h1>สวัสดีจาก Nelysia v0.1.4!</h1>

curl "http://localhost:3000/users/42?filter=active"
# ผลลัพธ์: {"id":"42","filter":"active","timestamp":1726180000000}
```

---

## 4. แกนหลักของแอปพลิเคชัน (`Nelysia`)

### การตั้งค่า Option ต่างๆ

คุณสามารถส่งค่าคอนฟิกให้กับ Constructor ได้ดังนี้:

```ts
import { Nelysia } from "@narudom96/nelysia"

const app = new Nelysia({
  // จำกัดขนาด Body สูงสุดเป็นไบต์ (ค่าเริ่มต้น: 1,048,576 หรือ 1 MB)
  bodyLimit: 5 * 1024 * 1024, // 5 MB

  // ใช้งาน X-Forwarded-For ในการหา IP ลูกค้า (กรณีอยู่หลัง Reverse Proxy/Load Balancer)
  trustedProxy: true,

  // บังคับให้ Cookie ทุกตัวติด Flag 'Secure' โดยอัตโนมัติ
  secureCookies: true,

  // การจัดการ Request ID (ค่าเริ่มต้น: true) ถ้าเป็น true จะหา request ID จาก
  // `requestId`, header `x-request-id` หรือค่าพื้นฐาน แล้วส่งกลับใน response header
  // `x-request-id` ตั้งเป็น false เพื่อข้ามการสร้าง request ID ทั้งหมด (เร็วแบบ Elysia
  // แนะนำสำหรับ benchmark และ service ที่ไม่ต้องการ ID)
  requestId: false,

  // การตรวจจับ Telemetry ระดับ Global
  telemetry: {
    onRequest(ctx) { console.log(`Request เข้ามา: ${ctx.request.method} ${ctx.request.url}`) },
    onResponse(ctx, res) { console.log(`ส่งผลลัพธ์: Status ${res.status}`) },
    onError(ctx, err) { console.error(`เกิด Error:`, err) }
  }
})
```

### เมธอดสำหรับ Routing

Nelysia รองรับ Method ต่างๆ ในรูปแบบ Chainable API:

- `app.get(path, handler | value, options?)`
- `app.getStatic(path, staticValue)` — กำหนด Route แบบค่าคงที่ Context-free โดยตรง
- `app.post(path, handler, options?)`
- `app.put(path, handler, options?)`
- `app.patch(path, handler, options?)`
- `app.delete(path, handler, options?)`
- `app.head(path, handler, options?)`
- `app.options(path, handler, options?)`
- `app.all(path, handler, options?)` — ลงทะเบียน Route เดียวกันสำหรับทุก HTTP Method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)
- `app.route(method, path, handler, options?)`

> **พฤติกรรมของ OPTIONS:** request แบบ `OPTIONS` จะไม่วิ่งเข้า handler ใดๆ ถ้ามี route
> ตรงกับ path จะตอบ `204` พร้อม header `Allow` ที่ลิสต์ method ที่ลงทะเบียนไว้ (บวก `HEAD`
> สำหรับ route `GET`) ถ้าไม่ตรงเลยจะตอบ `404` การลงทะเบียน `app.options(path, handler)`
> ทำได้แต่ handler จะไม่ถูกเรียก

```ts
app
  // ค่าคงที่ ไม่ต้องผ่านการประมวลผลของ Handler ใดๆ (Zero Context Allocation)
  .getStatic("/version", { version: "1.0.0", env: "production" })

  // POST Request พร้อมอ่าน Body
  .post("/items", async ({ body }) => {
    return { success: true, item: body }
  })

  // รับทุก Method ที่ path เดียวกัน (เหมาะกับ Auth handler ภายนอก)
  .all("/api/auth/*", async (context) => {
    return auth.handler(new Request(context.request.url, {
      method: context.request.method,
      headers: context.request.headers
    }))
  })
```

### Wildcard Route (`*`)

Path ที่ลงท้ายด้วย `/*` จะจับทุกเส้นทางย่อยภายใต้ prefix นั้น ส่วนที่เหลือจะอยู่ใน `params["*"]`:

```ts
app.get("/files/*", ({ params }) => {
  return { rest: params["*"] } // GET /files/a/b.txt -> { rest: "a/b.txt" }
})
```

> ข้อสังเกต: Wildcard ต้องอยู่ตำแหน่งสุดท้ายของ path เท่านั้น และ Route แบบนี้จะไม่ถูกจัดเป็น `COMPILED` (ตกเป็น `GENERIC` และใช้ generic runtime เสมอ)

### การจัดกลุ่ม Route ด้วย `group`

ในเวอร์ชัน v0.1.3+ Nelysia รองรับการจัดกลุ่ม Route ย่อยด้วย `app.group(prefix, callback)` ช่วยให้คุณแบ่งโครงสร้างของ API ได้เป็นสัดส่วน พร้อมทั้งสืบทอดและแยก Lifecycle Hooks (เช่น Authentication หรือ Middleware เฉพาะกลุ่ม) ออกจาก Route อื่นๆ โดยไม่รั่วไหล:

```ts
app.group("/api/v1", (api) => {
  // Hook นี้จะมีผลเฉพาะเส้นทางภายใต้ /api/v1 เท่านั้น
  api.onBeforeHandle(({ headers, response }) => {
    if (!headers.get("authorization")) {
      return response(401, { error: "กรุณาระบุ Token สำหรับ API v1" })
    }
  })

  api.get("/users", () => [{ id: "1", name: "สมชาย" }])
  api.get("/posts", () => [{ id: "101", title: "แนะนำ Nelysia" }])
})

// เส้นทางนี้อยู่นอกกลุ่ม จะไม่ถูกตรวจสอบ Authorization
app.get("/public", () => ({ status: "ok" }))
```

### การปรับแต่งหน้า 404 ด้วย `notFound`

ในเวอร์ชัน v0.1.3+ คุณสามารถกำหนด Fallback Handler สำหรับคำขอที่ไม่ตรงกับเส้นทางใดๆ ในระบบด้วย `app.notFound(handler)`:

```ts
app.notFound(({ request, response }) => {
  return response(404, {
    error: "Not Found",
    message: `ไม่พบเส้นทาง ${request.method} ${request.url}`,
    timestamp: Date.now()
  })
})
```

หรือจะใช้ร่วมกับ `context.html()` เพื่อส่งหน้า 404 แบบ HTML ที่สวยงาม:

```ts
app.notFound(({ html }) => html("<h1>404 - ไม่พบหน้าที่คุณต้องการ</h1>", 404))
```

### การรวม Sub-App ด้วย `mount`

คุณสามารถแยกโมดูลของแอปพลิเคชันออกเป็น Instance ย่อย (`new Nelysia()`) แล้วนำมารวมกันผ่าน Path Prefix:

```ts
const usersApp = new Nelysia()
  .get("/", () => [{ id: "1", name: "สมชาย" }])
  .get("/:id", ({ params }) => ({ id: params.id }))

const app = new Nelysia()
  .mount("/api/users", usersApp)

// จะได้เส้นทางดังนี้:
// GET /api/users
// GET /api/users/:id
```

### การเปิดเซิร์ฟเวอร์ด้วย `listen`

ในเวอร์ชัน v0.1.4+ เมธอด `app.listen()` ได้รับการปรับปรุงให้ทำงานเป็นหนึ่งเดียวทั้งบน Bun และ Node.js โดยรองรับ Callback ที่ส่งอ็อบเจกต์ `ServerInfo` กลับมา:

```ts
interface ServerInfo {
  port: number        // หมายเลข Port ที่เปิดรับจริง
  hostname: string    // Hostname เช่น "localhost"
  url: string         // URL สมบูรณ์ เช่น "http://localhost:3000"
  server: unknown     // Native Server instance ของ Bun หรือ Node.js http.Server
}
```

ตัวอย่างการเรียกใช้งาน:

```ts
// 1. ระบุเฉพาะ Port
app.listen(3000, ({ port, url }) => {
  console.log(`🚀 เซิร์ฟเวอร์เริ่มทำงานแล้วที่ ${url} (port ${port})`)
})

// 2. หรือระบุทั้ง Port และ Hostname
app.listen({ port: 8080, hostname: "0.0.0.0" }, ({ url }) => {
  console.log(`🌐 พร้อมรับการเชื่อมต่อจากทุก Network Interface: ${url}`)
})
```

### กลไก Plugin (`use`) และขอบเขต Lifecycle

`use()` รับได้เฉพาะฟังก์ชัน `(app) => app | void`:

```ts
// Plugin = factory รับ config แล้วคืน (app) => app
const myPlugin = (opts: { tag: string }) => (app: Nelysia) =>
  app.onBeforeHandle(({ headers, response }) => {
    if (!headers.has("x-tag")) return response(401, { error: opts.tag })
  })

app.use(myPlugin({ tag: "missing-tag" }))
```

กฎขอบเขตที่ต้องจำ:
- Hook ที่เพิ่มเข้า parent (ก่อนหรือหลัง `mount`) มีผลกับ route ของ parent เองทั้งหมด — รวมถึง route ที่ลงทะเบียนไว้ก่อนแล้ว (backfill)
- Route ที่ `mount` หรือสร้างผ่าน `group` เก็บ lifecycle `before/after/error` ของตัวเองไว้ ไม่รั่วไป route ข้างเคียง และ hook ของ parent ที่เพิ่มทีหลังไม่ย้อนมาติด
- Route ซ้ำ method+path ตอน mount จะ throw `Duplicate route`
- ไม่มี deduplication — เรียก `use()` ซ้ำจะลงทะเบียนซ้ำ

---

## 5. Request Context (`Context`)

Handler ทุกตัวจะได้รับอ็อบเจกต์ `Context` ที่ถูกสร้างขึ้นแยกอิสระสำหรับแต่ละ Request โดยในเวอร์ชัน v0.1.4+ ได้รับการขยายความสามารถให้รองรับการเขียนที่กระชับและยืดหยุ่นยิ่งขึ้น:

```ts
interface Context {
  request: RequestData                     // ข้อมูล Request ดิบ
  requestId: string                        // รหัสอ้างอิง Request แบบสุ่มหรือมาจาก Header
  clientIp?: string                        // IP ของเครื่องผู้เรียก (รองรับ trustedProxy)
  params: Record<string, string>           // พารามิเตอร์ใน URL (เช่น :id)
  query: ParsedQuery                       // Proxy รองรับทั้ง .get() และ Object Destructuring
  set: ResponseSetContext                  // ปรับแต่ง status และ headers ผ่าน Mutation
  store: Record<string, unknown>           // ที่เก็บ State ประจำ Request แชร์ระหว่าง Hooks
  body: unknown                            // Body ที่ถูก Parse เป็น JSON หรือข้อความ
  headers: Headers                         // Web Standard Headers
  cookies: Record<string, string>          // Cookies ที่ถูก Parse เข้ามา
  setCookie(name: string, value: string, options?: CookieOptions): void
  deleteCookie(name: string, options?: CookieOptions): void
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
  html(body: string, status?: number): ResponseData
  text(body: string, status?: number): ResponseData
  json(body: unknown, status?: number): ResponseData
  redirect(url: string, status?: number): ResponseData
  header(name: string, value: string): this
}
```

### การอ่าน Query ด้วย Proxy Destructuring

ในเวอร์ชัน v0.1.2+ `context.query` เป็น Proxy อัจฉริยะที่สามารถใช้งานได้ 2 รูปแบบพร้อมกัน:

1. **เข้าถึงค่าแบบ Object Property หรือ Destructure ได้โดยตรง:**
   ```ts
   app.get("/search", ({ query }) => {
     const { keyword, page = "1", limit = "20" } = query
     return { keyword, page: Number(page), limit: Number(limit) }
   })
   ```
2. **ใช้งานตามมาตรฐาน `URLSearchParams`:**
   ```ts
   app.get("/filter", ({ query }) => {
     if (query.has("tag")) {
       return { tag: query.get("tag") }
     }
     return { tag: null }
   })
   ```
3. **รองรับ Array Query Parameters อัตโนมัติ:**
   เมื่อมีการส่ง Query ชื่อซ้ำกัน เช่น `?role=admin&role=editor` พร็อพเพอร์ตี้ `query.role` จะคืนค่าเป็น Array `["admin", "editor"]` โดยอัตโนมัติ

### การตั้งค่า Status และ Headers ด้วย `context.set`

คุณสามารถกำหนด HTTP Status Code หรือเพิ่ม Response Header ได้โดยตรงผ่านการกำหนดค่าใน `context.set` โดยที่ Handler ยังคงสามารถ return ข้อมูลเป็น Object หรือ Primitive ได้ตามปกติ:

```ts
app.post("/users", ({ body, set }) => {
  set.status = 201 // กำหนด HTTP 201 Created
  set.headers["x-powered-by"] = "Nelysia"
  set.headers["x-resource-id"] = "user_99"

  return { success: true, data: body }
})
```

### การแชร์ข้อมูลภายใน Request ด้วย `context.store`

ในเวอร์ชัน v0.1.3+ `context.store` เป็น Dictionary เปล่าระดับ Request สำหรับส่งผ่านข้อมูลระหว่าง Lifecycle Hooks (`onBeforeHandle`, Route Handler, `onAfterHandle`):

```ts
// ตรวจสอบ JWT ใน onBeforeHandle แล้วเก็บ User ไว้ใน store
app.onBeforeHandle(({ headers, store, response }) => {
  const authHeader = headers.get("authorization")
  if (!authHeader) return response(401, { error: "กรุณาเข้าสู่ระบบ" })

  store.currentUser = { id: "user_123", role: "admin" }
})

// Route Handler ดึงข้อมูล currentUser ออกจาก store มาใช้ได้ทันที
app.get("/me", ({ store }) => {
  return { profile: store.currentUser }
})
```

### ฟังก์ชันอำนวยความสะดวกสำหรับ Response Shorthands

ในเวอร์ชัน v0.1.4+ Nelysia เพิ่มฟังก์ชัน Shorthand ให้สร้าง Response พร้อม Content-Type และ Status Code ที่ถูกต้องได้ในบรรทัดเดียว:

- `html(body, status = 200)`: ส่ง HTML string กลับไปพร้อม `Content-Type: text/html; charset=utf-8`
- `text(body, status = 200)`: ส่งข้อความตัวอักษรธรรมดา พร้อม `Content-Type: text/plain; charset=utf-8`
- `json(body, status = 200)`: แปลงข้อมูลเป็น JSON พร้อม `Content-Type: application/json; charset=utf-8`
- `redirect(url, status = 302)`: สั่งเปลี่ยนเส้นทาง (Redirect) ด้วย Header `Location: url` (ปรับ status เป็น 301 หรือ 307 ได้)
- `header(name, value)`: เมธอดสำหรับเพิ่ม Response Header แบบ Chainable

```ts
app
  .get("/welcome", ({ html }) => html("<h1>ยินดีต้อนรับสู่ Nelysia</h1>"))
  .get("/robots.txt", ({ text }) => text("User-agent: *\nDisallow: /admin"))
  .get("/old-dashboard", ({ redirect }) => redirect("/new-dashboard", 301))
  .get("/custom-header", (ctx) => {
    return ctx.header("x-app-name", "my-app").json({ ok: true })
  })
```

### การจัดการ Cookies

Nelysia รองรับทั้งการอ่านคุกกี้ (`cookies`), การบันทึกคุกกี้ (`setCookie`) และการลบคุกกี้ (`deleteCookie`):

```ts
app.get("/auth/login", ({ cookies, setCookie }) => {
  setCookie("sessionToken", "secret_token_123", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400 // 1 วัน
  })

  return { message: "เข้าสู่ระบบสำเร็จ" }
})

app.post("/auth/logout", ({ deleteCookie }) => {
  // ลบ Cookie โดยตั้งค่า Max-Age เป็น 0 และระบุ Path ให้ตรงกัน
  deleteCookie("sessionToken", { path: "/" })
  return { message: "ออกจากระบบแล้ว" }
})
```

### การส่ง Response กลับในรูปแบบต่างๆ

1. **คืนค่า Plain Object หรือ String**: ระบบจะแปลงเป็น JSON หรือ Text และตอบกลับด้วย `Status 200` อัตโนมัติ (หรือตามค่าที่ตั้งใน `set.status`)
2. **ใช้ Response Shorthands**: เช่น `context.html()`, `context.text()`, `context.json()`, `context.redirect()`
3. **ใช้ `context.response(status, body, headers)`**: กำหนด HTTP Status Code และ Custom Headers ได้อย่างอิสระ
4. **คืนค่า Web Standard `Response`**: คืนอ็อบเจกต์ `Response` ดั้งเดิม
5. **คืนค่า `ReadableStream`**: สำหรับการทำ Streaming ข้อมูลขนาดใหญ่หรือ Server-Sent Events

```ts
app.get("/custom", ({ response }) => {
  return response(201, { created: true }, { "x-powered-by": "Nelysia" })
})

app.get("/stream", () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("ข้อมูลชุดที่ 1\n"))
      controller.enqueue(new TextEncoder().encode("ข้อมูลชุดที่ 2\n"))
      controller.close()
    }
  })
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8" }
  })
})
```

---

## 6. การตรวจสอบข้อมูลและ Schema Validation

### เครื่องมือสร้าง Schema ในตัว (`t`)

Nelysia มีตัวสร้าง Schema น้ำหนักเบาในตัว ไม่ต้องลง Library เพิ่มเติม:

```ts
import { Nelysia, t } from "@narudom96/nelysia"

const UserSchema = t.Object({
  name: t.String(),
  age: t.Number(),
  isAdmin: t.Boolean()
})

const app = new Nelysia().post("/users", ({ body }) => {
  return { message: "บันทึกเรียบร้อย", user: body }
}, {
  body: UserSchema
})
```

### การเชื่อมต่อกับ Standard Schema (Zod, Valibot, ArkType)

Nelysia รองรับมาตรฐาน **Standard Schema (v1)** โดยอัตโนมัติ ทำให้คุณสามารถนำ Zod 3.24+, Valibot หรือ ArkType มาใช้ได้ทันที:

```ts
import { z } from "zod"
import { Nelysia } from "@narudom96/nelysia"

const PostSchema = z.object({
  title: z.string().min(5),
  tags: z.array(z.string())
})

const app = new Nelysia().post("/posts", ({ body }) => {
  return { post: body }
}, {
  body: PostSchema
})
```

### จุดที่สามารถ Validate ได้ทั้ง 5 จุด

คุณสามารถกำหนด Schema สำหรับส่วนต่างๆ ของ Request/Response ได้พร้อมกัน:

```ts
app.post("/articles/:id", ({ params, query, body }) => ({ params, query, body }), {
  params: t.Object({ id: t.String() }),
  query: t.Object({ draft: t.String() }),
  headers: t.Object({ authorization: t.String() }),
  body: t.Object({ content: t.String() }),
  response: t.Object({ content: t.String() }) // ตรวจสอบข้อมูลก่อนส่งออกกลับไปยัง Client
})
```

> **ข้อสังเกต:** หากข้อมูลที่ส่งเข้ามาไม่ตรงตามเงื่อนไข Nelysia จะตอบกลับด้วย `HTTP 400 Bad Request` ทันที โดยที่โค้ดใน Route Handler จะไม่ถูกเรียกทำงาน

---

## 7. Lifecycle Hooks และการดักจับข้อผิดพลาด

### ลำดับการทำงานของ Request (Execution Flow)

```
Request ส่งเข้ามา
       │
       ▼
[ค้นหา Route & อ่าน Body ดิบ]
       │
       ▼
[ตรวจสอบ Schema (params, query, headers, body)]
       │
       ▼
[onBeforeHandle Hook] ──► (ส่ง Response กลับ? ──► จบการทำงานทันที)
       │
       ▼
[เรียก Route Handler ทำงาน]
       │
       ▼
[ตรวจสอบ Schema ของผลลัพธ์ (response schema)]
       │
       ▼
[onAfterHandle Hook]
       │
       ▼
[ส่งข้อมูลไปยัง Telemetry onResponse]
       │
       ▼
ส่ง Response กลับไปยัง Client
```

### `onBeforeHandle`
เหมาะสำหรับสร้าง Authentication Guard หรือการเช็คสิทธิ์ หากใน Hook มีการ `return context.response(...)` จะถือว่า Request สิ้นสุดทันทีโดยไม่เข้าสู่ Handler:

```ts
app.onBeforeHandle(({ headers, response }) => {
  const auth = headers.get("authorization")
  if (!auth) {
    return response(401, { error: "กรุณาระบุ Authorization Token" })
  }
})
```

### `onAfterHandle`
ทำงานหลังจากที่ Route Handler ประมวลผลเสร็จสิ้น ใช้ในการแก้ไข Header หรือจัดการบีบอัดข้อมูล:

```ts
app.onAfterHandle((context, response) => {
  response.headers.set("x-server-time", Date.now().toString())
})
```

### `onError` และ `HttpError`
จุดศูนย์กลางในการดักจับและแปลง Error ให้กลายเป็น JSON Response ที่สวยงาม:

```ts
import { Nelysia, HttpError } from "@narudom96/nelysia"

const app = new Nelysia()
  .onError((error, context) => {
    if (error instanceof HttpError) {
      return context.response(error.status, { error: error.message })
    }
    console.error("เกิดข้อผิดพลาดที่ไม่คาดคิด:", error)
    return context.response(500, { error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" })
  })
  .get("/admin", () => {
    throw new HttpError(403, "ไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ")
  })
```

### การปิดเซิร์ฟเวอร์อย่างปลอดภัย (`gracefulShutdown`)

ช่วยระบาย Request ที่ค้างอยู่ให้เสร็จสิ้นและปิด Connection ก่อนที่ Process จะหยุดทำงาน:

```ts
import { gracefulShutdown } from "@narudom96/nelysia"

const server = app.listen(3000)

process.on("SIGINT", async () => {
  console.log("กำลังปิดเซิร์ฟเวอร์อย่างปลอดภัย...")
  await gracefulShutdown(server, 5000) // หน่วงเวลาสูงสุด 5 วินาที
  process.exit(0)
})
```

### รันหลาย Process (`serveClustered`, Node.js)

ขยายข้าม core ด้วยการ fork worker ตามจำนวน CPU แต่ละ worker สร้าง app ของตัวเอง
(พร้อม compiled dispatcher ของตัวเอง) ผ่าน factory:

```ts
import { serveClustered } from "@narudom96/nelysia/runtime-node-cluster"
import { Nelysia } from "@narudom96/nelysia"

serveClustered(() => new Nelysia({ requestId: false }).get("/json", () => ({ ok: true })), {
  port: 3000,     // worker ทุกตัว share port เดียวกันผ่าน OS
  workers: 4,     // ค่าเริ่มต้นเท่าจำนวน CPU
  respawn: true,  // worker ตายให้ fork ตัวใหม่ (ค่าเริ่มต้น)
})
```

คืน `Server` ของ worker หรือ `undefined` ใน primary process ดูตัวอย่างที่ `examples/cluster/server.ts`

---

## 8. การใช้งาน WebSockets

Nelysia รองรับ WebSocket แบบ Native ทั้งบน Bun และ Node.js ผ่าน API เดียวกัน:

```ts
app.websocket("/ws/chat", {
  open(socket) {
    console.log("มีการเชื่อมต่อใหม่เข้ามา")
    socket.send("ยินดีต้อนรับสู่ระบบแชท!")
  },
  message(socket, message) {
    console.log("ได้รับข้อความ:", message)
    socket.send(`ตอบกลับ: ${message}`)
  },
  close(socket, code, reason) {
    console.log(`การเชื่อมต่อถูกปิด: รหัส ${code} (${reason})`)
  },
  error(socket, error) {
    console.error("WebSocket เกิดข้อผิดพลาด:", error)
  }
})
```

---

## 9. ระบบปลั๊กอิน (Plugins Ecosystem)

### ระบบความปลอดภัย CORS (`cors`)

ในเวอร์ชัน v0.1.3+ Nelysia มีปลั๊กอิน `cors()` ในตัว รองรับการควบคุมการเข้าถึงข้ามโดเมนอย่างสมบูรณ์แบบ จัดการคำขอ Preflight `OPTIONS` อัตโนมัติด้วย HTTP 204:

```ts
import { cors } from "@narudom96/nelysia/plugins"

app.use(cors({
  // กำหนด Origin ที่อนุญาต: string, array, boolean, หรือ callback
  origin: ["http://localhost:3000", "https://myfrontend.com"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Custom-Header"],
  exposedHeaders: ["x-request-id"],
  credentials: true,
  maxAge: 86400 // Cache ผลการ Preflight 24 ชั่วโมง
}))
```

- **Preflight `OPTIONS` อัตโนมัติ**: เมื่อมีคำขอ `OPTIONS` เข้ามา `cors()` จะดักและตอบกลับด้วยสถานะ `204 No Content` พร้อม Headers ที่ถูกต้องทันทีโดยไม่หลุดไปถึง Handler
- **Origin Validation**: หากส่งฟังก์ชัน `origin: (reqOrigin, context) => boolean | string` จะสามารถตรวจสอบโดเมนแบบ Dynamic ได้อย่างแม่นยำ

### HTTP Security Headers (`securityHeaders`)

ในเวอร์ชัน v0.1.3+ ปลั๊กอิน `securityHeaders()` ช่วยเสริมความปลอดภัยให้เซิร์ฟเวอร์ตามแนวทางปฏิบัติที่ดีที่สุดของ OWASP โดยการเพิ่ม Headers ป้องกันการโจมตีทางเว็บ:

```ts
import { securityHeaders } from "@narudom96/nelysia/plugins"

app.use(securityHeaders({
  xContentTypeOptions: true,                                      // X-Content-Type-Options: nosniff
  xFrameOptions: "SAMEORIGIN",                                    // ป้องกัน Clickjacking (หรือ "DENY")
  xXSSProtection: true,                                           // X-XSS-Protection: 0 (มาตรฐานใหม่)
  referrerPolicy: "no-referrer",                                  // Referrer-Policy
  strictTransportSecurity: "max-age=15552000; includeSubDomains", // HSTS
  crossOriginOpenerPolicy: "same-origin",                         // COOP
  crossOriginResourcePolicy: "same-origin"                        // CORP
}))
```

### การให้บริการโฟลเดอร์ไฟล์ Static (`staticDirectory`)

ในเวอร์ชัน v0.1.2+ ให้บริการไฟล์ Static ทั้งโฟลเดอร์ (CSS, JS, รูปภาพ, ฟอนต์, HTML) ได้อย่างง่ายดาย พร้อมระบบตรวจจับ MIME Type และการป้องกัน Path Traversal ในตัว:

```ts
import { staticDirectory } from "@narudom96/nelysia/plugins"

// ให้บริการไฟล์จากโฟลเดอร์ public เช่น /public/style.css -> /assets/style.css
app.use(staticDirectory({
  prefix: "/assets",       // Path Prefix ที่ต้องการให้บริการ (ค่าเริ่มต้น: "")
  root: "./public",         // โฟลเดอร์ต้นทาง
  index: "index.html"      // ไฟล์ดัชนีเมื่อเรียกเข้าโฟลเดอร์ย่อย
}))
```

- **ความปลอดภัยสูง**: มีการตรวจสอบและตัด `..` ป้องกันไม่ให้ Client เข้าถึงไฟล์นอกโฟลเดอร์ที่กำหนด
- **รองรับ MIME Types ครอบคลุม**: `html`, `css`, `js`, `json`, `svg`, `png`, `jpg`, `webp`, `woff2`, `wasm` ฯลฯ

### การจำกัดจำนวน Request (`rateLimit`)

จำกัดปริมาณคำขอตามช่วงเวลาเพื่อป้องกันการยิงสแปม (ป้องกัน DDoS/Brute Force):

```ts
import { rateLimit } from "@narudom96/nelysia/plugins"

app.use(rateLimit({
  limit: 60,            // จำกัดไม่เกิน 60 ครั้ง
  windowMs: 60 * 1000,  // ต่อ 1 นาที
  key: (ctx) => ctx.clientIp ?? "anonymous"
}))
```
เมื่อคำขอเกินกำหนด ระบบจะตอบกลับด้วย `HTTP 429 Too Many Requests` พร้อม Header `Retry-After` อัตโนมัติ

### การให้บริการไฟล์ Static เดี่ยว (`staticFile`)

```ts
import { staticFile } from "@narudom96/nelysia/plugins"

app.use(staticFile("/favicon.ico", "./public/favicon.ico"))
app.use(staticFile("/logo.png", "./assets/logo.png"))
```

### การบีบอัดข้อมูล Gzip (`compression`)

ช่วยบีบอัด Response Body ด้วย Gzip อัตโนมัติเมื่อ Client ร้องขอผ่าน `Accept-Encoding: gzip`:

```ts
import { compression } from "@narudom96/nelysia/plugins"

app.use(compression({
  threshold: 1024 // บีบอัดเฉพาะข้อมูลที่มีขนาดมากกว่า 1 KB
}))
```

---

## 10. OpenAPI 3.1 และหน้าเอกสาร Redoc / Swagger UI

สร้างเอกสารอ้างอิง API ตามมาตรฐาน OpenAPI 3.1 จาก Route Schemas ที่ระบุไว้โดยอัตโนมัติ พร้อมรองรับ Metadata รายละเอียดเส้นทาง:

### สร้างเอกสาร OpenAPI อัตโนมัติและ Route Metadata

ในเวอร์ชัน v0.1.3+ คุณสามารถใส่ `summary`, `description` และ `tags` ใน Route Options เพื่อให้ปรากฏในสเปก OpenAPI ได้ทันที:

```ts
import { Nelysia, t } from "@narudom96/nelysia"
import { openapi, openapiUi, swaggerUi } from "@narudom96/nelysia/openapi"

const app = new Nelysia()
  .get("/users", () => [{ id: "1", name: "สมชาย" }], {
    summary: "ดึงรายชื่อผู้ใช้ทั้งหมด",
    description: "คืนค่ารายการผู้ใช้งานในระบบ พร้อมรองรับการกรองตามสถานะ",
    tags: ["Users"],
    response: t.Array(t.Object({ id: t.String(), name: t.String() }))
  })
  .use(openapi({
    title: "ระบบ API ตัวอย่าง",
    version: "1.0.0",
    path: "/openapi.json"
  }))
```

### เปิดหน้าเว็บ Redoc UI (`openapiUi`)

แสดงหน้าเว็บเอกสารแบบ Redoc ที่อ่านง่ายและสวยงาม:

```ts
app.use(openapiUi({
  path: "/docs",
  specPath: "/openapi.json",
  title: "คู่มือการเรียกใช้ API (Redoc)"
}))
```

### เปิดหน้าเว็บ Swagger UI (`swaggerUi`)

ในเวอร์ชัน v0.1.3+ เพิ่มการรองรับ Swagger UI แบบ Interactive ที่ให้คุณสามารถทดสอบยิง Request จากเบราว์เซอร์ได้ทันที:

```ts
app.use(swaggerUi({
  path: "/swagger",
  specPath: "/openapi.json",
  title: "API Explorer (Swagger UI)"
}))
```

เมื่อเปิดเว็บเบราว์เซอร์ไปที่ `http://localhost:3000/swagger` หรือ `/docs` จะพบหน้าต่างเอกสาร API ที่สวยงามพร้อมรายละเอียดและตัวอย่างข้อมูลทั้งหมด

### การสกัด Schema จาก Standard Schema (Zod / Valibot)
Nelysia สกัด Schema ที่นิยามด้วยมาตรฐาน Standard Schema v1 (เช่น Zod, Valibot, ArkType) ออกมาเป็น OpenAPI Schema Object ให้อัตโนมัติ ทำให้ไม่ต้องนิยาม Schema ซ้ำสองรอบ

---

## 11. ระบบ Observability & OpenTelemetry Tracing

Nelysia รองรับการเก็บสถิติระยะเวลาประมวลผลและการส่ง Spans ไปยัง OpenTelemetry Collector (เช่น Jaeger, Grafana Tempo, Honeycomb) ผ่าน HTTP OTLP:

```ts
import { otlpHttpExporter } from "@narudom96/nelysia/observability"

const app = new Nelysia({
  telemetry: {
    ...otlpHttpExporter({
      url: "http://localhost:4318/v1/traces",
      serviceName: "backend-service"
    })
  }
})
```

---

## 12. การเชื่อมต่อกับ GraphQL

เชื่อมต่อกับ GraphQL Schema ที่สร้างด้วย `graphql-js` ได้ทันที:

```ts
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from "graphql"
import { graphqlPlugin } from "@narudom96/nelysia/graphql"

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "RootQuery",
    fields: {
      greet: {
        type: GraphQLString,
        resolve: () => "สวัสดีจาก Nelysia GraphQL!"
      }
    }
  })
})

app.use(graphqlPlugin({
  schema,
  path: "/graphql"
}))
```

ส่ง POST ไปที่ `/graphql` ด้วย body `{ query, variables?, operationName? }` หากไม่ระบุ `query` จะได้ `400 { errors: [...] }` ผลลัพธ์จาก `graphql-js` จะถูก normalize เป็น plain JSON ก่อนส่งกลับ

---

## 13. การเชื่อมต่อฐานข้อมูล (Drizzle & Prisma)

### Drizzle ORM (`@narudom96/nelysia/drizzle`)

```ts
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { drizzleRoute } from "@narudom96/nelysia/drizzle"

const sqlite = new Database("app.db")
const db = drizzle(sqlite)
const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull()
})

app.use(drizzleRoute({
  db,
  path: "/users",
  query: (client) => client.select().from(users)
}))
// GET /users -> [{ id: 1, name: "สมชาย" }, ...]
```

> ข้อจำกัด: บน Bun ให้เลี่ยง `better-sqlite3` (native binding ไม่เสถียรบน Bun) — ใช้ Bun-native driver หรือรันบน Node.js

### Prisma (`@narudom96/nelysia/prisma`)

```ts
import { PrismaClient } from "@prisma/client"
import { prismaRoute } from "@narudom96/nelysia/prisma"

const prisma = new PrismaClient()

app.use(prismaRoute({
  db: prisma,
  path: "/users",
  query: (client) => client.user.findMany()
}))
```

ขั้นตอนเตรียม Prisma (ดู `examples/prisma/`):

```bash
npm run prisma:generate   # generate client จาก examples/prisma/schema.prisma
npm run prisma:smoke      # push schema ลง SQLite + รัน smoke test จริง
```

---

## 14. การยืนยันตัวตนด้วย Better Auth

`betterAuthPlugin` ต่อ Better Auth เข้ากับ Nelysia ผ่าน catch-all route (`app.all`) จึงรองรับทุก endpoint ของ Better Auth (`sign-in`, `sign-up`, `session`, ...) ภายใต้ prefix เดียว:

```ts
import { betterAuth } from "better-auth"
import { betterAuthPlugin } from "@narudom96/nelysia/better-auth"

const auth = betterAuth({
  database: /* adapter ของคุณ (drizzle/prisma/kysely) */,
  emailAndPassword: { enabled: true }
})

app.use(betterAuthPlugin(auth)) // ค่าเริ่มต้น prefix: /api/auth
```

- เปลี่ยน prefix ได้: `betterAuthPlugin(auth, "/auth")`
- Request method, headers และ body จะถูก forward ไปยัง `auth.handler` ตรงๆ และ `Response` (รวม `Set-Cookie`) จะถูกส่งกลับโดยไม่ดัดแปลง
- ต้องติดตั้งและตั้งค่า `better-auth` เอง (ฐานข้อมูล, secret, trusted origins) — ปลั๊กอินนี้ทำหน้าที่เป็นสะพานเชื่อมเท่านั้น

---

## 15. การเชื่อมต่อ AI SDK

เรียก `generateText` ของ Vercel AI SDK ภายใน route ได้ตรงๆ ผ่าน helper แบบ injectable (ดู `examples/ai-sdk/app.ts`):

```ts
import { generateText, type LanguageModel } from "ai"
import { Nelysia } from "@narudom96/nelysia"

export function createAiSdkApp(model: LanguageModel): Nelysia {
  return new Nelysia().post("/ai", async ({ body, response }) => {
    if (!body || typeof body !== "object" || typeof (body as any).prompt !== "string") {
      return response(400, { error: "Expected a JSON body with a string prompt" })
    }
    const { text } = await generateText({ model, prompt: (body as any).prompt })
    return { text }
  })
}
```

```bash
npm run ai:example
curl -X POST http://localhost:3001/ai \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hello"}'
# {"text":"Deterministic AI SDK response"}
```

ตัวอย่างที่ check-in ใช้ `MockLanguageModelV3` จาก `ai/test` จึงไม่ต้องใช้ network/credentials — สำหรับ production ให้ส่ง provider model จริง (เช่น OpenAI/Anthropic provider) เข้า `createAiSdkApp` เอง ส่วน streaming, tool calling และ API key เป็นความรับผิดชอบของแอป

---

## 16. Nelysia Client SDK (`@nelysia/client`)

ไลบรารี Client น้ำหนักเบาที่ช่วยให้เรียกใช้ API ของ Nelysia ได้ง่ายและปลอดภัย:

```ts
import { createClient } from "@narudom96/nelysia/client"

const api = createClient("http://localhost:3000")

// ส่งคำขอ GET
const { data, error, response } = await api.get<{ id: string; name: string }>("/users/1")

if (error) {
  console.error("เกิดข้อผิดพลาด:", error.status, error.body)
} else {
  console.log("ชื่อผู้ใช้:", data?.name)
}

// ส่งคำขอ POST
await api.post("/users", { name: "กรรณิการ์", age: 25 })
```

---

## 17. ระบบคอมไพเลอร์และเครื่องมือ CLI (`nelysia`)

### การจัดหมวดหมู่ Route
เมื่อผ่านคอมไพเลอร์ Route แต่ละเส้นทางจะถูกวิเคราะห์ออกเป็น 3 ระดับ:
1. **`COMPILED`**: สำหรับเส้นทางที่เป็นค่าคงที่ (Static Value) และไม่มี Hook ใดๆ จะตอบสนองด้วยความเร็วสูงสุด
2. **`SPECIALIZED`**: สำหรับเส้นทางที่มี Parameter แต่ไม่ต้องใช้ Cookie/Query
3. **`GENERIC`**: สำหรับเส้นทางที่มี Middleware ซับซ้อนหรือการตรวจสอบความถูกต้องหลายขั้นตอน

### Standalone Generation (เส้นทางที่รองรับ)

หากทุก route ในแอปเป็น GET แบบ static-value หรือ params-only handler (`({ params }) => ...`) ที่ไม่มี hooks/schemas/telemetry คอมไพเลอร์จะสร้าง **standalone server** ที่ฝัง route table และ handler ลงใน artifact โดยตรง — ไม่ import generic router:

- Static route จะ pre-serialize body ไว้ล่วงหน้าและ serve ผ่าน `Response.clone()` ที่เร็วที่สุด
- Dynamic route แบบ `/users/:id` จะ match prefix ตรงๆ และดึง param จาก URL โดยไม่ split array
- Route ที่ไม่เข้าเงื่อนไขจะ fallback ไปใช้ adapter พร้อม diagnostic `NELY002` ระบุ method/path

> ข้อจำกัดที่ตั้งใจไว้: arbitrary source-to-source (แปลง TypeScript ทุกรูปแบบ) ยังไม่รองรับ — ดู `docs/release-status.md`

### Adapter Dispatcher (Fast Path ค่าเริ่มต้น)

แม้ไม่ build แบบ standalone adapter ของ Node, Bun และ Fetch ก็ serve `GET` ที่ไม่มี hook ผ่าน compiled dispatcher ตัวกลาง (`packages/compiler/src/dispatcher.ts`): static hit แบบ O(1) ด้วย payload ที่ serialize ล่วงหน้า, dynamic lookup แยกตาม method ที่ split pathname ครั้งเดียว และ prefix matching สำหรับ route แบบ `/users/:id` ส่วน hooks/schemas/method อื่น/telemetry ตกไป generic router manifest บันทึกด้วย `dispatcher: true` และ diagnostic `NELY003` ระดับ info ที่รายงาน coverage ของ fast path

### คำสั่ง CLI
```bash
# ตรวจสอบการวิเคราะห์ Route ทั้งหมด
npm run inspect -- ./src/app.ts

# คอมไพล์และสร้าง Entrypoint เฉพาะสำหรับ Bun
npm run build -- ./src/app.ts --target bun

# คอมไพล์และสร้าง Entrypoint เฉพาะสำหรับ Node.js
npm run build -- ./src/app.ts --target node
```

ผลลัพธ์จากการสั่ง Build จะถูกบันทึกไว้ในโฟลเดอร์ `dist/`:
- `dist/server.bun.ts` (หรือ `dist/server.node.ts`): โค้ดเซิร์ฟเวอร์ที่ปรับแต่งประสิทธิภาพแล้ว
- `dist/server.bun.ts.map` (หรือ `dist/server.node.ts.map`): source map ของ artifact
- `dist/manifest.json`: สรุป target, artifact, route analyses, diagnostics (`NELY001`/`NELY002`/`NELY003`), `generation` (`standalone`|`adapter`), `dispatcher` (flag บอก fast-path coverage), `reproducible: true` และ content-addressed `cacheKey`
- `.nelysia-cache/<cacheKey>.json`: แคช manifest ตาม hash ของเนื้อหา

### Deploy ด้วย Docker

`Dockerfile` สำหรับ production อยู่ที่ root ของ repo (Node 22-slim, dependencies เฉพาะ production, prebuild `dist/server.node.ts`, มี `HEALTHCHECK` ที่ `/`, รันเป็น non-root user):

```bash
docker build -t nelysia:local .
docker run --rm -p 3000:3000 -e PORT=3000 nelysia:local
```

### สร้าง Type สำหรับ Client (`generateClientTypes`)

```ts
import { generateClientTypes } from "@narudom96/nelysia/openapi"

console.log(generateClientTypes(app))
// export interface NelysiaRoutes {
//   GET "/users": { response: unknown }
//   ...
// }
```

---

## 18. รันไทม์ที่รองรับและ Adapter

| คุณสมบัติ | Bun 1.4+ | Node.js 22+ | Standard Fetch | Vercel | Cloudflare | Deno |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| HTTP Routing | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ |
| WebSockets | รองรับสมบูรณ์ (Native) | รองรับสมบูรณ์ (`ws`) | ต้องมี Adapter | ไม่รองรับ | ต้องมี Adapter | ต้องมี Adapter |
| Body Parsing & Limit | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ |
| Streaming Response | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ |
| AOT Compiler Optimization | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ | รองรับสมบูรณ์ |

### Vercel (`@narudom96/nelysia/runtime-vercel`)

```ts
import { createVercelHandler } from "@narudom96/nelysia/runtime-vercel"

export default createVercelHandler(app)
```

### Cloudflare Workers (`@narudom96/nelysia/runtime-cloudflare`)

```ts
import { createCloudflareWorker } from "@narudom96/nelysia/runtime-cloudflare"

export default createCloudflareWorker(app) // { fetch(request, env, ctx) }
```

ใช้ Web API ล้วน ไม่ต้องพึ่ง Node globals (ดู `examples/cloudflare/worker.ts`)

### Deno

```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"

Deno.serve(createFetchHandler(app))
```

ตรวจสอบ contract ด้วย `npm run deno:check` (ดู `examples/deno/main.ts`)

---

## 19. การเชื่อมต่อกับ Full-Stack Web Frameworks

คุณสามารถนำ Nelysia ไปใช้เป็น Backend API ภายใน Full-stack Frameworks ยอดนิยมได้ผ่าน `createFetchHandler`:

### Next.js (App Router: `app/api/[[...slug]]/route.ts`)
```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

const handler = createFetchHandler(app)

export const GET = (req: Request) => handler(req)
export const POST = (req: Request) => handler(req)
export const PUT = (req: Request) => handler(req)
export const DELETE = (req: Request) => handler(req)
```

### Nuxt (`server/api/[...].ts`)
```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "~/server/app"

const handler = createFetchHandler(app)

export default defineEventHandler((event) => handler(toWebRequest(event)))
```

### SvelteKit (`src/routes/api/nelysia/+server.ts`)
```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "$lib/server/app"

const fetchHandler = createFetchHandler(app)

// SvelteKit ส่ง Request มาภายใน RequestEvent
export const GET = ({ request }: { request: Request }) => fetchHandler(request)
export const POST = ({ request }: { request: Request }) => fetchHandler(request)
```

### Astro (`src/pages/api/nelysia.ts`)
```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

// Astro endpoint รับ Fetch-standard handler ได้โดยตรง
export const GET = createFetchHandler(app)
export const POST = createFetchHandler(app)
```

### TanStack Start (`src/routes/api/nelysia.ts`)
```ts
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

// export Fetch boundary ให้ server route เรียกใช้
export const fetchHandler = createFetchHandler(app)
```

---

## 20. การทดสอบประสิทธิภาพและ Soak Testing

```bash
# รันทดสอบ Benchmark บน Node.js
npm run benchmark

# รันทดสอบ Benchmark บน Bun (static /json)
npm run benchmark:bun

# รันทดสอบ Benchmark บน Bun (dynamic /users/:id)
BENCH_CASE=dynamic npm run benchmark:bun

# ปรับจำนวนรอบ/ระยะเวลา/concurrency (ค่าเริ่มต้น: repeats=3)
BENCH_DURATION_MS=3000 BENCH_CONCURRENCY=10 BENCH_REPEATS=10 npm run benchmark:bun

# Router scale (ต้นทุน lookup ของ generic path เทียบกับขนาดตาราง route)
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=100 node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts

# รันทดสอบความเสถียรของหน่วยความจำ (Soak Test: static + dynamic, รายงาน heap/RSS)
npm run soak

# Soak ยาว (เช่น 1M requests บนตาราง 200 routes)
SOAK_ITERATIONS=1000000 SOAK_ROUTES=200 npm run soak

# รัน gate รวมทั้งหมด (typecheck + tests + soak + deno + audit)
npm run release:check
```

### ผลล่าสุด (10 รอบ, concurrency 10, failures 0)

ดูรายละเอียดเต็มที่ `docs/benchmark-10-rounds.md` และ `docs/benchmark-100-rounds.md`:

| Workload (Bun) | Nelysia | Elysia | Raw Bun |
| :--- | ---: | ---: | ---: |
| Static `GET /json` | **30,618 req/s** (0.33 ms) | 28,615 req/s (0.35 ms) | 29,625 req/s |
| Dynamic `GET /users/:id` | **28,991 req/s** (0.34 ms) | 28,125 req/s (0.35 ms) | 29,587 req/s |

> เป็นผลการวัดบนเครื่อง local เท่านั้น ไม่ใช่ข้ออ้างประสิทธิภาพสากล — ควรวัดซ้ำบน hardware เป้าหมายก่อนตัดสินใจ deploy

---

## 21. คู่มือการย้ายโค้ด (Migration Guide)

### จาก Express
- ใน Express ต้องเรียก `res.json(data)` หรือ `res.send(text)`
- ใน Nelysia เพียงแค่ `return data` หรือส่งกลับเป็น Object ได้โดยตรง

### จาก Fastify
- Schema ใน Fastify สามารถแมปเข้ามาใช้ใน Options `{ body, params, query }` ของ Nelysia ได้ทันที
- Validation จะทำงานก่อนที่ Handler จะถูกเรียกใช้เสมอ

### จาก Elysia
- Nelysia ใช้สไตล์การเขียน Method Chaining ที่คุ้นเคยของ Elysia เช่น `.get()`, `.post()`, `.use()`, `.onBeforeHandle()` ทำให้เรียนรู้และใช้งานต่อได้ทันที

---

## 22. คู่มือปรับประสิทธิภาพ (Performance Tuning)

อยากให้ route ร้อนวิ่งบน fast path ทำตามนี้:

1. **ใช้ `getStatic()` สำหรับ response คงที่** — body ถูก serialize ครั้งเดียวตอน startup แล้ว serve เป็น bytes สำเร็จรูป
2. **handler ของ route ร้อนขอแค่ params** — `({ params }) => …` จะข้ามการ parse query/cookie/header ทันทีที่ destructure `query`/`headers`/`cookies` จะตกไป generic path (ถูก แต่ช้ากว่า)
3. **อย่าใส่ hooks/schema บน route ร้อน** — hook หรือ schema ใดๆ จะคัด route นั้นออกจาก dispatcher
4. **อ่านข้อมูลที่ใช้ GET** — มีแค่ route `GET` เท่านั้นที่ถูก compile (`HEAD` ใช้ route `GET` ผ่าน generic path)
5. **ปิดสิ่งที่ไม่ใช้** — `new Nelysia({ requestId: false })` ข้ามการสร้าง UUID และ header `x-request-id`; ไม่ใส่ `telemetry` ก็ไม่เสียค่า `performance.now()`

ตรวจสอบด้วย inspector และ router-scale:

```bash
npm run inspect -- ./src/app.ts
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts
```

ต้นทุนต่อ request จากมากไปน้อย: parse JSON body → schema validation → UUID request ID → parse cookie → parse query → dynamic lookup → static lookup วัดบนเครื่องตัวเองด้วย `benchmarks/router-scale.ts` — ตัวเลขบนเครื่อง dev ใช้ดูทิศทางเท่านั้น

---

## 23. เช็กลิสต์ Deploy ขึ้น Production

- [ ] `npm run release:check` ผ่าน (typecheck + tests Node/Bun + soak + Deno check + audit)
- [ ] ดู coverage ของ dispatcher: build แล้วอ่าน `NELY003` ใน `dist/manifest.json` — route ร้อนควรอยู่บน fast path
- [ ] ตั้ง `bodyLimit` ให้พอดี payload ใหญ่สุด; `trustedProxy: false` ไว้ trừคุม proxy เอง
- [ ] มี endpoint `/health` และต่อ `gracefulShutdown(server, timeout)` กับ `SIGTERM`
- [ ] ขยายด้วย `serveClustered()` (Node) หรือ autoscaling ของ platform; ยืนยันการ wiring `PORT` env
- [ ] Deploy ผ่าน `Dockerfile` ที่มีให้ (`docker build -t nelysia:local .`) หรือ release tarball
- [ ] รัน soak ยาว (`SOAK_ITERATIONS=1000000`) และ benchmark 10 รอบบน hardware ใกล้เคียง production ก่อนประกาศตัวเลข

---

## 24. แก้ปัญหาและ FAQ (Troubleshooting)

| อาการ | สาเหตุ | วิธีแก้ |
| :--- | :--- | :--- |
| `400 Malformed JSON body` | body ไม่ใช่ JSON ที่ถูกต้อง | แก้ payload ฝั่ง client หรือรับเป็น text |
| `400 <path> must be …` | ไม่ผ่าน schema validation | ดู field ที่ระบุใน message |
| `413 Request body is too large` | body เกิน `bodyLimit` (ค่าเริ่มต้น 1 MB) | เพิ่ม `bodyLimit` หรือ reject ตั้งแต่ต้นทาง |
| `404 Not Found` | ไม่มี route ตรง path | ดูผล `npm run inspect` |
| `405 Method Not Allowed` | มี path แต่ไม่มี method นี้ | อ่าน header `Allow` ว่าวิธีไหนใช้ได้ |
| handler `OPTIONS` ไม่ทำงาน | ตั้งใจ: `OPTIONS` ตอบ `204` + `Allow` เสมอ | อย่าพึ่ง `.options()` handler |
| `EADDRINUSE` ตอน `listen` | port ถูกใช้แล้ว (เช่น dev server ตัวอื่น) | ตั้ง `PORT` env หรือปิดตัวที่ใช้อยู่ |
| WebSocket upgrade ล้มเหลว | ไม่มี route `websocket()` สำหรับ path หรือขาด header `upgrade` | ลงทะเบียน `app.websocket(path, …)` ก่อน |
| ตัวเลข benchmark แกว่ง | noise บนเครื่อง dev | ใช้เครื่อง Linux นิ่งๆ + load generator แยก + median 10 รอบ |
| ช้าเมื่อ route เยอะ | เวอร์ชันเก่า scan ทุก route ต่อ request | อัปเกรด: เวอร์ชันปัจจุบัน lookup รอบเดียวแยกตาม method |

# คู่มือการใช้งานอย่างละเอียด Nelysia (ภาษาไทย)

> **เวอร์ชัน:** 1.2.1 (package และ GitHub Release ปัจจุบัน)
> **รันไทม์ที่รองรับ:** Bun 1.4+, Node.js 22+, และ Web Fetch Standard (Vercel, Cloudflare, Deno)  
> **ภาษา:** TypeScript / JavaScript (ESM)

เริ่มจาก [แผนผังเอกสาร](./README.md) เพื่อเลือกคู่มือ, สถานะ release หรือ
รายงาน benchmark ที่ต้องการได้เร็วขึ้น

package ปัจจุบันคือ `v1.2.1` ส่วน workspace งาน runtime parity รุ่นถัดไปอยู่ใน
[หลักฐาน Win Matrix](./benchmark-latest-readable-2026-09-16.md) และยังเป็นสถานะ
`BLOCKED` / `NO PERFORMANCE CLAIM` จนกว่าจะมีหลักฐานครบทุก release blocker

Reference แบบแยกหมวดที่เปิดอ่าน offline ได้: [versioning](./reference/versioning.md),
[route options](./core/route-options.md), [errors](./core/errors.md),
[ภาพรวม authentication](./auth/overview.md), [JWT](./auth/jwt.md),
[Better Auth](./auth/better-auth.md), [session](./auth/session.md),
[roles และ permissions](./auth/roles-permissions.md) และ [การเขียน plugin](./plugins/authoring-plugins.md)
โดยแต่ละหน้ารวมภาษาอังกฤษและไทยของ contract v1.0 ที่ freeze แล้ว การแก้ไขแบบ additive ใน v1.1.x และงาน reuse route-preflight/runtime parity ใน v1.2.1

สำหรับเส้นทาง version ตั้งแต่ v0.6 ถึง v1.0 และ public contract ที่เตรียม freeze
ให้ดู [Nelysia v1.0 Guide](./v1.0.md) ซึ่งแยกสถานะ workspace ที่ตรวจผ่านออกจาก
สถานะ package/release ที่ publish แล้วอย่างชัดเจน

ฟีเจอร์ additive หลัง v0.5.1 รวมอยู่ใน release v1.0.0 แล้ว และ v1.1.0 เพิ่มการแก้
runtime correctness/stabilization แบบไม่ทำลาย compatibility ส่วน v1.2.1 เพิ่ม
การ reuse route-preflight ของ generic Bun โดย public API ยังคง
freeze แล้ว ส่วนประวัติแผนงานอยู่ที่
[`roadmap-after-v051.md`](./roadmap-after-v051.md) โดย worktree ปัจจุบันมี
subpath สำหรับ production contract ได้แก่ `@narudom96/nelysia/session`,
`@narudom96/nelysia/roles`, `@narudom96/nelysia/csrf`,
`@narudom96/nelysia/cache` และ `@narudom96/nelysia/health` แล้ว แต่ยังคง
package line เป็น v1.2.1

ตัวอย่างที่รันได้: [basic](../examples/hello/index.ts),
[JWT](../examples/jwt/index.ts), [upload](../examples/upload/index.ts) และ
[typed client](../examples/typed-client/client.ts)

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
   - [Strict TypeScript Contracts](#strict-typescript-contracts)
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
   - [Production Subpaths](#production-subpaths)
10. [OpenAPI 3.1 และหน้าเอกสาร Redoc / Swagger UI](#10-openapi-31-และหน้าเอกสาร-redoc--swagger-ui)
    - [สร้างเอกสาร OpenAPI อัตโนมัติและ Route Metadata](#สร้างเอกสาร-openapi-อัตโนมัติและ-route-metadata)
    - [เปิดหน้าเว็บ Redoc UI (`openapiUi`)](#เปิดหน้าเว็บ-redoc-ui-openapiui)
    - [เปิดหน้าเว็บ Swagger UI (`swaggerUi`)](#เปิดหน้าเว็บ-swagger-ui-swaggerui)
    - [สร้าง TypeScript Interface สำหรับ Client](#สร้าง-typescript-interface-สำหรับ-client)
11. [ระบบ Observability & OpenTelemetry Tracing](#11-ระบบ-observability--opentelemetry-tracing)
12. [การเชื่อมต่อกับ GraphQL](#12-การเชื่อมต่อกับ-graphql)
13. [การเชื่อมต่อฐานข้อมูล (Drizzle & Prisma)](#13-การเชื่อมต่อฐานข้อมูล-drizzle--prisma)
14. [การยืนยันตัวตนด้วย Better Auth](#14-การยืนยันตัวตนด้วย-better-auth)
15. [Nelysia Client SDK (`@narudom96/nelysia/client`)](#15-nelysia-client-sdk-narudom96nelysiaclient)
16. [ระบบคอมไพเลอร์และเครื่องมือ CLI (`nelysia`)](#16-ระบบคอมไพเลอร์และเครื่องมือ-cli-nelysia)
    - [การจัดหมวดหมู่ Route (Compiled vs Specialized vs Generic)](#การจัดหมวดหมู่-route)
    - [Standalone Generation](#standalone-generation-เส้นทางที่รองรับ)
    - [คำสั่ง CLI (`inspect`, `build`)](#คำสั่ง-cli)
    - [Build Manifest และ Cache](#build-manifest-และ-cache)
17. [รันไทม์ที่รองรับและ Adapter](#17-รันไทม์ที่รองรับและ-adapter)
18. [การเชื่อมต่อกับ Full-Stack Web Frameworks](#18-การเชื่อมต่อกับ-full-stack-web-frameworks)
    - [Next.js App Router](#nextjs-app-router)
    - [Nuxt](#nuxt)
    - [SvelteKit](#sveltekit)
    - [Astro](#astro)
    - [TanStack Start](#tanstack-start)
19. [การทดสอบประสิทธิภาพและ Soak Testing (Benchmark)](#19-การทดสอบประสิทธิภาพและ-soak-testing)
20. [คู่มือการย้ายโค้ด (Migration Guide)](#20-คู่มือการย้ายโค้ด-migration-guide)
21. [คู่มือปรับประสิทธิภาพ (Performance Tuning)](#21-คู่มือปรับประสิทธิภาพ-performance-tuning)
22. [เช็กลิสต์ Deploy ขึ้น Production](#22-เช็กลิสต์-deploy-ขึ้น-production)
23. [แก้ปัญหาและ FAQ (Troubleshooting)](#23-แก้ปัญหาและ-faq-troubleshooting)

---

## 1. บทนำและสถาปัตยกรรม

**Nelysia** คือ TypeScript Backend Framework รุ่นใหม่ที่ออกแบบภายใต้แนวคิด **Compiler-First** สำหรับรันไทม์ยุคใหม่อย่าง Bun และ Node.js (รวมถึง Cloudflare Workers, Vercel Edge, และ Deno) โดยมีหัวใจหลักคือความเร็วสูงสุด ความเรียบง่ายในการพัฒนา (Ergonomic DX) และการรักษาความเสถียรของหน่วยความจำในระดับฮาร์ดแวร์

---

### 10 จุดแข็งเชิงสถาปัตยกรรมของ Nelysia

#### 1. โมเดลการทำงาน 3 Lane พร้อม fast-path (AOT)
Nelysia วิเคราะห์ Route ทั้งหมดล่วงหน้าตั้งแต่เปิดเซิร์ฟเวอร์ แล้วจัดเข้า 3 public execution lane ตามพฤติกรรมที่พิสูจน์ได้:
- **`COMPILED`**: มี subtier ภายในคือ `static-prebuilt` จาก `getStatic()` และ `static-sync` จาก `.get()` แบบไม่มี argument ที่รองรับ
- **`SPECIALIZED`**: route มี param เช่น `/users/:id` และดึงค่าตรงจาก URL
- **`GENERIC`**: route ที่มี middleware, validation, body parsing หรือ behavior ที่ไม่รองรับ ใช้ full pipeline

ผลลัพธ์: แต่ละ Request ใช้พลังงานพอดีกับสิ่งที่ต้องการ ไม่เปลือง ไม่เสียเวลา

สัญญา Hybrid AOT ปัจจุบันใช้ lane แบบ conservative: compiled dispatcher มี
priority เมื่อ compiler IR และ function table พิสูจน์ behavior ได้, specialized
ใช้ immutable data plan ต่อ route และ behavior ที่ไม่รู้แน่หรือ dynamic จะ
fallback ไป generic reference pipeline เสมอ ไม่มีการใช้ runtime `eval()` หรือ
`new Function()` เพื่อประเมิน source ของผู้ใช้ การเปลี่ยน composition ใช้
internal version เพื่อ invalidate plan และ Bun, Node, Fetch ใช้ sync/async
executor contract เดียวกัน

#### 2. 95,173 req/s — parity snapshot กับ Raw Bun
compatibility snapshot ที่บันทึกไว้ 10 รอบวัด Bun static JSON ได้ **95,173 req/s** ที่ concurrency 50
เทียบ Raw `Bun.serve` ที่ **95,306 req/s** และไม่มี request ล้มเหลว รายงานเก็บ
รอบก่อน ๆ ไว้ให้ดู variance ด้วย ส่วนตัวเลข TechEmpower plaintext เดิมเป็น
historical snapshot เพราะใช้ harness คนละชุด

#### 3. V8 ไม่เบรก ไม่สะดุด (Monomorphic IC)
Framework อื่นมักยัดข้อมูลลง Context ด้วย `.decorate()` ซึ่งเปลี่ยน Shape ของ Object ทำให้ V8 ต้องออกจากโหมดเร็วไปโหมดช้า (De-opt)

Nelysia ใช้ `context.store` แทน — Shape คงที่ตลอด V8 Cache ทำงานเต็มสปีด JIT ไม่เบรกหนีแม้แต่ครั้งเดียว

#### 4. Node.js + Bun แท้ ไม่ต้องลง Polyfill
- **Node.js 22+**: ใช้ `node:http` แท้ รัน TypeScript ได้เลยโดยไม่ต้อง build ผ่าน `--experimental-strip-types`
- **Bun 1.4+**: ใช้ `Bun.serve` ตรง ดึงพลัง SIMD และ Zero-Copy I/O ได้เต็มสูบ

ไม่มี Polyfill กวนใจ ไม่มี Adapter ซ้อน ทั้งสองรันไทม์เป็น First-Class Citizen

#### 5. Multi-Core ในตัว ไม่ต้องลง PM2
เรียก `serveClustered(app, { instances: 'max' })` ปุ๊บ ทุก CPU Core ของเครื่องมาช่วยกันรับโหลดทันที พร้อม Graceful Drain — request ที่ค้างอยู่จะเสร็จก่อน แล้วค่อยปิด Process ไม่มี connection ขาดกลางอากาศ

#### 6. Zod, Valibot, ArkType — เสียบใช้ได้เลย
มี Schema Builder น้ำหนักเบา `t` ในตัวโดยไม่มี dependency. หรือจะใช้ **Zod**, **Valibot**, หรือ **ArkType** ที่คุ้นเคยก็ได้ — ผ่าน Standard Schema v1 เสียบแล้วรัน ไม่ต้องมีปลั๊กอินแปลง ไม่มี Overhead เสริม

#### 7. หน้า API Docs สวยๆ ที่ `/docs` สร้างเอง
Route และ Schema ถูกแปลงเป็น **OpenAPI 3.1** โดยอัตโนมัติ พร้อมหน้าเว็บ **Redoc** และ **Swagger UI** ให้เลือกใช้ที่ `/docs` — เปิดแล้วทดสอบ API ในเบราว์เซอร์ได้ทันที ไม่ต้องตั้งค่าเพิ่มเลย

#### 8. Frontend พิมพ์ผิดไม่ได้แล้ว (Type-Safe Client SDK)
`@narudom96/nelysia/client` ส่ง Type ทุก Route, Param, Body, Query, และ Response จาก Server ไปยัง Frontend ครบ 100% — กด Tab มี Autocomplete เด้งทันทีใน VS Code ไม่พิมพ์ Endpoint ผิดอีก

#### 9. เกราะป้องกัน Production ครบในกล่อง
ทุกอย่างอยู่ในตัว ไม่ต้องหาปลั๊กอินเพิ่ม:
- `cors()`: จัดการ CORS Preflight อัตโนมัติ
- `securityHeaders()`: ใส่ OWASP Security Headers ในคำสั่งเดียว
- `rateLimit()`: ป้องกันการยิงถล่ม ด้วย Sliding-Window
- `staticDirectory()`: เสิร์ฟไฟล์ Static พร้อมการ์ดป้องกัน Path Traversal
- `compression()`: บีบอัดข้อมูล Gzip/Deflate อัตโนมัติ

#### 10. Cloud Runtime Integrations
- **Database & Auth**: เชื่อม **Drizzle ORM**, **Prisma**, และ **Better Auth** ได้เลยตามเอกสาร
- **Edge Deployment**: Deploy บน Cloudflare Workers, Vercel Edge, และ Deno ในขั้นตอนเดียว

---


## 2. ข้อกำหนดและการติดตั้ง

### ข้อกำหนดของระบบ
- **Node.js**: เวอร์ชัน `v22.0.0` ขึ้นไป (รองรับการตัด type แบบ native ผ่าน `--experimental-strip-types`)
- **Bun**: เวอร์ชัน `v1.4.0` ขึ้นไป (สำหรับผู้ที่ต้องการประสิทธิภาพระดับสูงสุด)
- **TypeScript**: `v5.0+`

### การเรียกใช้ Packages (หลัง Build แพ็กเกจ)

ซอร์สโค้ดอยู่ใน `packages/*/src/*.ts` เมื่อสั่ง `npm run package:build` จะได้ไฟล์ JavaScript พร้อม Type Declaration ใน `dist-package/` และ `exports` ใน `package.json` จะชี้ไปที่ไฟล์ที่ build แล้ว:

สามารถ import compiler helpers จาก `@narudom96/nelysia/compiler` และ Bun server adapter จาก `@narudom96/nelysia/runtime-bun` ได้โดยตรง

```json
{
  "exports": {
    ".": "./dist-package/packages/core/src/index.js",
    "./plugins": "./dist-package/packages/plugins/src/index.js",
    "./observability": "./dist-package/packages/observability/src/index.js",
    "./runtime-fetch": "./dist-package/packages/runtime-fetch/src/server.js",
    "./runtime-node": "./dist-package/packages/runtime-node/src/server.js",
    "./runtime-bun": "./dist-package/packages/runtime-bun/src/server.js",
    "./runtime-node-cluster": "./dist-package/packages/runtime-node/src/cluster.js",
    "./graphql": "./dist-package/packages/integrations-graphql/src/index.js",
    "./drizzle": "./dist-package/packages/integrations-drizzle/src/index.js",
    "./prisma": "./dist-package/packages/integrations-prisma/src/index.js",
    "./better-auth": "./dist-package/packages/integrations-better-auth/src/index.js",
    "./runtime-vercel": "./dist-package/packages/runtime-vercel/src/index.js",
    "./runtime-cloudflare": "./dist-package/packages/runtime-cloudflare/src/index.js",
    "./compiler": "./dist-package/packages/compiler/src/index.js",
    "./openapi": "./dist-package/packages/openapi/src/index.js",
    "./client": "./dist-package/packages/client/src/index.js",
    "./jwt": "./dist-package/packages/jwt/src/index.js",
    "./upload": "./dist-package/packages/upload/src/index.js",
    "./logger": "./dist-package/packages/logger/src/index.js",
    "./timeout": "./dist-package/packages/timeout/src/index.js",
    "./session": "./dist-package/packages/session/src/index.js",
    "./roles": "./dist-package/packages/roles/src/index.js",
    "./csrf": "./dist-package/packages/csrf/src/index.js",
    "./cache": "./dist-package/packages/cache/src/index.js",
    "./health": "./dist-package/packages/health/src/index.js"
  }
}
```

> ระหว่างพัฒนาใน monorepo นี้ให้ import จาก path ต้นฉบับ เช่น `../../packages/core/src/index.ts` โดยตรง

---

## 3. เริ่มต้นใช้งานอย่างรวดเร็ว

สำหรับแอปพลิเคชัน production แนะนำให้จัดโค้ดตาม feature ดู [คู่มือ Feature Modules และ Composition](./feature-modules.md) สำหรับขอบเขตของ module, service, model, plugin และการทดสอบ

### สร้างไฟล์ `src/app.ts`

> **คำแนะนำ:** ควร `export const app` เสมอ เพื่อให้ตัว CLI และคอมไพเลอร์สามารถนำแอปไปวิเคราะห์ Route หรือ Build เป็น Bundle ได้โดยไม่เริ่มรัน Port ค้างไว้

```ts
import { Nelysia } from "@narudom96/nelysia"

export const app = new Nelysia()
  .get("/", ({ html }) => html("<h1>สวัสดีจาก Nelysia v1.0.0!</h1>"))
  .get("/users/:id", ({ params, query }) => ({
    id: params.id,
    filter: query.filter ?? "default",
    timestamp: Date.now()
  }))

// สั่งเปิดเซิร์ฟเวอร์พร้อม Callback แสดง URL
if (import.meta.main || process.env.NODE_ENV !== "test") {
  app.listen(3000, ({ port, url }) => {
    console.log(`Nelysia กำลังทำงานที่ ${url} (port ${port})`)
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
# ผลลัพธ์: <h1>สวัสดีจาก Nelysia v1.0.0!</h1>

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

  // Metadata ที่จะสืบทอดไปยังทุก Route ของ application นี้ (ใส่หรือไม่ใส่ก็ได้)
  routeOptions: {
    timeout: 5_000,
    cache: false
  },

  // การตรวจจับ Telemetry ระดับ Global
  telemetry: {
    onRequest(ctx) { console.log(`Request เข้ามา: ${ctx.request.method} ${ctx.request.url}`) },
    onResponse(ctx, res) { console.log(`ส่งผลลัพธ์: Status ${res.status}`) },
    onError(ctx, err) { console.error(`เกิด Error:`, err) }
  }
})
```

`routeOptions` คือค่าเริ่มต้นระดับ application สำหรับ route metadata โดย
ตัวเลือกของ group และ route จะถูกใช้ทับตามลำดับ application → parent group →
child group → route ค่าที่ใกล้ที่สุดชนะ object จะ merge แบบ shallow, array จะ
แทนค่าก่อนหน้า และ `false` ใช้ปิด feature ที่สืบทอดมา แต่ยังต้อง register
provider ด้วย `.use(...)` ก่อนจึงจะเปิดใช้ feature ที่มีชื่อได้

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

> **พฤติกรรมของ OPTIONS:** ถ้าลงทะเบียน `app.options(path, handler)` ไว้ handler นี้
> จะทำงานก่อน หากไม่มี explicit OPTIONS route จึงใช้ fallback อัตโนมัติ โดย path ที่ตรง
> จะตอบ `204` พร้อม header `Allow` ที่ลิสต์ method ที่ลงทะเบียนไว้ (บวก `HEAD` สำหรับ
> route `GET`) และ path ที่ไม่ตรงจะตอบ `404`

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
  stop(): void | Promise<void> // ตัวช่วยหยุด Server แบบมาตรฐาน
}
```

ตัวอย่างการเรียกใช้งาน:

```ts
// 1. ระบุเฉพาะ Port
app.listen(3000, ({ port, url }) => {
    console.log(`เซิร์ฟเวอร์เริ่มทำงานแล้วที่ ${url} (port ${port})`)
})

// 2. หรือระบุทั้ง Port และ Hostname
app.listen({ port: 8080, hostname: "0.0.0.0" }, ({ url }) => {
    console.log(`พร้อมรับการเชื่อมต่อจากทุก Network Interface: ${url}`)
})
```

### กลไก Plugin (`use`) และขอบเขต Lifecycle

สำหรับ Plugin callback, `use()` รับฟังก์ชัน `(app) => app | void`:

```ts
// Plugin = factory รับ config แล้วคืน (app) => app
const myPlugin = (opts: { tag: string }) => (app: Nelysia) =>
  app.onBeforeHandle(({ headers, response }) => {
    if (!headers.has("x-tag")) return response(401, { error: opts.tag })
  })

app.use(myPlugin({ tag: "missing-tag" }))
```

สำหรับ routing module แนะนำให้ใช้ `.mount(prefix, subApp)` หรือ
`.mountLazy(prefix, loader)` ส่วนรูปแบบเดิม `.use(subApp)` ยังรองรับอยู่
เพื่อให้แอปเดิมยังทำงานได้แบบ backward-compatible

กฎขอบเขตที่ต้องจำ:
- Hook ที่เพิ่มเข้า parent (ก่อนหรือหลัง `mount`) มีผลกับ route ของ parent เองทั้งหมด — รวมถึง route ที่ลงทะเบียนไว้ก่อนแล้ว (backfill)
- Route ที่ `mount` หรือสร้างผ่าน `group` เก็บ lifecycle `before/after/error` ของตัวเองไว้ ไม่รั่วไป route ข้างเคียง และ hook ของ parent ที่เพิ่มทีหลังไม่ย้อนมาติด
- Route ซ้ำ method+path ตอน mount จะ throw `Duplicate route`
- ไม่มี deduplication — เรียก `use()` ซ้ำจะลงทะเบียนซ้ำ

Lifecycle ทุกประเภทกำหนด scope ได้เหมือนกัน: `local` อยู่กับ module เจ้าของ,
`scoped` ติดตาม subtree ที่ถูก mount และ `global` กระจายไปทั้ง application
ค่าเริ่มต้นยังคง behavior เดิมเพื่อ compatibility. `.lazy()` จะเลื่อนการเรียก
loader จนกว่าจะ await module boundary และ `.mountLazy(prefix, loader)` ใช้กับ
sub-app ที่มี prefix; `.use(Promise)` แบบเดิมยังใช้ได้

```ts
const Order = t.Object({ id: t.String() })
const Unauthorized = t.Object({ error: t.String() })
const app = new Nelysia()
  .onBeforeHandle({ as: "global" }, () => undefined)
  .lazy(() => import("./feature.ts").then(({ app }) => app))
  .mountLazy("/admin", () => import("./admin.ts").then(({ app }) => app))
```

### การทดสอบแบบ Zero-Port ด้วย `app.inject()`

Nelysia มีฟังก์ชัน `app.inject()` ในตัว สำหรับการเขียน Unit และ Integration Tests โดยตรงในหน่วยความจำ โดย**ไม่ต้องเปิด Network Port จริง**:

```ts
const res = await app.inject({
  method: "GET",
  path: "/users/42",
  query: { filter: "active" }
})

console.log(res.statusCode) // 200
console.log(await res.json()) // { id: "42", filter: "active" }
console.log(await res.text()) // ข้อมูลในรูปแบบข้อความ
console.log(await res.bytes()) // Uint8Array
```

เมื่อ app มี route map แบบ typed แล้ว `inject()` จะตรวจ method/path และ
`injectTyped()` จะ infer response ตาม route ที่เลือก:

```ts
const typed = new Nelysia()
  .get("/users/:id", ({ params }) => ({ id: params.id }))

const response = await typed.injectTyped({ method: "GET", path: "/users/42" })
const user = await response.json() // { id: string }
```

ถ้าต้องการส่ง route pattern โดยตรง สามารถส่ง `params` ที่มี type ตาม route ได้
ระบบจะขยาย URL ก่อน match และรูปแบบเดิมที่ส่ง path จริงยังใช้ได้เหมือนเดิม:

```ts
const response = await typed.injectTyped({
  method: "GET",
  path: "/users/:id",
  params: { id: "42" }
})
```

ใช้ `injectUntyped()` เฉพาะกรณีที่ต้องการ escape hatch สำหรับ test ที่ไม่ใช้
route map

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
  auth?: unknown                           // Auth payload; auth plugin จะช่วยกำหนด type
  signal: AbortSignal                      // Signal สำหรับยกเลิกหรือกำหนด deadline
  logger?: Logger                          // เพิ่มโดย logger plugin
  files?: Record<string, UploadedFile[]>   // เพิ่มโดย upload plugin
  setCookie(name: string, value: string, options?: CookieOptions): void
  deleteCookie(name: string, options?: CookieOptions): void
  response(body: unknown, options?: ResponseOptions): ResponseData
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
  html(body: string, status?: number): ResponseData
  text(body: string, status?: number): ResponseData
  json(body: unknown, status?: number | ResponseOptions): ResponseData
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

ในเวอร์ชัน v0.1.3+ `context.store` เป็น Dictionary ระดับ Request สำหรับส่งผ่านข้อมูลระหว่าง Lifecycle Hooks (`onBeforeHandle`, Route Handler, `onAfterHandle`) ค่าใน `state(name, value)` จะถูก copy เข้า store ของ request นั้น การแก้ store ของ request หนึ่งจะไม่เปลี่ยน request ถัดไป หากต้องการข้อมูลที่อยู่ข้าม request/process ให้ใช้ external store:

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

รูปแบบ body-first เป็น additive และรูปแบบ positional เดิมยังใช้ได้:

```ts
import { error } from "@narudom96/nelysia"

app.get("/created", ({ response }) => response(
  { created: true },
  { status: 201, headers: { "x-source": "nelysia" } }
))

app.get("/missing", () => {
  throw error(404, { code: "NOT_FOUND" })
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

### Strict TypeScript Contracts

Generic สาธารณะของ `Nelysia` มีค่าเริ่มต้นเป็น `{}` ไม่ใช่ `any` และ
`Context`/`RouteOptions` ไม่มี index signature กว้าง จึงช่วยจับ typo ตั้งแต่
ตอน compile ส่วน key ของ Macro จะถูกเพิ่มเข้า route options หลังประกาศ Macro
แล้วเท่านั้น:

```ts
const app = new Nelysia()
  .macro({ cache: { beforeHandle: () => undefined } })
  .get("/users", () => [], { cache: true })

app.get("/strict", () => "ok", {
  // @ts-expect-error: `parmas` ไม่ใช่ route option ที่ประกาศไว้
  parmas: {}
})
```

Authentication package จะเพิ่มชื่อ strategy ให้ `AuthStrategyRegistry` ผ่าน
module augmentation โดย JWT จะลงทะเบียน `jwt` ให้เอง ดังนั้น `auth: "jwt"`,
`auth: true` และ `{ strategy: "jwt" }` จึงมี type รองรับทั้งหมด ส่วน string
strategy แบบ legacy ที่กำหนดเองยังรับได้ใน v0.x แต่ประกาศ deprecated แล้ว

`derive()` และ `resolve()` ยังคงเป็น alias สำหรับเพิ่ม context แบบ sync/async:

```ts
const app = new Nelysia()
  .derive(() => ({ requestStartedAt: Date.now() }))
  .resolve(async ({ requestStartedAt }) => ({
    elapsedAtResolve: Date.now() - requestStartedAt
  }))

app.get("/timing", ({ requestStartedAt, elapsedAtResolve }) => ({
  requestStartedAt,
  elapsedAtResolve
}))
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

### Production Subpaths

โมดูลเหล่านี้เป็น composable plugin แบบ opt-in หากไม่เรียกใช้ plugin จะไม่มี
การสร้าง store หรือ hook ของโมดูลนั้นเพิ่มเข้า application

```ts
import { session } from "@narudom96/nelysia/session"
import { roles, requireRole } from "@narudom96/nelysia/roles"
import { csrf } from "@narudom96/nelysia/csrf"
import { cache } from "@narudom96/nelysia/cache"
import { health } from "@narudom96/nelysia/health"
import { logger } from "@narudom96/nelysia/logger"
import { timeout } from "@narudom96/nelysia/timeout"
import { upload } from "@narudom96/nelysia/upload"

const app = new Nelysia()
  .use(session<{ userId: string }>({ ttlSeconds: 3600 }))
  .use(roles({
    resolveRoles: ({ auth }) => {
      const role = (auth as { role?: string } | undefined)?.role
      return role ? [role] : []
    },
    permissions: { "users:read": ["admin"] }
  }))
  .use(csrf())
  .use(cache({ ttlMs: 30_000 }))
  .use(logger({ level: "info" }))
  .use(timeout({ timeoutMs: 5_000 }))
  .use(health({ checks: { database: async () => true } }))
  .use(upload({ maxFileSize: 2 * 1024 * 1024, maxFiles: 1 }))
  .onBeforeHandle(requireRole("admin"))
  .post("/upload", ({ files }) => files)
```

สัญญาและข้อจำกัด:

- `session()` มี `context.session.get/set/destroy`; memory store เริ่มต้นเป็น
  store ภายใน process เดียว หากรันหลาย process ให้ใช้ `SessionStore` ของระบบเอง
- `roles()` เพิ่ม `context.permissions` แบบ typed และ `requireRole()` จะตอบ
  `403` เมื่อไม่มี role ที่ต้องการ
- `csrf()` จะออก cookie ให้ safe methods และตรวจ header ที่ตั้งค่าไว้กับ unsafe
  methods ใช้ `exclude()` สำหรับ endpoint ที่ตั้งใจเปิดสาธารณะ
- `cache()` cache เฉพาะ `GET` ที่สำเร็จ เพิ่ม weak ETag และตอบ `304` เมื่อ
  `If-None-Match` ตรงกัน โดย contract memory นี้ไม่ cache native `Response`/stream
- `health()` มี `/health` และ `/ready` เป็นค่าเริ่มต้น รัน named checks และตอบ
  degraded หรือ `503` สำหรับ readiness ที่ไม่พร้อม
- `upload()` รับ Web `FormData`/`File` จำกัดขนาด จำนวนไฟล์ และ field พร้อม
  memory/disk/custom storage; หาก storage ล้มเหลวจะ cleanup ไฟล์ที่บันทึกไปแล้ว
- `logger()` เพิ่ม `context.logger` แบบ typed ตั้ง level/sink ได้ และ redact
  authorization, cookie, secret, token, password และ API key เป็นค่าเริ่มต้น
  ความล้มเหลวของ sink จะไม่เปลี่ยนผลลัพธ์ของ request
- `timeout()` เพิ่ม deadline ผ่าน `context.signal` ค่าเริ่มต้น `504` และ clear
  timer ทุกเส้นทางการจบงาน แต่ไม่สามารถหยุด synchronous JavaScript ที่กำลังรันอยู่ได้

### Unified route metadata และ Provider

Route และ group ใช้ metadata contract ชุดเดียวกัน ต้อง register provider ก่อน
ประกาศ feature และจะไม่มีการเปิดใช้ feature โดยอัตโนมัติ:

```ts
const app = new Nelysia()
  .use(jwt<{ sub: string }>({ secret: process.env.JWT_SECRET! }))
  .use(rateLimit({ limit: 100, windowMs: 60_000 }))
  .use(cache())
  .use(timeout({ timeoutMs: 5_000 }))
  .post("/orders/:id", ({ auth }) => ({ id: auth.sub }), {
    auth: { strategy: "jwt", role: "user", permissions: ["orders:write"] },
    response: { 201: Order, 401: Unauthorized },
    rateLimit: "20/min",
    timeout: 5_000,
    cache: false
  })
```

ลำดับการสืบทอดคือ application → parent group → child group → route โดยค่าที่
ใกล้ที่สุดชนะ object จะ merge แบบ shallow ส่วน array/permission จะแทนค่าก่อนหน้า
และ `false` ใช้ปิด feature ที่สืบทอดมา ถ้า auth หรือ feature provider ที่ระบุชื่อ
ยังไม่ได้ register ระบบจะ fail ตอน registration พร้อม method, path และชื่อ feature
Route ที่ไม่มี metadata จะไม่สร้าง guard, timer, parser หรือ store ของ provider นั้น
เมื่อ authentication ไม่ผ่านจะตอบ `401` และเมื่อ role/permission ไม่ผ่านจะตอบ `403`

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

หาก Route มี Response ได้หลาย Status ให้ใช้ `responses` โดย `response` เดิมยังเป็น Contract ของ Status `200` ส่วน key ใช้ได้ทั้งตัวเลขและข้อความ และ Model ที่ตั้งชื่อจะถูกสร้างเป็น OpenAPI `$ref` อัตโนมัติ:

```ts
app.post("/users", ({ response }) => response(201, { id: "1" }), {
  responses: {
    201: "User",
    422: t.Object({ error: t.String() })
  }
})
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

สำหรับ observability ระดับ phase ให้กำหนด `telemetry.onEvent` ซึ่งจะได้รับ event `request.start`, `route.matched`, `parse`, `handler`, `response`, `error` และ `after.response` พร้อม request ID, route, status (ถ้ามี) และเวลาที่ใช้ หาก observer มี error จะไม่ทำให้ response ของ application เปลี่ยนแปลง

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

## 14. ระบบยืนยันตัวตน (Authentication: JWT & Better Auth)

### 14.1 โมดูล JWT ทางการ (`@narudom96/nelysia/jwt`)

Nelysia มาพร้อมกับโมดูล JWT อย่างเป็นทางการที่พัฒนาด้วย **Native Web Crypto API (HMAC-SHA256)** โดยไม่มี External Dependency ภายนอก และยึดหลัก **Pay Only For What You Use**:
- **0 Auth Overhead**: Route ทั่วไปที่ไม่ได้ประกาศ `{ auth: "jwt" }` จะไม่มีการแตะ `Authorization` header หรือเสีย CPU cycle ใดๆ เลย
- **Fast-Verify Path**: Route ที่กำหนด `{ auth: "jwt" }` จะถูกตรวจสอบผ่าน pre-imported `CryptoKey` ในระดับความเร็วสูงทันทีก่อนส่งต่อไปยัง handler
- **Auto 401 Rejection**: หากไม่มี Token, Token ผิดรูปแบบ หรือ Token หมดอายุ ระบบจะตอบกลับ `401 Unauthorized` ทันที
- **Strict Algorithm**: รองรับเฉพาะ `HS256` เท่านั้น และปฏิเสธ `none`, algorithm confusion, token segment ที่ผิดรูป, signature ที่ไม่ถูกต้อง และ JSON ที่ parse ไม่ได้
- **Optional Claims**: ตั้งค่า `issuer` และ `audience` ได้โดยไม่เปลี่ยน behavior เดิมเมื่อไม่ระบุ และระบบจะตรวจ `exp` กับ `nbf` เมื่อมีอยู่ใน token

```ts
import { Nelysia } from "@narudom96/nelysia"
import { jwt, signJwt, verifyJwt } from "@narudom96/nelysia/jwt"

const app = new Nelysia()
  .use(jwt({
    secret: process.env.JWT_SECRET || "super-secret-key",
    expiresIn: 3600 // หมดอายุใน 1 ชั่วโมง (วินาที)
  }))
  // 1. Public route: Zero overhead, ไม่มี auth hook มารบกวน
  .get("/public", () => ({ status: "open" }))

  // 2. Protected route: ดึง payload จาก context.auth
  .get("/profile", ({ auth }) => ({
    status: "authenticated",
    user: auth
  }), { auth: "jwt" })

  // 3. Login endpoint: สร้าง token ด้วย signJwt
  .post("/login", async ({ body }) => {
    const token = await signJwt({ sub: "user-123", role: "admin" }, process.env.JWT_SECRET!, { expiresIn: 3600 })
    return { token }
  })
```

### 14.2 การยืนยันตัวตนด้วย Better Auth (`@narudom96/nelysia/better-auth`)

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

สามารถกำหนด type ของ JWT claims ได้โดยไม่เปลี่ยน runtime contract:

```ts
type Claims = { sub: string; role: "admin" | "user" }
const secured = new Nelysia()
  .use(jwt<Claims>({ secret: process.env.JWT_SECRET! }))
  .get("/me", ({ auth, jwt }) => ({ subject: auth?.sub }), { auth: "jwt" })
```

---

## 15. Nelysia Client SDK (`@narudom96/nelysia/client`)

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

หากสร้าง route map ด้วย `generateClientTypes(app)` สามารถใช้ `createTypedClient<Routes>()` เพื่อจำกัด path และ infer response จาก route ได้:

```ts
import { createTypedClient } from "@narudom96/nelysia/client"
import type { NelysiaRoutes } from "./nelysia-routes"

const api = createTypedClient<NelysiaRoutes>("http://localhost:3000")
const result = await api.get("/users/1")
```

หรือให้ client อ่าน route map จาก app โดยตรง:

```ts
const typedClient = createClient<typeof app>("http://localhost:3000")
const result = await typedClient.get("/users/1")
// path, params, body, query, headers, response และ errors ถูกตรวจให้
```

หากต้องการสร้างไฟล์ route map แบบ reproducible ให้ใช้ CLI ซึ่งจะ await
`app.modules` และไม่ bind port:

```sh
nelysia client src/app.ts --out src/generated/nelysia-client.ts
nelysia client src/app.ts --out src/generated/nelysia-client.ts --force
```

---

## 16. ระบบคอมไพเลอร์และเครื่องมือ CLI (`nelysia`)

### การจัดหมวดหมู่ Route
เมื่อผ่านคอมไพเลอร์ Route แต่ละเส้นทางจะถูกวิเคราะห์เป็น 3 public execution lane:
1. **`COMPILED`**: มี subtier ภายใน `static-prebuilt` และ `static-sync` สำหรับ response ที่พิสูจน์ได้
2. **`SPECIALIZED`**: สำหรับเส้นทางที่มี Parameter แต่ไม่ต้องใช้ Cookie/Query
3. **`GENERIC`**: สำหรับเส้นทางที่มี Middleware, schema, custom serializer หรือ behavior ที่คอมไพเลอร์สร้างไม่ได้ โดยจะ fallback พร้อม diagnostic

### Standalone Generation (เส้นทางที่รองรับ)

เมื่อ handler, lifecycle และ schema definition ของ route สามารถฝังได้อย่างปลอดภัย คอมไพเลอร์จะสร้าง **standalone source-to-source server** โดยไม่ import development router รองรับทุก HTTP method, path parameter, wildcard, body/query/header validation, response serialization, headers, HEAD, OPTIONS, 405 และ route error handler:

- Static route จะ pre-serialize body ไว้ล่วงหน้าและ serve ผ่าน `Response.clone()` ที่เร็วที่สุด
- Dynamic route แบบ `/users/:id` จะ match prefix ตรงๆ และดึง param จาก URL โดยไม่ split array
- Route ที่ไม่เข้าเงื่อนไขจะ fallback ไปใช้ adapter พร้อม diagnostic ที่ระบุ method, path และสาเหตุ โดยใช้ code คงที่ เช่น `NELY101` (method), `NELY102` (request lifecycle), `NELY103` (response lifecycle), `NELY104` (schema), `NELY105` (opaque handler), `NELY106`–`NELY111` สำหรับ context/module/native response/stream/WebSocket/runtime dependency และ `NELY112`–`NELY115` สำหรับ application context values, static value ที่ replay ไม่ได้, application option ที่ต้องใช้ runtime และ lifecycle ที่ฝังใน artifact ไม่ได้

> ข้อจำกัดที่ตั้งใจไว้: handler ที่พึ่งพา closure, platform object หรือ integration แบบ opaque จะ fallback ไป generic runtime — ดู diagnostics ใน manifest

### Adapter Dispatcher (Fast Path ค่าเริ่มต้น)

แม้ไม่ build แบบ standalone adapter ของ Node, Bun และ Fetch ก็ serve route `GET` ที่ไม่มี hook ผ่าน compiled dispatcher ตัวกลาง (`packages/compiler/src/dispatcher.ts`): static hit แบบ O(1) ด้วย payload ที่ serialize ล่วงหน้า, static zero-arg ผ่าน `static-sync`, dynamic lookup แยกตาม method ที่ split pathname ครั้งเดียว, prefix matching สำหรับ route แบบ `/users/:id` และ generated validation สำหรับ built-in params/query/header/response schema ที่เป็น deterministic ส่วน body schema, Standard Schema/custom behavior, hook, method อื่น และ telemetry จะ fallback ไป generic router เสมอ manifest บันทึกด้วย `dispatcher: true`, diagnostic `NELY002` สำหรับ generated schema และ `NELY003` สำหรับ coverage

### คำสั่ง CLI
```bash
# ตรวจสอบการวิเคราะห์ Route ทั้งหมด
npm run inspect -- ./src/app.ts

# คอมไพล์และสร้าง Entrypoint เฉพาะสำหรับ Bun
npm run build -- ./src/app.ts --target bun

# คอมไพล์และสร้าง Entrypoint เฉพาะสำหรับ Node.js
npm run build -- ./src/app.ts --target node
```

คำสั่ง DX เพิ่มเติม:

```bash
nelysia routes ./src/app.ts   # method, path, lane และ compiler reason
nelysia doctor ./src/app.ts   # runtime, TypeScript, exports, duplicate routes
nelysia create my-api         # สร้าง project scaffold
nelysia dev ./src/app.ts --port 3000
```

ผลลัพธ์จากการสั่ง Build จะถูกบันทึกไว้ในโฟลเดอร์ `dist/`:
- `dist/server.bun.ts` (หรือ `dist/server.node.ts`): โค้ดเซิร์ฟเวอร์ที่ปรับแต่งประสิทธิภาพแล้ว
- `dist/server.bun.ts.map` (หรือ `dist/server.node.ts.map`): source map ของ artifact
- `dist/manifest.json`: สรุป target, artifact, route analyses, diagnostics (`NELY001`/`NELY003` และ reason codes `NELY101`–`NELY115`), `generation` (`standalone`|`adapter`), `dispatcher` (flag บอก fast-path coverage), `reproducible: true` และ content-addressed `cacheKey`
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
//   "GET /users": { response: User }
//   ...
// }
```

---

## 17. รันไทม์ที่รองรับและ Adapter

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

## 18. การเชื่อมต่อกับ Full-Stack Web Frameworks

คุณสามารถนำ Nelysia ไปใช้เป็น Backend API ภายใน Full-stack Frameworks ยอดนิยมได้ผ่าน `createFetchHandler`:

### Next.js (App Router: `app/api/nelysia/route.ts`)
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
import { defineEventHandler, toWebRequest } from "h3"

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

const fetchHandler = createFetchHandler(app)
// Astro endpoint รับ APIContext จึงส่ง request มาที่ Fetch handler
export const GET = ({ request }: { request: Request }) => fetchHandler(request)
export const POST = ({ request }: { request: Request }) => fetchHandler(request)
```

### TanStack Start (`src/routes/api/nelysia.ts`)
```ts
import { createFileRoute } from "@tanstack/react-router"
import { createFetchHandler } from "@narudom96/nelysia/runtime-fetch"
import { app } from "@/server/app"

const fetchHandler = createFetchHandler(app)
export const Route = createFileRoute("/api/nelysia")({
  server: { handlers: { GET: ({ request }) => fetchHandler(request) } }
})
```

### Fixture ที่รันได้จริงและวิธีตรวจสอบ

ตัวอย่างทั้ง 5 ตัวมี `package.json` ของ framework จริง, route `/api/nelysia`,
และถูกตรวจด้วย production build พร้อม HTTP smoke จาก dev server:

| Framework | โฟลเดอร์ | Bridge หลัก | หลักฐานการตรวจสอบ |
| :--- | :--- | :--- | :--- |
| Astro | `examples/astro` | endpoint method รับ `APIContext.request` | build + HTTP smoke |
| Next.js | `examples/nextjs` | export `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS` | build + HTTP smoke |
| Nuxt/Nitro | `examples/nuxt` | `toWebRequest(event)` แปลง H3/Nitro event | Nitro build + HTTP smoke |
| SvelteKit | `examples/sveltekit` | `RequestEvent.request` | build + HTTP smoke |
| TanStack Start | `examples/tanstack-start` | server handler รับ `{ request }` | build + HTTP smoke |

ติดตั้ง dependency ของแต่ละ fixture แล้วรัน ecosystem gate จาก root:

```bash
for fixture in astro nextjs nuxt sveltekit tanstack-start; do
  (cd "examples/$fixture" && npm install)
done
npm run framework:check
```

คำสั่งนี้จะ build ทุก fixture และยิง `GET /api/nelysia` ผ่าน server จริงของแต่ละ
framework ให้ผล `200` และตรวจ response runtime ที่ถูกต้องด้วย ขอบเขตของ bridge
คือ Fetch `Request`/`Response`; ส่วน SSR, cache, WebSocket, cookie/streaming
policy และ deployment binding ยังขึ้นกับการตั้งค่าของ framework/platform นั้น ๆ

---

## 19. การทดสอบประสิทธิภาพและ Soak Testing

### สัญญา production ใน v0.5.0 (รวมอยู่ใน package v0.5.1)

workspace v0.5.0 เพิ่ม JWT route guard แบบ HS256 ที่ strict, generated
validation สำหรับ built-in schema subset ที่พิสูจน์ได้ และ subpath ใน package
เดียวกันคือ `@narudom96/nelysia/upload`, `@narudom96/nelysia/logger` และ
`@narudom96/nelysia/timeout` ส่วน Standard Schema transform/custom runtime,
native response และ stream ที่ generate ไม่ได้จะ fallback ไป generic path เสมอ
ดูคำสั่ง release gate และสถานะ evidence ได้ที่ [`v0.5-release-gates.md`](./v0.5-release-gates.md)

### patch v0.5.1: Bun route-compiled fast path

patch นี้เพิ่ม index `staticFunctionMap` ใน compiled dispatcher สำหรับ route
ฟังก์ชันแบบไม่มี argument โดยจัดเป็น `static-sync` ส่วน `.getStatic()` ยังเป็น
ระดับ `static-prebuilt` แยกกัน และ route แบบ params-only ใช้ dynamic specialization
ที่พิสูจน์ได้ ผลลัพธ์ `Response`, stream และ error จะถูกส่งต่อหรือเข้า error adapter
เพียงครั้งเดียว; กรณีที่ไม่รองรับยัง fallback ไป generic runtime เสมอ ใช้
`BENCH_ROUTE_SET=single` หรือ `multi` รัน benchmark ที่จับคู่กันด้วยคำสั่ง
`npm run benchmark:oha:route:release` รายงานอยู่ที่
[`benchmark-route-fast-path-v051-2026-09-14.md`](./benchmark-route-fast-path-v051-2026-09-14.md)

```bash
# TechEmpower Round 22 Benchmark Suite (Plaintext & JSON บนระดับ Concurrency 50-500)
npm run benchmark:teb

# ตรวจสอบความถูกต้องตามมาตรฐาน TechEmpower 100%
npm run benchmark:teb:verify

# JWT Authentication Benchmark (Nelysia vs Elysia vs Hono)
npm run benchmark:jwt

# Release security evidence: public/protected และ invalid-token matrix (30s × 7)
npm run benchmark:jwt:release

# Full Load Test ด้วย oha (Bun + Node.js)
npm run benchmark:oha
npm run benchmark:oha:bun
npm run benchmark:oha:node
npm run benchmark:oha:release

# short regression matrix สำหรับ route count 1/10/100/500
npm run benchmark:short
# ถ้า port เริ่มต้น 4321 ถูกใช้งานอยู่:
BENCH_PORT=4341 npm run benchmark:oha

# Router scale (ต้นทุน lookup ของ generic path เทียบกับขนาดตาราง route)
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=100 node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts

# รันทดสอบความเสถียรของหน่วยความจำ (Soak Test: static + dynamic, รายงาน heap/RSS)
npm run soak
npm run soak:1m
npm run soak:10m
# gate แยกสำหรับ production readiness; ตั้งใจเลื่อนไว้ก่อน
npm run soak:24h

# Soak ยาว (เช่น 1M requests บนตาราง 200 routes)
SOAK_ITERATIONS=1000000 SOAK_ROUTES=200 npm run soak

# รัน gate รวมของ v0.6 (ไม่รวม soak 24 ชั่วโมง)
npm run release:check:v06
```

### compatibility snapshot ที่บันทึกไว้จาก `oha` 10 รอบ (2026-09-14)

ทุก workload ใช้ `oha 1.16.0`, concurrency 50, 3 วินาทีต่อ sample,
10 รอบ และไม่มี request ล้มเหลว ตัวเลขเป็น historical compatibility snapshot
ที่เก็บแยกจาก release evidence ของ v0.5.1 เครื่อง snapshot ใช้ AMD Ryzen 5 5600
(6 cores / 12 threads), Bun 1.4.0 และ Node.js v26.8.1 ส่วน release report
แบบ 30 วินาที × 7 ใช้ Node.js v26.8.2:

| Workload ฝั่ง Node | Raw Node | Nelysia | Fastify | Express |
| :--- | ---: | ---: | ---: | ---: |
| JSON (`GET /json`) | 47,572 req/s | 27,451 req/s | 38,879 req/s | 21,130 req/s |
| Dynamic (`GET /users/:id`) | 47,607 req/s | 40,919 req/s | 38,846 req/s | 20,527 req/s |

| Workload ฝั่ง Bun | Raw Bun | Nelysia | Elysia | Baseline อื่น |
| :--- | ---: | ---: | ---: | :--- |
| Static JSON (`GET /json`) | 95,306 req/s | 95,173 req/s | 76,062 req/s | Route Compiled 44,153 |
| Dynamic (`GET /users/:id`) | 82,904 req/s | 83,855 req/s | 82,816 req/s | Standard Bun 41,945 |

การอ่านผลรอบ 10 ครั้ง: Bun static ของ Nelysia ต่ำกว่า Raw Bun เพียง 0.1% แต่
สูงกว่า Elysia 25.1%; Bun dynamic สูงกว่า Raw Bun 1.1% และสูงกว่า Elysia 1.3%;
Node dynamic ต่ำกว่า Raw Node 14.0% แต่สูงกว่า Fastify 5.3%; Node JSON ต่ำกว่า
Raw Node 42.3% นี่เป็น directional result จากเครื่อง local ไม่ใช่การจัดอันดับสากล
รายละเอียดคำสั่งและ environment อยู่ที่
[`docs/benchmark-oha-2026-09-14.md`](./benchmark-oha-2026-09-14.md)

หลักฐาน release ที่รันเสร็จแล้วอยู่ที่
[`benchmark-oha-v05-2026-09-14.md`](./benchmark-oha-v05-2026-09-14.md),
[`benchmark-jwt-v05-2026-09-14.md`](./benchmark-jwt-v05-2026-09-14.md) และ
[`benchmark-route-fast-path-v051-2026-09-14.md`](./benchmark-route-fast-path-v051-2026-09-14.md)
ส่วนหลักฐาน soak 1M/10M อยู่ที่
[`soak-v05-2026-09-14.md`](./soak-v05-2026-09-14.md) และ rerun ล่าสุดอยู่ที่
[`soak-roadmap-rerun-2026-09-14.md`](./soak-roadmap-rerun-2026-09-14.md) ส่วน 24 ชั่วโมงเป็น gate
แยกสำหรับ production readiness และยังตั้งใจเลื่อนไว้ก่อน

### การเทียบกับ benchmark เดิมแบบ runner เดียวกัน

เพื่อดูแนวโน้มโดยไม่ปนกับความต่างของ `oha` ได้รัน historical runner เดิมซ้ำที่
1 วินาทีต่อ sample, concurrency 10, 10 รอบ, request failure เป็นศูนย์:

| Workload | เดิม | Rerun 2026-09-14 | เปลี่ยนแปลง |
| :--- | ---: | ---: | ---: |
| Bun static | 30,618 req/s | 57,011 req/s | +86.2% |
| Bun dynamic | 28,991 req/s | 37,590 req/s | +29.7% |
| Node JSON | 5,208 req/s | 5,872 req/s | +12.7% |

ตัวเลขนี้เป็น directional comparison เพราะ runtime, dependency, kernel และ
ภาระเครื่องอาจเปลี่ยนระหว่างวัน จึงไม่ควรตีความว่าเป็น code-only speedup ทั้งหมด
ดูรายละเอียดได้ที่ [`docs/benchmark-10-rounds.md`](./benchmark-10-rounds.md)

---

## 20. คู่มือการย้ายโค้ด (Migration Guide)

### จาก Express
- ใน Express ต้องเรียก `res.json(data)` หรือ `res.send(text)`
- ใน Nelysia เพียงแค่ `return data` หรือส่งกลับเป็น Object ได้โดยตรง โดย Nelysia จะ serialize และตั้งค่า Header ให้อัตโนมัติ

```ts
// Express
app.get("/users/:id", (req, res) => res.json({ id: req.params.id }))

// Nelysia
app.get("/users/:id", ({ params }) => ({ id: params.id }))
```

### จาก Fastify
- Schema ใน Fastify สามารถแมปเข้ามาใช้ใน Options `{ body, params, query }` ของ Nelysia ได้ทันที
- Validation จะทำงานก่อนที่ Handler จะถูกเรียกใช้เสมอ

```ts
// Fastify
fastify.post("/users", { schema: { body: userSchema } }, async (req) => req.body)

// Nelysia
app.post("/users", ({ body }) => body, { body: userSchema })
```

### จาก Elysia

Nelysia ได้รับแรงบันดาลใจจาก Developer Experience (DX) ที่ยอดเยี่ยมและ Method Chaining ของ Elysia แต่มีความแตกต่างด้านสถาปัตยกรรมภายในและไวยากรณ์บางจุด เพื่อความเร็วสูงสุดระดับ AOT, การรักษา V8 Monomorphic shape และความเข้ากันได้กับ Node.js 22+ แบบ Zero-polyfill

#### ตารางเปรียบเทียบไวยากรณ์และฟีเจอร์ (Elysia vs Nelysia)

| ฟีเจอร์ / รูปแบบ | ElysiaJS | Nelysia | เหตุผลและจุดต่างของ Nelysia |
| :--- | :--- | :--- | :--- |
| **State & Decorator** | `app.state('k', v)`<br>`app.decorate('db', db)`<br>→ รับผ่าน `({ db, store }) => ...` | `context.store`<br>→ รับผ่าน `({ store }) => { store.db = ... }` | `state()` ให้ค่าเริ่มต้นใน request store ส่วน `decorate()` เพิ่ม context extension แบบ typed ใช้ store สำหรับข้อมูลของ request และวัด hot path บน runtime เป้าหมาย |
| **การต่อ Sub-App** | `app.use(subApp)` | `app.mount('/prefix', subApp)` | แนะนำให้ใช้ `.mount()` กับ routing tree ที่มี prefix และ `.use()` กับ Plugin; รูปแบบเดิม `.use(subApp)` ยังรองรับเพื่อ compatibility |
| **การจัดกลุ่ม Route** | `app.group('/v1', (app) => ...)` | `app.group('/v1', (group) => ...)` | ไวยากรณ์เหมือนกัน โดย group ใน Nelysia จะสืบทอด Lifecycle Hooks (`onBeforeHandle`) จากกลุ่มแม่โดยตรง |
| **Guards & Macros** | `.guard({ ... })`<br>`.macro({ ... })` | `app.group(prefix, (g) => { g.onBeforeHandle(...) })` | Nelysia ใช้ Hook ปกติผ่าน group เพื่อให้ AOT Dispatch Compiler วิเคราะห์เส้นทางและคอมไพล์ได้เร็วแม่นยำ |
| **Route ค่าคงที่ (Static)** | รันผ่าน dynamic handler ปกติ `app.get('/ping', () => 'pong')` | `app.getStatic('/ping', 'pong')` หรือ `.get('/ping', () => 'pong')` ที่รองรับ | `getStatic()` เป็น `static-prebuilt`; `.get()` แบบไม่มี argument ที่รองรับเป็น `static-sync` ผ่าน `staticFunctionMap` ส่วนผลลัพธ์ที่ไม่รองรับจะ fallback ไป generic |
| **รันบน Node.js** | เน้น Bun; บน Node.js ต้องใช้ `@bogeychan/elysia-polyfill` | รองรับทั้ง **Node.js 22+** (`node:http`) และ **Bun 1.4+** เป็น First-class | ทำงานบน Node.js ได้เนทีฟ 100% ไม่ต้องลง polyfill หรือ adapter เสริม |
| **Multi-Core Scaling** | ต้องใช้ Cluster ภายนอก (เช่น PM2) | `serveClustered(app, { port, instances: 'max' })` | มีตัวจัดการ Node.js Cluster Fork ในตัว พร้อมจัดการ Graceful Shutdown |
| **Schema Validation** | TypeBox (`t`) เป็นหลัก | Built-in `t` + **Standard Schema v1** | รองรับทั้ง `t` ในตัว และใช้ Zod, Valibot, ArkType ได้ทันทีโดยไม่ต้องลงปลั๊กอินแปลง |
| **Cookies** | `({ cookie: { session } }) => ...` (Proxy) | `({ cookies, setCookie, deleteCookie }) => ...` | ฟังก์ชันจัดการ Cookie ตรงไปตรงมา ชัดเจน ไร้ความซับซ้อนของ Proxy |

#### ตัวอย่างการแปลงโค้ดจาก Elysia มาเป็น Nelysia

##### 1. การ Mount ซับแอพ (Sub-Apps)

```ts
// ❌ Elysia: นำ sub-app มาใส่ใน .use()
import { Elysia } from 'elysia'
const userRoutes = new Elysia({ prefix: '/users' }).get('/', () => ['Alice', 'Bob'])
const app = new Elysia().use(userRoutes)

// ✅ Nelysia: แยก .mount() สำหรับ sub-app และ .use() สำหรับ plugin
import { Nelysia } from '@narudom96/nelysia'
const userRoutes = new Nelysia().get('/', () => ['Alice', 'Bob'])
const app = new Nelysia()
  .mount('/users', userRoutes) // mount ไปที่ path /users
```

##### 2. การใช้งาน State และ Database (Context Store)

```ts
// ❌ Elysia: decorate ค่าลงไปใน Context โดยตรง
const app = new Elysia()
  .decorate('db', database)
  .get('/items', ({ db }) => db.findAll())

// ✅ Nelysia: ใช้ context.store เพื่อให้ V8 Monomorphic คงประสิทธิภาพสูงสุด
const app = new Nelysia()
  .onBeforeHandle(({ store }) => {
    store.db = database
  })
  .get('/items', ({ store }) => store.db.findAll())
```

##### 3. การป้องกัน Route ด้วย Group (Route Guarding)

```ts
// Elysia
app.group('/admin', (app) =>
  app.guard({ beforeHandle: checkAuth }, (app) =>
    app.get('/dashboard', () => ({ secret: true }))
  )
)

// Nelysia
app.group('/admin', (admin) => {
  admin.onBeforeHandle(checkAuth)
  admin.get('/dashboard', () => ({ secret: true }))
})
```

##### 4. การปรับ Route ค่าคงที่ให้ได้ความเร็วระดับสูงสุด (Static Route Optimization)

```ts
// Elysia: ผ่านกระบวนการ Handler ปกติ
app.get('/health', () => ({ status: 'ok' }))

// Nelysia: explicit prebuilt (`static-prebuilt`)
app.getStatic('/health', { status: 'ok' })

// Nelysia: zero-argument specialized static function (`static-sync`)
app.get('/health', () => ({ status: 'ok' }))
```


---

## 21. คู่มือปรับประสิทธิภาพ (Performance Tuning)

อยากให้ route ร้อนวิ่งบน fast path ทำตามนี้:

1. **ใช้ `getStatic()` สำหรับ response คงที่** — body ถูก serialize ครั้งเดียวตอน startup แล้ว serve เป็น bytes สำเร็จรูป
2. **ใช้ `.get()` แบบไม่มี argument ที่รองรับสำหรับ response แบบ static-sync** — handler ใช้ `staticFunctionMap` และไม่สร้าง request context; ผลลัพธ์ที่ไม่รองรับจะ fallback ไป generic
3. **handler ของ route ร้อนขอแค่ params** — `({ params }) => …` จะข้ามการ parse query/cookie/header ทันทีที่ destructure `query`/`headers`/`cookies` จะตกไป generic path (ถูก แต่ช้ากว่า)
4. **อย่าใส่ hooks/schema บน route ร้อน** — hook หรือ schema ใดๆ จะคัด route นั้นออกจาก dispatcher
5. **อ่านข้อมูลที่ใช้ GET** — มีแค่ route `GET` เท่านั้นที่ถูก compile (`HEAD` ใช้ route `GET` ผ่าน generic path)
6. **ปิดสิ่งที่ไม่ใช้** — `new Nelysia({ requestId: false })` ข้ามการสร้าง UUID และ header `x-request-id`; ไม่ใส่ `telemetry` ก็ไม่เสียค่า `performance.now()`

ตรวจสอบด้วย inspector และ router-scale:

```bash
npm run inspect -- ./src/app.ts
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts
```

ต้นทุนต่อ request จากมากไปน้อย: parse JSON body → schema validation → UUID request ID → parse cookie → parse query → dynamic lookup → static lookup วัดบนเครื่องตัวเองด้วย `benchmarks/router-scale.ts` — ตัวเลขบนเครื่อง dev ใช้ดูทิศทางเท่านั้น

---

## 22. เช็กลิสต์ Deploy ขึ้น Production

- [x] constituent checks ของ v0.6 workspace gate ที่ไม่รวม 24 ชั่วโมงผ่านและมีหลักฐานบันทึกไว้ (typecheck + tests + package/tarball/import/deployment checks + benchmark/runtime + soak 1M/10M + Deno + audit); ถ้าต้องการรันรวมให้ใช้ `npm run release:check:v06`
- [x] `npm run framework:check` ผ่าน หลังติดตั้ง dependency ของ fixture ทั้ง 5 ตัว
- [ ] ดู coverage ของ dispatcher: build แล้วอ่าน `NELY003` ใน `dist/manifest.json` — route ร้อนควรอยู่บน fast path
- [ ] ตั้ง `bodyLimit` ให้พอดี payload ใหญ่สุด; `trustedProxy: false` ไว้ trừคุม proxy เอง
- [ ] มี endpoint `/health` และต่อ `gracefulShutdown(server, timeout)` กับ `SIGTERM`
- [ ] ขยายด้วย `serveClustered()` (Node) หรือ autoscaling ของ platform; ยืนยันการ wiring `PORT` env
- [ ] Deploy ผ่าน `Dockerfile` ที่มีให้ (`docker build -t nelysia:local .`) หรือ release tarball
- [ ] รัน soak 24 ชั่วโมงแยกต่างหากบน hardware ใกล้เคียง production ก่อนประกาศ production readiness; ตอนนี้ตั้งใจเลื่อนไว้ก่อน

---

## 23. แก้ปัญหาและ FAQ (Troubleshooting)

| อาการ | สาเหตุ | วิธีแก้ |
| :--- | :--- | :--- |
| `400 Malformed JSON body` | body ไม่ใช่ JSON ที่ถูกต้อง | แก้ payload ฝั่ง client หรือรับเป็น text |
| `400 <path> must be …` | ไม่ผ่าน schema validation | ดู field ที่ระบุใน message |
| `413 Request body is too large` | body เกิน `bodyLimit` (ค่าเริ่มต้น 1 MB) | เพิ่ม `bodyLimit` หรือ reject ตั้งแต่ต้นทาง |
| `404 Not Found` | ไม่มี route ตรง path | ดูผล `npm run inspect` |
| `405 Method Not Allowed` | มี path แต่ไม่มี method นี้ | อ่าน header `Allow` ว่าวิธีไหนใช้ได้ |
| ได้ fallback `OPTIONS` อัตโนมัติ | explicit handler จะทำงานก่อน; ถ้าไม่มีจึงใช้ fallback `204` + `Allow` | ลงทะเบียน `.options(path, handler)` เมื่อต้องการ custom preflight behavior |
| `EADDRINUSE` ตอน `listen` | port ถูกใช้แล้ว (เช่น dev server ตัวอื่น) | ตั้ง `PORT` env หรือปิดตัวที่ใช้อยู่ |
| WebSocket upgrade ล้มเหลว | ไม่มี route `websocket()` สำหรับ path หรือขาด header `upgrade` | ลงทะเบียน `app.websocket(path, …)` ก่อน |
| ตัวเลข benchmark แกว่ง | noise บนเครื่อง dev | ใช้เครื่อง Linux นิ่งๆ + load generator แยก + median 10 รอบ |
| ช้าเมื่อ route เยอะ | เวอร์ชันเก่า scan ทุก route ต่อ request | อัปเกรด: เวอร์ชันปัจจุบัน lookup รอบเดียวแยกตาม method |

# Nelysia Versioning and Release Truth

This page is the offline source for deciding which Nelysia version is current.
The Thai section follows the same contract so both languages stay aligned.

## English

### Current status

- Current package line: **`1.2.0`**
- Current public GitHub release/tag: **`v1.2.0`** ([release page](https://github.com/ASTOHACKER/nelysia/releases/tag/v1.2.0))
- The v1.0 API contract remains frozen. v1.1.0 and v1.2.0 are additive; bug fixes and security fixes may ship in `1.2.x`; breaking changes belong in `2.0`.
- npm publication is a separate registry operation. A GitHub release does not imply that `npm install @narudom96/nelysia` is available from npm.
- The Bun stabilization gate is `no-performance-claim`. The 24-hour soak is deferred, and production readiness is not declared solely because the package reached `1.2.0`.

### Source-of-truth table

| Source | Answers | Rule |
| --- | --- | --- |
| `package.json` | What package version is being built? | Read `version`; this page must match it. |
| GitHub tag/release | What public source/artifact was released? | Use the immutable `v1.2.0` tag and release. |
| `README.md` and `docs/README.md` | Where should a developer start? | Describe the current line and link to detailed docs. |
| `docs/DOCUMENTATION_EN.md` / `TH.md` | What does the API do? | Detailed reference; historical sections are labeled. |
| `docs/benchmark-*.md` | What was measured? | Evidence only; never a promise across runners. |
| `docs/release-status.md` | Which gates passed or remain deferred? | Milestone status only. |

### Installing the current artifact offline

Use the GitHub Release tarball when npm publication is not available:

```bash
npm install https://github.com/ASTOHACKER/nelysia/releases/download/v1.2.0/narudom96-nelysia-1.2.0.tgz
```

The tarball contains the built package and all documented subpaths. Verify its
SHA-256 against the release evidence before distributing it internally.

### Historical versions

`v0.5.1`, `v0.6.0`, `v1.0.0`, and `v1.1.0` are immutable historical releases. They remain in
changelogs, benchmark evidence and migration history because those documents
describe what was measured or shipped at that time. A historical version must
not be labeled “current”, “latest”, or “pending release”.

### Release checklist

Before announcing a later release, update `package.json`, the release notes,
the documentation map and current status box together; run `npm run docs:check`
and `git diff --check`; then create an immutable tag and release. Do not rewrite
an existing tag.

## ภาษาไทย

### สถานะปัจจุบัน

- package ปัจจุบัน: **`1.2.0`**
- GitHub release/tag สาธารณะปัจจุบัน: **`v1.2.0`** ([หน้า release](https://github.com/ASTOHACKER/nelysia/releases/tag/v1.2.0))
- API contract ของ v1.0 freeze แล้ว; v1.1.0 และ v1.2.0 เพิ่มความสามารถแบบ additive, `1.2.x` แก้ bug/security และ breaking change ไป `2.0`
- npm publish เป็นงานแยกต่างหาก การมี GitHub release ไม่ได้แปลว่า `npm install @narudom96/nelysia` ใช้จาก npm ได้แล้ว
- Bun stabilization gate เป็น no-performance-claim, soak 24 ชั่วโมงถูกเลื่อนไว้ และยังไม่ประกาศ production readiness จากการออก v1.2.0 เพียงอย่างเดียว

### ตาราง source of truth

| แหล่งข้อมูล | ใช้ตอบคำถามอะไร | กติกา |
| --- | --- | --- |
| `package.json` | package ที่กำลัง build คือ version ใด | อ่านค่า `version`; หน้านี้ต้องตรงกัน |
| GitHub tag/release | source/artifact สาธารณะคืออะไร | ใช้ tag/release `v1.2.0` ที่แก้ย้อนหลังไม่ได้ |
| `README.md` และ `docs/README.md` | developer ควรเริ่มตรงไหน | อธิบายสายปัจจุบันและลิงก์ไป reference |
| `DOCUMENTATION_EN.md` / `TH.md` | API ทำงานอย่างไร | reference ละเอียด; ส่วนประวัติต้องติดป้ายชัดเจน |
| `benchmark-*.md` | วัดอะไรและด้วย runner ใด | เป็น evidence เท่านั้น ห้ามรวม runner ต่างชุดเป็น claim เดียว |
| `release-status.md` | gate ใดผ่านหรือ deferred | ใช้บอกสถานะ milestone เท่านั้น |

### ติดตั้ง artifact ปัจจุบันแบบไม่พึ่ง npm

```bash
npm install https://github.com/ASTOHACKER/nelysia/releases/download/v1.2.0/narudom96-nelysia-1.2.0.tgz
```

tarball มี package ที่ build แล้วและ subpath ที่ระบุในเอกสาร ควรตรวจ SHA-256
กับ release evidence ก่อนแจกจ่ายภายในองค์กร

### Version ในอดีต

`v0.5.1`, `v0.6.0`, `v1.0.0` และ `v1.1.0` เป็น release ในอดีตที่ immutable จึงยังอยู่ใน changelog,
benchmark และ migration history เพื่ออธิบายสิ่งที่เคยวัดหรือส่งมอบ แต่ห้าม
เรียกว่า “current”, “latest” หรือ “pending release”

### Checklist ก่อน release

เมื่อจะออก release ใหม่ ให้ update `package.json`, release notes, documentation
map และ status box พร้อมกัน จากนั้นรัน `npm run docs:check` และ `git diff --check`
แล้วจึงสร้าง tag/release ใหม่โดยไม่เขียนทับ tag เดิม

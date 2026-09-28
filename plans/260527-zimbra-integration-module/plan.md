---
title: "Zimbra Integration Module"
description: ""
status: pending
priority: P2
branch: "jason"
tags: []
blockedBy: []
blocks: []
created: "2026-05-27T15:20:23.778Z"
createdBy: "ck:plan"
source: skill
---

# Zimbra Integration Module

## Overview

Module proxy thuần gọi Zimbra Admin SOAP API (`:7071`), KHÔNG lưu Supabase. Quản lý: list domain, list group + add/remove member, search/list/create account, reset password theo pattern. Trang mới `/asset-management/zimbra`.

Kiến trúc 3 lớp: `app/api/zimbra/*/route.ts` → `lib/services/zimbraService.ts` → `lib/zimbra/soap-client.ts` → Zimbra.

**Stack:** Next.js **13.5.6** (không phải 15) — transport dùng `https.request` + custom agent, không `fetch+agent`.

### Quyết định chốt
- Proxy thuần (no DB); admin credential Zimbra trong `.env.local` server-side, người dùng không nhập.
- Password reset = `Capitalize(localpart)+suffix(ENV)` — **người dùng GIỮ pattern** dù red team cảnh báo đoán được (trade-off chấp nhận, document ở phase 2).
- Auth gate route Zimbra: **server-verified thật** (KHÔNG dùng header spoofable hiện tại), check `super_admin/admin` thẳng từ DB. Phụ thuộc cơ chế auth **JWT/session+bcrypt** sau migration Postgres.

### Thứ tự build (do migration Postgres dang dở)
- **P1 + P2 build trước** — SOAP client + service layer độc lập hoàn toàn với DB/migration.
- **P3 (auth gate) chờ** auth post-migration ổn định (JWT+bcrypt) rồi gắn vào.
- P4 phụ thuộc P3; P5 cuối.

Nguồn: [brainstorm-summary.md](./brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [SOAP Client Foundation](./phase-01-soap-client-foundation.md) | Pending |
| 2 | [Zimbra Service Layer](./phase-02-zimbra-service-layer.md) | Pending |
| 3 | [API Routes & Permissions](./phase-03-api-routes-permissions.md) | Pending (blocked: auth post-migration) |
| 4 | [UI Page](./phase-04-ui-page.md) | Pending |
| 5 | [Test & Verify](./phase-05-test-verify.md) | Pending |

## Dependencies

- **External:** migration Supabase → Postgres (auth JWT+bcrypt) phải xong trước P3. P1+P2 không phụ thuộc.

## Red Team Review

### Session — 2026-05-27
**Findings:** 15 (14 accepted, 1 accepted-with-user-override)
**Severity breakdown:** 4 Critical, 8 High, 3 Medium
**Verification:** mọi Critical claim đã tự verify bằng grep (file:line).

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Permission guard no-op (`x-user-permissions` không ai gửi) | Critical | Accept | Phase 3 |
| 2 | Identity spoofable (`x-current-user-role` từ localStorage) | Critical | Accept | Phase 3 |
| 3 | TLS default false → MITM admin credential | Critical | Accept | Phase 1 |
| 4 | Password pattern đoán được + plaintext | Critical | Accept (user override: GIỮ pattern, document trade-off + optional mustChange) | Phase 2 |
| 5 | `manager` chạm asset-management (mâu thuẫn "chỉ admin") | High | Accept (check role thẳng) | Phase 3 |
| 6 | LDAP injection ở searchAccounts | High | Accept (escapeLdap RFC4515 + allow-list) | Phase 2 |
| 7 | Không audit log mutation | High | Accept (auditService) | Phase 3 |
| 8 | Next 13.5 ≠ 15 → fetch+agent không chạy | High | Accept (https.request primary) | Phase 1 |
| 9 | Không test framework | High | Accept (`node --test`) | Phase 5 |
| 10 | Token cache race / auth storm | High | Accept (single-flight Promise) | Phase 1 |
| 11 | createAccount không idempotent | High | Accept (map ACCOUNT_EXISTS→409) | Phase 2/3 |
| 12 | Zimbra-down cascade (15s×3 tab) | High | Accept (timeout 6s + lazy tab) | Phase 1/4 |
| 13 | SOAP contract chưa verify | High | Accept (spike phase 1 trước P2) | Phase 1 |
| 14 | Nav link sai file (layout.tsx) | Medium | Accept (AssetManagementSidebar.tsx) | Phase 4 |
| 15 | P5 thiếu negative security test + cleanup | Medium | Accept (neg tests + teardown finally) | Phase 5 |

## Validation Log

### Session — 2026-05-27
**Questions:** 4 asked. (Verification Pass skipped — Red Team Review section đã có bằng chứng verify; không còn `[UNVERIFIED]` tag.)

| # | Decision point | Câu trả lời | Propagate |
|---|---|---|---|
| 1 | TLS self-signed / CA cert | **Không có CA** → tắt verify (`rejectUnauthorized=false`), chấp nhận MITM trong mạng nội bộ tin cậy | Phase 1 TLS |
| 2 | Audit log destination | Dùng `auditService.ts` sẵn có, tự theo migration Postgres; không chặn thêm P3 | Phase 3 (xác nhận) |
| 3 | `zimbraPasswordMustChange` | **KHÔNG** — giữ nguyên pattern, không force đổi lần đầu | Phase 2 (bỏ optional mustChange) |
| 4 | ENV Zimbra owner | Người dùng tự cung cấp URL/user/password admin khi test P1 | Không cần guide lấy credential |

### Whole-Plan Consistency Sweep
- Premise "Next 15" → sửa thành 13.5.6 ở plan.md + phase-01.
- `x-user-permissions`/email-accounts làm "permission model" → loại bỏ, thay bằng server-verified gate ở phase-03.
- Password pattern: giữ nguyên (user), trade-off ghi rõ phase-02 + finding #4; success criteria phase 2/5 dùng pattern → nhất quán.
- Nav file: layout.tsx → AssetManagementSidebar.tsx ở phase-04 (Architecture + Related Files + Risk) — nhất quán.
- Timeout 15s → 6s ở phase-01; phase-04 lazy-load tham chiếu khớp.
- Thứ tự build P1+P2 trước P3: phase-03 + plan.md dependencies nhất quán.
- **Red team sweep: không còn mâu thuẫn.**

### Whole-Plan Consistency Sweep (sau Validation)
- TLS: quyết định "không CA → verify off" propagate phase-01 (Architecture + Success Criterion + Risk) — đã sửa criterion/risk khỏi "CA pin/dev only" thành "verify off mọi env, agent-scoped". Nhất quán.
- mustChange: bỏ khỏi phase-02 (Architecture + Risk). Nhất quán với quyết định "không force".
- Audit: phase-03 đã có auditService — khớp validate.
- **Không còn mâu thuẫn chưa giải quyết. Plan sẵn sàng implement (P1+P2; P3 chờ auth post-migration).**

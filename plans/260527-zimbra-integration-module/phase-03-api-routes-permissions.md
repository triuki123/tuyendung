---
phase: 3
title: "API Routes & Permissions"
status: pending
priority: P1
effort: "1.5d"
dependencies: [2]
---

# Phase 3: API Routes & Permissions

## Overview
API routes mỏng dưới `app/api/zimbra/*` gọi zimbraService, gắn **auth gate server-side thật** + audit log. Admin credential Zimbra chỉ server-side (ENV). **Đây là phase nhạy cảm nhất — không dùng cơ chế header spoofable hiện tại.**

> **Phụ thuộc migration Postgres:** auth gate gắn vào cơ chế **JWT/session tự làm + bcrypt** sau khi migration auth ổn định. Build P1+P2 trước (độc lập migration); P3 chờ auth mới. Đánh dấu `blockedBy` migration trong plan.md.

## Requirements
- Functional: 6 endpoint (domains, accounts GET/POST, accounts reset-password, groups, group members POST/DELETE).
- Non-functional: server-verified identity; chỉ super_admin/admin; audit log mọi mutation; CORS khoá origin; error JSON nhất quán.

## Architecture
- Routes:
  | Route | Method | service | guard |
  |---|---|---|---|
  | `app/api/zimbra/domains/route.ts` | GET | listDomains | view |
  | `app/api/zimbra/accounts/route.ts` | GET (?domain,?search,?limit) | searchAccounts | view |
  | `app/api/zimbra/accounts/route.ts` | POST | createAccount | admin |
  | `app/api/zimbra/accounts/reset-password/route.ts` | POST `{email}` | resetPassword | admin |
  | `app/api/zimbra/groups/route.ts` | GET | listGroups | view |
  | `app/api/zimbra/groups/members/route.ts` | POST/DELETE `{dlId,email}` | add/removeGroupMember | admin |

- **Auth gate — server-verified, KHÔNG tin client header:**
  - ❌ KHÔNG dùng `checkPermission`/`x-user-permissions` (`lib/api-permissions.ts:21`) — header này không client nào gửi, đọc null → 403 mọi request; và spoofable.
  - ❌ KHÔNG tin `x-current-user-role` (`lib/api-client.ts:112`) — lấy từ localStorage, client tự đặt.
  - ✅ Verify token JWT/session server-side (cơ chế post-migration: bcrypt + JWT), resolve role từ **DB**, check `role === 'super_admin' || role === 'admin'` tường minh. Lý do check role thẳng thay vì module: `manager` có `asset-management` (`lib/permissions.ts:165`) nhưng KHÔNG được phép thao tác Zimbra.
  - Viết helper `requireZimbraAdmin(req)` server-side, mọi route mutation gọi.
- **Audit log:** dùng `lib/services/auditService.ts` sẵn có. Mọi create/reset/member-change ghi `{ actorUserId, action, targetEmail, timestamp, sourceIp }`. KHÔNG log password.
- **CORS:** khoá `Access-Control-Allow-Origin` cho `/api/zimbra/*` về origin app (hiện global `*` ở `next.config.mjs:30` — không để endpoint nhạy cảm hở CORS).
- Reset-password trả `{ email, newPassword }` để admin báo user (password vốn đoán được theo pattern — người dùng chấp nhận; vẫn không log).
- Mỗi route: `export const runtime = 'nodejs'`.

## Related Code Files
- Create: `src/app/api/zimbra/domains/route.ts`
- Create: `src/app/api/zimbra/accounts/route.ts`
- Create: `src/app/api/zimbra/accounts/reset-password/route.ts`
- Create: `src/app/api/zimbra/groups/route.ts`
- Create: `src/app/api/zimbra/groups/members/route.ts`
- Create: `src/lib/zimbra/require-zimbra-admin.ts` (auth gate helper)
- Modify: `next.config.mjs` (CORS scope cho /api/zimbra/*)
- Read for context: `src/lib/services/auditService.ts`, cơ chế auth post-migration, `src/lib/permissions.ts`

## Implementation Steps
1. `requireZimbraAdmin(req)`: verify session/JWT server-side → role từ DB → super_admin/admin else 401/403.
2. Domains GET: guard view → listDomains.
3. Accounts GET: guard view → parse query → searchAccounts (service đã escape).
4. Accounts POST: guard admin → createAccount; `ACCOUNT_EXISTS` → 409; audit log.
5. reset-password POST: guard admin → resetPassword → audit log → trả newPassword.
6. groups GET: guard view → listGroups.
7. groups/members POST & DELETE: guard admin → add/remove; audit log.
8. CORS scope; mỗi route try/catch + `{error}` + status.

## Success Criteria
- [ ] Request không session hợp lệ → 401; user/manager (không admin) → 403.
- [ ] Forged `x-current-user-role: super_admin` KHÔNG bypass được (server verify session thật).
- [ ] `GET /api/zimbra/domains` (admin) trả list domain thật.
- [ ] `POST /api/zimbra/accounts` tạo account 201; trùng → 409.
- [ ] reset-password trả `{email,newPassword}` + audit log ghi actor.
- [ ] groups GET + members POST/DELETE hoạt động + audit.
- [ ] `/api/zimbra/*` không trả CORS `*`.

## Risk Assessment
- Auth mechanism phụ thuộc migration → blocked; build sau khi JWT+bcrypt ổn định.
- Thiếu audit → không truy vết breach: auditService bắt buộc mọi mutation.
- ENV thiếu → 500: config.ts ném lỗi rõ, log server (không lộ credential).

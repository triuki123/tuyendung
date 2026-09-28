---
phase: 2
title: "Zimbra Service Layer"
status: pending
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 2: Zimbra Service Layer

## Overview
Nghiệp vụ trên soap-client: list domain, search/list account, tạo account, reset password theo pattern, list group + add/remove member. Map response Zimbra → shape gọn cho UI. **Chỉ build sau khi spike phase 1 xác nhận selector/filter contract.**

## Requirements
- Functional: 7 op (domains, accounts list/search, createAccount, resetPassword, groups, group members add/remove).
- Non-functional: password pattern `Capitalize(localpart)+suffix` (quyết định người dùng — xem trade-off bên dưới); escape LDAP RFC4515; SearchDirectory `limit` default 100, hard max 500; file < 200 dòng (tách `zimbra-accounts.ts`/`zimbra-groups.ts` nếu >200).

## Architecture
| Hàm service | Zimbra op | Note |
|---|---|---|
| `listDomains()` | GetAllDomains | map `domain[].name`, `id` |
| `searchAccounts({domain,query,limit})` | SearchDirectory | `types:'accounts'`; **escape input** |
| `createAccount({email,password?,displayName})` | CreateAccount | idempotent-aware (xem dưới) |
| `resetPassword(email)` | SetPassword | tính pattern từ **canonical name** |
| `listGroups()` | GetAllDistributionLists | map `dl[]` |
| `addGroupMember(dlId,email)` | AddDistributionListMember | |
| `removeGroupMember(dlId,email)` | RemoveDistributionListMember | |

- **Password pattern (quyết định người dùng — GIỮ):** `defaultPassword(name)` = `Capitalize(localpart) + ZIMBRA_DEFAULT_PASSWORD_SUFFIX`. Vd `nam@cty.com` + `@123` → `Nam@123`.
  - ⚠️ **Trade-off (người dùng chấp nhận, validate xác nhận):** pattern đoán được — ai biết suffix + email tính ra password mọi account. KHÔNG random. **KHÔNG set `zimbraPasswordMustChange`** (người dùng chọn giữ nguyên pattern, không force đổi). Rủi ro password tồn tại lâu + đoán được = chấp nhận có chủ đích.
  - **Tính từ canonical name:** localpart lấy từ tên account **Zimbra trả về** (sau resolve), KHÔNG từ chuỗi input thô. Tránh lệch khi input là alias → mailbox chính khác localpart.
- **LDAP filter escape:** escape RFC4515 (`*()\` và NUL) cho mọi phần input. `domain` allow-list theo kết quả `listDomains()`. Filter: có `domain` → `(zimbraMailDeliveryAddress=*@<domain>)`; có `query` → `(|(mail=*<esc(q)>*)(displayName=*<esc(q)>*))`.
- **Account selector:** theo kết quả spike phase 1 — dùng `by='name'` nếu Zimbra nhận, else resolve zimbraId qua GetAccount. Pin 1 chiến lược, không để ngỏ.

## Related Code Files
- Create: `src/lib/services/zimbraService.ts` (tách nếu >200 dòng)
- Read for context: `src/lib/zimbra/soap-client.ts`, `src/lib/zimbra/types.ts`, kết quả spike

## Implementation Steps
1. `defaultPassword(name)` helper (từ canonical name) + unit-test được.
2. `escapeLdap(s)` helper RFC4515.
3. `listDomains()` → GetAllDomains, map.
4. `searchAccounts()` → SearchDirectory; build filter với escape + domain allow-list; áp `limit` (clamp ≤500).
5. `createAccount()` → CreateAccount. **Idempotency:** bắt fault `account.ACCOUNT_EXISTS` → ném lỗi phân loại được (route map 409). Cân nhắc tách set-password khỏi create để partial-failure recoverable.
6. `resetPassword(email)` → resolve canonical → tính pattern từ canonical name → SetPassword. Trả `{ email, newPassword }`.
7. `listGroups()` → GetAllDistributionLists, map members count.
8. `addGroupMember/removeGroupMember`.

## Success Criteria
- [ ] `defaultPassword('nam@cty.com')` === `Nam@123` (suffix `@123`), tính từ canonical name.
- [ ] `escapeLdap(')(objectClass=*')` không phá filter (injection test).
- [ ] `listDomains()` trả `{id,name}` đúng.
- [ ] `createAccount` tạo account; account trùng → lỗi `ACCOUNT_EXISTS` phân loại được.
- [ ] `resetPassword` đổi pass thành công, login được bằng pass trả về (khớp canonical).
- [ ] `searchAccounts` lọc đúng + chặn injection.
- [ ] add/remove member phản ánh trên Zimbra.

## Risk Assessment
- LDAP injection nếu không escape → escapeLdap bắt buộc + domain allow-list (Success Criterion).
- Password đoán được: trade-off người dùng chấp nhận; document rõ; KHÔNG mustChange (validate đã chốt).
- Lệch localpart (alias): tính password từ canonical name Zimbra trả.
- createAccount non-atomic: map ACCOUNT_EXISTS→409; recovery qua reset-password.

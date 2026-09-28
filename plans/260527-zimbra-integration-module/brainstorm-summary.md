# Brainstorm Summary — Zimbra Integration Module

Date: 2026-05-27

## Problem
Cần module gọi thẳng Zimbra server để quản lý domain, group email, account: list domain, list/sửa group, tạo email, reset password mặc định, tìm kiếm. Codebase đã có `domains`/`email-accounts` nhưng chỉ là bản ghi local Supabase — không nối Zimbra thật.

## Decisions (user-confirmed)
- **Data model:** Proxy thuần, KHÔNG lưu Supabase. Gọi thẳng Zimbra mỗi request.
- **Kết nối:** Zimbra SOAP Admin API tại `:7071/service/admin/soap`, có admin account.
- **Scope v1:** list domain, list group + add/remove member, list account, tạo account, reset password theo pattern, search account.
- **Password mặc định:** `Capitalize(localpart) + suffix(ENV)` — vd `nam@cty.com` → `Nam@123`, suffix cấu hình `ZIMBRA_DEFAULT_PASSWORD_SUFFIX`.
- **UI:** trang mới `/asset-management/zimbra` (tách khỏi domains/email-accounts local).

## Architecture
```
UI /asset-management/zimbra
  → app/api/zimbra/*/route.ts   (thin, pattern như email-accounts/route.ts)
  → lib/services/zimbraService.ts   (nghiệp vụ: mapping, password pattern, validate)
  → lib/zimbra/soap-client.ts       (SOAP: auth token cache, build/parse, https.Agent)
  → Zimbra Admin SOAP :7071
```
- Tách 2 lớp: soap-client (giao tiếp thuần) vs service (nghiệp vụ). File < 200 dòng.
- Auth: `AuthRequest` → authToken, cache in-memory TTL ~12h, auto re-auth + retry 1 lần.
- Không thêm thư viện SOAP nặng — dùng `fetch` built-in + namespace `urn:zimbraAdmin`.
- TLS self-signed: `https.Agent` riêng cho client này, KHÔNG tắt verify global.

## ENV (.env.local, không commit)
```
ZIMBRA_ADMIN_URL=https://mail.example.com:7071/service/admin/soap
ZIMBRA_ADMIN_USER=admin@example.com
ZIMBRA_ADMIN_PASSWORD=...
ZIMBRA_TLS_REJECT_UNAUTHORIZED=false
ZIMBRA_DEFAULT_PASSWORD_SUFFIX=@123
```

## API Routes
| Route | Method | Zimbra op |
|---|---|---|
| /api/zimbra/domains | GET | GetAllDomains |
| /api/zimbra/accounts | GET (domain, search) | SearchDirectory |
| /api/zimbra/accounts | POST | CreateAccount |
| /api/zimbra/accounts/[id]/reset-password | POST | SetPassword |
| /api/zimbra/groups | GET | GetAllDistributionLists |
| /api/zimbra/groups/[id]/members | POST/DELETE | Add/RemoveDistributionListMember |

## Security
- Admin credential chỉ server-side; UI không thấy token/password admin.
- Permission check qua `lib/api-permissions.ts` — chỉ super_admin/admin.
- SearchDirectory có `limit` mặc định.

## Risks & Mitigation
- Zimbra version lệch SOAP schema → test GetAllDomains trước.
- Self-signed TLS → https.Agent riêng.
- Token hết hạn → auto re-auth + retry.
- Proxy thuần chậm/phụ thuộc Zimbra online → timeout + error rõ ràng (đã chấp nhận).

## Success Criteria
- /api/zimbra/domains trả list domain thật.
- Tạo account → thấy trên Zimbra web admin.
- Reset password → login được bằng pass pattern.
- Search trả đúng account.
- Add/remove member group phản ánh trên Zimbra.

## Touchpoints (existing)
- Pattern: `src/app/api/email-accounts/route.ts`, `src/lib/services/emailAccountsService.ts`
- Auth/permission: `src/lib/api-permissions.ts`, `src/lib/permissions.ts`
- Nav: `src/app/asset-management/` (thêm tab/route zimbra)

## Out of scope (v1)
- Sync 2 chiều với Supabase.
- Xóa account/domain/group.
- zmprov CLI / SSH.

## Next step
→ /ck:plan (standard phased plan)

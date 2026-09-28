# AssetFlow Pro — Tính Năng Quản Trị Zimbra Mail

**Phiên bản:** 1.0
**Cập nhật:** 2026-05-27
**Trạng thái:** Đã triển khai (uncommitted)

---

## Mục Đích

Module Zimbra cho phép quản trị viên (`super_admin`, `admin`) thực hiện các tác vụ quản trị hệ thống
thư điện tử Zimbra trực tiếp từ AssetFlow Pro — không cần đăng nhập vào Zimbra Admin Console.

Các chức năng được hỗ trợ:
- Xem danh sách domain
- Xem danh sách distribution list (nhóm mail)
- Thêm/xóa thành viên khỏi nhóm mail
- Tìm kiếm và xem tài khoản mail
- Tạo tài khoản mail mới
- Đặt lại mật khẩu tài khoản mail

Tất cả thao tác gọi qua **Zimbra Admin SOAP API** (HTTPS, cổng mặc định 7071).

---

## Kiến Trúc

```
Trình duyệt (React)
  └── src/app/asset-management/zimbra/
        └── ZimbraClient (tab: Domains / Groups / Accounts)
              │ fetch /api/zimbra/*  (header: x-current-user-id)
              ▼
API Route Handler  (src/app/api/zimbra/*)
  └── requireZimbraAdmin(req)          ← kiểm tra quyền từ DB
        └── zimbra service             (src/lib/services/zimbra-service.ts)
              └── callAdmin(op, payload)  (src/lib/zimbra/soap-client.ts)
                    ├── getToken()     ← cache token, single-flight
                    └── POST HTTPS     → Zimbra Server (:7071)
```

### Các Module Liên Quan

| File | Vai trò |
|------|---------|
| `src/lib/zimbra/config.ts` | Đọc biến môi trường, trả về `ZimbraConfig` |
| `src/lib/zimbra/types.ts` | Các interface và class lỗi (`ZimbraConfig`, `ZimbraError`, v.v.) |
| `src/lib/zimbra/soap-client.ts` | Giao tiếp SOAP, cache token admin, retry khi token hết hạn |
| `src/lib/zimbra/require-zimbra-admin.ts` | Guard kiểm tra quyền (`super_admin` / `admin`) |
| `src/lib/services/zimbra-service.ts` | Logic nghiệp vụ: list domains, accounts, groups, reset password |
| `src/lib/services/zimbraService.ts` | Barrel file — re-export toàn bộ từ `zimbra-service.ts` |
| `src/app/api/zimbra/*/route.ts` | API route handlers (5 file) |
| `src/app/asset-management/zimbra/` | UI: page + 4 component |

---

## Biến Môi Trường

Tất cả biến này chỉ dùng phía server (Node.js runtime), **không bao giờ** được expose ra client.

| Biến | Bắt buộc | Mô tả |
|------|---------|-------|
| `ZIMBRA_ADMIN_URL` | Bắt buộc | URL đầy đủ Zimbra Admin SOAP (ví dụ: `https://mail.example.com:7071/service/admin/soap`) |
| `ZIMBRA_ADMIN_USER` | Bắt buộc | Tài khoản quản trị Zimbra (ví dụ: `admin@example.com`) |
| `ZIMBRA_ADMIN_PASSWORD` | Bắt buộc | Mật khẩu tài khoản quản trị Zimbra |
| `ZIMBRA_TLS_REJECT_UNAUTHORIZED` | Tùy chọn | Mặc định `true`. Đặt `false` để bỏ qua lỗi chứng chỉ TLS tự ký (không khuyến nghị cho production) |
| `ZIMBRA_CA_CERT` | Tùy chọn | Nội dung PEM của CA certificate để pinning TLS (chuỗi nhiều dòng) |
| `ZIMBRA_DEFAULT_PASSWORD_SUFFIX` | Tùy chọn | Hậu tố mật khẩu mặc định khi tạo/reset tài khoản. Mặc định: `@123` |

Nếu bất kỳ biến bắt buộc nào bị thiếu, `getZimbraConfig()` ném lỗi tại thời điểm khởi động
route handler — app không crash toàn bộ, chỉ endpoint Zimbra bị lỗi.

---

## Danh Sách API Endpoint

Mọi endpoint đều gọi `requireZimbraAdmin` trước — chỉ `super_admin` và `admin` có quyền truy cập.

| Method | Path | Quyền | Chức năng |
|--------|------|-------|-----------|
| `GET` | `/api/zimbra/domains` | admin / super_admin | Lấy danh sách tất cả domain |
| `GET` | `/api/zimbra/groups` | admin / super_admin | Lấy danh sách distribution list |
| `POST` | `/api/zimbra/groups/members` | admin / super_admin | Thêm thành viên vào nhóm mail |
| `DELETE` | `/api/zimbra/groups/members` | admin / super_admin | Xóa thành viên khỏi nhóm mail |
| `GET` | `/api/zimbra/accounts` | admin / super_admin | Tìm kiếm tài khoản mail (query params: `domain`, `search`, `limit`) |
| `POST` | `/api/zimbra/accounts` | admin / super_admin | Tạo tài khoản mail mới |
| `POST` | `/api/zimbra/accounts/reset-password` | admin / super_admin | Đặt lại mật khẩu tài khoản |

### Request / Response Chi Tiết

**GET /api/zimbra/domains**
```
Response: { domains: [{ id: string, name: string }] }
```

**GET /api/zimbra/groups**
```
Response: { groups: [{ id: string, name: string, memberCount?: number }] }
```

**POST /api/zimbra/groups/members**
```
Body: { dlId: string, email: string }
Response: { ok: true }
```

**DELETE /api/zimbra/groups/members**
```
Body: { dlId: string, email: string }
Response: { ok: true }
```

**GET /api/zimbra/accounts**
```
Query: domain? (tên domain), search? (từ khóa), limit? (mặc định 100, tối đa 500)
Response: { accounts: [{ id: string, name: string, displayName?: string }] }
```

**POST /api/zimbra/accounts**
```
Body: { email: string, password?: string, displayName?: string }
Response 201: { account: { id: string, name: string } }
Response 409: { error: "Account already exists" }
```

**POST /api/zimbra/accounts/reset-password**
```
Body: { email: string }
Response: { email: string, newPassword: string }
```

---

## Các Hàm Service Được Export

File `src/lib/services/zimbra-service.ts` (import qua barrel `zimbraService.ts`):

| Hàm | Chữ ký | Mô tả |
|-----|--------|-------|
| `listDomains` | `() => Promise<{id, name}[]>` | Lấy tất cả domain từ Zimbra |
| `listGroups` | `() => Promise<{id, name, memberCount?}[]>` | Lấy tất cả distribution list |
| `addGroupMember` | `(dlId: string, email: string) => Promise<void>` | Thêm thành viên vào nhóm |
| `removeGroupMember` | `(dlId: string, email: string) => Promise<void>` | Xóa thành viên khỏi nhóm |
| `searchAccounts` | `(opts: {domain?, query?, limit?}) => Promise<{id, name, displayName?}[]>` | Tìm kiếm tài khoản |
| `createAccount` | `(opts: {email, password?, displayName?}) => Promise<{id, name}>` | Tạo tài khoản mới |
| `resetPassword` | `(email: string) => Promise<{email, newPassword}>` | Đặt lại mật khẩu |
| `defaultPassword` | `(canonicalEmail: string) => string` | Tính mật khẩu mặc định (localpart + suffix) |
| `escapeLdap` | `(s: string) => string` | Escape ký tự đặc biệt theo RFC 4515 cho LDAP filter |

---

## SOAP Client — Cơ Chế Cache Token

`src/lib/zimbra/soap-client.ts` xuất một hàm duy nhất:

```typescript
callAdmin<TRes>(op: string, payload: Record<string, unknown>): Promise<TRes>
```

Cơ chế xác thực với Zimbra:
1. Lần đầu gọi: thực hiện `AuthRequest` để lấy `authToken`.
2. Token được cache trong module-level `tokenPromise`. Tất cả lần gọi đồng thời đều
   `await` cùng một Promise đang chờ (single-flight) — tránh spam AuthRequest.
3. Token hết hạn được phát hiện qua `expiresAt = Date.now() + lifetime * 0.9`.
   Lifetime mặc định 12 giờ nếu Zimbra không trả về.
4. Khi nhận lỗi `service.AUTH_EXPIRED` hoặc `service.AUTH_REQUIRED`, client tự động
   xóa cache và lấy token mới, rồi retry request một lần.
5. Mỗi request có timeout 6 giây.

---

## Bảo Mật

### TLS / Chứng Chỉ
- `ZIMBRA_TLS_REJECT_UNAUTHORIZED` mặc định `true` — từ chối chứng chỉ không hợp lệ.
- Đặt `false` chỉ dùng cho môi trường dev/test nội bộ với chứng chỉ tự ký.
- `ZIMBRA_CA_CERT` cho phép cung cấp CA bundle riêng để pinning chứng chỉ Zimbra,
  thay vì dùng CA hệ thống.

### Guard Quyền
- `requireZimbraAdmin(req)` trích xuất `x-current-user-id` từ header, sau đó truy vấn
  bảng `users` để xác minh `role IN ('super_admin', 'admin')` và `status = 'active'`.
- Guard từ chối 401 nếu thiếu header, 403 nếu role không đủ quyền.

### Lưu Ý Bảo Mật Quan Trọng

> **Header `x-current-user-id` hiện có thể bị giả mạo (spoofable).**
> Guard xác minh role trong DB, nhưng userId ban đầu đến từ header không được ký.
> Sau khi auth migration (JWT + bcrypt) hoàn tất, cần thay bằng userId trích xuất
> từ JWT/session cookie đã xác thực. Xem TODO trong `require-zimbra-admin.ts`.

### Audit Log
- `POST /api/zimbra/groups/members` và `DELETE /api/zimbra/groups/members` ghi
  `zimbra_member_added` / `zimbra_member_removed` vào `audit_logs`.
- `POST /api/zimbra/accounts` ghi `zimbra_account_created`.
- `POST /api/zimbra/accounts/reset-password` ghi `zimbra_password_reset`.
  Mật khẩu mới **không bao giờ được ghi vào audit log**.

---

## UI

| Component | Vị trí | Chức năng |
|-----------|--------|-----------|
| `ZimbraPage` | `src/app/asset-management/zimbra/page.tsx` | Server component — wrapper |
| `ZimbraClient` | `.../zimbra/components/ZimbraClient.tsx` | Client component — điều hướng tab |
| `DomainsTab` | `.../zimbra/components/DomainsTab.tsx` | Hiển thị danh sách domain |
| `GroupsTab` | `.../zimbra/components/GroupsTab.tsx` | Hiển thị nhóm, thêm/xóa thành viên |
| `AccountsTab` | `.../zimbra/components/AccountsTab.tsx` | Tìm kiếm, tạo tài khoản, reset mật khẩu |

Truy cập từ sidebar: **Quản Lý Tài Sản > Zimbra Mail** (`/asset-management/zimbra`).

---

## Tài Liệu Liên Quan

- [Kiến trúc hệ thống](./system-architecture.md)
- [Hướng dẫn triển khai](./deployment-guide.md)
- [Hệ thống phân quyền](./feature-permissions.md)

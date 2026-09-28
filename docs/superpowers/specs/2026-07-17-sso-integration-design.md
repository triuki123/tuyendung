# Thiết kế: Tích hợp FADO SSO vào AssetFlowPro

**Ngày:** 2026-07-17
**Trạng thái:** Đã duyệt thiết kế, chờ lập kế hoạch triển khai
**SSO:** https://sso.fadoai.com (OIDC + OAuth2, docs: https://sso.fadoai.com/sdk/docs)

## 1. Mục tiêu

1. **Login qua SSO:** người dùng đăng nhập AssetFlow bằng tài khoản FADO SSO (OIDC Authorization Code + PKCE). Bỏ form mật khẩu cho user thường.
2. **Quản lý user SSO từ AssetFlow:** quản lý tạo/sửa/khóa user trên trang Users → tự đồng bộ sang SSO qua Provisioning API (M2M).

## 2. Các quyết định đã chốt

| Quyết định | Lựa chọn |
|---|---|
| Mô hình dữ liệu user | **AssetFlow là master** — user tạo/sửa/khóa ở AssetFlow, đồng bộ sang SSO. Login SSO map về user local bằng email. Không auto-provision khi login. |
| Chế độ login | **Chỉ SSO** — form mật khẩu ẩn khỏi UI. |
| Dự phòng | **Break-glass cho super_admin** — `POST /api/auth/login` chỉ chấp nhận `role === 'super_admin'`, truy cập qua `?mode=emergency`. Chỉ super_admin giữ bcrypt hash local; user thường `password = NULL`. |
| OIDC client | **BFF tự viết + `jose`** — confidential client, token không chạm browser, cắm vào hạ tầng session sẵn có. |
| Cơ chế sync | **Đồng bộ ngay + trạng thái sync** — gọi Provisioning API trong request; lỗi SSO không chặn thao tác local, đánh dấu để retry. |
| RBAC | Quyền lấy từ `module_permissions` local. Claims `role`/`module_permissions` trong token SSO **bị bỏ qua**. |

## 3. Bối cảnh kỹ thuật

### AssetFlow hiện tại
- Login: `POST /api/auth/login` (bcrypt) → `buildLoginResponse()` (`src/lib/auth/finishLogin.ts`) tạo session trong `user_sessions` + cookie HMAC `assetflow_session` (`src/lib/authCookie.ts`).
- `src/middleware.ts` strip header danh tính client, verify cookie + session DB qua `/api/internal/session/validate`, tiêm header tin cậy (`getEffectiveContext` cho đa công ty).
- Trang quản lý user: `src/app/users/` → `/api/users` → `src/lib/services/usersService.ts`.
- Chưa có `jose`/`openid-client` — cần thêm dependency `jose`.

### SSO (từ docs)
- Issuer `https://sso.fadoai.com/oidc`, discovery `/.well-known/openid-configuration`, JWKS `/jwks.json`, JWT RS256.
- Authorization Code + PKCE bắt buộc. Access/id_token TTL 15′, code 60″.
- Provisioning API `https://sso.fadoai.com/provisioning/users` — M2M client_credentials, scope `users:write`, rate limit **30 req/phút**:
  - `POST /provisioning/users` (tạo, password ≥ **10 ký tự**)
  - `GET /provisioning/users?q=&page=&limit=` · `GET /:id` · `GET ?email=`
  - `PATCH /:id` (fullName/displayName/phoneNumber)
  - `PUT /:id/password` (reset, thu hồi mọi phiên SSO)
  - `PATCH /:id/status` (`active` | `inactive`) — **không có xóa cứng**
- **Email thuộc domain Zimbra không được tạo local user trên SSO** — các user này login SSO bằng chính mật khẩu Zimbra.

## 4. Điều kiện tiên quyết (thao tác trên SSO backoffice)

Đăng ký 2 client:

| Client | Loại | Cấu hình |
|---|---|---|
| `assetflow-web` | Confidential | Redirect URIs: `https://assetflow.fadoai.com/api/auth/sso/callback`, `http://localhost:4028/api/auth/sso/callback`. Scopes: `openid profile email`. |
| `assetflow-provisioner` | M2M | Scope `users:write`. |

Lưu `clientSecret` (SSO chỉ trả 1 lần) vào env — không commit.

## 5. Biến môi trường mới

```
SSO_ISSUER=https://sso.fadoai.com/oidc
SSO_CLIENT_ID=assetflow-web
SSO_CLIENT_SECRET=***
SSO_M2M_CLIENT_ID=assetflow-provisioner
SSO_M2M_CLIENT_SECRET=***
```

## 6. Phần 1 — Login qua SSO

### 6.1 Thành phần mới

**`src/lib/auth/ssoClient.ts`** — OIDC helper thuần server-side:
- Sinh `code_verifier`/`code_challenge` (S256), `state`, `nonce`.
- Đổi code lấy token: `POST {issuer}/token` với Basic auth (`client_id:client_secret`) + `code_verifier`.
- Verify `id_token` bằng `jose`: `createRemoteJWKSet(new URL('{issuer}/jwks.json'))`, check `iss === SSO_ISSUER`, `aud === SSO_CLIENT_ID`, `nonce`, `exp`.

**`GET /api/auth/sso/start`** (`src/app/api/auth/sso/start/route.ts`):
- Sinh PKCE + state + nonce, lưu vào cookie httpOnly ký HMAC (tái dùng cơ chế ký của `authCookie.ts`), TTL 10 phút, kèm đích `?redirect=`.
- Redirect 302 sang `{issuer}/authorize?response_type=code&client_id=...&redirect_uri=...&scope=openid profile email&state=...&nonce=...&code_challenge=...&code_challenge_method=S256`.

**`GET /api/auth/sso/callback`** (`src/app/api/auth/sso/callback/route.ts`):
1. So `state` với cookie tạm; lệch → redirect login + lỗi.
2. Đổi `code` lấy `id_token` (server-to-server).
3. Verify `id_token` → lấy `email` (lowercase).
4. Tra `users` local theo email. Không có bản ghi hoặc `status !== 'active'` → redirect `/sign-up-login-screen?error=sso_no_account` ("Tài khoản chưa được cấp trên AssetFlow").
5. Có → biến thể redirect của `buildLoginResponse()` trong `finishLogin.ts` (cùng logic: `createSession` + login history + `updateLastLogin` + set cookie `assetflow_session`; chỉ khác trả 302 thay vì JSON). Ghi `user_login_history` như luồng cũ; nếu schema có chỗ ghi phương thức thì đánh dấu `sso`, không thì giữ nguyên shape hiện tại (kiểm tra schema ở bước lập kế hoạch).
6. Redirect về đích `?redirect` (chỉ chấp nhận đường dẫn tương đối bắt đầu bằng `/` — chống open redirect) hoặc `/dashboard`.
7. Xóa cookie tạm PKCE/state.

### 6.2 Thay đổi thành phần hiện có
- **`LoginClient.tsx`:** chỉ còn nút "Đăng nhập với FADO SSO" → `/api/auth/sso/start?redirect=...`. Form email/mật khẩu + modal 2FA/quên mật khẩu chỉ render khi `?mode=emergency`. Hiển thị thông báo lỗi từ `?error=` (sso_no_account, sso_failed...).
- **`POST /api/auth/login`:** sau khi bcrypt đúng, chặn nếu `role !== 'super_admin'` → 403 "Đăng nhập mật khẩu đã tắt — vui lòng dùng SSO".
- **`src/middleware.ts`:** thêm `/api/auth/sso/` vào whitelist public.
- **Client localStorage:** callback là redirect nên client không nhận JSON user như luồng cũ. Sau redirect về `/dashboard`, `AppLayout` cần bootstrap `assetflow_auth` từ server nếu localStorage trống — thêm endpoint `GET /api/auth/me` (đọc header danh tính middleware đã tiêm + trả user JSON + perms hiệu lực, cùng shape với response login cũ) và gọi nó trong `AppLayout` khi thiếu localStorage.
- **Đăng xuất:** giữ logout local như hiện tại. Không gọi `/oidc/session/end` (không kill phiên SSO của app khác). Có thể thêm sau, ngoài scope.

### 6.3 Vòng đời session
- `id_token` chỉ dùng một lần lúc callback. Không xin `offline_access`, không lưu access/refresh token SSO cho luồng login.
- Session AssetFlow 30 ngày (theo `getSecurityConfig().sessionDays`) tự quản như cũ.

## 7. Phần 2 — Đồng bộ quản lý user sang SSO

### 7.1 Migration 297

```sql
-- Migration 297: cột đồng bộ SSO trên bảng users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_error  TEXT,
  ADD COLUMN IF NOT EXISTS sso_synced_at   TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS users_sso_user_id_key
  ON users (sso_user_id) WHERE sso_user_id IS NOT NULL;
```

`sso_sync_status`: `synced` | `error` | `skipped_zimbra` | `NULL` (chưa sync).

### 7.2 Service mới — `src/lib/services/ssoProvisioningService.ts`
- `getMachineToken()`: `POST {issuer}/token` grant `client_credentials` scope `users:write`; cache in-memory theo `expires_in`, refresh sớm 60″; gặp 401 → xin token mới + retry đúng 1 lần.
- `createSsoUser(payload)`, `updateSsoProfile(id, patch)`, `setSsoStatus(id, status)`, `resetSsoPassword(id, password)`, `findSsoUserByEmail(email)`.
- `isZimbraEmail(email)`: so domain với danh sách cấu hình (mục 7.6).
- Throttle nội bộ ≤ 30 req/phút (hàng đợi tuần tự cho bulk).
- Không log password/token.

### 7.3 Cắm vào `usersService.ts`

| Thao tác local | Hành động SSO | Ghi chú |
|---|---|---|
| `createUser` | Email Zimbra → không gọi SSO, `sso_sync_status='skipped_zimbra'`. Email thường → `POST /provisioning/users` (password người tạo nhập, ≥10 ký tự) → lưu `sso_user_id`, `synced`. Email đã tồn tại bên SSO → `GET ?email=` để **link** + `PATCH` profile. | Nâng validation password tạo user từ 8 → 10 ký tự. User thường không lưu bcrypt local (`password = NULL`); riêng super_admin giữ hash (break-glass). |
| `updateUser` (name/phone) | `PATCH /users/:id` nếu có `sso_user_id`. | Đổi email: SSO không hỗ trợ → cảnh báo "cần xử lý tay bên SSO", đánh dấu `error`. |
| `deactivateUser` | `PATCH /users/:id/status` → `inactive`. | Khóa cả hai nơi. |
| Kích hoạt lại | → `active`. | |
| `hardDeleteUser` | Set `inactive` bên SSO rồi xóa local. | SSO không có xóa cứng — chấp nhận bản ghi SSO còn nhưng khóa. |
| `adminChangeUserPassword` | `PUT /users/:id/password` (SSO tự thu hồi phiên). | Chỉ user non-Zimbra. Không ghi hash local (trừ super_admin). |

Mọi lỗi SSO: thao tác local vẫn hoàn tất; ghi `sso_sync_status='error'` + `sso_sync_error`; phát notification (7.7).

### 7.4 API + UI trang Users
- Badge trạng thái mỗi user: `✓ SSO` / `⚠ Chưa đồng bộ` (tooltip lỗi) / `Zimbra`.
- `POST /api/users/[id]/sso-sync` — retry cho 1 user (tạo/link/patch/status tùy trạng thái hiện tại). Quyền: `users:edit`.
- `POST /api/users/sso-sync-all` — bulk, tuần tự có throttle, trả tổng kết `{created, linked, skipped_zimbra, errors[]}`. Quyền: admin/super_admin. Đây cũng là công cụ migrate lần đầu.
- Không thêm module RBAC mới — dùng module `users` sẵn có.

### 7.5 Migrate user hiện có (chạy một lần sau deploy)
- Email Zimbra (đa số) → đánh dấu `skipped_zimbra`, không cần hành động — login SSO bằng mật khẩu Zimbra ngay.
- Email ngoài (gmail...) → bulk sync sinh mật khẩu ngẫu nhiên 16 ký tự, tạo bên SSO, gửi email mật khẩu ban đầu qua SES (pattern `SendAccountEmailModal`).
- super_admin: sync sang SSO như thường nhưng **giữ nguyên bcrypt hash local**.
- Bcrypt hash cũ của user thường: **để nguyên, không xóa** — vô hại vì `POST /api/auth/login` đã chặn non-super_admin; tránh thao tác destructive không đảo ngược được. Có thể dọn sau bằng migration riêng nếu muốn.

### 7.6 Cấu hình hệ thống (skill hardcode-to-config)
Thêm vào `system_settings` qua `systemConfig.ts` + `systemSettingsService.ts` + tab trong `/cau-hinh-he-thong`:
- `sso.zimbra_domains` — danh sách domain Zimbra (seed từ domain đang dùng thực tế).
- `sso.auto_sync_enabled` — bật/tắt tự đồng bộ khi tạo/sửa user (mặc định bật).
Seed rỗng/mặc định = hành vi mô tả ở trên, không đổi hành vi khi deploy nếu chưa cấu hình.

### 7.7 Thông báo (qua notification engine, đúng luật CLAUDE.md)
- Template + event mới `sso.sync_failed` (category hệ thống): notify admin khi 1 thao tác sync thất bại, kèm tên user + lỗi. Phát bằng `notify('sso.sync_failed', vars, { recipients })` — không INSERT thủ công.

## 8. Xử lý lỗi & edge case

| Tình huống | Hành vi |
|---|---|
| SSO down lúc login | Trang login hiện "SSO không phản hồi"; super_admin vào `?mode=emergency`. |
| SSO down lúc tạo/sửa user | Thao tác local hoàn tất, badge `⚠`, retry bằng nút Đồng bộ. |
| `state` lệch / code hết hạn (60″) | Redirect login + `?error=sso_failed`, thử lại. |
| Login SSO nhưng email không có trong `users` | Từ chối — "Tài khoản chưa được cấp trên AssetFlow". |
| User local `inactive` login SSO | Từ chối như trên. |
| Email đã tồn tại bên SSO khi tạo | Link bằng `GET ?email=` thay vì tạo trùng. |
| Token M2M hết hạn giữa chừng | Refresh + retry 1 lần. |
| Rate limit 30 req/phút | Hàng đợi tuần tự trong service; bulk sync chạy chậm có chủ đích. |

## 9. Kiểm thử

- **Unit:** `ssoClient` (verify id_token: iss/aud/nonce sai → reject), `ssoProvisioningService` (token cache, retry 401, phân loại Zimbra), validation password ≥10.
- **Tích hợp (dev, SSO thật hoặc localhost:4000):** login round-trip đủ 6 bước; login email không tồn tại → từ chối; tạo user email thường → xuất hiện bên SSO → login được ngay; tạo user email Zimbra → skipped; khóa user → login SSO bị chặn; break-glass: user thường 403, super_admin vào được.
- **Regression:** luồng session/middleware/đa công ty không đổi — smoke test các trang chính sau login SSO.

## 10. Câu hỏi mở (không chặn triển khai)

1. SSO có luồng "quên mật khẩu" self-service cho local user không? Docs không nhắc. Nếu không, user quên pass nhờ admin reset qua trang Users (đã cover).
2. Nút "Đăng xuất mọi nơi" (RP-initiated logout `/oidc/session/end`) — để giai đoạn sau.

## 11. Phạm vi KHÔNG làm lần này

- Không auto-provision user local từ SSO khi login.
- Không đồng bộ role/permission hai chiều với SSO.
- Không SSO hóa các luồng public/forms/warehouse guest (giữ nguyên whitelist middleware).
- Không gỡ hạ tầng 2FA/OTP hiện có (vẫn dùng được ở luồng emergency).

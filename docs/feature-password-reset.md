# Tính Năng Quên Mật Khẩu (Password Reset)

**Cập nhật:** 2026-05-27

---

## Trạng Thái Hiện Tại

> **Lưu ý:** Các route `/api/auth/forgot-password`, `/api/auth/verify-reset-token`, và `/api/auth/reset-password` hiện vẫn đang dùng Supabase client (`src/lib/supabase.ts`). Chúng cần được rewrite sang `pg` Pool (`src/lib/db.ts`) như phần còn lại của ứng dụng. Xem task #4 trong danh sách công việc.

---

## Tổng Quan Flow

```
User nhấp "Quên mật khẩu?" trên login screen
  └─ ForgotPasswordModal → POST /api/auth/forgot-password { email }
       └─ Tạo token ngẫu nhiên (crypto.randomBytes(32))
       └─ Lưu vào bảng password_reset_tokens (expires 24h)
       └─ Gửi email reset qua AWS SES
            └─ Link: {APP_URL}/reset-password?token={token}

User click link trong email → /reset-password?token=xxx
  └─ GET /api/auth/verify-reset-token?token=xxx (kiểm tra còn hạn)
  └─ User nhập mật khẩu mới → POST /api/auth/reset-password
       └─ Xác minh token hợp lệ, chưa dùng, chưa hết hạn
       └─ Cập nhật mật khẩu người dùng
       └─ Đánh dấu token đã dùng (used = true)
       └─ Vô hiệu hóa tất cả token khác của user
```

---

## Database Schema

### Bảng `password_reset_tokens`

```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id    UUID NOT NULL      -- FK → users.id
email      TEXT NOT NULL
token      TEXT UNIQUE NOT NULL  -- 64 ký tự hex (32 bytes)
expires_at TIMESTAMP NOT NULL    -- tạo + 24 giờ
used       BOOLEAN DEFAULT false
created_at TIMESTAMP DEFAULT NOW()
```

Indexes:
- `idx_password_reset_tokens_token` — tìm kiếm nhanh theo token
- `idx_password_reset_tokens_email` — tìm kiếm nhanh theo email
- `idx_password_reset_tokens_expires` — dọn tokens hết hạn

File schema: `sql/password_reset_tokens.sql`

Để tạo bảng trên Postgres tự-host:
```bash
psql "$DATABASE_URL" -f sql/password_reset_tokens.sql
```

---

## API Endpoints

### POST `/api/auth/forgot-password`

```json
// Request
{ "email": "user@example.com" }

// Response (luôn trả về 200 để tránh user enumeration)
{ "success": true, "message": "Nếu email tồn tại, bạn sẽ nhận được email reset" }
```

Logic:
1. Kiểm tra email hợp lệ
2. Kiểm tra user tồn tại trong bảng `users`
3. Nếu đã có token còn hiệu lực cho email này → trả về thành công (không tạo thêm)
4. Tạo token 32 bytes hex, lưu vào `password_reset_tokens`
5. Gửi email qua AWS SES

### GET `/api/auth/verify-reset-token?token={token}`

```json
// Response hợp lệ
{ "valid": true, "email": "user@example.com", "expiresAt": "2026-05-20T..." }

// Response không hợp lệ / hết hạn
{ "valid": false, "error": "Token không hợp lệ" }
```

### POST `/api/auth/reset-password`

```json
// Request
{
  "token": "abc123...",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}

// Response thành công
{ "success": true, "message": "Mật khẩu đã được cập nhật thành công" }
```

Validation: mật khẩu tối thiểu 6 ký tự, hai trường phải khớp.

---

## Email Service

**File:** `src/lib/services/emailService.ts`

Sử dụng **AWS SES** (`@aws-sdk/client-ses`). Không dùng nodemailer.

### Biến Môi Trường

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `AWS_REGION` | Region SES (ví dụ: `ap-southeast-2`) | Có |
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key | Có |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key | Có |
| `SES_FROM_EMAIL` | Email người gửi (đã verify trong SES) | Có |
| `APP_URL` | Base URL app (dùng trong reset link) | Có |

Nếu `AWS_ACCESS_KEY_ID` hoặc `AWS_SECRET_ACCESS_KEY` không có, service sẽ throw error.

### Cấu Hình AWS SES

1. Tạo IAM user với policy `AmazonSESFullAccess`
2. Verify email sender trong AWS SES Console
3. Chuyển khỏi SES Sandbox (yêu cầu nếu gửi đến email bất kỳ)
4. Điền credentials vào `.env.local` (local) hoặc biến môi trường Docker

---

## UI Components

| Component | File | Mô tả |
|-----------|------|-------|
| `ForgotPasswordModal` | `src/app/sign-up-login-screen/components/ForgotPasswordModal.tsx` | Modal nhập email |
| `ResetPasswordPage` | `src/app/reset-password/page.tsx` | Trang nhập mật khẩu mới |
| `LoginClient` | `src/app/sign-up-login-screen/components/LoginClient.tsx` | Tích hợp nút "Quên mật khẩu?" |

---

## Bảo Mật

- Token có hạn sử dụng 24 giờ
- Token chỉ dùng được một lần (`used = true` sau khi dùng)
- Khi reset thành công, tất cả token cũ của user bị vô hiệu hóa
- API không tiết lộ email có tồn tại hay không (bảo vệ user enumeration)
- Mật khẩu tối thiểu 6 ký tự

---

## Test Thủ Công

```bash
# 1. Yêu cầu reset
curl -X POST http://localhost:4028/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# 2. Xác minh token (thay YOUR_TOKEN)
curl "http://localhost:4028/api/auth/verify-reset-token?token=YOUR_TOKEN"

# 3. Đặt mật khẩu mới
curl -X POST http://localhost:4028/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN","newPassword":"newpass123","confirmPassword":"newpass123"}'
```

---

## Việc Cần Làm (Rewrite sang pg)

Khi rewrite các route này sang `pg`, thay thế:
- `supabaseAdmin.auth.admin.listUsers()` → `queryOne('SELECT id FROM users WHERE email = $1', [email])`
- `supabase.from('password_reset_tokens').select(...)` → `query('SELECT * FROM password_reset_tokens WHERE ...')`
- `supabaseAdmin.auth.admin.updateUserById(id, { password })` → `execute('UPDATE users SET password = $1 WHERE id = $2', [newPassword, userId])`

Lưu ý: login route hiện tại so sánh mật khẩu plain-text (`user.password !== password`). Khi rewrite password reset, cần thống nhất chiến lược hash (bcrypt) cho toàn bộ auth flow.

# Đăng nhập bằng Telegram (Telegram Login Widget) — Cài đặt & Vận hành

Cho phép người dùng đăng nhập FADO AssetFlow bằng tài khoản Telegram, song song với
Email/Password. Dùng **Telegram Login Widget** chính thức + xác thực chữ ký phía máy chủ.

> Khác với *Phê duyệt trên Telegram* (`docs/telegram-approval-setup.md`): tính năng đó dùng
> bot để nhận lệnh duyệt; tính năng này dùng bot làm **nhà cung cấp danh tính** để đăng nhập.

## Khóa định danh
- Chỉ dùng **`telegram_id`** (Telegram User ID) làm khóa định danh — DUY NHẤT toàn hệ thống.
- KHÔNG dùng `username` (người dùng có thể đổi username bất cứ lúc nào).

## Biến môi trường
```
TELEGRAM_BOT_TOKEN=...                      # đã có — dùng để xác thực chữ ký (secret = SHA256(token))
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=fadoaibot # MỚI — tên bot (KHÔNG @). ⚠️ INLINE LÚC BUILD →
                                            #   phải set trên Coolify TRƯỚC khi build/deploy.
```

## Cấu hình bắt buộc trên @BotFather (làm 1 lần)
Telegram Login Widget chỉ chạy trên domain đã đăng ký với bot:
1. Mở **@BotFather** → `/setdomain` → chọn bot **@fadoaibot**.
2. Nhập domain: `assetflow.fadoai.com` (không kèm https://, không path).
3. Nếu sai/không set → widget hiện lỗi *"Bot domain invalid"*.

> Local dev (`localhost:4028`) KHÔNG đăng nhập Telegram thật được (Telegram chặn domain lạ).
> Iframe widget vẫn render để kiểm tra layout, nhưng bấm vào sẽ báo domain invalid.

## Cơ sở dữ liệu
Migration **`146_add_telegram_identity_to_users.sql`** thêm vào `users`:
`telegram_id` (unique), `telegram_username`, `telegram_first_name`, `telegram_last_name`,
`telegram_photo_url`, `telegram_linked_at`. (Cột `telegram_chat_id`/`telegram_enabled` cũ giữ nguyên.)

## Luồng xác thực

### A. Người dùng ĐÃ liên kết Telegram
1. Vào trang đăng nhập → bấm widget **"Log in with Telegram"**.
2. Telegram xác thực, trả payload (`id, first_name, …, auth_date, hash`) về `data-onauth`.
3. Client `POST /api/auth/telegram` với payload.
4. Server `verifyTelegramAuth()`: dựng `data_check_string`, `HMAC_SHA256` với secret = `SHA256(bot_token)`,
   so khớp `hash` (timing-safe) + kiểm `auth_date` ≤ 24h.
5. Tìm user theo `telegram_id` → tạo session (`user_sessions`) + ghi `user_login_history` + `last_login`.
6. Trả về user + `session_id` → client lưu `localStorage` (`assetflow_auth`, `currentUser`) → vào dashboard.

### B. Người dùng CHƯA liên kết
1–4. Như trên (xác thực chữ ký thành công).
5. Không tìm thấy `telegram_id` → server trả `{ needsLink: true, telegram }`.
6. Client mở **modal liên kết**: nhập email + mật khẩu FADO AssetFlow.
7. `POST /api/auth/telegram/link` `{ telegram, email, password }`:
   - Xác thực **lại** chữ ký Telegram (không tin client).
   - `bcrypt.compare` email/mật khẩu.
   - Đảm bảo `telegram_id` chưa gắn tài khoản khác (409 nếu trùng).
   - Lưu thông tin Telegram vào user (+ set `telegram_chat_id` để dùng kênh thông báo).
   - Tạo session → đăng nhập luôn.
8. Lần sau → đăng nhập trực tiếp bằng Telegram (luồng A).

### C. Liên kết/Hủy trong Cài đặt (đang đăng nhập)
- *Cài đặt → Cài Đặt Chung → Tài Khoản Telegram*.
- Liên kết: bấm widget → `POST /api/auth/telegram/link` `{ telegram, userId }` (xác thực chữ ký, chống trùng).
- Hủy: `POST /api/auth/telegram/unlink` `{ userId }` (xóa thông tin Telegram, giữ `telegram_chat_id`).

## Bảo mật
- Chữ ký HMAC-SHA256 theo chuẩn Telegram, so khớp **timing-safe**.
- Chống replay: `auth_date` tối đa 24h.
- `telegram_id` UNIQUE (partial index) → không thể gắn 1 Telegram cho 2 tài khoản.
- Endpoint `link` luôn **xác thực lại** payload (không tin `needsLink` từ vòng trước).
- Tài khoản `inactive` bị từ chối (403).

## API
| Endpoint | Nhiệm vụ |
|---|---|
| `POST /api/auth/telegram` | Đăng nhập Telegram; trả `needsLink` nếu chưa liên kết |
| `POST /api/auth/telegram/link` | Liên kết (kèm email/mật khẩu HOẶC userId đang đăng nhập) |
| `POST /api/auth/telegram/unlink` | Hủy liên kết |

## Triển khai production (checklist)
1. Set env `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=fadoaibot` trên Coolify (**build-time**) → rebuild.
2. @BotFather `/setdomain` = `assetflow.fadoai.com`.
3. Deploy (migration 146 chạy tự động).
4. Test: tài khoản đã set `telegram_id` → đăng nhập 1 chạm; tài khoản mới → luồng liên kết.

## File đã tạo / sửa
**Tạo mới**
- `migrations/146_add_telegram_identity_to_users.sql`
- `src/lib/services/telegramAuthService.ts` — verify chữ ký + tìm/liên kết/hủy
- `src/app/api/auth/telegram/route.ts` — đăng nhập Telegram
- `src/app/api/auth/telegram/link/route.ts` — liên kết (2 chế độ)
- `src/app/api/auth/telegram/unlink/route.ts` — hủy liên kết
- `src/components/auth/TelegramLoginButton.tsx` — nhúng widget
- `docs/telegram-login-setup.md` — tài liệu này

**Sửa**
- `src/app/sign-up-login-screen/components/LoginClient.tsx` — nút Telegram + modal liên kết
- `src/app/settings/components/SettingsClient.tsx` — thẻ "Tài Khoản Telegram" (liên kết/hủy)
- `.env` — thêm `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

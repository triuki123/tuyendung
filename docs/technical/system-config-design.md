# Thiết kế: Cấu Hình Hệ Thống (Nhắc nhở + Bảo mật) ra UI

> Đưa các hằng số hardcode của **nhóm Nhắc nhở** và **nhóm Bảo mật/Auth** thành cấu hình DB + UI,
> theo skill `hardcode-to-config`, **không đổi hành vi khi deploy**.
>
> Phạm vi đợt này: **Nhắc nhở** + **Bảo mật**. Khung thiết kế để sẵn chỗ cắm các nhóm sau
> (Ticket, Tài sản, Tuân thủ luật...). **KHÔNG đụng Zimbra** (giữ nguyên env hiện tại).

## 0. Khác biệt với module chấm công (vì sao nhẹ hơn)

Chấm công cần **per-company + hiệu lực theo ngày** vì đụng số liệu lương lịch sử. Nhóm này thì
**không**: nhắc nhở và chính sách bảo mật chỉ cần *giá trị hiện hành toàn hệ thống*. Vì vậy dùng
schema **key/value đơn giản, global, không effective-date** → nhẹ hơn nhiều, ít rủi ro hơn.
(Nếu sau này một nhóm cần theo công ty — vd ngưỡng tuân thủ luật — sẽ thêm cột `company_id` nullable
cho riêng key đó, không ảnh hưởng phần còn lại.)

## 1. Schema (1 bảng key/value dùng chung)

```sql
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,         -- vd 'reminder.contract', 'security.session'
  category    TEXT NOT NULL,            -- 'reminder' | 'security' (để nhóm trên UI)
  value       JSONB NOT NULL,           -- khối giá trị (xem DEFAULTS)
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
```
- Seed **rỗng** → resolve trả DEFAULT → hành vi y hệt hiện tại.
- 1 dòng / 1 key (vd `reminder.contract`, `reminder.leave_balance`, `security.session`,
  `security.password`). Value là JSONB nhóm các field liên quan.
- Mirror sang `docker/postgres/reconcile.sql` (idempotent, `IF NOT EXISTS`).

## 2. Nguồn DEFAULTS + service

`src/lib/config/systemConfig.ts` (thuần TS, import được cả client/server):
```ts
// Chỉ cấu hình MỐC NHẮC (mảng số ngày trước hết hạn). Logic slot/giờ gửi giữ trong code từng service
// (bespoke + gắn với dedup log) — generalize ra config rủi ro, không làm đợt này.
export interface ReminderSetting { milestones: number[]; }
export interface SecurityConfig {
  sessionDays: number; resetTokenHours: number;
  // KHÔNG đưa passwordMinLength vào — SSO sắp thay mật khẩu, không đụng code mật khẩu.
}
export const DEFAULT_REMINDERS: Record<string, ReminderSetting> = {
  contract:         { milestones: [30,15,5,1] },
  leave_balance:    { milestones: [30,14,7,1] },
  asset_maintenance:{ milestones: [30,14,7,1] },
  evaluation:       { milestones: [7,3,1] },
  requisition:      { milestones: [5,1] },
};
export const DEFAULT_SECURITY: SecurityConfig = { sessionDays: 30, resetTokenHours: 24 };
```

`src/lib/services/systemSettingsService.ts`:
- `getReminderSetting(type)` → `ReminderSetting` (DB → merge lên DEFAULT_REMINDERS[type] → fallback DEFAULT).
- `getSecurityConfig()` → `SecurityConfig`.
- `getAllSettings(category)` / `saveSetting(key, value, actor)` / cache TTL ~60s + invalidate khi lưu.
- **Phòng thủ:** mọi truy vấn `.catch` trả DEFAULT (bảng chưa migrate → không vỡ).

## 3. Cắm vào logic (giữ chữ ký, đọc config trong lúc chạy)

### 3.1 Nhắc nhở — ⚠️ điểm mấu chốt
Các scheduler hiện khai báo `MILESTONES`/slot ở **đầu module** (đọc 1 lần lúc import). Phải đổi để
**đọc config TRONG mỗi lần chạy tick**, không phải lúc khởi tạo — nếu không, đổi config phải restart
app mới ăn. Mỗi service nhắc (`contractReminderService`, `leaveBalanceReminderService`,
`assetMaintenanceReminderService`, `evaluationReminderService`, `requisitionReminderService`,
`onboardingChecklistReminderService`) gọi `await getReminderSetting('<type>')` ở đầu hàm chạy.

Giá trị DEFAULT khớp 100% mảng cũ → seed rỗng = hành vi cũ.

### 3.2 Bảo mật
- **Session:** `authCookie.ts` `MAX_AGE_SECONDS` ← `getSecurityConfig().sessionDays`. Lưu ý: đổi chỉ
  áp dụng cho **phiên đăng nhập MỚI** (cookie cũ đã ký maxAge cũ) — ghi rõ trên UI.
- **Reset token:** `forgot-password/route.ts` `+24h` ← `resetTokenHours`.
- **Độ dài mật khẩu:** ❌ BỎ — SSO sắp thay mật khẩu, KHÔNG đụng code check mật khẩu (giữ nguyên
  6/8 hiện tại). ⇒ deploy đợt này 100% không đổi hành vi.
- **Giữ là code (KHÔNG đưa UI):** bcrypt rounds (10), login-history retention (90 ngày) — kỹ thuật.

## 4. API + UI

- `GET /api/system-config?category=` → trả settings đã resolve (mọi user đọc được phần cần để validate;
  hoặc tách: client chỉ cần `security.passwordMinLength`).
- `GET/PUT /api/system-config/settings` (super_admin) — đọc/lưu, có validate.
- **UI:** trang mới **"Cấu Hình Hệ Thống"** (khu Quản trị), RBAC **super_admin**, 2 tab:
  - *Nhắc nhở*: mỗi loại 1 hàng — sửa mảng mốc (chips số ngày) + chọn slot (sáng/chiều/cả hai).
  - *Bảo mật*: session (ngày), token reset (giờ), độ dài mật khẩu tối thiểu. Có cảnh báo "session chỉ
    áp dụng phiên mới".
  - Khung tab để cắm nhóm sau (Ticket/Tài sản) mà không dựng lại trang.

## 5. Validation
- Nhắc nhở: mảng số nguyên dương, sort giảm dần, ≤ 365, không rỗng (rỗng = tắt nhắc → cho phép nhưng cảnh báo).
- Bảo mật: `sessionDays` 1–365; `resetTokenHours` 1–168.

## 6. An toàn deploy (checklist skill hardcode-to-config)
- DEFAULT khớp 100% giá trị cũ (đối chiếu `HEAD`). **Đợt này KHÔNG có thay đổi hành vi nào** — chỉ
  thêm bảng + núm vặn. (Đã bỏ phần siết mật khẩu vì SSO sắp thay.)
- Migration idempotent + reconcile.sql mirror; chạy trên dev trước; `tsc --noEmit` sau mỗi bước.
- Scheduler đọc config trong tick (không lúc init) → đổi config ăn trong ≤1 chu kỳ, không cần restart.
- Adversarial review trước deploy: "giá trị nào lệch? scheduler nào còn đọc hằng số lúc init? client
  còn validate độ dài bằng số cứng không?"

## 7. Thứ tự build (mỗi bước type-check, không đổi hành vi tới bước cuối)
1. `systemConfig.ts` (DEFAULTS + type) + `systemSettingsService.ts` + migration + reconcile. (nền)
2. Cắm Nhắc nhở: 6 service đọc `getReminderSetting` trong tick.
3. Cắm Bảo mật: authCookie / forgot-password / các chỗ check password.
4. API `/api/system-config` + client validate password theo config.
5. UI trang "Cấu Hình Hệ Thống" (2 tab) + RBAC + validate.

## 8. KHÔNG làm trong đợt này
Zimbra (`@123` suffix, TLS) — giữ nguyên env theo yêu cầu. Cũng không đụng: chunk size, bcrypt rounds,
polling client, SSE reconnect, SQL LIMIT cứng (cần refactor riêng), email sender.

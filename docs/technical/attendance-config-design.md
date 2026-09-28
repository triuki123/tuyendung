# Thiết kế: Cấu hình chấm công ra UI (Phase 1)

> Mục tiêu: đưa các hằng số nghiệp vụ chấm công/tăng ca/kỳ công (đã gom ở Phase 0 trong
> `src/lib/config/attendanceConfig.ts`) ra DB + UI, để người kế thừa tự chỉnh không cần sửa code.
>
> Quyết định đã chốt với chủ dự án:
> 1. **Tách theo từng công ty** (có fallback về mặc định hệ thống).
> 2. **Hiệu lực theo ngày — lịch sử đầy đủ** (đổi config không phá số liệu kỳ cũ; mọi tính toán tra đúng phiên bản tại thời điểm đó).

## 1. Hệ quả kiến trúc (đọc kỹ trước khi code)

Hai lựa chọn trên khiến config **không còn là hằng số tĩnh** mà là **hàm theo (công ty, ngày)**:

```
resolveAttendanceConfig(companyId, onDate) → ResolvedConfig
```

- Hằng số hiện tại trong `attendanceConfig.ts` trở thành **giá trị mặc định / seed** (DEFAULTS).
- Các hàm tính thuần (`calculateOvertimeBrackets`, `classifyDayRecords`, tính giờ trong 2 bảng)
  hiện **không nhận config** → cần nhận thêm tham số `config` (resolved sẵn), default = DEFAULTS
  để không vỡ caller cũ và để client render được khi chưa có config.
- Nguyên tắc resolve **theo kỳ công** (không theo từng ngày) để tránh 1 tháng dính 2 phiên bản:
  ràng buộc `effective_from` chỉ được đặt vào **đầu kỳ công** (ngày 28). Giảm độ phức tạp,
  vẫn đúng thực tế (quy tắc công ít khi đổi giữa kỳ).

## 2. Schema

```sql
-- Mỗi (công ty | mặc định) có thể có NHIỀU phiên bản theo effective_from.
CREATE TABLE attendance_settings (
  id              TEXT PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = mặc định hệ thống
  effective_from  DATE NOT NULL,           -- nên rơi vào ngày bắt đầu kỳ công (28)
  config          JSONB NOT NULL,          -- toàn bộ giá trị (xem ResolvedConfig)
  note            TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, effective_from)      -- 1 phiên bản / mốc / phạm vi
);
CREATE INDEX idx_attendance_settings_lookup ON attendance_settings(company_id, effective_from DESC);
```

JSONB `config` chứa nguyên khối (versioned, dễ thêm field):
```jsonc
{
  "payrollStartDay": 28, "payrollEndDay": 27,
  "lunchStartHour": 12, "lunchEndHour": 13,
  "fullWorkdayMinutes": 480,
  "punchWindows": { "checkInStart": 4, "checkInEnd": 11, "checkOutStart": 14, "skipStart": 3, "skipEnd": 4 },
  "adjustmentDeadline": { "day": 27, "hour": 17 },
  "sheetSubmitDeadline": { "day": 28, "hour": 11 },
  "adjustmentSameDayEarliestHour": 19,
  "weekendDays": [0],
  "overtimeBrackets": { "eveningStartMin": 1050, "eveningEndMin": 1320, "nightEndMin": 1860 }
}
```

## 3. Resolve + cache

```
resolveAttendanceConfig(companyId, onDate):
  1. row = SELECT ... WHERE company_id = $companyId AND effective_from <= $onDate
           ORDER BY effective_from DESC LIMIT 1
  2. nếu không có → SELECT ... WHERE company_id IS NULL AND effective_from <= $onDate ...  (mặc định)
  3. nếu vẫn không có → DEFAULTS (hằng số seed trong code)
  4. merge nông JSONB lên DEFAULTS (an toàn khi thêm field mới)
```
- **Cache** key = `${companyId}:${effective_period}` TTL ~60s; invalidate khi lưu config.
- Server: resolve 1 lần cho mỗi (user→company, kỳ) rồi truyền `config` vào các hàm tính.
- Client (2 bảng tháng): gọi API `GET /api/attendance/config?companyId=&date=` lấy ResolvedConfig
  của kỳ đang xem để tính giờ/CN/ngưỡng cho khớp server.

## 4. Các bước build (đề xuất thứ tự, mỗi bước tự kiểm thử + không đổi hành vi tới bước cuối)

- **1a — Nền dữ liệu (không đổi hành vi):** migration + reconcile.sql, service `resolveAttendanceConfig`
  + cache, DEFAULTS lấy từ `attendanceConfig.ts`. Chưa cắm vào logic. Seed rỗng → luôn trả DEFAULTS.
- **1b — Cắm vào server:** đổi `attendanceConfig` getters / hàm thuần để nhận `config` resolved;
  thread vào attendanceService, deadline (adjustment + sheet), overtime, quy tắc 19h. Mặc định vẫn = DEFAULTS.
- **1c — Cắm vào client:** API config + 2 bảng tháng đọc theo (công ty, kỳ).
- **1d — UI cấu hình:** trang trong "Cấu Hình Máy Chấm Công": chọn công ty (hoặc Mặc định),
  đặt `effective_from` (ràng ngày 28), sửa từng nhóm, validation, xem lịch sử phiên bản. RBAC: chỉ super_admin.

## 5. Validation (UI + API)
- `checkInStart < checkInEnd <= checkOutStart`; `lunchStartHour < lunchEndHour`.
- `payrollStartDay`/deadline day trong 1–28 (tránh 29–31 lệch tháng).
- OT: `eveningStart < eveningEnd < nightEnd`.
- `effective_from` = ngày bắt đầu kỳ (28) — cảnh báo nếu không.
- `fullWorkdayMinutes` 1–1440; `weekendDays` ⊂ 0–6.

## 6. Rủi ro / lưu ý
- **Đổi kỳ công (28/27) giữa chừng** là thay đổi nhạy nhất — hiệu lực theo ngày giúp kỳ cũ giữ nguyên,
  nhưng cần test kỹ ranh giới kỳ.
- Bảng công đã `submitted`/`approved` **không tính lại** dù đổi config (đúng tinh thần lịch sử theo ngày).
- Đa công ty của user (1 user nhiều công ty) → resolve theo **công ty đang active** (đã có `getEffectiveContext`).
- Holidays đã ở `public_holidays` — giữ nguyên, không gộp vào config này.

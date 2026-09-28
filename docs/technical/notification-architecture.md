# Kiến trúc Thông báo — Lộ trình trưởng thành (Notification Architecture)

> Tài liệu thiết kế. Mục tiêu: đưa hệ thống thông báo từ "chuỗi hardcode rải rác"
> lên một **engine tập trung** chỉnh được qua UI, mở rộng được, **không đổi hành vi
> khi deploy** (behavior-preserving theo skill `hardcode-to-config`).
>
> **Phạm vi kênh:** in-app + **Telegram**. **KHÔNG làm Email** (quyết định: tập trung
> Telegram). Lớp trừu tượng channel vẫn để mở để sau thêm kênh nếu cần, nhưng không
> lên kế hoạch/triển khai email.

---

## 1. Bối cảnh & hiện trạng

Thông báo hiện phát ra từ ~2 đường:
- `notifyUser(payload)` (`src/lib/services/notify.ts`) — chuẩn, ghi `notifications` + đẩy Telegram.
- **~17 chỗ INSERT thẳng** vào bảng `notifications` (các reminder service, watcher, batch document/announcement…), tự dựng chuỗi + tự gọi Telegram.

Đã làm (nền bậc 2):
- `system_settings` (key/value) + `attendance_settings` — cấu hình tách DB.
- `notification_templates` + `src/lib/notifications/templates.ts` — template có biến `{{}}`, sửa qua UI tab "Mẫu thông báo" (`/cau-hinh-he-thong`).
- Resolve "seed rỗng = DEFAULT" → behavior-preserving.
- 5 nhắc HR đã render qua template registry.

**Định vị: ~2.3/5** — vững bậc 2, chạm vài thứ bậc 3 (resolve theo scope ở chấm công,
2 kênh in-app/Telegram) nhưng **chưa qua lằn ranh decoupling**: call site vẫn tự dựng
nội dung + tự ghi + tự gửi.

---

## 2. Thang trưởng thành (mục tiêu định vị)

| Bậc | Tên | Đặc trưng |
|---|---|---|
| 1 | Hardcode | Chuỗi/ngày/giờ nằm trong code, đổi = sửa code + deploy |
| 2 | Externalized | Config + template tách DB, sửa qua UI, store tập trung |
| 3 | Event-decoupled | Call site phát *sự kiện*; engine trung tâm chọn template + kênh + người nhận |
| 4 | Preference + versioning | Người nhận chọn loại × kênh; template có lịch sử/rollback/i18n/audit |
| 5 | Platform | Outbox + retry, digest/batching, rate-limit, analytics, config-as-code, approval, search |

**Đích thực tế đề xuất:** **bậc 3 + phần lớn bậc 4** (không email). Bậc 5 chỉ làm khi
quy mô đòi hỏi (đầu tư lớn, lợi ích giảm dần với ERP nội bộ).

---

## 3. Kiến trúc đích

### 3.1 Một cửa duy nhất: `notify(eventKey, payload, opts)`

Mọi nơi phát thông báo gọi **một** hàm, **không** tự dựng chuỗi / INSERT / gọi Telegram:

```ts
await notify('contract.expiring', {
  contractNumber, employeeName, endDate, daysLeft, daysOverdue,
}, { recipients });   // recipients: danh sách user (hoặc rule)
```

Engine bên trong làm tuần tự:
1. Tra **event catalog** theo `eventKey` → biết: template key, kênh mặc định, icon, mẫu `related_url`.
2. **Render** template (registry hiện có) với payload.
3. Lọc người nhận theo **preference** (bậc 4; bậc 3 chưa có = gửi hết).
4. Đẩy qua từng **channel adapter** đang bật.
5. (Bậc 5) Ghi **outbox** + theo dõi trạng thái + retry.

### 3.2 Event catalog

`src/lib/notifications/eventCatalog.ts` — khai báo mọi sự kiện (≈55):

```ts
interface NotificationEvent {
  key: string;                 // 'contract.expiring'
  templateKey: string | ((p) => string); // map sang notification_templates (hỗ trợ sub-state)
  channels: Channel[];         // ['inapp','telegram'] mặc định
  notifType: string;           // giá trị cột notifications.type (GIỮ NGUYÊN để không vỡ UI cũ)
  icon: string;
  relatedUrl?: (p) => string;
}
```

> Quan trọng: `notifications.type` **giữ nguyên** các giá trị cũ (`contract_renewal`,
> `evaluation_reminder`…) để filter/hiển thị/notification cũ không vỡ. `eventKey` là
> lớp ngữ nghĩa MỚI nằm trên, không thay thế `type`.

### 3.3 Channel adapter

`src/lib/notifications/channels/`:
- `inApp.ts` — INSERT `notifications` (gói logic đang rải rác).
- `telegram.ts` — gói `sendTelegramMessageWithButton` + escape + nút.
- *(interface `Channel` để mở — KHÔNG triển khai email.)*

```ts
interface ChannelAdapter {
  id: 'inapp' | 'telegram';
  send(recipient, rendered, ctx): Promise<DeliveryResult>;
}
```

### 3.4 Template registry (đã có)

`notification_templates` + `templates.ts`. Bổ sung dần:
- Bậc 4: cột `locale` (vi mặc định) + biến thể theo kênh (in-app ngắn / Telegram).
- Bậc 4: bảng `notification_template_versions` (lịch sử + rollback).

### 3.5 Resolve theo scope (formalize)

Chuẩn hoá chuỗi resolve **default → công ty → (sau này) phòng ban** cho cấu hình thông báo,
tái dùng pattern `attendance_settings` (company_id NULL = mặc định).

---

## 4. Mô hình dữ liệu

**Đã có:** `notifications`, `system_settings`, `notification_templates`, các `*_reminder_log`.

**Thêm mới theo bậc:**

```sql
-- Bậc 4: tùy chọn người nhận (mặc định bật hết = hành vi cũ)
CREATE TABLE notification_preferences (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  TEXT NOT NULL,
  channel    TEXT NOT NULL,          -- 'inapp' | 'telegram'
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, event_key, channel)
);

-- Bậc 4: lịch sử phiên bản template (rollback + audit)
CREATE TABLE notification_template_versions (
  id           TEXT PRIMARY KEY,
  template_key TEXT NOT NULL,
  title        TEXT, message TEXT, icon TEXT, locale TEXT,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bậc 5: outbox đảm bảo gửi + retry + theo dõi
CREATE TABLE notification_outbox (
  id          TEXT PRIMARY KEY,
  event_key   TEXT NOT NULL,
  recipient   UUID NOT NULL,
  channel     TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ
);
```

> Mọi bảng idempotent + mirror vào `docker/postgres/reconcile.sql`. Seed rỗng = hành vi cũ.

---

## 5. Lộ trình mốc

| Mốc | Bậc | Nội dung | Quy mô |
|---|---|---|---|
| **M1** | →3 | `notify(eventKey, payload)` engine + `eventCatalog.ts` (DEFAULT khớp cũ) | Lớn |
| **M2** | →3 | Channel adapter (in-app, telegram) + refactor ~17 call site về `notify()` | Lớn |
| **M3** | →4 | Bảng `notification_preferences` + engine lọc + UI "Tùy chọn thông báo" của user | Vừa |
| **M4** | →4 | `notification_template_versions` + `locale` + biến thể template theo kênh + audit | Vừa |
| **M5** | →5 | `notification_outbox` + retry/back-off + theo dõi trạng thái + **digest/batching** + rate-limit | Lớn |
| **M6** | →5 | Config-as-code (export/import JSON) + approval đổi template + analytics đọc/click + **search** trong hub | Lớn |

> Email bị loại khỏi mọi mốc theo quyết định tập trung Telegram. Lớp channel vẫn để mở.

### Nguyên tắc xuyên suốt (vì sao không vỡ khi deploy)
- DEFAULT trong code = chuỗi/cấu hình cũ; DB rỗng → engine trả DEFAULT → hành vi y hệt.
- `notifications.type` giữ nguyên giá trị cũ.
- Mỗi mốc deploy độc lập, có thể dừng ở bất kỳ mốc nào.
- Mỗi mốc: `tsc --noEmit` sạch + adversarial review "deploy đổi hành vi gì?".

---

## 6. Quyết định & khuyến nghị

- **Đích thực tế:** hoàn tất **M1–M3** (bậc 3 + preference cơ bản) — đây là vùng lợi ích/chi phí cao nhất, đưa hệ thống "chuyên nghiệp hẳn".
- **M4:** làm khi cần i18n/audit chặt hoặc khi template đổi thường xuyên.
- **M5–M6:** chỉ làm khi quy mô lớn (nhiều nghìn user, cần SLA gửi, governance). Với ERP
  nội bộ thường là đầu tư lợi ích giảm dần.
- **Không làm Email** — kênh ngoài chính là Telegram.

---

## 7. Trạng thái triển khai

- [x] Bậc 2: template registry + UI (`notification_templates`, tab "Mẫu thông báo")
- [x] M1 — engine `notify()` + event catalog (`src/lib/notifications/engine.ts`, `eventCatalog.ts`) — additive, dormant
- [~] M2 — refactor call site về engine. **Xong:** 5 nhắc HR + đặt phòng + onboarding + task/ticket quá hạn + contract watcher (4) + evaluation watcher (status/created/passed/terminated). Engine hỗ trợ `telegramButtonLabel` động. **Còn (chặn bởi M4 — cần template biến thể theo kênh):** offboarding/onboarding/attendance… dùng `dispatchToRecipients` với Telegram nhiều dòng riêng → migrate giờ sẽ mất format. Ngữ nghĩa `telegram_enabled`: engine dùng null=bật.
- **Phát hiện:** nhiều notif trong `notificationsService.ts` có nội dung Telegram khác in-app (rich, đa dòng). Cần **M4 (template theo kênh: in-app vs telegram)** trước khi đưa chúng về engine không-regression.
- [ ] M3 — preference người nhận
- [~] M4 — **biến thể template theo kênh (Telegram riêng):** xong hạ tầng (cột `notification_templates.telegram`, migration 163, engine fallback, UI ô Telegram, escape biến). Còn: versioning + i18n + audit; và dùng biến thể này để migrate nhóm rich-telegram (offboarding/onboarding/attendance) về engine.
- [x] M5 — **Outbox + Retry** + **UI trạng thái gửi:** bảng `notification_outbox` (migration 164), engine enqueue Telegram, worker drain mỗi 30s + back-off, trạng thái pending/sent/failed, fallback gửi thẳng. Tab "Trạng thái gửi" trong `/cau-hinh-he-thong` (thống kê + danh sách + gửi lại thủ công). Retention tự dọn (sent>7d, failed>30d). **Digest/gộp (xong):** event có `digest` (hợp đồng/đánh giá/tuyển dụng/bảo trì/task/ticket) — nhiều tin cùng (người nhận × nhóm) trong 1 lượt drain → gộp 1 tin Telegram "Xem tất cả" (in-app vẫn lẻ). **Rate-limit (xong):** trần 8 tin/người/lượt drain (vượt → hoãn 1'). **Phân tích đọc (xong):** tỷ lệ đọc IN-APP theo loại (30 ngày) từ `notifications.read` + tỷ lệ gửi Telegram, hiển thị ở tab "Trạng thái gửi". Telegram không có read-receipt nên chỉ tới mức đã gửi/thất bại. → **M5 hoàn tất.**
- [ ] M6 — config-as-code + governance + search
- [x] **Kênh Web Push (in-app đẩy về desktop/điện thoại)** — `src/lib/notifications/webpush.ts` (VAPID lazy, ngủ nếu thiếu env), bảng `push_subscriptions` (migration 229 + reconcile), API `/api/push/subscribe|unsubscribe`, handler `push`/`notificationclick` trong `public/sw.js`, nút bật/tắt `PushToggle` trong chuông. Engine **mirror in-app**: mọi event có kênh `inapp` cũng đẩy Web Push tới thiết bị đã đăng ký của người nhận. **Behavior-preserving:** thiếu VAPID hoặc bảng rỗng ⇒ không gửi push. Cần env `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- [x] **In-app click điều hướng + popup** — `NotificationBell` click → mark read + `router.push(related_url)`, gate quyền qua `routeModuleMap.ts` (fail-open). Thông báo "thuần" (không link **hoặc** loại trong `POPUP_TYPES`) → `NotificationPopup` nổi góc phải.

*Cập nhật checklist này sau mỗi mốc.*

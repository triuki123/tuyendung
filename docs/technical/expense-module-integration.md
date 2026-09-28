# Đặc tả tích hợp: Module Chi Phí (AssetFlow) ↔ Webapp Kế Toán

> Bản nháp để 2 đội (AssetFlow + Kế toán) chốt **hợp đồng API** trước khi code.
> Trạng thái: DRAFT — chờ Kế toán review các mục "❓ Cần Kế toán quyết".

## 1. Mục tiêu & ranh giới

AssetFlow là **nơi phát sinh nhu cầu chi + cổng phê duyệt**. Webapp Kế toán là **hệ ghi sổ (system of record)**. Không bên nào lấn vai bên kia.

| AssetFlow giữ (nguồn sự thật) | Kế toán giữ (nguồn sự thật) |
|---|---|
| Nội dung yêu cầu chi phí + đính kèm chứng từ | Bút toán / nhật ký |
| Luồng phê duyệt (ai duyệt, khi nào) | Thuế, đa tiền tệ |
| Trạng thái của **yêu cầu** | Thực thi thanh toán |
| Thread trao đổi theo từng chi phí | Đối chiếu, báo cáo tài chính |
| | Trạng thái **đã hạch toán / đã chi** |

**Nguyên tắc vàng:**
- AssetFlow là nguồn sự thật cho `draft → approved`.
- Kế toán là nguồn sự thật cho `posted → paid` (chỉ set qua callback, AssetFlow không tự set).
- **Không nhân đôi sổ cái.** Module Chi phí KHÔNG tự ghi giao dịch tiền (khác `solace-cash` là till tự chứa của quán).

## 2. Vòng đời chi phí (status machine)

```
draft ──► pending_approval ──► approved ──► sent_to_accounting ──► posted ──► paid
  │              │                 │                                  │
  └──────────────┴─────────────────┴───────────► rejected ◄──────────┘
```

| Status | Ai set | Ý nghĩa |
|---|---|---|
| `draft` | AssetFlow (người tạo) | Đang soạn |
| `pending_approval` | AssetFlow | Đã gửi duyệt |
| `approved` | AssetFlow (người duyệt) | Quản lý duyệt → **kích hoạt đẩy API** |
| `sent_to_accounting` | AssetFlow (sau khi push thành công) | Kế toán đã nhận |
| `posted` | **Kế toán (callback)** | Đã hạch toán |
| `paid` | **Kế toán (callback)** | Đã chi tiền |
| `rejected` | Cả 2 (kèm lý do) | Bị từ chối ở bất kỳ bước nào |

> Chỉ khi `approved` mới đẩy sang Kế toán. `posted`/`paid`/`rejected(từ Kế toán)` chỉ đến qua **callback**.

## 3. Data model (phía AssetFlow)

Tiền: **BIGINT theo đồng VND** (đúng convention hiện có — xem `src/lib/format.ts`, `MoneyInput`).

### `expenses`
```
id                TEXT PK              -- app sinh (vd exp_xxx)
code              TEXT UNIQUE          -- mã hiển thị (vd CP-2026-000123)
title             TEXT NOT NULL
category_id       TEXT                 -- FK expense_categories (cấu hình)
amount            BIGINT NOT NULL      -- đồng VND
currency          TEXT DEFAULT 'VND'
company_id        UUID                 -- công ty chịu chi phí
department_id     TEXT                 -- phòng ban (tuỳ chọn)
requested_by      UUID NOT NULL        -- người tạo
approved_by       UUID                 -- người duyệt
status            TEXT NOT NULL DEFAULT 'draft'   -- xem §2 (CHECK enum)
reject_reason     TEXT
-- Liên kết ngữ cảnh (tuỳ chọn): chi phí gắn tài sản/hợp đồng nào
related_type      TEXT                 -- 'asset' | 'contract' | 'task' | null
related_id        TEXT
-- Đồng bộ Kế toán
accounting_ref    TEXT                 -- id bên Kế toán (do callback trả về)
external_status   TEXT                 -- trạng thái thô bên Kế toán (để hiển thị)
idempotency_key   TEXT UNIQUE          -- khóa gửi 1 lần (uuid)
created_at        TIMESTAMPTZ DEFAULT NOW()
updated_at        TIMESTAMPTZ DEFAULT NOW()
```

### `expense_attachments`
```
id, expense_id (FK), file_name, mime_type, size_bytes, storage_ref, uploaded_by, created_at
```
(Chứng từ/hoá đơn. Kế toán tải qua URL công khai có ký, giống cơ chế ảnh hiện tại.)

### `expense_messages` — Thread trao đổi theo từng chi phí
```
id            TEXT PK
expense_id    TEXT NOT NULL FK
source        TEXT NOT NULL           -- 'assetflow' | 'accounting'
author_ref    TEXT                    -- id người gửi ở hệ nguồn (opaque, KHÔNG map user)
author_name   TEXT NOT NULL           -- tên hiển thị (vd "Kế toán · Nguyễn X")
body          TEXT NOT NULL
attachments   JSONB DEFAULT '[]'      -- [{file_name, url, mime}]
client_msg_id TEXT                    -- idempotency (chống trùng khi retry)
created_at    TIMESTAMPTZ DEFAULT NOW()
UNIQUE (expense_id, client_msg_id)
```

**Chốt thiết kế thread:**
- AssetFlow **giữ thread** (single source of truth). Cả 2 bên cùng ghi vào đây qua API.
- KHÔNG map tài khoản kế toán ↔ user AssetFlow. Lưu `author_name` + `author_ref` dạng đục.
- Message **immutable** (không sửa/xoá — hồ sơ giải trình). Cần gỡ thì soft-delete có dấu vết.
- Idempotency bằng `client_msg_id`.

## 4. API contract

### 4.0 Auth (service-to-service)
- Token riêng giữa 2 hệ (Bearer), **không dùng cookie/phiên user**.
- Header: `Authorization: Bearer <SERVICE_TOKEN>` + `X-Idempotency-Key` cho các POST tạo dữ liệu.
- ❓ Cần Kế toán quyết: cơ chế token (tĩnh/HMAC/mTLS), rotate ra sao.

### 4.1 AssetFlow → Kế toán

**Đẩy chi phí đã duyệt** (khi status → `approved`):
```
POST {ACCOUNTING_BASE}/api/expenses
X-Idempotency-Key: <expenses.idempotency_key>
{
  "source_id": "exp_xxx",
  "code": "CP-2026-000123",
  "title": "Tiền thuê văn phòng T7/2026",
  "amount": 23000000,            // đồng VND, số nguyên
  "currency": "VND",
  "company": { "id": "...", "tax_code": "...", "name": "..." },
  "category": "rent",            // mã loại chi phí (map ở Kế toán)
  "requested_by": { "name": "...", "email": "..." },
  "approved_by":  { "name": "...", "email": "..." },
  "attachments": [ { "file_name": "hoadon.pdf", "url": "https://assetflow.fadoai.com/api/public/expense-file/<signed>", "mime": "application/pdf" } ],
  "callback_url": "https://assetflow.fadoai.com/api/expenses/webhook",
  "created_at": "2026-07-07T10:00:00Z"
}
→ 200 { "accounting_ref": "ACC-...", "status": "received" }
```
- **Idempotent**: gọi lại cùng key → trả cùng kết quả, không tạo trùng bút toán.
- Thất bại (Kế toán sập) → giữ trong **outbox + retry** (tái dùng pattern `notification_outbox`), có nút "Gửi lại".

**Gửi message (AssetFlow → Kế toán)** — khi có tin mới trong thread từ phía AssetFlow, đẩy qua outbox:
```
POST {ACCOUNTING_BASE}/api/expenses/{accounting_ref}/messages
{ "client_msg_id": "...", "author_name": "...", "body": "...", "attachments": [...] }
```

### 4.2 Kế toán → AssetFlow

**Callback trạng thái**:
```
POST https://assetflow.fadoai.com/api/expenses/webhook
{ "source_id": "exp_xxx", "accounting_ref": "ACC-...",
  "event": "status", "status": "posted" | "paid" | "rejected",
  "reject_reason": "...", "at": "..." }
```
→ AssetFlow cập nhật `expenses.status` + `accounting_ref` + notify người liên quan.

**Post message vào thread** (kế toán hỏi/trả lời):
```
POST https://assetflow.fadoai.com/api/expenses/{source_id}/messages
{ "client_msg_id": "...", "source": "accounting",
  "author_ref": "...", "author_name": "Kế toán · Nguyễn X",
  "body": "Thiếu hoá đơn VAT, bổ sung giúp nhé", "attachments": [...] }
```
→ Lưu `expense_messages` + notify người tạo/người duyệt (in-app + Telegram).

### 4.3 Nội bộ AssetFlow (UI dùng)
```
GET  /api/expenses                      -- danh sách (lọc theo status/của tôi/team)
POST /api/expenses                      -- tạo (draft)
GET  /api/expenses/{id}                 -- chi tiết
PUT  /api/expenses/{id}                 -- sửa (chỉ khi draft/rejected)
POST /api/expenses/{id}/submit          -- gửi duyệt
POST /api/expenses/{id}/approve|reject  -- duyệt/từ chối (RBAC)
GET  /api/expenses/{id}/messages        -- đọc thread
POST /api/expenses/{id}/messages        -- gửi tin (người AssetFlow) → cũng đẩy outbox sang Kế toán
```

## 5. Realtime & thông báo
- Không websocket xuyên 2 hệ. Đủ dùng: **notification engine** (in-app + Telegram) + **SSE** hiện có để UI tự cập nhật; Kế toán nhận qua webhook.
- Sự kiện cần notify: chi phí được duyệt/từ chối, đổi trạng thái từ Kế toán, **có tin mới trong thread**.

## 6. Idempotency, thứ tự, độ bền
- Mọi POST tạo dữ liệu có idempotency key (`idempotency_key` cho expense, `client_msg_id` cho message).
- Đẩy đi qua **outbox** có retry + backoff; UI có nút gửi lại thủ công.
- Message hiển thị theo `created_at`; chấp nhận eventual consistency (trễ vài giây).

## 7. Bảo mật
- Service token riêng, IP allowlist nếu được.
- URL chứng từ là **signed URL hết hạn**, không public trần.
- Ghi audit mọi thay đổi trạng thái + ai gọi API.

## 8. Phạm vi — để KHÔNG phình
- Thread **chỉ trong ngữ cảnh 1 expense** (sau này mở cho "yêu cầu" khác cùng cơ chế). KHÔNG presence/typing/DM/kênh — muốn chat tự do thì dùng Telegram.
- AssetFlow KHÔNG làm: bút toán, thuế, thanh toán, đối chiếu, báo cáo tài chính.

## 9. ❓ Cần đội Kế toán quyết
1. Cơ chế auth service-to-service (token tĩnh / HMAC / mTLS) + rotate.
2. Danh mục **mã loại chi phí** (category) để map ↔ tài khoản kế toán.
3. Tập trạng thái thật bên Kế toán (mình chỉ cần map về `posted`/`paid`/`rejected`).
4. Kế toán tải chứng từ qua **signed URL** (pull) hay mình **push file**?
5. Có cần đẩy thông tin công ty/MST/ngân hàng người thụ hưởng trong payload không?
6. SLA callback (bao lâu sau khi hạch toán thì báo về).

---
*Liên quan: `docs/technical/notification-architecture.md` (outbox/notify), `src/lib/format.ts` (tiền BIGINT đồng), luồng "Duyệt yêu cầu" hiện có (tái dùng cho phê duyệt chi phí).*

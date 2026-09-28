# Lộ trình toàn cục: Module Chi Phí (AssetFlow)

> Kim chỉ nam để build không lạc hướng. Đi kèm đặc tả tích hợp:
> `docs/technical/expense-module-integration.md` (hợp đồng API ↔ Kế toán).
> Trạng thái: PLAN — chốt trước khi code.

## 0. Nguyên tắc xuyên suốt (đọc trước)
1. **AssetFlow = phát sinh + phê duyệt + thread.** Kế toán = ghi sổ. Không nhân đôi sổ cái.
2. **Tách phần nội bộ khỏi phần phụ thuộc Kế toán.** Toàn bộ quy trình xin-duyệt chi phí phải **chạy độc lập** dù chưa nối Kế toán (đẩy đi để trạng thái "chờ").
3. **Tiền = BIGINT theo đồng VND** (dùng `MoneyInput` + `formatVND/parseVND`).
4. **Mọi thông báo qua notification engine** (bắt buộc theo CLAUDE.md — KHÔNG INSERT notifications thủ công).
5. **Mỗi cột/bảng mới = 1 migration** đánh số tăng dần, idempotent.
6. **Tái dùng** thay vì dựng mới: outbox, notify, MoneyInput, signed-URL, pattern Duyệt Yêu Cầu.

## 1. Bản đồ 3 phase

| Phase | Nội dung | Phụ thuộc | Deploy được? |
|---|---|---|---|
| **P1 — Nội bộ** | DB + CRUD chi phí + **duyệt phân cấp theo hạn mức** + thread nội bộ + notify + RBAC | Không (tự chủ) | ✅ Ngay |
| **P2 — Tích hợp Kế toán** | Outbox đẩy thật + webhook callback (`posted/paid/rejected`) + đồng bộ thread 2 chiều + signed-URL chứng từ | Đội Kế toán (§9 đặc tả) | Khi Kế toán sẵn sàng |
| **P3 — Nâng cao** | Báo cáo/ngân sách (budget per phòng ban), chi phí định kỳ, gắn tài sản/hợp đồng, xuất Excel | Sau P1/P2 | Tuỳ nhu cầu |

> Thứ tự bắt buộc: **P1 trước** (không chờ ai). P2 bật khi có endpoint + token của Kế toán. P3 tuỳ chọn.

## 2. Duyệt — mô hình hợp nhất 2 tầng (CHỐT, trọng tâm P1)

> Kiểu Concur/Workday: **chuỗi ráp tay per-user + hạn mức thẩm quyền per-người-duyệt (Limit of Authority)**.
> Điểm Odoo không có: Odoo chỉ 2 nấc cứng (QL trực tiếp / QL của QL); ở đây chuỗi tuỳ biến hoàn toàn + đơn nhỏ tự dừng sớm.

### 2.1 Tầng 1 — Chuỗi duyệt ráp theo NGƯỜI TẠO (ưu tiên cao nhất)
**`expense_approval_chains`** — cấu hình ở Tab **"Quyền Chi Phí"** trong form Người Dùng:
```
id          TEXT PK
user_id     UUID NOT NULL     -- NGƯỜI TẠO đơn (chuỗi áp cho đơn người này tạo)
company_id  UUID              -- null = áp mọi công ty; có giá trị = riêng khi chi cho công ty đó
steps       JSONB NOT NULL    -- [{ order, approver_user_id, label? }] — kéo-thả thứ tự
active      BOOLEAN DEFAULT true
UNIQUE (user_id, company_id)
```
- Ráp `X → A` → A duyệt = XONG. Ráp `X → A → B → C` → C chốt mới được chi.
- **Resolve ưu tiên**: chuỗi riêng cho (user, công ty chịu chi) > chuỗi chung của user (company_id null) > **fallback rule công ty (§2.3)**. Không ai bị kẹt không gửi được đơn.

### 2.2 Tầng 2 — Hạn mức thẩm quyền per-NGƯỜI-DUYỆT (điểm dừng thông minh)
**`expense_approver_limits`** — cũng trong Tab "Quyền Chi Phí" (phần "khi người này DUYỆT"):
```
user_id     UUID NOT NULL     -- NGƯỜI DUYỆT
company_id  UUID              -- null = mọi công ty
max_amount  BIGINT            -- null = VÔ HẠN (được chốt mọi đơn)
UNIQUE (user_id, company_id)
```
- Đơn chạy dọc chuỗi, **dừng ở người đầu tiên có thẩm quyền ≥ số tiền** (hoặc người cuối chuỗi — cuối chuỗi mặc nhiên chốt):
  - Chuỗi A(5tr)→B(50tr)→C(∞): đơn 3tr → A chốt xong; 20tr → A rồi B chốt; 200tr → phải tới C.
- Người duyệt KHÔNG đặt hạn mức + không phải cuối chuỗi → duyệt xong vẫn đẩy tiếp.

### 2.3 Tầng fallback — Rule hạn mức per-CÔNG-TY (lưới an toàn)
**`expense_approval_rules`** (per công ty; dùng khi người tạo chưa được ráp chuỗi):
```
id / company_id (null=global) / min_amount / max_amount (null=∞)
steps JSONB [{ order, approver_type: 'role'|'permission'|'manager_chain'|'specific_user', approver_value, label }]
active / sort_order
```
Ví dụ: `[0–5tr] → [QL trực tiếp]`; `[5–50tr] → [QL, Giám đốc]`; `[>50tr] → [QL, Giám đốc, Chủ tịch]`.

### 2.4 Bước duyệt thực tế (đóng băng lúc submit)
**`expense_approvals`**:
```
id / expense_id FK / step_order / approver_user_id (đã resolve cụ thể)
status 'pending'|'approved'|'rejected'|'skipped' / approved_by / approved_at / note
UNIQUE (expense_id, step_order)
```

### 2.5 Luật vận hành
- **Submit** (`draft → pending_approval`): resolve theo thứ tự §2.1 → cắt chuỗi theo hạn mức §2.2 → sinh N bước đóng băng.
- **Tuần tự**: chỉ bước pending nhỏ nhất action được; xong bước i mở bước i+1; đủ hết → `approved` (kích hoạt flow_type + P2).
- **Từ chối** bất kỳ bước → `rejected` (kèm lý do), dừng chuỗi. Sửa & submit lại → resolve lại từ đầu (amount đổi → đường đi đổi).
- **Người tạo không tự duyệt**: nếu nằm trong chuỗi của chính mình → bước đó `skipped`.
- Hook tương lai (chưa làm v1): uỷ quyền khi vắng mặt, CC người theo dõi.

### 2.6 UI
- **Tab "Quyền Chi Phí" trong form Người Dùng** (cạnh tab Phân quyền): (a) chuỗi duyệt cho đơn người này tạo — per công ty, kéo-thả; (b) hạn mức thẩm quyền khi người này duyệt — per công ty.
- Tab "Cấu Hình" module (super_admin): CRUD `expense_approval_rules` fallback per công ty (pattern LeaveTypesTab).
- Chi tiết đơn: **timeline các bước** (ai, hạn mức, khi nào, ghi chú) — pattern timeline "Duyệt Công".
- Trang **Duyệt Yêu Cầu** thêm tab "Chi Phí" — mỗi người chỉ thấy đơn đến lượt mình.

## 3. Data model P1 (tổng hợp)
Từ đặc tả (§3) + bổ sung duyệt phân cấp:
- `expenses` (draft→paid, amount BIGINT, code, category_id, company/department, requested_by/approved_by, related_type/id, accounting_ref, idempotency_key…)
- `expense_categories` (cấu hình mã loại chi phí — map ↔ tài khoản Kế toán ở P2)
- `expense_attachments` (chứng từ, BYTEA hoặc storage_ref; signed-URL ở P2)
- `expense_messages` (thread immutable, `client_msg_id` idempotency)
- **`expense_approval_rules`** + **`expense_approvals`** (mới — duyệt phân cấp)

> Mỗi bảng 1 migration; thêm vào `reconcile.sql` để DB mới đồng bộ.

## 4. RBAC
Module mới `expense` (Chi Phí) với actions:
- `view` (xem đơn theo phạm vi), `create` (tạo/sửa draft), `approve` (duyệt — nhưng bước cụ thể còn gate theo rule), `manage` (cấu hình rule/loại chi phí — super_admin), `export`.
- Phạm vi xem: của tôi / phòng ban / công ty / hệ thống (giống asset-lookup role logic).

## 5. Notification (P1)
Theo công thức 4 bước (template → event → notify → scheduler). Sự kiện:
- `expense_submitted` → báo người duyệt bước 1.
- `expense_step_approved` → báo người duyệt bước kế + người tạo.
- `expense_approved` / `expense_rejected` → báo người tạo.
- `expense_message_new` (P1 nội bộ; P2 gồm cả tin từ Kế toán).
Kênh: in-app + Telegram. Digest nếu fan-out.

## 6. API P1 (nội bộ)
```
GET/POST  /api/expenses                     -- list (lọc status/của tôi/team) + tạo draft
GET/PUT   /api/expenses/{id}                 -- chi tiết / sửa (draft|rejected)
POST      /api/expenses/{id}/submit          -- gửi duyệt (resolve rule → sinh bước)
POST      /api/expenses/{id}/approve         -- duyệt bước hiện tại (gate theo rule + không tự duyệt)
POST      /api/expenses/{id}/reject          -- từ chối (kèm lý do)
GET/POST  /api/expenses/{id}/messages        -- thread (P1 nội bộ)
GET/POST/PUT/DELETE /api/expense-categories  -- danh mục
GET/POST/PUT/DELETE /api/expense-approval-rules -- cấu hình duyệt (super_admin)
```

## 7. Mảnh tái dùng (không dựng mới)
| Cần | Dùng lại |
|---|---|
| Đẩy Kế toán + retry (P2) | `notificationOutboxService` + `outboxScheduler` (outbox pattern) |
| Thông báo | Notification engine (`engine.ts`, `eventCatalog`, `templates`) |
| Nhập/hiển thị tiền | `MoneyInput`, `formatVND/parseVND` (BIGINT đồng) |
| Chứng từ tải công khai | Pattern `/api/public/signature-image/[id]` → `/api/public/expense-file/[id]` (signed) |
| Khung duyệt + timeline | Module Duyệt Yêu Cầu + timeline "Duyệt Công" |
| Cấu hình per-công-ty | Pattern trang cấu hình loại phép (`LeaveTypesTab`) |

## 8. Định nghĩa "xong" từng phase
- **P1 xong**: tạo đơn → gửi duyệt → chuỗi duyệt phân cấp theo hạn mức chạy đúng → approved/rejected → notify → thread nội bộ. Cấu hình rule + danh mục qua UI. RBAC đủ. Deploy chạy thật trong 1 công ty.
- **P2 xong**: đơn `approved` tự đẩy Kế toán qua outbox (idempotent, retry, nút gửi lại) → nhận callback `posted/paid/rejected` → đồng bộ trạng thái + thread 2 chiều → chứng từ qua signed-URL.
- **P3**: theo nhu cầu (ngân sách, định kỳ, báo cáo).

## 9. Chặn/nhắc (blockers)
- P2 **chờ Kế toán** chốt §9 đặc tả: auth service-to-service, danh mục category ↔ tài khoản, tập trạng thái thật, push-file vs signed-URL, payload MST/ngân hàng, SLA callback.
- P1 **không chờ ai** → khởi động ngay.

## 10. Thứ tự thực thi đề xuất (P1)
1. Migration: `expense_categories`, `expenses`, `expense_attachments`, `expense_messages`, `expense_approval_rules`, `expense_approvals` (+ reconcile).
2. RBAC: thêm module `expense` vào `modules.ts`.
3. Service: `expenseService` (CRUD + resolve rule + duyệt bước) · `expenseApprovalService`.
4. API nội bộ (§6).
5. Notification (§5).
6. UI: danh sách + tạo/sửa + chi tiết (timeline duyệt + thread) + tab cấu hình rule/danh mục + tab "Chi Phí" trong Duyệt Yêu Cầu.
7. Type-check + build + deploy P1.

## 11. v1 CHỐT (build ngay) — "Lõi Chi Phí toàn trình"

> Triết lý thương hiệu: **MỘT DÒNG CHẢY.** Phân loại tại nguồn → hệ tự dẫn dòng xuống mắt xích phù hợp → truy vết end-to-end từ bất kỳ đâu. `flow_type` là **cơ chế MỞ** — "mua tài sản" chỉ là MỘT ví dụ hành vi, không phải trọng tâm; sau này thêm hành vi mới không đập lại. Đủ field kế toán nhưng gom nhóm mạch lạc + tự điền từ employee graph (chống-Odoo). VND-only (đa tệ để Kế toán lo). Chỉ vai trò có quyền `create` mới tạo.

### 11.0 Đa công ty & danh tính (xoá bất cập Odoo — QUAN TRỌNG NHẤT)
Odoo mô hình sai: "Employee = người × công ty" → 1 người 5 công ty = 5 profile → loạn.
AssetFlow: **một con người = MỘT danh tính** (đã có `user_company_memberships` + `getEffectiveContext` + company switcher). Chi Phí đứng trên nền đó:
- `expenses.requested_by` = user duy nhất. KHÔNG bao giờ có profile thứ hai.
- **`expenses.company_id` = công ty CHỊU chi phí** — người tạo chỉ trả lời "chi cho công ty nào?" (dropdown từ memberships; mặc định = công ty active ở switcher).
- **Quyền tạo xét per-company**: phải có membership + quyền `expense.create` Ở CÔNG TY ĐÓ (per-company permissions của membership).
- **Chuỗi duyệt resolve theo công ty chịu chi** (rule per-company §2) — chi cho công ty A thì cấp duyệt của A duyệt, bất kể người tạo "chính" ở đâu.
- **Phạm vi xem cắt theo công ty** (trừ vai trò tập đoàn). Hồ sơ 1 người = mọi chi phí họ tạo ở mọi công ty; hồ sơ 1 công ty = mọi chi phí công ty gánh — cùng dữ liệu, 2 lát cắt.
- **CHỐT v1: 1 phiếu = 1 công ty.** Chi chung tập đoàn → tách phiếu. Chừa hook: sau này cần phân bổ thì thêm bảng `expense_allocations` (expense_id, company_id, ratio) — KHÔNG đổi schema `expenses`.

### 11.1 Phạm vi v1
- Tạo/sửa (draft) · gửi duyệt · **duyệt phân cấp theo hạn mức** · thread nội bộ · notify.
- **Danh mục loại chi phí cấu hình qua UI**, mỗi loại gắn `flow_type` (hành vi dòng chảy — cơ chế mở).
- Hành vi mẫu v1: `asset_purchase` → tự treo tài sản `Chờ mua` → duyệt → `Đang mua` → **Nhận hàng** → `Đang dùng`. Các flow_type khác (`operational`, `reimbursement`, `service`) v1 chỉ đi duyệt, không sinh thực thể.
- **Link toàn trình**: chi phí ⇄ ticket ⇄ tài sản qua `related_type/related_id`; xem chéo + flow timeline từ mọi mắt xích. Tạo chi phí *từ* ticket (tái dùng pattern Task↔Ticket).

### 11.2 Form 6 khối (progressive disclosure; ⑤⑥ gập)
① Chung: tiêu đề · ngày phát sinh · **loại chi phí** · công ty+phòng ban (tự điền) · trung tâm chi phí/dự án (tuỳ chọn).
② Nội dung & tiền: **bảng dòng động + công thức** (tái dùng Email Center) → cộng tự động; hoặc 1 số tiền nhanh.
③ Thuế/Hoá đơn: có VAT? · số HĐ · ngày · NCC + **MST** · trước thuế · **VAT %** (bật/tắt) · tiền thuế · tổng.
④ Thanh toán: người thụ hưởng · phương thức · ngân hàng (chủ TK/số TK/NH).
⑤ Chứng từ: đính kèm (BYTEA; signed-URL ở P2).
⑥ Liên kết: gắn Tài sản/Hợp đồng/Ticket/Dự án.

### 11.3 Data model v1
- `expense_categories` (name, code, **flow_type** ['asset_purchase'|'operational'|'reimbursement'|'service'|...], company_id?, active)
- `expenses` (code, title, expense_date, category_id, amount BIGINT, currency='VND', company_id, department_id, cost_center, project_code, requested_by, payee, payment_method, bank_*, vat_*, invoice_*, supplier_*, related_type/id, status, reject_reason, accounting_ref/external_status/idempotency_key[P2])
- `expense_lines` (expense_id, noi_dung, sl, dvt, don_gia, thanh_tien) — line items động
- `expense_attachments` · `expense_messages` (thread immutable)
- `expense_approval_rules` + `expense_approvals` (duyệt phân cấp — §2)
- **Assets**: thêm trạng thái chờ mua/đang mua + cột `expense_id`/`source_ticket_id` (liên kết ngược). Sinh tài sản khi loại = asset_purchase.

### 11.4 Thứ tự build v1
1. Migration: expense_categories · expenses · expense_lines · expense_attachments · expense_messages · expense_approval_rules · expense_approvals · (assets: status + expense_id/source_ticket_id) + reconcile.
2. RBAC: module `expense` (view/create/approve/manage/export).
3. Service: `expenseService` (CRUD + submit resolve-rule) · `expenseApprovalService` · `expenseCategoryService` · hook `spawnAssetFromExpense`.
4. API nội bộ (§6) + `/api/expense-categories` + `/api/expense-approval-rules` + "tạo chi phí từ ticket".
5. Notification (§5).
6. UI: danh sách + form 6 khối + chi tiết (timeline duyệt + flow timeline + thread) + tab cấu hình (danh mục+rule) + tab "Chi Phí" trong Duyệt Yêu Cầu + panel "Chi phí liên quan" trên Ticket + nút "Nhận hàng" tạo asset active.
7. Type-check + build + deploy v1.

### 11.5 Các quyết định hạng hai (CHỐT với user — Jul 7)
1. **Thu hồi đơn**: người tạo bấm "Thu hồi" khi CHƯA ai duyệt bước nào → về `draft`. Đã có người duyệt → phải nhờ từ chối.
2. **Hủy đơn đã duyệt**: trạng thái **`cancelled`** — người tạo hoặc người chốt hủy được TRƯỚC khi bàn giao Kế toán, bắt buộc lý do + lưu vết.
3. **Số phiếu — MỖI CÔNG TY TỰ QUY ĐỊNH QUY TẮC**: bảng `expense_code_rules (company_id UNIQUE, pattern, next_seq, reset_yearly)`. Pattern có placeholder `{YYYY} {YY} {MM} {SEQ:n} {COMPANY}` (vd `CP-{COMPANY}-{YYYY}-{SEQ:5}`); đếm số chạy riêng từng công ty, tuỳ chọn reset đầu năm. Chưa cấu hình → mặc định `CP-{YYYY}-{SEQ:5}`.
4. **Cảnh báo nghi trùng** (kiểu Ramp): cùng NCC + cùng số hoá đơn → cảnh báo vàng lúc tạo, KHÔNG chặn.
5. **Audit**: mọi thay đổi trạng thái ghi vào hệ thống lịch sử sẵn có (activity history).

### 11.6 v1.1 — TẠM ỨNG → QUYẾT TOÁN (làm NGAY SAU lõi v1 — user chốt Jul 7, là bất cập Odoo cần xoá)
- **Phiếu tạm ứng** = expense với category `flow_type='advance'` — đi qua đúng chuỗi duyệt 2 tầng.
- **Phiếu quyết toán** = expense gắn `advance_id` trỏ về phiếu tạm ứng: kê thực chi (line items + chứng từ) → duyệt → hệ tự tính **chênh lệch**: thực chi < tạm ứng → hoàn lại công ty; thực chi > tạm ứng → công ty chi thêm.
- Phiếu tạm ứng có `settlement_status`: `none` (chưa quyết toán) / `pending` (đang quyết toán) / `settled`. Nhắc quyết toán quá hạn qua notification engine.
- **Schema đã chừa sẵn từ migration v1**: cột `advance_id`, `settlement_status` trên `expenses` — v1.1 chỉ thêm logic + UI, không đổi schema.

### 11.7 Ngoài phạm vi (làm sau, đã chừa hook)
OCR hoá đơn · signed-URL chứng từ (P2) · đẩy Kế toán thật + webhook (P2) · ngân sách/định kỳ/báo cáo (P3) · phân bổ nhiều công ty (`expense_allocations`) · Payroll/Benefit (module kế tiếp).
> Đã LÀM (Jul 7, ngoài kế hoạch gốc): đa tiền tệ (mig 258), ngân hàng VN (`banksVN.ts`), duyệt inline trong Duyệt Yêu Cầu, phân trang chuẩn (`ListPagination`).

---

## 12. ACTION CENTER — "Cần tôi xử lý" (mô hình duyệt hợp nhất xuyên công ty + xuyên module)

> **Kim chỉ nam CHUNG cho MỌI luồng duyệt/thông báo hợp nhất** (chi phí, nghỉ phép, tuyển dụng, task…).
> User chốt Jul 7. Đây là chuẩn "best-in-world" kiểu inbox (Linear/Superhuman), thay cho mô hình Odoo
> phải gạt switcher từng công ty mới duyệt được.

### 12.1 Nguyên tắc trục
- **1 người = 1 danh tính = 1 hộp xử lý.** Mọi việc chờ duyệt của MỌI công ty mà người đó có vai trò duyệt đều gom về MỘT màn `/can-toi-xu-ly`. KHÔNG bắt đổi công ty ở switcher mới thấy/duyệt được.
- **Trục chia = LOẠI VIỆC (tab)**, không phải công ty. Vì thao tác khác nhau: duyệt chi phí ≠ duyệt phép ≠ duyệt tuyển dụng. Tab: Tất cả · Chi phí · Nghỉ phép · … (mỗi module là 1 "nguồn" cắm vào cùng interface `ActionItem`).
- **Công ty = chiều LỌC + MÀU + SỐ ĐẾM**, KHÔNG phải tab. Chống bẫy Odoo (nhiều công ty = nhiều tab = cuộn ngang = miss).

### 12.2 UX chống-miss (bắt buộc)
- **Thanh tổng quan** đầu trang: tổng số + dải chip đếm theo công ty (`Tất cả 12 · 🟦A·5 · 🟩B·4`). Liếc là thấy công ty nào cũng có việc — không cần bấm.
- **Mỗi công ty một MÀU accent** (badge + viền trái mảnh của dòng). Nhưng **màu chỉ phụ trợ — luôn kèm TÊN công ty** (an toàn mù màu / liếc nhanh).
- Nhóm-theo tuỳ chọn (Không / Công ty / Loại). Mặc định phẳng, **ưu tiên việc chờ lâu nhất lên đầu** (chống ứ đọng).
- Duyệt ngay trên dòng (inline), tái dùng modal chi tiết sẵn có của từng module.

### 12.3 ⚠️ CHỐNG-NHẦM-CÔNG-TY (luật cứng, áp cho MỌI module duyệt/thông báo)
**Tầng UI — công ty không bao giờ ẩn:**
1. Công ty hiện ở MỌI điểm chạm: dòng danh sách · header modal (sticky) · nội dung thông báo · **hộp xác nhận trước khi bấm duyệt**.
2. Màu ≠ tín hiệu duy nhất — luôn kèm chữ TÊN công ty.
3. Hộp xác nhận cuối đọc rõ công ty + số tiền + tiền tệ: *"Duyệt phiếu **PC-B-2507** của **🟩 Công ty B** — **12.000.000 đ**?"*
4. Mã phiếu tự mang mã công ty (`PC-B-…` vs `PC-A-…`).

**Tầng LOGIC — hệ thống không cho nhầm (quan trọng hơn UI):**
5. 🔴 **Hành động duyệt LẤY CÔNG TY TỪ CHÍNH BẢN GHI (record-driven), KHÔNG từ switcher toàn cục.** Switcher chỉ dùng cho *tạo mới*; TUYỆT ĐỐI không dùng cho *duyệt* trong màn hợp nhất. Nếu để switcher nhiễm vào hành động duyệt → kiểm quyền sai / audit sai / trừ quỹ sai (lỗi backend im lặng — nguy hiểm nhất).
6. Server **kiểm lại quyền theo công ty của bản ghi tại thời điểm bấm** — không tin danh sách gộp làm căn cứ phân quyền.
7. Audit ghi rõ **công ty + tư cách** ("B duyệt với vai trò GĐ Công ty B").
8. `company_id` của bản ghi **bất biến** sau khi gửi duyệt.

### 12.4 Data / kỹ thuật
- Interface chung `ActionItem { type, id, company_id, company_name, title, subtitle, amountFmt?, waitingSince, actionUrl, detailKind }`. Mỗi module viết 1 resolver trả về `ActionItem[]` cho `userId`.
- Chi phí: `listExpenses({ pendingApproverId: userId })` (đã xuyên công ty sẵn).
- Nghỉ phép: hợp nhất `getTeamLeaves(userId, {companyId})` qua MỌI công ty user có vai trò duyệt (manager/admin) + super_admin = toàn hệ thống.
- **Thông báo cũng cần chiều công ty:** thêm `company_id` vào bảng `notifications` + `notify(...companyId)` để Trung Tâm Thông Báo lọc/gom/đếm theo công ty (đồng bộ nguyên tắc trên).

### 12.5 Lộ trình
1. Nhãn + lọc công ty trên danh sách duyệt chi phí (nhẹ).
2. `company_id` cho `notifications` + lọc/gom công ty ở Trung Tâm Thông Báo.
3. Uỷ quyền duyệt cho NGƯỜI KHÁC (substitute approver — vắng mặt/nghỉ): bảng `approval_delegations` (from→to, phạm vi công ty/module, thời hạn, trần tiền), gate + audit "duyệt thay".
4. `/can-toi-xu-ly` Action Center gom chi phí + phép (+ mở rộng tuyển dụng/task sau).

---
*Liên quan: `expense-module-integration.md` (API Kế toán), `notification-architecture.md` (outbox/notify), `src/lib/format.ts` (tiền BIGINT), luồng Task↔Ticket (link), module Tài sản (spawn asset).*

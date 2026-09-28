# Báo cáo Rà soát Bảo mật — FADO AssetFlowPro

- **Ngày rà soát:** 2026-06-26
- **Nhánh:** `afterdeploy`
- **Phạm vi:** Toàn bộ codebase (`src/`), tập trung vào auth/authz, injection, secret/crypto, file ops, các luồng public (Solace POS, Telegram bot, máy chấm công).
- **Phương pháp:** Fan-out nhiều luồng rà soát song song theo từng nhóm rủi ro → lọc false-positive độc lập → xác minh trực tiếp các phát hiện trọng yếu bằng cách đọc mã nguồn.

---

## 1. Tóm tắt điều hành

Ghi chú nợ kỹ thuật trong `CLAUDE.md` ("permission check bị giả mạo qua header `x-user-permissions`") **đã lỗi thời**. Thực tế [`src/middleware.ts`](../src/middleware.ts) là một chốt chặn danh tính server-side đúng đắn: nó **xoá mọi header danh tính do client gửi** rồi **tiêm lại từ cookie phiên ký HMAC-SHA256** ([`src/lib/authCookie.ts`](../src/lib/authCookie.ts)). Do đó các route đọc `x-current-user-id` / `x-current-user-role` từ header là **an toàn, không spoof được**.

Lỗ hổng thật sự tập trung ở **3 mẫu sai lặp lại**:

1. **Tin danh tính/vai trò lấy từ BODY hoặc URL** thay vì header tin cậy → bỏ qua hoàn toàn chốt chặn của middleware.
2. **Secret "fail-open"** — mẫu `if (secret) { check }` bị bỏ qua khi biến môi trường chưa cấu hình, trên các endpoint public (webhook, cron).
3. **`SELECT *` / `SELECT u.*` trên bảng `users`** → trả về cả hash mật khẩu và PII cho bất kỳ ai đăng nhập.

### Đã kiểm và KHÔNG có lỗ hổng
- **SQL injection:** không có. Toàn bộ truy vấn dùng tham số `$1,$2…`; `buildInsert/buildUpdateById` validate tên cột bằng allowlist regex; `ORDER BY` đều hardcode; sort/filter động chỉ chạy client-side.
- **Command injection:** không có `child_process`/`exec`/`spawn` với input người dùng (zkteco dùng TCP socket, không qua shell).
- **XXE:** không có — Zimbra dùng endpoint JSON, không parse XML; không có DOMParser/xml2js trong repo.
- **Deserialization / eval / zip-slip:** không có `eval`, `new Function`, `vm.*`, YAML loader, hay giải nén archive.
- **Crypto nền tảng đúng chuẩn:** login `bcrypt.compare`; cookie ký HMAC (`AUTH_SECRET` bắt buộc, so sánh timing-safe); reset-password token `crypto.randomBytes(32)`, single-use, có hạn; Telegram Login Widget verify `timingSafeEqual`; TLS `rejectUnauthorized` mặc định `true`.

### Bảng tổng hợp phát hiện

| # | Mức | Loại | Vị trí | Conf |
|---|-----|------|--------|------|
| 1 | 🔴 HIGH | sensitive_data_exposure / idor | `GET /api/users/[id]` | 0.95 |
| 2 | 🔴 HIGH | auth_bypass / privilege_escalation | `POST /api/admin/change-user-password` | 0.95 |
| 3 | 🔴 HIGH | privilege_escalation | `POST /api/users` | 0.85 |
| 4 | 🔴 HIGH | broken_access_control / idor | `DELETE /api/users/[id]` | 0.90 |
| 5 | 🔴 HIGH | missing_authz / privilege_escalation | `/api/admin/system-config` | 0.85 |
| 6 | 🔴 HIGH | idor / broken_access_control | `POST /api/users/[id]/tags` | 0.85 |
| 7 | 🟠 MEDIUM | session_flaw | Cookie phiên không thu hồi được | 0.80 |
| 8 | 🟠 MEDIUM | webhook_auth | Telegram approval webhook fail-open | 0.75 |
| 9 | 🟠 MEDIUM | path_traversal | Export báo cáo task ghi đè `.html` | 0.70 |
| 10 | 🟠 MEDIUM | idor | `POST /api/users/[id]/avatar` | 0.70 |
| 11 | 🟠 MEDIUM | webhook_auth | Solace bot webhook fail-open | 0.65 |
| 12 | 🟠 MEDIUM | missing_authz | `email-accounts` create/update/delete | 0.70 |
| 13 | 🟠 MEDIUM | info_disclosure | RBAC matrix + audit-log đọc tự do | 0.70 |
| 14 | 🟠 MEDIUM | broken_access_control | `setup/phase2-migration` mở ngoài prod | 0.70 |
| 15 | 🟠 MEDIUM | idor / weak_authz | `change-password` & terminate session tin client id | 0.70 |
| 16 | 🟠 MEDIUM | broken_access_control | Cron secret fail-open / fallback `dev-secret` | 0.60 |
| 17 | 🟡 LOW | info_disclosure | `/api/solace/members` enumerate nhân viên | 0.30 |
| 18 | 🟡 LOW | hardcoded_secret | `db.ts` fallback `postgres/postgres` | 0.55 |
| 19 | ⚪ Info | dead_code | `authStore.ts` so sánh mật khẩu plaintext (false positive) | — |

---

## 2. Phát hiện HIGH (cần sửa ngay)

### Vuln 1 — `GET /api/users/[id]` rò hash mật khẩu + toàn bộ PII
- **File:** [`src/app/api/users/[id]/route.ts:15-30`](../src/app/api/users/[id]/route.ts#L15-L30)
- **Severity:** HIGH · **Category:** `sensitive_data_exposure` / `idor` · **Confidence:** 0.95
- **Mô tả:** Handler GET không có bất kỳ kiểm tra quyền nào và chạy `SELECT u.*` → trả về **mọi cột** của bảng `users` cho `[id]` bất kỳ, bao gồm `password` (bcrypt hash), `national_id`, ngày sinh, tài khoản ngân hàng, lương/bảo hiểm, liên hệ khẩn cấp, `telegram_chat_id`.
- **Kịch bản khai thác:** Một nhân viên quyền thấp nhất (chỉ cần đăng nhập, qua được middleware) gọi `GET /api/users/<id-bất-kỳ>` và thu thập hash mật khẩu của mọi đồng nghiệp để crack offline, cộng toàn bộ PII. ID người dùng lộ khắp nơi (response của `/api/users`, các trường `created_by`/`updated_by`, audit log…).
- **Khắc phục:** Thêm kiểm quyền (admin hoặc chính chủ qua `x-current-user-id`); trả về **allow-list cột tường minh**, loại bỏ `password` và các cột nhạy cảm khỏi mọi response. Helper `getUserById`/`getUserByEmail` dùng `SELECT *` cũng cần rà các nơi trả nguyên văn.

### Vuln 2 — Đổi mật khẩu user khác qua `adminId` trong body (chiếm tài khoản)
- **File:** [`src/app/api/admin/change-user-password/route.ts:6-22`](../src/app/api/admin/change-user-password/route.ts#L6-L22) → service `adminChangeUserPassword` trong [`src/lib/services/usersService.ts`](../src/lib/services/usersService.ts)
- **Severity:** HIGH · **Category:** `auth_bypass` / `privilege_escalation` · **Confidence:** 0.95
- **Mô tả:** Route đọc `adminId` từ **request body** rồi truyền vào service; phân quyền chỉ là `getUserById(adminId).role === 'super_admin'`. Danh tính người gọi thật (`x-current-user-id` do middleware tiêm) **không bao giờ được dùng** → "admin" là bất cứ ai kẻ tấn công khai báo. Chỉ tài khoản `admin@fadogroup.com.au` được bảo vệ riêng.
- **Kịch bản khai thác:** Người dùng quyền thấp POST `{ adminId: "<id một super_admin đã biết>", targetUserId: "<nạn nhân>", newPassword: "Attacker123" }`. Kiểm tra pass vì id đó đúng là super_admin → mật khẩu nạn nhân bị ghi đè → kẻ tấn công đăng nhập như nạn nhân. Chiếm được mọi tài khoản admin/lãnh đạo.
- **Khắc phục:** Bỏ `adminId` trong body; lấy actor từ `request.headers.get('x-current-user-id')`, truy vấn lại vai trò trong DB và từ chối nếu không phải super_admin.

### Vuln 3 — `POST /api/users` cho phép tạo `super_admin`
- **File:** [`src/app/api/users/route.ts:77-97`](../src/app/api/users/route.ts#L77-L97) → `createUser` [`src/lib/services/usersService.ts:271,327`](../src/lib/services/usersService.ts#L271)
- **Severity:** HIGH · **Category:** `privilege_escalation` · **Confidence:** 0.85
- **Mô tả:** `currentUser` lấy từ header tin cậy (đúng), nhưng chốt chặn duy nhất là `canAccess(currentUser.module_permissions, 'users', 'create')` — **không giới hạn role**. `createUser` nhận `userData.role` và `userData.module_permissions` nguyên văn từ body (chỉ `company_memberships` được giới hạn super_admin).
- **Kịch bản khai thác:** Một HR/quản lý chỉ được cấp quyền `users:create` POST `{ email, name, password, role:'super_admin', module_permissions:{...toàn quyền...} }` → tự tạo tài khoản super_admin đầy đủ đặc quyền → leo thang dọc tối đa.
- **Khắc phục:** Chỉ super_admin mới được set `role`/`module_permissions` ở mức cao; với người tạo không phải super_admin, ép `role:'user'` và strip `module_permissions` (hoặc giới hạn ≤ vai trò của chính actor).

### Vuln 4 — `DELETE /api/users/[id]` vô hiệu hoá mọi tài khoản, không kiểm quyền
- **File:** [`src/app/api/users/[id]/route.ts:162-174`](../src/app/api/users/[id]/route.ts#L162-L174)
- **Severity:** HIGH · **Category:** `broken_access_control` / `idor` · **Confidence:** 0.90
- **Mô tả:** Handler DELETE hardcode `currentUser = 'system'`, **không kiểm vai trò**, gọi `deactivateUser(id)` → lật trạng thái mọi user thành `inactive`. Đáng chú ý: handler `PUT` cùng file *có* kiểm role trong DB ([dòng 68-87](../src/app/api/users/[id]/route.ts#L68-L87)) — khiến đây là lỗ hổng bất đối xứng rõ ràng.
- **Kịch bản khai thác:** Bất kỳ nhân viên đăng nhập nào vô hiệu hoá bất kỳ tài khoản nào — kể cả tất cả admin/super_admin → khoá/DoS toàn tổ chức.
- **Khắc phục:** Sao chép logic của `PUT`: lấy actor từ `x-current-user-id`, yêu cầu admin/super_admin (hoặc quyền `users:delete`).

### Vuln 5 — `admin/system-config` tin `adminId` body, GET không kiểm quyền
- **File:** [`src/app/api/admin/system-config/route.ts:18-42`](../src/app/api/admin/system-config/route.ts#L18-L42) (POST) và [`:5-16`](../src/app/api/admin/system-config/route.ts#L5-L16) (GET)
- **Severity:** HIGH · **Category:** `missing_authz` / `privilege_escalation` · **Confidence:** 0.85
- **Mô tả:** POST phân quyền bằng `getUserById(adminId).role === 'super_admin'` với `adminId` lấy từ **body** (cùng anti-pattern Vuln 2) → truyền id một super_admin đã biết là pass. GET không kiểm gì, trả toàn bộ cấu hình hệ thống.
- **Kịch bản khai thác:** Người dùng quyền thấp truyền id super_admin để chèn cấu hình role/phòng ban/công ty mới; và đọc toàn bộ inventory cấu hình qua GET.
- **Khắc phục:** Lấy actor từ `x-current-user-id`; `requireRole(['super_admin'])` cho POST và kiểm quyền đọc phù hợp cho GET.

### Vuln 6 — IDOR ghi đè tag của user bất kỳ
- **File:** [`src/app/api/users/[id]/tags/route.ts:37-89`](../src/app/api/users/[id]/tags/route.ts#L37-L89)
- **Severity:** HIGH (cận MEDIUM) · **Category:** `idor` / `broken_access_control` · **Confidence:** 0.85
- **Mô tả:** POST nhận `[id]` từ URL, `DELETE FROM user_tags WHERE user_id=$1` rồi chèn `tag_ids` tuỳ ý — **không hề** đọc `x-current-user-id`, **không** kiểm role/permission.
- **Kịch bản khai thác:** Nhân viên quyền thấp xoá/viết lại tập tag của bất kỳ user nào. Tag có thể chi phối phân nhóm/segmentation/automation → ảnh hưởng tính toàn vẹn dữ liệu.
- **Khắc phục:** Yêu cầu `[id] === x-current-user-id` hoặc quyền `users:edit`/admin (giải từ header).

---

## 3. Phát hiện MEDIUM (lỗ hổng thật, nên sửa)

### Vuln 7 — Cookie phiên không thu hồi được server-side
- **File:** [`src/middleware.ts:108-128`](../src/middleware.ts#L108-L128); [`src/app/api/auth/logout/route.ts`](../src/app/api/auth/logout/route.ts); [`src/lib/authCookie.ts`](../src/lib/authCookie.ts)
- **Severity:** MEDIUM · **Category:** `session_flaw` · **Confidence:** 0.80
- **Mô tả:** Middleware tin cookie thuần dựa trên chữ ký + payload (`uid`,`sid`), **không** đối chiếu `sid` với bảng `user_sessions` (có sẵn `isSessionValidForUser()` nhưng không dùng). "Đăng xuất tất cả thiết bị" / vô hiệu hoá tài khoản chỉ set `expires_at=NOW()` / `status='inactive'` ở DB, **không** làm cookie đã cấp hết hiệu lực (sống tới 30 ngày).
- **Kịch bản khai thác:** Nhân viên bị sa thải/khoá tài khoản, hoặc admin "đăng xuất tất cả" sau khi nghi lộ token — kẻ đang giữ cookie vẫn truy cập đầy đủ tới 30 ngày.
- **Khắc phục:** Trong middleware (hoặc guard nhẹ mỗi request) tra `sid` trong `user_sessions`, từ chối nếu thiếu/hết hạn và nếu user `inactive`; cho `logout` gọi `logoutSession(sid)`.

### Vuln 8 — Telegram approval webhook fail-open (tự ký phiên nạn nhân)
- **File:** [`src/app/api/telegram/webhook/route.ts:20-26,91`](../src/app/api/telegram/webhook/route.ts#L20-L26) (public whitelist)
- **Severity:** MEDIUM · **Category:** `webhook_auth` · **Confidence:** 0.75
- **Mô tả:** Kiểm secret bọc trong `if (expected)` → bỏ qua khi `TELEGRAM_WEBHOOK_SECRET` chưa set. Actor lấy từ `callback_query.from.id` (forge được). Handler sau đó **tự ký một phiên danh tính nội bộ** (`signIdentity`) cho approver rồi gọi API duyệt/từ chối nghiệp vụ với quyền của người đó.
- **Kịch bản khai thác:** Khi secret chưa set, kẻ tấn công forge `callback_query` (`from.id` = approver, `data` = `apv:<type>:approve:<id>`) → server tự ký phiên approver và thực thi duyệt (đặt phòng, đề xuất tuyển dụng…), audit ghi nhận cho nạn nhân.
- **Khắc phục:** Fail-closed — trả 401 nếu secret chưa cấu hình; luôn verify header `x-telegram-bot-api-secret-token`.

### Vuln 9 — Path traversal ghi đè file `.html` qua export báo cáo task
- **File:** [`src/lib/services/taskReportService.ts:226-230,409-413`](../src/lib/services/taskReportService.ts#L226-L230); route [`src/app/api/tasks/report/export/route.ts:71`](../src/app/api/tasks/report/export/route.ts#L71)
- **Severity:** MEDIUM · **Category:** `path_traversal` · **Confidence:** 0.70
- **Mô tả:** `fromDate`/`toDate` lấy từ POST body, **không validate format** (chốt chặn duy nhất `new Date(fromDate) > new Date(toDate)` bị bypass vì `Invalid Date` so sánh luôn `false`). Chúng lọt vào `fileName = \`task_report_${userId}_${fromDate}_${toDate}.html\`` rồi `join(process.cwd(),'public','reports',fileName)` + `writeFileSync` — không `path.basename`/normalize.
- **Kịch bản khai thác:** Gửi `toDate = "../../../../tmp/evil"` để ghi/ghi-đè file `.html` **thoát khỏi** `public/reports` với nội dung HTML do attacker kiểm soát. Bị giới hạn ở đuôi `.html` (không RCE, không ghi đuôi tuỳ ý).
- **Khắc phục:** Validate `fromDate`/`toDate` bằng `^\d{4}-\d{2}-\d{2}$`; `path.basename` filename cuối cùng và khẳng định đường dẫn nằm trong thư mục reports.

### Vuln 10 — IDOR ghi đè avatar của user bất kỳ
- **File:** [`src/app/api/users/[id]/avatar/route.ts:61-171`](../src/app/api/users/[id]/avatar/route.ts#L61-L171)
- **Severity:** MEDIUM · **Category:** `idor` · **Confidence:** 0.70
- **Mô tả:** POST upsert avatar cho `[id]` từ URL, cập nhật `users.avatar` rồi `pg_notify` broadcast — không kiểm chủ sở hữu/role. Ảnh re-encode qua `sharp` nên không phải vector inject nội dung; vấn đề thuần là thiếu authz.
- **Kịch bản khai thác:** Nhân viên quyền thấp thay avatar của lãnh đạo/admin bằng ảnh giả mạo/phishing, lan toàn hệ thống qua broadcast.
- **Khắc phục:** Yêu cầu `[id] === x-current-user-id` hoặc quyền `users:edit`/admin.

### Vuln 11 — Solace bot webhook fail-open
- **File:** [`src/app/api/solace/telegram/webhook/route.ts:13-17`](../src/app/api/solace/telegram/webhook/route.ts#L13-L17); handler [`src/lib/solace/solaceBotHandler.ts`](../src/lib/solace/solaceBotHandler.ts)
- **Severity:** MEDIUM · **Category:** `webhook_auth` · **Confidence:** 0.65
- **Mô tả:** Cùng mẫu `if (expected)` cho `SOLACE_BOT_WEBHOOK_SECRET`. Khi chưa set, actor lấy từ `from.id` (forge được). Hành động admin vẫn bị `canManageSolace` (RBAC DB) chặn, nhưng hành động khách (thanh toán ví, huỷ đơn) chỉ cần biết `telegram_chat_id` của nạn nhân.
- **Kịch bản khai thác:** Khi secret chưa set, kẻ tấn công biết `from.id` của user đã liên kết → đặt đơn trả bằng ví (rút ví tín dụng nạn nhân), huỷ đơn của họ.
- **Khắc phục:** Fail-closed + bắt buộc secret; cân nhắc đối chiếu `callback_query.message.chat.id` với `solace_order_messages.chat_id` của đơn.

### Vuln 12 — `email-accounts` create/update/delete không kiểm quyền
- **File:** [`src/app/api/email-accounts/route.ts:31`](../src/app/api/email-accounts/route.ts#L31); [`src/app/api/email-accounts/[id]/route.ts:4,19`](../src/app/api/email-accounts/[id]/route.ts#L4)
- **Severity:** MEDIUM · **Category:** `missing_authz` · **Confidence:** 0.70
- **Mô tả:** POST/PUT/DELETE trên bản ghi quản lý email không có kiểm role/permission (GET đã strip password nên không lộ credential). Bất kỳ ai đăng nhập tạo/sửa/xoá inventory này.
- **Khắc phục:** Thêm kiểm quyền module (vd `email-accounts:edit/delete`).

### Vuln 13 — Ma trận RBAC và audit-log đọc tự do
- **File:** [`src/app/api/role-permission-templates/route.ts`](../src/app/api/role-permission-templates/route.ts); [`src/app/api/users/audit-logs/route.ts`](../src/app/api/users/audit-logs/route.ts)
- **Severity:** MEDIUM (audit-log) / LOW (RBAC matrix) · **Category:** `info_disclosure` · **Confidence:** 0.70
- **Mô tả:** GET role-permission-templates trả toàn bộ template quyền cho mọi role tới bất kỳ user đăng nhập nào; audit-logs không kiểm role, không có `userId` thì trả toàn bộ nhật ký (`SELECT *`) — lộ ai đổi quyền/mật khẩu của ai. (Phần ghi của role-permission-templates kiểm `x-current-user-role` đã được middleware bảo vệ, nhưng nên re-read role từ DB cho nhất quán.)
- **Khắc phục:** Giới hạn admin cho GET; non-admin chỉ xem audit của chính mình.

### Vuln 14 — `setup/phase2-migration` mở ngoài production
- **File:** [`src/app/api/setup/phase2-migration/route.ts:17-25`](../src/app/api/setup/phase2-migration/route.ts#L17-L25) (public whitelist)
- **Severity:** MEDIUM · **Category:** `broken_access_control` · **Confidence:** 0.70
- **Mô tả:** `checkSetupToken` chỉ bắt buộc `SETUP_TOKEN` khi `NODE_ENV === 'production'`; ở staging/preview/cấu hình NODE_ENV sai thì mở hoàn toàn và chạy DDL (`CREATE TABLE`/`INDEX`) lên DB (idempotent nên tác động giới hạn). Response lỗi cũng lộ nội bộ DB.
- **Khắc phục:** Bắt buộc `SETUP_TOKEN` vô điều kiện; gỡ endpoint sau khi setup xong.

### Vuln 15 — `change-password` & terminate session tin id từ client
- **File:** [`src/app/api/auth/change-password/route.ts:6,22`](../src/app/api/auth/change-password/route.ts#L6); [`src/app/api/auth/sessions/[id]/logout/route.ts:14-27`](../src/app/api/auth/sessions/[id]/logout/route.ts#L14-L27)
- **Severity:** MEDIUM · **Category:** `idor` / `weak_authz` · **Confidence:** 0.70
- **Mô tả:** `change-password` lấy `userId` từ body (vẫn cần `oldPassword` đúng nên không phải takeover độc lập, nhưng là confused-deputy). Terminate session dùng `WHERE id=$1` không scope theo `user_id` của người gọi (session UUID khó đoán nên tác động hạn chế).
- **Khắc phục:** Bỏ id từ client; scope mọi thao tác theo `x-current-user-id` (`WHERE id=$1 AND user_id=$2`).

### Vuln 16 — Cron secret fail-open / fallback `dev-secret`
- **File:** [`src/app/api/cron/evaluation-reminders/route.ts:6-8`](../src/app/api/cron/evaluation-reminders/route.ts#L6-L8) (fallback `process.env.CRON_SECRET || 'dev-secret'`); các cron khác (`contract-reminders`, `requisition-reminders`, `archive-old-bookings`) dùng `if (cronSecret && …)`
- **Severity:** MEDIUM · **Category:** `broken_access_control` · **Confidence:** 0.60
- **Mô tả:** `dev-secret` là secret công khai trong source; các cron khác fail-open khi `CRON_SECRET` chưa set. Tuy nhiên các route này **không** trong public whitelist nên vẫn cần phiên hợp lệ → giới hạn ở user đã đăng nhập; tác động chủ yếu là gửi thông báo (`archive-old-bookings` có DELETE nhưng chỉ move row >7 ngày sang bảng archive).
- **Khắc phục:** Fail-closed nếu `CRON_SECRET` chưa set; bỏ fallback; thêm RBAC admin.

---

## 4. Phát hiện LOW / Thông tin

- **Vuln 17 — `info_disclosure`** · [`src/app/api/solace/members/route.ts:15-29`](../src/app/api/solace/members/route.ts#L15-L29) · Conf 0.30: Chỉ gate `requireLogin` (không RBAC Solace); `?q=` tìm mọi user theo name/email, `?ids=` resolve id tuỳ ý → bất kỳ user đăng nhập nào enumerate được name+email toàn bộ nhân viên (hỗ trợ phishing). **Fix:** gate sau capability staff; không trả `email` cho non-staff.
- **Vuln 18 — `hardcoded_secret` (fallback)** · [`src/lib/db.ts:42-46`](../src/lib/db.ts#L42-L46) · Conf 0.55: Fallback `postgres/postgres/localhost` khi thiếu env → nguy cơ vận hành (kết nối DB ngoài ý muốn) thay vì fail to. **Fix:** fail-fast ở production.
- **Vuln 19 — FALSE POSITIVE (dead code, thông tin)** · [`src/lib/authStore.ts:7-17`](../src/lib/authStore.ts#L7-L17): `authStore.login()` so sánh mật khẩu plaintext với `MOCK_USERS` (creds hardcode trong [`src/lib/mockData.ts`](../src/lib/mockData.ts) như `SuperAdmin@2026`). **Đã xác minh không có caller server-side nào** — login thật dùng `/api/auth/login` + bcrypt. Không khai thác được, nhưng nên xoá để tránh footgun (khớp nợ kỹ thuật #2 trong CLAUDE.md).

---

## 5. Nguyên nhân gốc & ưu tiên khắc phục

| Nguyên nhân gốc | Liên quan | Cách sửa hệ thống |
|-----------------|-----------|-------------------|
| **Tin actor từ body/URL** | Vuln 2, 3, 4, 5, 6, 10, 15 | Bắt buộc mọi route đặc quyền lấy danh tính từ `x-current-user-id` (header middleware tiêm) + truy vấn lại role trong DB; **không bao giờ** nhận `adminId`/owner-id từ client. Đây là mẫu nguy hiểm nhất. |
| **Idiom secret fail-open `if (secret) { check }`** | Vuln 8, 11, 14, 16 | Đổi sang **fail-closed**: thiếu secret ⇒ từ chối (401/503). Thêm assertion lúc khởi động bắt buộc secret tồn tại trước khi `setWebhook`. |
| **`SELECT *` / `SELECT u.*` trên `users`** | Vuln 1 | Không bao giờ trả cột `password`; dùng allow-list cột tường minh. |

### Thứ tự đề xuất
1. **Cụm route `users` (Vuln 1, 2, 4, + 3, 6)** — cùng nhóm file, chung cách sửa (lấy actor từ header + kiểm role DB + allow-list cột). Cấp bách nhất: Vuln 1 (dump hash+PII) và Vuln 2 (chiếm mọi tài khoản) khai thác được ngay bởi nhân viên quyền thấp nhất.
2. **Cụm fail-open secret (Vuln 8, 11, 14, 16)** — chuyển fail-closed đồng loạt.
3. Các MEDIUM còn lại (7, 9, 10, 12, 13, 15) theo lịch thường.

---

*Báo cáo tạo bởi rà soát bảo mật tự động (skill `security-review`) + xác minh thủ công các phát hiện trọng yếu. Mỗi phát hiện kèm số dòng và đường dẫn để truy vết. Độ tin cậy (confidence) ghi theo từng mục.*

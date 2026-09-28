# Kế hoạch Cải tổ Cơ cấu Tổ chức (Org Structure Overhaul)

> Trạng thái: **ĐỀ XUẤT — chờ duyệt**. Soạn 2026-07-03.
> Mục tiêu: cấp bậc & cây tổ chức tường minh, nhất quán ở mọi module, hỗ trợ
> **một người – nhiều phân công (kiêm nhiệm) – nhiều công ty**, theo chuẩn
> Workday/SAP (concurrent assignments) và Odoo (head tường minh trên mỗi đơn vị).

## 1. Vấn đề hiện tại (đã khảo sát code)

1. Cấp bậc bị SUY LUẬN, không khai báo:
   - `job_titles.rank` (migration 035) được seed bằng **đoán theo tên** chức danh;
     chức danh mới ("Cố Vấn HĐQT", "Trợ Lý BGĐ") rơi về rank 4 mặc định.
   - Bảng công (`BangCongClient.tsx:71-88`) gom người `department_id IS NULL`
     vào "(Chưa phân phòng ban)" và đoán trưởng nhóm qua cờ `is_manager`.
   - UI cơ cấu tổ chức cho phép trống trưởng đơn vị ("Tự nhận diện theo quản lý").
2. `users.department_id / sub_department_id / job_title_id / manager_id` là **cột đơn**
   → không diễn tả được kiêm nhiệm; lãnh đạo cấp công ty buộc phải "không có phòng ban".
3. Bug tiềm ẩn: `api/organizations/org-chart/route.ts:47,62` join `departments.head_id`
   / `sub_departments.head_id` nhưng **chưa có migration tạo 2 cột này**
   (migration 138 chỉ thêm cho `companies`). API departments/sub-departments cũng đang ghi `head_id`.
4. Mỗi module tự đọc cột thô và tự suy luận → hiển thị mâu thuẫn giữa sơ đồ tổ chức,
   bảng công, chữ ký email, duyệt phép.

## 2. Thiết kế đích

### 2.1 Bốn khái niệm tách bạch
| Khái niệm | Lưu ở | Ghi chú |
|---|---|---|
| Đơn vị tổ chức | `companies` → `departments` → `sub_departments` | giữ nguyên cây hiện có |
| Chức danh | `positions.name` | **CANONICAL** (quyết định 2026-07-03, xem 2.1b) |
| Cấp bậc | `positions.rank` (migration 225, 1..5) | **khai báo qua UI**, bỏ đoán theo tên |
| Vai trò trong đơn vị | `org_assignments.org_role` | head / deputy / assistant / member |

### 2.1b Quyết định kiến trúc: positions (không phải job_titles) là chức danh canonical
Codebase có HAI bảng chức vụ song song. Khảo sát dữ liệu thật (dev, 2026-07-03):
`positions` = 63 chức danh thật, 65/66 user active dùng `users.position_id`, được modal
user + chữ ký email + onboarding dùng; `job_titles` = 5 dòng seed, 3 user, chỉ
taskPermissionService cũ đọc `job_titles.rank` (mig 035, seed đoán theo tên — nguồn gốc bug).
→ `positions` nhận cột `rank`; `org_assignments.position_id` là tham chiếu chức danh;
`org_assignments.job_title_id` + bảng `job_titles` đóng băng LEGACY, gỡ ở Phase 6.

### 2.2 Bảng trung tâm mới: `org_assignments`
Một người = nhiều dòng phân công (kiêm nhiệm nội bộ + đa công ty).

```sql
CREATE TABLE org_assignments (
  id                TEXT PRIMARY KEY,            -- app sinh
  user_id           UUID NOT NULL,               -- users.id (UUID thật)
  company_id        UUID NOT NULL,
  department_id     UUID,                        -- NULL = phân công CẤP CÔNG TY (tường minh, không phải "thiếu")
  sub_department_id UUID,
  job_title_id      UUID,                        -- chức danh CỦA RIÊNG phân công này
  org_role          TEXT NOT NULL DEFAULT 'member'
                    CHECK (org_role IN ('head','deputy','assistant','member')),
  manager_id        UUID,                        -- báo cáo cho ai TRONG vai trò này
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  effective_from    DATE,                        -- chừa sẵn cho lịch sử; phase đầu chưa dùng
  effective_to      DATE,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Mỗi người đúng 1 vai trò chính / công ty:
CREATE UNIQUE INDEX uq_org_assign_primary
  ON org_assignments(user_id, company_id) WHERE is_primary AND is_active;
CREATE INDEX idx_org_assign_user ON org_assignments(user_id) WHERE is_active;
CREATE INDEX idx_org_assign_unit ON org_assignments(company_id, department_id, sub_department_id) WHERE is_active;
```

Quy ước:
- **Trưởng đơn vị** = assignment có `org_role='head'` tại đúng đơn vị đó (deputy tương tự).
  `companies/departments/sub_departments.head_id` giữ lại làm **cột đồng bộ** (denormalized,
  service tự sync khi assignment head thay đổi) để query hiển thị nhanh + tương thích code cũ.
- **Lãnh đạo/cố vấn cấp công ty**: assignment với `department_id IS NULL` — là dữ liệu
  khai báo tường minh, không còn là "thiếu phòng ban".
- **Kiêm nhiệm**: nhiều assignment active; đúng 1 `is_primary` mỗi công ty.
- **Chuỗi báo cáo**: `manager_id` per-assignment; mặc định auto-điền = head của đơn vị
  (hoặc head đơn vị cha nếu chính mình là head), luôn cho phép override, luôn lưu vật lý.

### 2.3 Quy ước tiêu thụ cho module
- Chấm công / nghỉ phép / bảng công: mỗi người đếm **một lần** theo assignment
  `is_primary` của công ty đang xét. Grouping bảng công đọc từ assignment,
  bỏ hẳn heuristic `'__'` + `is_manager`.
- Quyền duyệt/scope: **hợp nhất từ mọi assignment active** (trưởng phòng kiêm trưởng
  bộ phận duyệt được cả hai nhóm). Cây cấp dưới = đệ quy `org_assignments.manager_id`.
- Sơ đồ tổ chức: người kiêm nhiệm xuất hiện ở mọi ô có vai trò, badge "Kiêm nhiệm".
- Chữ ký email / hồ sơ: mặc định chức danh của assignment primary; UI cho chọn
  assignment khác (hiển thị nhiều chức danh là hợp lệ).
- `user_company_memberships`: giữ làm nguồn **role + module_permissions** per công ty
  (auth/RBAC); các cột org (department/job_title/manager) chuyển dần sang đọc từ
  `org_assignments`. Không xây hai nguồn song song lâu dài.

### 2.4 Nguồn sự thật duy nhất: `orgStructureService.ts`
API nội bộ mọi module phải dùng (cấm tự query cột thô sau khi chuyển đổi):
- `getUserAssignments(userId, companyId?)` — tất cả phân công active
- `getPrimaryAssignment(userId, companyId)`
- `getUnitTree(companyId)` — cây đơn vị + head/deputy + member count
- `getUnitHead(unit)` / `getUnitMembers(unit)`
- `getOrgSubtreeUserIds(managerUserId, companyId?)` — thay bản trong attendanceService
- `getRank(userId, companyId)` — max cấp (min rank number) trong các assignment active
- `resolveDefaultManager(assignment)` — auto-điền manager khi tạo/chuyển phân công

## 3. Lộ trình theo Phase (mỗi phase deploy được độc lập, không đổi hành vi cho tới khi bật)

### Phase 0 — Hotfix nền (nhỏ, làm ngay)
- Migration **222**: `ADD COLUMN IF NOT EXISTS head_id TEXT` cho `departments`,
  `sub_departments` (sửa bug join cột không tồn tại của org-chart API).
- Không đổi UI/hành vi.

### Phase 1 — Schema + backfill
- Migration **223**: tạo `org_assignments` (như trên).
- Migration **224**: backfill idempotent:
  - Mỗi user active → 1 assignment `is_primary=true` từ
    `users.(company_id, department_id, sub_department_id, job_title_id, manager_id)`.
  - Mỗi dòng `user_company_memberships` active → 1 assignment primary tại công ty phụ.
  - `org_role` khởi tạo: `head` nếu user là `head_id`/`manager_id` của đơn vị mình thuộc; ngược lại `member`.
- Không module nào đọc bảng mới ở phase này → zero rủi ro hành vi.

### Phase 2 — Service + dual-write
- Viết `src/lib/services/orgStructureService.ts` (mục 2.4) + unit test logic scope.
- **Dual-write**: mọi luồng ghi hiện có (đã kiểm kê đủ 6 luồng: users POST/PUT,
  onboarding approve, offboarding complete, memberships PUT, contract terminate)
  ghi song song vào `org_assignments`; cột cũ trên `users` vẫn được ghi
  (= giá trị assignment primary) để code chưa chuyển vẫn đúng.
- Sync `head_id` denormalized khi assignment head đổi.

### Phase 3 — UI phân công & cấp bậc
- **UsersModal**: thêm tab "Phân Công" — danh sách assignments (đơn vị, chức danh,
  vai trò, quản lý, primary), thêm/sửa/kết thúc phân công. Các field đơn lẻ cũ
  (Công Ty/Phòng ban/Bộ Phận/Chức Vụ/Quản lý) trở thành view của assignment primary.
- **/organization/positions**: thêm cột "Cấp bậc" (rank) chỉnh được — hết đoán theo tên.
- **OrganizationStructureManagement**: gán Trưởng/Phó tường minh cho mọi đơn vị;
  bỏ tuỳ chọn "Tự nhận diện theo quản lý".
- Màn hình **"Kiểm tra sức khoẻ tổ chức"**: liệt kê user chưa có phân công primary,
  đơn vị chưa có head, chức danh chưa xếp cấp — để HR backfill có kiểm soát.

### Phase 4 — Chuyển module tiêu thụ (theo mức phụ thuộc, mỗi module 1 commit)
1. `taskPermissionService` — rank + scope từ assignments (hợp nhất đa vai trò).
2. `attendanceService.getOrgSubtreeUserIds` + **BangCong grouping** (xoá heuristic
   `'__'`/`is_manager`; nhóm cấp công ty hiển thị "Ban Lãnh Đạo / Văn phòng công ty").
3. Nghỉ phép / bù công / tăng ca — người duyệt từ `resolveDefaultManager`/assignments.
4. `contractPermissionService`, `managerDashboardService`, dashboard scope.
5. Org-chart API + `/organizations/structure/personnel` (OrgPersonPicker) — multi-box kiêm nhiệm.
6. `signatureService.getSignatureAutofill` — chọn assignment, default primary.
7. `getEffectiveContext` — org fields đọc từ assignments (role/permissions giữ ở memberships).

### Phase 5 — Backfill nghiệp vụ + nghiệm thu
- Cùng HR rà từng người trên màn "Kiểm tra sức khoẻ tổ chức" (máy không đoán thay).
- So sánh song song output cũ/mới (bảng công, cây duyệt) trước khi cắt chuyển.

### Phase 6 — Dọn dẹp
- Gỡ toàn bộ heuristic cũ; cột org đơn lẻ trên `users` chuyển read-only (giữ tương thích),
  đánh dấu LEGACY trong code + CLAUDE.md.

## 4. Nguyên tắc an toàn
- Mỗi thay đổi schema = 1 migration `NNN_*.sql` idempotent, chạy DB dev trước khi test.
- Mỗi phase deploy độc lập, mặc định **không đổi hành vi** (dual-write, feature-flag khi cắt module).
- Không đụng hệ thống notification thủ công — nếu phát sinh nhắc nhở (vd đơn vị thiếu head) thì đi qua engine `src/lib/notifications/`.
- Chỉ deploy khi user yêu cầu; gom nhiều phase nếu user muốn.

## 5. Bề mặt ảnh hưởng đã kiểm kê (tham chiếu)
- Consumer phụ thuộc CAO: chấm công (`getOrgSubtreeUserIds`), nghỉ phép, task permission,
  hợp đồng/hồ sơ, đa công ty (`userCompanyService`, `getEffectiveContext`).
- Luồng ghi: users POST/PUT, bulk-update (không đụng org), onboarding approve,
  offboarding complete (set inactive + left_date, không clear org), memberships PUT,
  contract terminate. ADMS/Zimbra không ghi org.
- Migration hiện tại lớn nhất: **221** → chuỗi mới bắt đầu từ **222**.

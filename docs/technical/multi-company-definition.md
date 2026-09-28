# Dinh nghia chuan - Da Cong Ty

Tai lieu nay la source of truth cap product + system cho chuc nang `Da Cong Ty` trong FADO AssetFlowPro.

Muc tieu la de:

- khong ai hieu sai rang "da cong ty" chi la gan user vao nhieu company
- Claude Code, Codex, IT Manager, va dev moi co chung mot dinh nghia
- moi thay doi lien quan company scope co checklist de lam dung du o bat ky may nao

## 1. Dinh nghia chuan

`Da Cong Ty` la co che cho phep **mot tai khoan nguoi dung lam viec trong nhieu cong ty**, va khi nguoi dung chuyen "cong ty dang lam viec" thi **toan bo ngu canh hieu luc** phai doi theo cong ty do.

Ngu canh hieu luc bao gom:

- role
- module_permissions
- company_id
- department_id
- sub_department_id
- position_id
- job_title_id
- manager_id
- pham vi du lieu duoc xem
- pham vi thao tac duoc tao/sua/xoa/duyet

No khong phai la:

- mot field `company_id` phu tren user
- mot bo loc giao dien
- mot dropdown de doi logo hoac ten cong ty

No la:

- mot co che `multi-workspace`
- moi workspace = 1 company
- moi company co the cho cung 1 user mot vai tro va cau truc to chuc khac nhau

## 2. Muc dich nghiep vu

Chuc nang nay ton tai de giai quyet cac tinh huong sau:

1. Mot nguoi phu trach nhieu cong ty trong he thong.
2. Cung mot nguoi co the:
   - la `admin` o cong ty A
   - la `manager` o cong ty B
   - la `user` o cong ty C
3. Cung mot nguoi co the thuoc:
   - phong ban khac nhau
   - bo phan khac nhau
   - chuc vu khac nhau
   - cap quan ly khac nhau
   giua cac cong ty.
4. Khi doi company active, he thong phai doi:
   - du lieu nhin thay
   - quyen thao tac
   - sidebar/module count
   - dashboard
   - bo loc/to chuc/mapping user
   - cac API query va mutation

## 3. Mo hinh du lieu chuan

### 3.1 Cong ty chinh

Cong ty chinh cua user nam trong:

- `users.company_id`
- kem theo role/to chuc chinh trong bang `users`

Day la nguon su that cho company chinh.

### 3.2 Cong ty phu

Cong ty phu nam trong:

- `user_company_memberships`

Moi dong membership co the mang:

- `company_id`
- `role`
- `department_id`
- `sub_department_id`
- `position_id`
- `job_title_id`
- `manager_id`
- `module_permissions`
- `is_active`

### 3.3 Company dang lam viec

Company dang lam viec tren client duoc giu boi:

- `active_company_id` trong localStorage

Neu khong co gia tri nay thi fallback ve:

- `assetflow_auth.company_id`

## 4. Ngu canh hieu luc

Khong bao gio tin client tu khai:

- role
- module permissions
- org context

Client chi duoc noi:

- "toi dang muon lam viec trong company X"

Server phai tu tinh lai ngu canh hieu luc bang:

- `getEffectiveContext(userId, companyId)`

Ket qua hieu luc la cap:

- user
- company dang active

Va phai tra ra day du:

- role
- permissions hieu luc
- org fields hieu luc

## 5. Quy tac bat buoc

1. `super_admin` co the nhin toan he thong.
2. Role khac `super_admin` khong duoc vuot khoi company active, tru khi nghiep vu cho phep ro rang va co code xu ly minh bach.
3. `admin` chi duoc thao tac trong company active.
4. `manager` chi duoc thay:
   - ban than
   - cap duoi
   trong company active.
5. `user` chi duoc thay:
   - du lieu cua chinh minh
   trong company active, tru module duoc thiet ke khac.
6. Moi API mutating hoac list co scope du lieu phai co company-aware enforcement o server.
7. Client-side filter khong duoc coi la bao mat.

## 6. Source of truth trong code

### Bat buoc doc

- `src/lib/services/userCompanyService.ts`
- `src/lib/activeCompany.ts`
- `src/components/CompanySwitcher.tsx`
- `src/lib/api-permissions.ts`

### Cac diem quan trong

- `getEffectiveContext()` = noi suy role/quyen/to chuc theo company dang active
- `getCompanyMemberUserIds()` = tap user thuoc 1 company
- `installCompanyFetchInterceptor()` = tu dong chen `x-current-user-company`
- `CompanySwitcher` = noi doi company tren client va cap nhat session local

## 7. Luong dung

### Luong chuyen company

1. User mo switcher.
2. User chon company B.
3. Client goi `/api/users/:id/effective-context?company_id=B`.
4. Server tra ve effective context cua user tai company B.
5. Client cap nhat local session:
   - role
   - module_permissions
   - company_id
   - department_id
   - sub_department_id
   - position_id
   - job_title_id
   - manager_id
6. Client reload.
7. Mọi request `/api/*` tu dong gui kem `x-current-user-company=B`.
8. API server scope lai theo company B.

### Luong API dung chuan

1. Lay `x-current-user-id`
2. Lay `x-current-user-company`
3. Goi `getEffectiveContext(userId, activeCompany)`
4. Check module/unit permission tren context hieu luc
5. Scope du lieu theo role hieu luc + company hieu luc
6. Moi query mutation/list deu dung company scope do

## 8. Dau hieu implementation dung

Mot module duoc coi la "multi-company-safe" khi:

- khong chi dua vao `users.company_id` mot cach nguyen thuy
- API co doc `x-current-user-company`
- API co goi `getEffectiveContext()`
- list query scope theo company hieu luc
- update/delete/create khong cho phep ghi sang company khac
- neu manager scope thi co subtree filter trong company active
- neu admin scope thi chi thay user thuoc company active
- badge/count/dashboard cung dung cung mot scope

## 9. Anti-pattern can tranh

1. Doc `localStorage.currentUser.role` roi tin la du.
2. Dung `user.company_id` o client de quyet dinh scope bao mat.
3. API check permission bang header role ma khong resolve `getEffectiveContext()`.
4. Chuyen company tren UI nhung khong cap nhat org fields hieu luc.
5. List da scope theo company nhung mutation van cho ghi cheo company.
6. Company filter chi o frontend, backend van mo.
7. Cung mot module co noi dung `active company aware`, noi khac lai `primary company only`.

## 10. Checklist audit toan bo Da Cong Ty

Dung checklist nay moi khi muon ra soat hoac ban giao.

### A. Nen tang

- [ ] `userCompanyService.ts` con la source of truth cho effective context
- [ ] `CompanySwitcher` cap nhat day du role + org context
- [ ] `activeCompany` interceptor con chen header `x-current-user-company`
- [ ] login/logout/reset session co clear `active_company_id`

### B. API route

Cho tung route co du lieu co company scope:

- [ ] co lay `x-current-user-company`
- [ ] co goi `getEffectiveContext()`
- [ ] co check permission server-side
- [ ] GET/list scope dung company active
- [ ] POST/create khong cho ghi record sang company khac
- [ ] PUT/PATCH/delete khong cho sua/xoa record ngoai company active
- [ ] count/analytics/dashboard dung cung scope

### C. Role scope

- [ ] `super_admin` toan he thong
- [ ] `admin` chi company active
- [ ] `manager` chi ban than + cap duoi trong company active
- [ ] `user` chi ban than trong company active

### D. Client

- [ ] switch company xong session local duoc cap nhat day du
- [ ] page reload sau switch company
- [ ] page/form/filter khong cache org context cu
- [ ] request fetch tay nao khong di qua interceptor thi phai tu gan header company

### E. Kiem thu

- [ ] cung 1 user, doi tu company A sang B thi sidebar/module count doi theo
- [ ] cung 1 user, role o A va B khac nhau thi quyen thay doi theo
- [ ] manager A khong thay cap duoi B
- [ ] admin A khong sua record B
- [ ] dashboard/analytics khong leak cheo company

## 11. Checklist khi them module moi

Neu them mot module moi ma co company scope, bat buoc:

- [ ] xac dinh record nay thuoc company nao
- [ ] xac dinh role nao duoc xem/sua
- [ ] route list co `getEffectiveContext()`
- [ ] route create co ép/fix `company_id` theo context neu can
- [ ] route detail/update/delete validate record thuoc company active
- [ ] neu co manager scope thi them subtree logic
- [ ] neu co dashboard/count thi dung chung company scope
- [ ] test switch company tren UI

## 12. Checklist truoc khi commit len git

- [ ] doc `CLAUDE.md`
- [ ] doc `CODEX.md`
- [ ] doc file nay
- [ ] grep `getEffectiveContext(` de xem module dang theo pattern nao
- [ ] grep route/module vua sua de dam bao list + mutation deu da scope
- [ ] chay `npx tsc --noEmit`
- [ ] neu co UI switch company lien quan, test lai tren browser
- [ ] ghi ro trong commit message neu thay doi anh huong company scope

## 13. Checklist de thuc hien o bat ky may nao

Khi mo repo tren may moi, chi can:

1. Doc:
   - `CLAUDE.md`
   - `CODEX.md`
   - `docs/AGENT-INDEX.md`
   - `docs/technical/multi-company-definition.md`
2. Xac nhan branch dang dung.
3. Xem `git status`.
4. Tim:
   - `getEffectiveContext`
   - `active_company_id`
   - `CompanySwitcher`
5. Chon 1 module can audit/sua.
6. Doi checklist o Muc 10, 11, 12 de lam.

Neu ai lam theo 6 buoc nay thi van tiep tuc dung du o may khac, IDE khac, agent khac.

## 14. Tham van hien tai

Danh gia hien tai cua Codex:

- Nen tang Da Cong Ty cua du an la dung huong.
- `getEffectiveContext()` la quyet dinh kien truc dung.
- Fetch interceptor la lop bao ve thuc dung va can giu.
- Rui ro lon nhat la cac module cu van doc `user.company_id` truc tiep hoac chi scope o frontend.

Thay doi vua nen lam ngay:

- sau khi switch company, client phai cap nhat day du org context hieu luc, khong chi role + permissions

Huong audit tiep theo nen uu tien:

1. Dashboard / analytics / counts
2. Users / organization
3. Attendance / leave / overtime
4. Assets / software / domains / emails
5. Tasks / tickets / HR modules con lai

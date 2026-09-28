# CODEX.md - Memory hien hanh cho FADO AssetFlowPro

Doc nay la ban handoff ngan gon de Codex tiep tuc lam viec trong repo ma khong lech quy uoc da dung voi Claude Code. Doc file nay truoc khi sua code, sau do doi chieu voi code that va `CLAUDE.md` neu task cham vao phan nhay cam.

Thu tu doc de han che lech context:

1. `CLAUDE.md`
2. `CODEX.md`
3. `docs/AGENT-INDEX.md`

`CLAUDE.md` la luat goc. `CODEX.md` la memory hien hanh. `docs/AGENT-INDEX.md` chi ra can doc them gi theo tung loai task.

## Du an la gi

FADO AssetFlowPro la webapp san pham that dang chay tren domain `assetflow.fadoai.com`.

He thong quan ly van hanh noi bo cho to chuc Viet Nam, gom cac mang chinh:

- Quan ly tai san, phan cung, phan mem, domain, tai khoan email/Zimbra.
- Dashboard, ticket, task, lich su/audit.
- Phong hop, QR check-in/check-out, phe duyet dat phong.
- Nhan su, hop dong, danh gia, onboarding/offboarding, yeu cau tuyen dung.
- Cham cong, bang cong, nghi phep, bu cong/tang ca, may cham cong ZKTeco.
- Solace POS/vi/thanh toan/dat mon/quan ly kho mini.
- He thong thong bao tap trung, Telegram, email, scheduler/cron.

UI mac dinh la tieng Viet.

## Stack va kien truc

- Next.js App Router, TypeScript, React.
- Tailwind CSS + Radix/shadcn-style primitives + lucide-react.
- PostgreSQL self-hosted qua thu vien `pg`.
- Khong coi Supabase la backend hien hanh, du repo con mot so file/ghi chu cu lien quan Supabase.
- Auth hien hanh: dang nhap chinh qua FADO SSO (OIDC, `/api/auth/sso/start` + `/api/auth/sso/callback`), khong con form nhap password cho luong dang nhap thuong. Mat khau local chi con dung cho break-glass super_admin qua `?mode=emergency`. User duoc dong bo sang SSO qua `src/lib/services/ssoProvisioningService.ts` (M2M) + cot `users.sso_*`. Van con no ky thuat legacy client auth/localStorage (xem `src/lib/authStore.ts`).
- Realtime chu yeu qua Server-Sent Events va cac endpoint subscribe.
- Deploy bang Docker/Coolify/Traefik, app port chinh `4028`.

## Da Cong Ty

- `Da Cong Ty` trong repo nay khong chi la "1 user thuoc nhieu company".
- Dinh nghia dung: 1 user co the co nhieu workspace cong ty, va moi company co role/quyen/to chuc hieu luc rieng.
- Company chinh nam o `users.company_id`.
- Company phu nam o `user_company_memberships`.
- Company dang lam viec nam o `active_company_id` tren client.
- Server phai coi `getEffectiveContext(userId, companyId)` la source of truth.
- Doc them: `docs/technical/multi-company-definition.md`.

## Lenh thuong dung

Chay trong root repo:

```bash
npm run dev
npm run build
npm run lint
npm run type-check
npm run lint:colors
npm run migrate
```

Ghi nho:

- Dev server mac dinh: `http://localhost:4028`.
- `npm run start` trong repo nay dang tro ve `next dev -p 4028`, khong phai production start.
- Khi can test giao dien sau sua frontend, mo app bang Browser/in-app browser va kiem tra man hinh that.

## Luat du an bat buoc

- Doc `CLAUDE.md` truoc khi lam viec lon. File do la source of truth van hanh cua du an.
- Khong tu y revert thay doi chua commit cua user.
- DB chi di qua `src/lib/db.ts`: `query`, `queryOne`, `execute`, `withTransaction`, `buildInsert`, `buildUpdateById`.
- Khong tao Pool PostgreSQL moi.
- Moi bang/cot/index/constraint moi phai co migration trong `migrations/`.
- Migration phai idempotent neu co the, uu tien `IF NOT EXISTS`.
- Ten bang dung `plural_snake_case`.
- Can canh giac cot camelCase trong DB cu: khi viet SQL thu cong phai double-quote, vi co cot nhu `"roleLabel"`, `"userId"`, `"performedBy"`.
- API route phai co `try/catch`, response loi tieng Viet, khong log secret.
- Business logic nen nam trong `src/lib/services/*Service.ts`.
- UI text bang tieng Viet, dung `AppLayout` cho trang app noi bo.
- Giao dien dung token/CSS variable/Tailwind dark-safe, khong hardcode mau light tuy tien.
- Khi them notification/reminder/automation moi, phai di qua he thong notification tap trung trong `src/lib/notifications/`, khong insert truc tiep vao `notifications`.
- Neu co hang so nghiep vu/cau hinh co the thay doi, dua vao system config thay vi hardcode.

## UI standards can nho

- Trang module dung layout hien co, khong tu ve sidebar/topbar moi.
- Main content theo padding cua `AppLayout`, khong them wrapper padding ngoai gay lech.
- Trang nen co header ro, loading state, empty state, error state.
- Modal/drawer/table/list theo style hien co, uu tien component co san trong `src/components/ui`.
- Mobile-first, tranh vo layout o man hinh nho.
- Dung icon lucide cho nut/chuc nang khi phu hop.
- Khong them landing page neu user dang yeu cau mot tool/module noi bo.

## Module dang co dau hieu dang lam do

Tai thoi diem tao file nay, worktree dang co rat nhieu file modified va mot vai file moi. Khong duoc coi day la rac hay tu y revert.

Nhom thay doi dang thay ro:

- Chuan hoa UX/UI tren nhieu module, lien quan `docs/ux-standards.md`.
- Asset management: asset modal/detail/history/QR/bulk QR/domain/email/software/Zimbra.
- Dashboard cards/charts/metrics.
- Tickets, tasks, room bookings, approvals.
- HR/nguon nhan luc/nhan su/onboarding/offboarding/requisitions.
- Attendance/cham cong/nghi phep/cau hinh may.
- Solace POS/dat mon/vi/quan ly/guest.
- Shared UI moi: `src/components/ui/EmptyState.tsx`, `src/components/ui/ErrorState.tsx`.
- Hooks moi: `src/hooks/useEscapeKey.ts`, `src/hooks/useUnsavedGuard.ts`.

Truoc khi sua mot file trong cac nhom tren, doc noi dung file hien tai va lam tiep tren thay doi dang co, khong dua ve version cu.

## Deploy va moi truong

- San pham that: `assetflow.fadoai.com`.
- Port app noi bo/dev: `4028`.
- Dockerfile va docker-compose co trong root repo.
- Tai lieu lien quan:
  - `docs/deploy-coolify.md`
  - `docs/coolify-deploy-status.md`
  - `.claude/skills/deploy-coolify/SKILL.md`
  - `DEPLOYMENT.md`
  - `docs/deployment-guide.md`
- Khi task lien quan Coolify/deploy, doc skill deploy-coolify truoc.
- Khong dua secret `.env` vao docs, commit, log, screenshot.

## RUI RO lon

- Permission server-side co lich su chua chac chan an toan, tung co pattern doc quyen tu header client. Khi them API moi, khong mac dinh pattern cu la secure.
- Auth co dau vet hai he song song: DB/bcrypt va legacy localStorage/mock. Khi sua auth, doc code that truoc.
- Migrations co kha nang trung so thu tu o cac file cu. Khi tao migration moi, kiem tra so lon nhat trong `migrations/` truoc.
- README/docs cu co the sai so voi code hien tai, dac biet thong tin Next.js/Supabase/auth. Tin code va `CLAUDE.md` hon README cu.
- `.claude/settings.local.json` dang co dau hieu conflict marker. File nay la lich su permission cua Claude, khong phai source of truth nghiep vu.
- Mot so endpoint debug/admin/migration co the nguy hiem neu dung tren prod. Khong goi tren prod neu user khong yeu cau ro.
- Khong log password, token, connection string, API key, cookie/session.

## Tai khoan test

Chua co tai khoan test an toan duoc xac nhan trong tai lieu da doc.

Neu can dang nhap/test:

- Hoi user tai khoan test hoac cach dang nhap phu hop.
- Khong tu doan mat khau.
- Khong ghi credential vao `CODEX.md`, issue, commit message, hay log.
- Neu phai doc `.env`/du lieu local de debug, chi dung cuc bo va khong lap lai secret trong cau tra loi.

## Cac viec tuyet doi khong lam

- Khong revert/xoa thay doi chua commit neu user khong yeu cau ro.
- Khong chay lenh destructive nhu reset hard, checkout file, xoa thu muc lon neu chua co yeu cau ro.
- Khong tao migration ma khong can, va khong tham chieu cot DB moi khi chua co migration.
- Khong tao DB connection rieng ngoai `src/lib/db.ts`.
- Khong hardcode secret, token, password, domain noi bo nhay cam.
- Khong bypass notification engine bang insert/gui Telegram thu cong cho luong moi.
- Khong sua hang loat style/refactor ngoai pham vi task.
- Khong doi ngon ngu UI sang tieng Anh trong man hinh nguoi dung.
- Khong tin docs cu mot cach may moc khi code hien tai khac.
- Khong day code len remote/deploy prod neu user chua yeu cau.

## Cach Codex nen lam viec

1. Doc `CODEX.md`, `CLAUDE.md`, va file/module lien quan.
2. Kiem tra `git status` de biet thay doi dang co.
3. Neu sua DB, kiem tra migrations va tao migration dung so.
4. Sua nho, dung pattern san co.
5. Chay test/lint/type-check phu hop voi pham vi thay doi.
6. Neu sua frontend, kiem tra bang browser/screenshot khi co the.
7. Bao cao ngan gon: da sua gi, file nao, da test gi, con rui ro gi.

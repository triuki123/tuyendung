---
name: deploy-coolify-assetflow
description: Build & deploy FADOAssetFlowPro (app "FADO Asset") lên Coolify PaaS tại deploy.fadoai.com. Dùng khi user muốn build/deploy/redeploy app, cập nhật env, hoặc debug một lần deploy fail. Coolify build Dockerfile từ GitHub, chạy migration rồi start Next.js.
---

# Deploy FADOAssetFlowPro lên Coolify (deploy.fadoai.com)

App **"FADO Asset"** deploy lên **Coolify** (self-hosted PaaS) tại `https://deploy.fadoai.com`.
Coolify clone repo **GitHub `itfado/FADOAssetFlowPro`** nhánh **`afterdeploy`** → build [Dockerfile](../Dockerfile)
trên server → CMD chạy `node scripts/run-migrations.js && node scripts/migrate.mjs && node server.js`
→ start Next.js standalone (port **4028**).

> ⚠️ Đây là dự án Next.js, KHÁC hoàn toàn skill `deploy-coolify` của hub-backend
> (NestJS/TypeORM/GitLab/port 4000). Dùng đúng app "FADO Asset", KHÔNG dùng UUID hub-backend.

## Yêu cầu trước khi thao tác

1. **Coolify API token** (user cung cấp) — Laravel Sanctum `N|xxxxx`.
   Header `Authorization: Bearer <token>`, base `https://deploy.fadoai.com/api/v1`.
   Scope cần: `read` + `write` (sửa env) + `deploy` (trigger).
   Test: `GET /api/v1/version`.
2. **Code đã ở GitHub `afterdeploy`** — agent đã commit + push. Xác nhận `git log origin/afterdeploy` đúng commit mới nhất TRƯỚC khi trigger (Coolify kéo từ GitHub, không phải từ máy local).
3. Coolify đã kết nối GitHub source cho repo này (đã cấu hình sẵn vì app đang chạy).

## Bước 0 — Tìm UUID app "FADO Asset" (KHÔNG hardcode)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "https://deploy.fadoai.com/api/v1/applications" \
 | python3 -c "import sys,json;[print(a.get('uuid'),'|',a.get('name'),'|',a.get('git_branch')) for a in json.load(sys.stdin)]"
```
Lấy `uuid` của dòng tên **"FADO Asset"**, xác nhận `git_branch = afterdeploy`. Đặt `APP=<uuid>`.

## ⚠️ BÀI HỌC #1: Build LOCAL pass KHÔNG nghĩa build Coolify pass

> Server build của Coolify **không truy cập được internet ra ngoài** (đặc biệt
> `fonts.gstatic.com`). Máy dev có internet + cache nên `npm run build` thành công,
> nhưng trên Coolify sẽ **FAIL**. Đã từng làm hỏng 1 deploy.

- ❌ **KHÔNG dùng `next/font/google`** (vd `import { Montserrat } from 'next/font/google'`).
  Nó fetch font lúc build → Coolify build báo `Failed to fetch <Font> from Google Fonts`
  / `FetchError ... fonts.gstatic.com ... failed`.
- ✅ Dùng chuỗi `font-family` CSS với fallback có sẵn, vd:
  `"'Montserrat', var(--font-plus-jakarta-sans), system-ui, sans-serif"`.
  (`Plus Jakarta Sans` đã self-host toàn cục ở `src/app/layout.tsx` và **đã từng build
  được** trên Coolify — nhưng thêm font Google THỨ HAI là gãy.)
- ✅ Trước mỗi deploy: chạy `npm run build` ở local để bắt lỗi compile/type — nhưng nhớ
  rằng lỗi **mạng** (Google Fonts, tải tài nguyên ngoài) sẽ KHÔNG hiện ở local. Rà tay
  xem có `next/font/google` mới nào không: `grep -rn "next/font/google" src/`.

## Quy trình REDEPLOY

1. Xác nhận commit mới đã lên GitHub: `git log -1 origin/afterdeploy`.
   (Coolify kéo từ GitHub — quên `git push origin afterdeploy` là deploy lại bản cũ.)
2. Trigger:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://deploy.fadoai.com/api/v1/deploy?uuid=$APP&force=true"
   # -> {"deployments":[{"deployment_uuid":"..."}]}
   ```
3. Poll tới khi terminal (`run_in_background`):
   ```bash
   D=<deployment_uuid>
   for i in $(seq 1 120); do
     resp=$(curl -s -H "Authorization: Bearer $TOKEN" "https://deploy.fadoai.com/api/v1/deployments/$D")
     st=$(printf '%s' "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))")
     echo "[$i] $st"; case "$st" in finished|failed|error|cancelled) echo "$resp" > /tmp/r.json; break;; esac; sleep 20
   done
   python3 -c "import json;d=json.load(open('/tmp/r.json'));[print((e.get('output','') if isinstance(e,dict) else e)[:240]) for e in json.loads(d.get('logs') or '[]')[-60:]]"
   ```
4. Xác nhận: `GET /api/v1/applications/$APP` → `status`. App này Dockerfile **không có HEALTHCHECK** → có thể là `running:unknown` (bình thường, không phải lỗi). Kiểm thật bằng cách mở domain app hoặc đọc runtime log.

## Env vars (đã set sẵn trên app — chỉ kiểm/khôi phục khi cần)

App đọc env lúc runtime (không inline trừ `NEXT_PUBLIC_*`):
- **DB**: `DATABASE_URL` (hoặc `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`), `PGSSL`, `PG_POOL_MAX`.
- **App**: `NEXT_PUBLIC_APP_URL` (⚠️ inline lúc BUILD — đổi giá trị này phải rebuild, set qua build arg/env trước deploy), `PORT=4028`, `NODE_ENV=production`, `TZ=Asia/Ho_Chi_Minh`.
- **Email (tùy chọn)**: `AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY SES_FROM_EMAIL`.
- **Zimbra (server-only)**: `ZIMBRA_ADMIN_URL ZIMBRA_ADMIN_USER ZIMBRA_ADMIN_PASSWORD ZIMBRA_TLS_REJECT_UNAUTHORIZED ZIMBRA_DEFAULT_PASSWORD_SUFFIX`.

Set env qua API (per-key):
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://deploy.fadoai.com/api/v1/applications/$APP/envs" \
  -d '{"key":"PG_POOL_MAX","value":"30","is_preview":false}'
```

## Migration khi deploy (đặc thù dự án)

CMD chạy 2 lớp nối tiếp TRƯỚC khi start server:
- `run-migrations.js` — chạy `migrations/NNN_*.sql` theo thứ tự, track qua bảng `_migrations` (mỗi file 1 lần).
- `migrate.mjs` — chạy `docker/postgres/reconcile.sql` (dựng/đồng bộ schema, chạy SAU cùng).
- Nếu migration fail → `&&` dừng → `server.js` KHÔNG start → app unhealthy. Đọc log deployment tìm dòng `❌ FAILED: NNN_*.sql` + mã lỗi Postgres.

> ⚠️ reconcile.sql chạy SAU migration đánh số → DROP/ADD CONSTRAINT trong nó có thể ghi đè
> constraint mới. Khi đổi constraint/enum phải cập nhật CẢ migration LẪN reconcile.sql.

## Lỗi migration đã gặp & cách xử lý (lịch sử)

| Triệu chứng trong log | Nguyên nhân | Fix |
|---|---|---|
| `foreign key constraint ... cannot be implemented (42804)` | Cột FK lệch kiểu với bảng đích (TEXT trỏ UUID) | Đồng kiểu — vd `company_id UUID` trỏ `companies.id` (UUID) |
| `column "X" of relation "Y" does not exist (42703)` | Bảng đã tồn tại schema cũ, `CREATE TABLE IF NOT EXISTS` bỏ qua | Thêm `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` trước INSERT |
| `no unique or exclusion constraint matching ON CONFLICT (42P10)` | Bảng cũ thiếu PK/unique mà ON CONFLICT cần | Dùng `INSERT ... SELECT ... WHERE NOT EXISTS` |
| `violates check constraint ..._status_check` | reconcile.sql ghi đè constraint, thiếu giá trị status app dùng | Thêm giá trị vào CHECK ở CẢ migration LẪN reconcile.sql |
| `Could not load the sharp module` (đổi avatar) | sharp (native) không vào standalone | Thêm `sharp` vào `serverComponentsExternalPackages` + copy `sharp`/`@img` trong Dockerfile |

## Lỗi BUILD (trên Coolify, KHÔNG phải migration) đã gặp

| Triệu chứng trong log build | Nguyên nhân | Fix |
|---|---|---|
| `Failed to fetch <Font> from Google Fonts` / `FetchError ... fonts.gstatic.com` → `Build failed because of webpack errors` | Server build không ra được internet, `next/font/google` fetch font lúc build | Bỏ `next/font/google`, dùng `font-family` CSS fallback (xem Bài học #1) |

## Mẹo vận hành đã rút ra

- **Poll deploy chạy nền** (`run_in_background`), đặt fallback ~90 vòng × 20s. `finished`
  = OK; `failed/error` → đọc 40–60 dòng log cuối tìm `ERROR`/`FAILED`.
- **App sống = migration đã chạy xong.** CMD nối bằng `&&`: migration fail thì `server.js`
  không start → không có HTTP 200. Nên `curl -o /dev/null -w "%{http_code}" https://assetflow.fadoai.com/`
  trả **200** là bằng chứng migration 136/137/138... đã áp thành công.
- **`running:unknown` là BÌNH THƯỜNG** (Dockerfile không có HEALTHCHECK). Đừng tưởng lỗi.
- **Migration mới chạy tự động** khi deploy (qua `run-migrations.js`); chỉ cần commit file
  `migrations/NNN_*.sql` (idempotent, `IF NOT EXISTS`) là đủ — không cần chạy tay trên prod.
- **Script DB local**: `require('./src/lib/db')` KHÔNG chạy bằng `node` thuần (TS + alias).
  Test nhanh bằng `pg` trực tiếp: `require('dotenv').config({path:'.env'})` + `new Pool({...})`.
- **Lỗi dev `Unexpected end of JSON input` / `Failed to generate static paths`**: cache `.next`
  hỏng (KHÔNG phải bug code, KHÔNG ảnh hưởng prod). Fix: dừng dev, `rm -rf .next`, chạy lại.

## Quy tắc an toàn

- KHÔNG trigger deploy bằng UUID của app khác (hub-backend). Luôn discover UUID theo tên "FADO Asset" ở Bước 0.
- Deploy là thao tác production, khó đảo ngược: xác nhận commit + nhánh đúng trước khi trigger.
- Không log/echo token ra ngoài.

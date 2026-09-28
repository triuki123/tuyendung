# Trạng thái deploy Coolify — BÀN GIAO (cập nhật 2026-06-15)

> File này ghi việc **đang dở** để tiếp tục từ máy bất kỳ. Hướng dẫn quy trình đầy đủ ở [deploy-coolify.md](deploy-coolify.md).
> ⚠️ **KHÔNG ghi token vào file này** (nhạy cảm). Mỗi lần làm phải có Coolify API token do mình cung cấp.

## Đang làm gì
Đưa **FADOAssetFlowPro** lên **Coolify** (`https://deploy.fadoai.com`), app tên **"FADO Asset"**, project "Fado Asset".
Nguồn: GitHub `itfado/FADOAssetFlowPro` nhánh `afterdeploy`. Dùng **Postgres mới (rỗng)**, IT chuyển dữ liệu sau.

## UUID hạ tầng (đã tạo)
| Resource | UUID |
|---|---|
| Project "Fado Asset" | `ursf11he49flzdznnqqj6056` |
| Environment production | `nsh8266thtl8me63z5rgrq1x` |
| Server localhost (160.250.134.188) | `u9mjnpxacnfkpsx364ac48fa` |
| App "FADO Asset" | `p11puozhrh0702hw1mbblxf3` |
| Postgres mới (db/user `assetflow`) | `kvoegy0j5x7w534dtepkjff9` |
| Deploy key (đã add vào GitHub) | `kc7yyy53i3204lqh1fxooxmp` |

App: repo `ssh://git@ssh.github.com:443/itfado/FADOAssetFlowPro.git`, branch `afterdeploy`, Dockerfile `/Dockerfile`,
port 4028, fqdn `https://asset.fadoai.com`, `connect_to_docker_network=true`.
Env đã set: `DATABASE_URL` (trỏ Postgres mới), `PGSSL=false`, `PG_POOL_MAX=30`, `NEXT_PUBLIC_APP_URL=https://asset.fadoai.com`.

## Đã xong
- ✅ Clone GitHub (deploy key), build Next.js + Docker image (kể cả copy `sharp`/`@img`).
- ✅ Postgres `running:healthy`.
- ✅ **(2026-06-15) Hướng B hoàn tất — crash-loop ĐÃ HẾT.** IT restore dump DB cũ vào Postgres
  `kvoegy0j5x7w534dtepkjff9`. Redeploy (deployment `lgim8bt00werzgtn9pc33pwh`) → `finished`.
  Runtime log: `✅ Không có migration mới — DB đã cập nhật` (DB cũ kèm sẵn bảng `_migrations`
  → KHÔNG chạy lại migration nào, dữ liệu nguyên vẹn) · `reconcile.sql áp dụng thành công` ·
  `Next.js Ready` port 4028. App `status=running` (Dockerfile không có HEALTHCHECK → `running:unknown`
  là bình thường).

## ĐANG KẸT — DNS cut-over (việc của IT, KHÔNG tự làm)
App khỏe nội bộ nhưng **domain chưa truy cập được**. Nguyên nhân: DNS trỏ sai server.
| Hostname | Trỏ về | |
|---|---|---|
| `deploy.fadoai.com` (Coolify) | `160.250.134.188` | server Coolify mới ✅ |
| `asset.fadoai.com` (app) | `103.70.12.148` | ⚠️ server CŨ (Docker+Traefik), KHÔNG phải Coolify |

Probe `https://asset.fadoai.com` = HTTP 000 (cả qua DNS lẫn `--resolve` về `160.250.134.188`):
Traefik Coolify chưa cấp được cert Let's Encrypt vì DNS chưa trỏ về nó.

## BƯỚC TIẾP THEO
1. **IT đổi DNS** `asset.fadoai.com` A-record → `160.250.134.188` (server Coolify). Đây là cut-over
   production từ server cũ sang Coolify — IT quyết định & thực hiện.
2. Sau khi DNS propagate, Coolify tự cấp SSL. Verify: `curl -I https://asset.fadoai.com` → 200/302
   + đăng nhập thử.

## Redeploy (khi cần deploy lại sau này)
`curl -H "Authorization: Bearer $TOKEN" "https://deploy.fadoai.com/api/v1/deploy?uuid=p11puozhrh0702hw1mbblxf3&force=true"`
→ poll `GET /api/v1/deployments/<deployment_uuid>` tới `finished/failed`.

## Cần cung cấp lại mỗi phiên
1. **Coolify API token** (không lưu trong repo/bộ nhớ).

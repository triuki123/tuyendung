# AssetFlow Pro — Hướng Dẫn Triển Khai (Self-Hosted Docker)

**Phiên bản:** 2.0
**Cập nhật:** 2026-05-27
**Nền tảng:** Docker Compose (self-hosted)

---

## Yêu Cầu Hệ Thống

| Thành phần | Phiên bản tối thiểu |
|-----------|-------------------|
| Docker | 24+ |
| Docker Compose | v2 (plugin, không phải `docker-compose` standalone) |
| RAM | 1 GB trống |
| Disk | 5 GB trống |

---

## Khởi Động Nhanh

```bash
# 1. Clone repo
git clone <repository-url>
cd FADOAssetFlowPro

# 2. Tạo file môi trường
cp .env.local.example .env.local
# Chỉnh sửa .env.local (xem bảng biến môi trường bên dưới)

# 3. Build và chạy
docker compose up -d --build

# 4. Kiểm tra trạng thái
docker compose ps

# App chạy tại: http://localhost:4028
# Postgres chạy tại: localhost:5432
```

---

## Biến Môi Trường

File mẫu: `.env.local.example`

### Postgres (bắt buộc — chọn một trong hai cách)

**Cách 1 — Connection string:**
```bash
DATABASE_URL=postgres://assetflow:assetflow@localhost:5432/assetflow
```

**Cách 2 — Biến rời:**
```bash
PGHOST=localhost
PGPORT=5432
PGUSER=assetflow
PGPASSWORD=assetflow
PGDATABASE=assetflow
```

Tùy chọn thêm:
```bash
PGSSL=false        # đặt true nếu kết nối qua TLS
PG_POOL_MAX=10     # số connection tối đa trong pool
```

### Docker Compose (biến cho container)

```bash
POSTGRES_USER=assetflow
POSTGRES_PASSWORD=assetflow    # đổi thành password mạnh trước production
POSTGRES_DB=assetflow
POSTGRES_PORT=5432             # port expose ra host
APP_PORT=4028                  # port expose ra host
APP_URL=http://localhost:4028  # dùng trong link email reset password
```

### Email — AWS SES (tùy chọn)

Chỉ cần nếu dùng tính năng quên mật khẩu:

| Biến | Mô tả |
|------|-------|
| `AWS_REGION` | Region SES (ví dụ: `ap-southeast-2`) |
| `AWS_ACCESS_KEY_ID` | IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | IAM Secret Key |
| `SES_FROM_EMAIL` | Email người gửi (đã verify trong SES) |

### Zimbra Mail Admin (tùy chọn — chỉ server-side)

Chỉ cần nếu dùng tính năng quản trị Zimbra. Tất cả biến dưới đây là **server-side only** —
không bao giờ được expose ra client (không dùng prefix `NEXT_PUBLIC_`).

| Biến | Bắt buộc | Mô tả |
|------|---------|-------|
| `ZIMBRA_ADMIN_URL` | Bắt buộc | URL Zimbra Admin SOAP, ví dụ: `https://mail.example.com:7071/service/admin/soap` |
| `ZIMBRA_ADMIN_USER` | Bắt buộc | Tài khoản quản trị Zimbra |
| `ZIMBRA_ADMIN_PASSWORD` | Bắt buộc | Mật khẩu tài khoản quản trị |
| `ZIMBRA_TLS_REJECT_UNAUTHORIZED` | Tùy chọn | Mặc định `true`. Chỉ đặt `false` khi dev/test với chứng chỉ tự ký |
| `ZIMBRA_CA_CERT` | Tùy chọn | Nội dung PEM của CA certificate (cho TLS pinning) |
| `ZIMBRA_DEFAULT_PASSWORD_SUFFIX` | Tùy chọn | Hậu tố mật khẩu mặc định khi tạo/reset tài khoản. Mặc định: `@123` |

Nếu không khai báo các biến bắt buộc, các route `/api/zimbra/*` sẽ trả lỗi 500
nhưng phần còn lại của ứng dụng không bị ảnh hưởng.

---

## Kiến Trúc Docker Compose

```
docker-compose.yml
├── service: db (postgres:16-alpine)
│     container_name: assetflow-db
│     port: 5432
│     volume: db-data (persistent)
│     healthcheck: pg_isready
│
└── service: app (Next.js standalone)
      container_name: assetflow-app
      port: 4028
      depends_on: db (healthy)
      DATABASE_URL: postgres://...@db:5432/assetflow
```

Service `app` chờ `db` healthy trước khi khởi động (`depends_on: condition: service_healthy`).

---

## Khởi Tạo Schema Database

Postgres tự động chạy các file SQL trong `docker/postgres/init/` theo thứ tự tên file **khi volume `db-data` chưa tồn tại** (lần đầu tiên).

> Nếu thư mục `docker/postgres/init/` chưa có, tạo và đặt schema SQL vào đó.

```bash
# Cấu trúc khuyến nghị
docker/postgres/init/
├── 001_schema.sql      # CREATE TABLE users, assets, ...
├── 002_indexes.sql     # CREATE INDEX ...
└── 003_seed.sql        # Dữ liệu mặc định (tùy chọn)
```

Để chạy migrations bổ sung sau khi container đã chạy:
```bash
# Sử dụng psql bên trong container
docker compose exec db psql -U assetflow -d assetflow -f /tmp/migration.sql

# Hoặc từ host (cần psql client)
psql "$DATABASE_URL" -f migrations/024_new_feature.sql
```

---

## Build Dockerfile

Multi-stage build (`node:20-alpine`):

| Stage | Mô tả |
|-------|-------|
| `deps` | `npm install` — cài dependencies |
| `builder` | `npm run build` — tạo Next.js standalone bundle |
| `runner` | Image runtime tối giản, chạy `node server.js` |

App chạy trên port `4028` với user `nextjs` (không phải root).

Build thủ công:
```bash
# Build image
docker build -t assetflow-app .

# Chạy riêng lẻ (cần DATABASE_URL trỏ đến Postgres đang chạy)
docker run -p 4028:4028 -e DATABASE_URL=... assetflow-app
```

---

## Quản Lý Container

```bash
# Xem logs
docker compose logs -f app
docker compose logs -f db

# Restart service
docker compose restart app

# Dừng tất cả (giữ volume)
docker compose stop

# Dừng và xóa container (giữ volume)
docker compose down

# Dừng và xóa tất cả bao gồm volume (MẤT DỮ LIỆU)
docker compose down -v
```

---

## Backup & Restore

### Backup

```bash
# Dump toàn bộ database
docker compose exec db pg_dump \
  -U assetflow \
  -d assetflow \
  --no-owner \
  --no-acl \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup compressed
docker compose exec db pg_dump \
  -U assetflow -d assetflow \
  | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
# Restore từ file SQL
docker compose exec -T db psql \
  -U assetflow \
  -d assetflow \
  < backup_20260527.sql

# Restore từ file compressed
gunzip -c backup_20260527.sql.gz | docker compose exec -T db psql \
  -U assetflow -d assetflow
```

---

## Phát Triển Cục Bộ (Không Dùng Docker)

```bash
# Cài dependencies
npm install

# Chỉnh .env.local — trỏ DATABASE_URL về Postgres local hoặc Docker
DATABASE_URL=postgres://assetflow:assetflow@localhost:5432/assetflow

# Chạy chỉ Postgres bằng Docker, app bằng Node
docker compose up -d db
npm run dev

# App tại: http://localhost:4028
```

---

## Build Production Cục Bộ

```bash
npm run build    # Tạo .next/standalone
npm run start    # Chạy production server
```

---

## Kiểm Tra Kết Nối Database

```bash
# Kết nối psql vào container
docker compose exec db psql -U assetflow -d assetflow

# Kiểm tra từ host
psql "$DATABASE_URL" -c "\dt"

# Kiểm tra pool từ app
docker compose logs app | grep "idle pool client error"
```

---

## Bảo Mật Trước Production

- [ ] Đổi `POSTGRES_PASSWORD` thành password mạnh (không dùng `assetflow`)
- [ ] Không commit `.env.local` lên git (đã có trong `.gitignore`)
- [ ] `AWS_SECRET_ACCESS_KEY` chỉ trong biến môi trường, không trong code
- [ ] `ZIMBRA_ADMIN_PASSWORD` chỉ trong biến môi trường, không trong code
- [ ] Đặt `ZIMBRA_TLS_REJECT_UNAUTHORIZED=true` (mặc định) trên production
- [ ] Đặt `APP_URL` đúng domain production
- [ ] Cân nhắc đặt Postgres sau firewall, không expose port 5432 ra internet
- [ ] Cấu hình backup định kỳ (cron + pg_dump)
- [ ] HTTPS: đặt reverse proxy (nginx/Caddy) trước app port 4028

---

## Troubleshooting

### App không kết nối được database

```bash
# Kiểm tra db healthy chưa
docker compose ps

# Kiểm tra DATABASE_URL trong container app
docker compose exec app env | grep DATABASE_URL

# Kiểm tra có thể reach db từ app container
docker compose exec app nc -zv db 5432
```

### Lỗi "database does not exist"

```bash
# Tạo database thủ công
docker compose exec db createdb -U assetflow assetflow
```

### Schema không tự init

Init scripts chỉ chạy khi volume `db-data` **chưa tồn tại**. Nếu đã có volume:

```bash
# Xóa volume cũ (MẤT DỮ LIỆU) và khởi động lại
docker compose down -v
docker compose up -d
```

Hoặc chạy migration thủ công như mô tả ở phần "Khởi Tạo Schema Database".

### Email không gửi được

```bash
# Kiểm tra biến SES
docker compose exec app env | grep AWS

# Xem logs lỗi email
docker compose logs app | grep "email\|SES\|ses"
```

### Zimbra Admin không hoạt động

Các lỗi thường gặp khi kết nối Zimbra:

```bash
# Kiểm tra biến Zimbra được cấu hình chưa
docker compose exec app env | grep ZIMBRA

# Xem logs lỗi Zimbra
docker compose logs app | grep -i zimbra
```

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-----------|-----------|
| Connection refused | ZIMBRA_ADMIN_URL không đúng hoặc không thể reach | Kiểm tra URL format (`https://mail.example.com:7071/service/admin/soap`) và firewall |
| TLS errors (self-signed cert) | Chứng chỉ tự ký không tin cậy | Đặt `ZIMBRA_TLS_REJECT_UNAUTHORIZED=false` (dev/test only) hoặc thêm CA cert vào `ZIMBRA_CA_CERT` |
| 401 Unauthorized | ZIMBRA_ADMIN_USER/PASSWORD sai | Xác minh tài khoản admin Zimbra và mật khẩu |
| Timeout (6s) | Zimbra server down hoặc quá chậm | Kiểm tra Zimbra server, firewall blocking port 7071, hoặc network issues |
| Missing env vars | `ZIMBRA_ADMIN_URL` / `ZIMBRA_ADMIN_USER` / `ZIMBRA_ADMIN_PASSWORD` không được cấu hình | Thêm vào `.env.local` — endpoints `/api/zimbra/*` sẽ trả 500 nếu thiếu |

---

## Cấu Trúc Port Mặc Định

| Service | Port Host | Port Container |
|---------|-----------|---------------|
| App (Next.js) | `4028` | `4028` |
| Postgres | `5432` | `5432` |

Thay đổi qua biến `APP_PORT` và `POSTGRES_PORT` trong `.env.local`.

---

## Tài Liệu Liên Quan

- **Kiến Trúc Hệ Thống** → `docs/system-architecture.md`
- **Code Standards** → `docs/code-standards.md`
- **Project Overview** → `docs/project-overview-pdr.md`

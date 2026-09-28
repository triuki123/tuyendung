# Hướng dẫn deploy & migration (cho IT Manager)

Tài liệu này mô tả cách đưa nhánh `afterdeploy` lên **site đang chạy** mà **không mất
dữ liệu, không mất bảng, không mất kiểu dữ liệu**.

## Nguyên tắc an toàn

Hệ thống tự đồng bộ schema theo kiểu **chỉ THÊM, không bao giờ XÓA**:

- Mỗi lần container `app` khởi động, nó chạy `node scripts/migrate.mjs` trước
  (xem `Dockerfile`), áp file `docker/postgres/reconcile.sql`.
- `reconcile.sql` chỉ chứa `ADD COLUMN / CREATE TABLE / CREATE INDEX ... IF NOT EXISTS`
  → idempotent (chạy lại bao nhiêu lần cũng an toàn), không xóa cột, không drop bảng,
  không đổi kiểu dữ liệu đang có.
- Dữ liệu nằm trong Docker volume `db-data`. Build lại app **không** đụng tới volume.

## ⚠️ Tuyệt đối KHÔNG làm

```bash
docker compose down -v        # cờ -v XÓA volume => MẤT TOÀN BỘ DATABASE
```

Chỉ dùng `docker compose down` (không có `-v`) hoặc `docker compose up -d --build`.

## Quy trình deploy chuẩn

```bash
# 0. Vào thư mục dự án trên server
cd /path/to/FADOAssetFlowPro

# 1. BACKUP TRƯỚC TIÊN (luôn luôn, đây là lưới an toàn thật sự)
mkdir -p backups
docker exec assetflow-db pg_dump -U assetflow -d assetflow -Fc \
  -f /tmp/backup_$(date +%F_%H%M).dump
docker cp assetflow-db:/tmp/backup_$(date +%F_%H%M).dump ./backups/

# 2. Lấy code nhánh afterdeploy
git fetch origin
git checkout afterdeploy
git pull origin afterdeploy

# 3. Build lại & khởi động (volume DB giữ nguyên)
docker compose up -d --build

# 4. Kiểm tra log migrate
docker logs assetflow-app | grep migrate
#   Kỳ vọng: [migrate] reconcile.sql ap dung thanh cong.

# 5. Smoke test: mở web, đăng nhập, vào vài module chính.
```

## Rollback (nếu cần)

```bash
# Phục hồi DB từ bản backup ở bước 1
docker cp ./backups/backup_XXXX.dump assetflow-db:/tmp/restore.dump
docker exec assetflow-db pg_restore -U assetflow -d assetflow --clean /tmp/restore.dump

# Quay code về commit trước rồi build lại
git checkout <commit-cũ>
docker compose up -d --build
```

## Khi thêm thay đổi schema mới về sau

1. Viết câu lệnh **idempotent** (`ADD COLUMN/CREATE ... IF NOT EXISTS`).
2. Thêm vào `docker/postgres/reconcile.sql`.
3. (Tùy chọn) thêm bản đầy đủ vào `docker/postgres/init/01-schema.sql` cho DB dựng mới.
4. Lệnh phá hủy (`DROP`, `RENAME`, `ALTER ... TYPE`) **KHÔNG** bỏ vào reconcile —
   phải làm tay, có review và backup riêng.

## Phạm vi reconcile hiện tại

`reconcile.sql` lúc này đồng bộ:
- `audit_logs`: bù cột `admin_id`, `target_user_id`, `userId`, `performedBy`
  (các writer trong code cần, DB cũ thiếu → từng gây lỗi `column ... does not exist`).
- `org_tags` + `org_tag_assignments`: feature "Tags Tổ Chức".

> Ghi chú: DB hiện tại còn vài khác biệt schema CÓ SẴN TỪ TRƯỚC (không do nhánh này):
> `rooms.amenities` vs `description`, `password_reset_tokens.token_hash` vs `token/email`,
> `departments/sub_departments.head_id` vs `manager_id`. Đây là nợ kỹ thuật cần xử lý
> riêng có chủ đích — KHÔNG migrate tự động để tránh tạo cột lai và rủi ro dữ liệu.

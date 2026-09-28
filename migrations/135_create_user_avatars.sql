-- Migration 135: Lưu ảnh đại diện trong DB (BYTEA) thay vì file trên đĩa.
-- Lý do: container Docker/Coolify không có volume bền → file public/avatars bị xoá
-- mỗi lần redeploy + không theo được khi chuyển server. Lưu DB (như CV/ticket) để
-- bền vững, không phụ thuộc volume.
--
-- Bảng tách riêng (không nhét BYTEA vào users) để query user thường KHÔNG kéo blob.
-- user_id là TEXT (khớp users.id do app sinh), KHÔNG đặt FK để tránh lệch kiểu
-- TEXT/UUID giữa các bản DB (xem 087/reconcile).
CREATE TABLE IF NOT EXISTS user_avatars (
  user_id    TEXT PRIMARY KEY,
  content    BYTEA NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dọn avatar cũ trỏ file đĩa (/avatars/...): file đã mất khi chuyển server →
-- NULL để UI fallback chữ cái đầu thay vì hiện ảnh vỡ. User upload lại sẽ dùng
-- URL động /api/users/{id}/avatar.
UPDATE users SET avatar = NULL WHERE avatar LIKE '/avatars/%';

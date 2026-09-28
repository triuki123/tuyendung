-- Migration 064: Bảng quản lý máy chấm công
-- Lưu thông tin IP, port, tên máy, trạng thái

CREATE TABLE IF NOT EXISTS public.attendance_machines (
  id             TEXT PRIMARY KEY,                    -- machine_id (zkteco_ronald_jack, etc.)
  name           TEXT NOT NULL,                       -- tên máy (Ronald Jack A, Ronald Jack B)
  host           TEXT NOT NULL,                       -- IP address (115.79.205.119)
  port           INTEGER NOT NULL DEFAULT 1111,      -- port (1111)
  machine_type   TEXT NOT NULL DEFAULT 'zkteco',     -- loại máy (zkteco, hikvision, etc.)
  location       TEXT,                                -- địa điểm (Văn phòng A, Lầu 2, etc.)
  status         TEXT NOT NULL DEFAULT 'active',     -- active, inactive, error
  last_sync      TIMESTAMP WITH TIME ZONE,           -- lần polling cuối
  last_error     TEXT,                               -- lỗi cuối cùng nếu có
  polling_enabled BOOLEAN DEFAULT true,              -- có polling hay không
  notes          TEXT,                               -- ghi chú
  created_by     UUID,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_status ON public.attendance_machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_host_port ON public.attendance_machines(host, port);

-- Update machine_mappings để reference machines table
ALTER TABLE public.attendance_machine_mappings
ADD CONSTRAINT fk_machine_mappings_machine_id
FOREIGN KEY (machine_id) REFERENCES public.attendance_machines(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

SELECT 'Migration 064: attendance_machines table created' AS migration_status;

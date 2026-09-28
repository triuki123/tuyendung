-- Migration 264: Tích hợp Chấm công/Task chuyển từ cấp CÔNG TY sang cấp BỘ CHỈ TIÊU MẪU.
-- Mỗi bộ chỉ tiêu (kpi_templates) tự quyết định có tính Chấm công/Task vào KPI không —
-- đúng bản chất "mỗi công ty 1 quy tắc riêng" nhưng còn chia nhỏ tới từng bộ chỉ tiêu,
-- vì 1 công ty có thể có nhiều bộ chỉ tiêu khác nhau theo chức danh/phòng ban.
ALTER TABLE public.kpi_templates
  ADD COLUMN IF NOT EXISTS integration_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Bảng tích hợp cấp công ty (kpi_integration_sources) chưa có dữ liệu thật nào — an toàn xóa.
DROP TABLE IF EXISTS public.kpi_integration_sources;

-- Migration 268: trọng số của từng kỳ tháng trong kỳ tổng hợp (quý/6 tháng/năm).
-- weight = phần trăm đóng góp của kỳ tháng vào điểm THAM KHẢO có trọng số của kỳ tổng hợp.
-- NULL = chưa đặt → coi như CHIA ĐỀU (giữ nguyên hành vi trung bình cộng cũ khi chưa cấu hình).
ALTER TABLE public.kpi_cycle_rollups
  ADD COLUMN IF NOT EXISTS weight NUMERIC(6,2);

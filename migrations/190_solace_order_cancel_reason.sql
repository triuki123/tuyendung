-- Migration 190: Lý do huỷ đơn Solace (nhân viên bắt buộc nhập khi huỷ qua bot).
ALTER TABLE public.solace_orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

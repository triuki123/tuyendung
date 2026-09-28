-- Migration 307: "Trích trừ BHXH" chuyển từ SỐ TIỀN (đ) sang TỶ LỆ %
--
-- Bối cảnh: migration 121 định nghĩa cột là số tiền đồng (auto = 10.5% mức đóng),
-- migration 123 đã đổi kiểu sang NUMERIC(12,2) nhưng phần còn lại của hệ thống vẫn
-- hiểu là tiền. Nay chốt: cột lưu TỶ LỆ PHẦN TRĂM, cho số lẻ (vd 10.5, 20.5).
--
-- Quy đổi dữ liệu cũ (idempotent, chỉ đụng bản ghi rõ ràng là SỐ TIỀN):
--  - Giá trị > 100 KHÔNG thể là % hợp lệ → chắc chắn là số tiền cũ.
--      + Có mức đóng > 0  → quy ra tỷ lệ = tiền / mức đóng * 100 (làm tròn 2 số lẻ).
--      + Không có mức đóng → không suy ra được → để NULL (an toàn hơn là giữ "596610%").
--  - Giá trị <= 100 giữ nguyên: đã là tỷ lệ, hoặc số tiền quá nhỏ để có nghĩa.

ALTER TABLE users
  ALTER COLUMN social_insurance_deduction TYPE NUMERIC(12,2);

UPDATE users
   SET social_insurance_deduction =
         ROUND((social_insurance_deduction / social_insurance_base * 100)::numeric, 2)
 WHERE social_insurance_deduction > 100
   AND COALESCE(social_insurance_base, 0) > 0;

UPDATE users
   SET social_insurance_deduction = NULL
 WHERE social_insurance_deduction > 100
   AND COALESCE(social_insurance_base, 0) = 0;

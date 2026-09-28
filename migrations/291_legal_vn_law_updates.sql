-- Migration 291: cập nhật dữ liệu seed Pháp Chế theo luật VN hiện hành (rà 07/2026)
--
-- 4 thay đổi pháp luật 2025-2026 ảnh hưởng seed của mig 290:
-- 1. NQ 198/2025/QH15: BÃI BỎ lệ phí môn bài từ 01/01/2026 → tắt mục nhắc (không xóa,
--    giữ lịch sử các kỳ đã nộp những năm trước nếu có).
-- 2. Sắp xếp bộ máy 01/07/2025: Sở LĐ-TB&XH sáp nhập vào Sở Nội vụ → đổi nơi nộp
--    báo cáo lao động Mẫu 01/PLI.
-- 3. Luật BHXH 2024 (41/2024/QH15, hiệu lực 01/07/2025), Điều 34: hạn đóng BHXH
--    hằng tháng = ngày CUỐI CÙNG CỦA THÁNG TIẾP THEO (nới 1 tháng so với luật cũ).
-- 4. Luật PCCC&CNCH 55/2024 + NĐ 105/2025 (thay NĐ 136/2020 từ 01/07/2025):
--    làm rõ 2 loại giấy PCCC — chứng nhận huấn luyện (5 năm) ≠ thẩm duyệt thiết kế
--    (không có thời hạn cố định).
--
-- Toàn bộ là UPDATE/INSERT dữ liệu — admin đã sửa tay qua UI thì WHERE theo id
-- vẫn an toàn (chỉ đụng đúng bản ghi seed gốc).

-- 1. Môn bài: tắt + ghi rõ căn cứ (admin thấy lý do trong UI thay vì biến mất khó hiểu)
UPDATE legal_compliance_items
   SET active = FALSE,
       note = 'ĐÃ BÃI BỎ từ 01/01/2026 theo Nghị quyết 198/2025/QH15 — không còn phải kê khai/nộp. Giữ lại để tra cứu lịch sử.'
 WHERE id = 'lci_monbai';

-- 2. Báo cáo lao động: nơi nộp mới là Sở Nội vụ (qua Cổng DVC Quốc gia)
UPDATE legal_compliance_items
   SET agency = 'Sở Nội vụ (qua Cổng DVC Quốc gia)',
       note = 'NĐ 145/2020/NĐ-CP — trước 05/06. Từ 01/07/2025 Sở LĐ-TB&XH sáp nhập vào Sở Nội vụ; đồng thời thông báo cơ quan BHXH khu vực.'
 WHERE id = 'lci_laodong_6t';

UPDATE legal_compliance_items
   SET agency = 'Sở Nội vụ (qua Cổng DVC Quốc gia)',
       note = 'NĐ 145/2020/NĐ-CP — trước 05/12. Từ 01/07/2025 Sở LĐ-TB&XH sáp nhập vào Sở Nội vụ; đồng thời thông báo cơ quan BHXH khu vực.'
 WHERE id = 'lci_laodong_nam';

-- 3. BHXH: hạn = cuối tháng TIẾP THEO (Luật BHXH 2024). due_day=31 tự co về ngày
--    cuối tháng; kỳ nhắc mỗi cuối tháng = hạn chót đóng cho tháng liền trước.
UPDATE legal_compliance_items
   SET name = 'Đóng BHXH/BHYT/BHTN (cho tháng liền trước)',
       due_day = 31,
       note = 'Luật BHXH 2024, Điều 34 (hiệu lực 01/07/2025): đóng hằng tháng chậm nhất ngày CUỐI CÙNG của tháng tiếp theo. Nhắc cuối mỗi tháng = hạn chót của kỳ tháng trước.'
 WHERE id = 'lci_bhxh';

-- 4. PCCC: đổi tên loại seed cho đúng bản chất (chứng nhận huấn luyện mới có hạn 5 năm)
UPDATE legal_document_types
   SET name = 'Chứng nhận huấn luyện nghiệp vụ PCCC & CNCH'
 WHERE id = 'ldt_pccc' AND name = 'Giấy chứng nhận PCCC';

-- ...và thêm loại thẩm duyệt thiết kế (không có thời hạn cố định) nếu chưa có
INSERT INTO legal_document_types (id, name, group_key, default_validity_months, sort)
SELECT 'ldt_pccc_thamduyet', 'GCN thẩm duyệt thiết kế về PCCC (NĐ 105/2025)', 'giay_phep_con', NULL, 15
 WHERE NOT EXISTS (SELECT 1 FROM legal_document_types WHERE id = 'ldt_pccc_thamduyet');

-- 5. NGHĨA VỤ MỚI — Luật 76/2025/QH15 (hiệu lực 01/07/2025): kê khai CHỦ SỞ HỮU
--    HƯỞNG LỢI với cơ quan ĐKKD (NĐ 168/2025 + TT 68/2025). DN thành lập trước
--    01/07/2025 phải bổ sung khi làm thủ tục thay đổi ĐKKD gần nhất.
INSERT INTO legal_document_types (id, name, group_key, default_validity_months, sort)
SELECT 'ldt_cshhl', 'Danh sách chủ sở hữu hưởng lợi (Luật 76/2025)', 'dang_ky_dn', NULL, 5
 WHERE NOT EXISTS (SELECT 1 FROM legal_document_types WHERE id = 'ldt_cshhl');

INSERT INTO legal_compliance_items (id, company_id, name, agency, frequency, due_month, due_day, note)
SELECT 'lci_cshhl', NULL,
       'Kê khai / cập nhật chủ sở hữu hưởng lợi (CSHHL)',
       'Cơ quan đăng ký kinh doanh',
       'once', NULL, NULL,
       'Luật 76/2025/QH15 + NĐ 168/2025 (hiệu lực 01/07/2025). DN thành lập trước 01/07/2025: bổ sung khi làm thủ tục thay đổi ĐKKD gần nhất; sau đó cập nhật mỗi khi CSHHL thay đổi. Đánh dấu hoàn thành theo từng công ty.'
 WHERE NOT EXISTS (SELECT 1 FROM legal_compliance_items WHERE id = 'lci_cshhl');

-- 6. GPLĐ người nước ngoài: NĐ 219/2025 (07/08/2025) thay NĐ 152/2020 — thời hạn
--    tối đa vẫn 24 tháng (seed đúng) nhưng nay CHỈ GIA HẠN ĐƯỢC 1 LẦN → làm rõ tên.
UPDATE legal_document_types
   SET name = 'Giấy phép lao động người nước ngoài (NĐ 219/2025 — gia hạn tối đa 1 lần)'
 WHERE id = 'ldt_gpld_nn' AND name = 'Giấy phép lao động người nước ngoài';

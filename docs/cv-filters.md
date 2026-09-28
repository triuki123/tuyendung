# Bộ lọc Kho CV

Sheet bên phải chỉ chỉnh bản nháp. **Áp dụng** gửi tiêu chí đến `POST /api/hr/cv/search`,
giữ từ khóa và tab trạng thái đang chọn. **Xóa lọc** không đổi tab trạng thái.

Ô khoảng thời gian nằm ngay dưới radio đang chọn, giữ khoảng thời gian khi đổi loại thời gian.
Mỗi tiêu chí nâng cao mở một vùng chọn ngay dưới hàng chứa mục đó; mở mục khác chỉ đóng vùng chọn,
không xóa giá trị đã nhập. Tiêu chí vẫn chỉ gửi API khi bấm **Áp dụng**.

| Tiêu chí | Dữ liệu / cách lọc |
| --- | --- |
| Ngành nghề | `industry`; `""` là Chưa phân loại, bỏ trường là tất cả ngành |
| Thời gian cập nhật CV | `updated_at`, `sortBy: "updated"` |
| Thời gian tải CV lên | `created_at` (API trả thêm `uploaded_at`), `sortBy: "uploaded"`; không đổi khi sửa, xem hay ghi chú |
| Khoảng thời gian | `updatedWithinDays`, áp dụng cho loại thời gian đã chọn: tất cả, 1 ngày, 1 tuần, 1 tháng (30 ngày), 2 tháng (60 ngày) |
| Kinh nghiệm | `years_experience`, `minExperience` / `maxExperience` |
| Hình thức làm việc | `employment_type`, `employmentTypes[]` |
| Giới tính | `gender` |
| Ngôn ngữ | `languages[]`; khớp một trong các ngôn ngữ đã chọn |
| Mức lương | `expected_salary` theo VNĐ/tháng, `minSalary` / `maxSalary` |
| Giới hạn tuổi | tuổi hoàn chỉnh tính từ `date_of_birth`, `minAge` / `maxAge` |
| Bằng cấp | `education_degree`, `educationLevels[]`: Chưa tốt nghiệp THPT, Tốt nghiệp THPT, Chứng chỉ nghề, Trung cấp, Cao đẳng, Đại học, Sau đại học |
| Trạng thái tìm việc | `job_search_status`, `jobSearchStatuses[]` |
| Hồ sơ chưa xem | `onlyUnviewed`, không có bản ghi trong `hr_cv_views` cho TA đăng nhập |
| Tiêu chí khác | kỹ năng (cần có tất cả), đánh giá tối thiểu, yêu cầu tuyển dụng liên kết |

`GET /api/hr/cv/filter-options` lấy ngành, kỹ năng, ngôn ngữ thực tế từ Kho CV và trả 7 bằng cấp chuẩn,
không lấy nội dung/tệp CV nặng. Trường `education_level` vẫn giữ nguyên trường học/nội dung học vấn;
`education_degree` lưu riêng bằng cấp để không ghi đè dữ liệu cũ. Chỉ đồng bộ trình độ cũ khi có bằng cấp rõ ràng,
không suy đoán từ tên trường. Preset cũ `sortBy: "activity"` được chuyển thành `"uploaded"`.
Tiêu chí khác nhau kết hợp bằng AND;
nhiều hình thức làm việc, bằng cấp hay trạng thái tìm việc kết hợp bằng OR trong cùng tiêu chí.
Thông tin chưa có được giữ NULL và không khớp tiêu chí cụ thể; không đoán tuổi/giới tính từ tên hoặc ảnh.

`POST /api/hr/cv/:id/view` được gọi khi TA mở hồ sơ (bao gồm chuyển hồ sơ tiếp theo).
Lịch sử xem bắt đầu từ khi tính năng này được triển khai, độc lập theo TA. API lấy TA
từ phiên đã xác thực qua middleware, không nhận danh tính người xem trong body bộ lọc.

**Bằng cấp** dùng cùng 7 lựa chọn ở bộ lọc, thêm CV và chi tiết CV; ngày tải lên hiển thị cùng `uploaded_at` ở danh sách và chi tiết.
Các thông tin khác có thể nhập trong **Thông tin bổ sung cho bộ lọc** ở thêm CV và chi tiết CV.
Lưu bộ lọc là preset trên trình duyệt hiện tại, tách theo TA; không tự áp dụng preset khi mở trang.

## CV hiển thị trực tiếp

Mở hồ sơ tự hiển thị tệp CV gốc, không cần bấm **Xem**. Máy tính đặt CV bên trái và thông tin
ứng viên bên phải, cuộn độc lập; điện thoại xếp CV phía trên thông tin. Tệp đính kèm được lấy
từ API đã xác thực `GET /api/hr/cv/:id`, chỉ cho ứng viên đang mở, không tải tệp ở danh sách.
Chuyển/đóng hồ sơ hủy request cũ và thu hồi blob URL. PDF dùng trình xem có sẵn của trình duyệt;
ảnh và văn bản hiển thị trực tiếp, DOCX chuyển nội dung với thư viện tải theo nhu cầu rồi hiển thị
trong iframe sandbox/CSP (không chạy script hoặc tải tài nguyên ngoài). Định dạng chưa hỗ trợ
cho phép tải về; tải lỗi có nút thử lại. Hồ sơ đã liên kết một yêu cầu tuyển dụng không tự mở
thêm drawer che CV; mở hồ sơ theo vị trí vẫn là thao tác riêng.

## Cơ sở dữ liệu và kiểm tra

Áp dụng migration `322_cv_filter_criteria.sql` và `323_cv_education_degree.sql` trong quy trình triển khai, trước khi chạy phiên bản mới.
Đối với DB localhost hiện tại:

```powershell
node scripts/migrate-cv-filters.mjs
npm.cmd run type-check
node scripts/verify-cv-filter-sql.mjs
node scripts/verify-cv-filter-ui.mjs
node scripts/verify-cv-status-tabs.mjs
node scripts/verify-cv-preview.mjs
```

Kiểm tra SQL sử dụng service thực tế trong một transaction được ROLLBACK: không lưu CV/view/note thử nghiệm.
Kiểm tra UI/API dùng dữ liệu thật theo chế độ chỉ đọc; kiểm tra trạng thái dùng fixture chặn ở trình duyệt.

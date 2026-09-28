# Nguồn Nhân Lực

Module **Nguồn Nhân Lực** tập hợp toàn bộ nghiệp vụ tuyển dụng và vòng đời nhân sự: từ dự báo nhu cầu, tuyển dụng, tiếp nhận nhân sự mới (onboarding) đến khi nghỉ việc (offboarding).

::: info Tóm tắt nhanh
- **Đường dẫn:** `/nguon-nhan-luc` (menu **Nguồn Nhân Lực**).
- **Ai dùng được:** Super Admin, Admin; các vai trò khác cần quyền tương ứng. Mỗi phân hệ con ẩn/hiện theo quyền (kế thừa từ module cha).
- **7 phân hệ:** Tình hình tuyển dụng · Biến động nhân sự · Yêu cầu tuyển dụng · Onboarding · Offboarding · Kho ứng viên · Kho mô tả công việc.
:::

## Giao diện chính

![Trang Nguồn nhân lực](/screenshots/nguon-nhan-luc/tong-quan.png)

Trang chủ module là lưới các thẻ điều hướng. Thẻ chỉ hiện nếu tài khoản có quyền xem phân hệ tương ứng; một số thẻ kèm badge đếm số mục đang chờ xử lý.

| Phân hệ | Đường dẫn | Dùng để |
|---------|-----------|---------|
| **Tình Hình Tuyển Dụng** | `/nguon-nhan-luc/tinh-hinh-tuyen-dung` | Dashboard biểu đồ: phễu tuyển dụng, xu hướng, cơ cấu lao động, nguồn ứng viên. |
| **Biến Động Nhân Sự** | `/nguon-nhan-luc/bien-dong-nhan-su` | Báo cáo vào/ra/ròng, tỷ lệ nghỉ việc, báo cáo tăng giảm theo mốc ngày 15. |
| **Yêu Cầu Tuyển Dụng** | `/nguon-nhan-luc/yeu-cau-tuyen-dung` | Quản lý nhu cầu tuyển: số lượng, người phụ trách, tiến độ, duyệt yêu cầu. |
| **Onboarding** | `/nguon-nhan-luc/onboarding` | Tiếp nhận nhân sự mới: cấu hình biểu mẫu, chuẩn hóa thông tin, gửi duyệt tạo tài khoản. |
| **Offboarding** | `/nguon-nhan-luc/offboarding` | Quy trình nghỉ việc: checklist bàn giao, thu hồi tài sản, vô hiệu hóa tài khoản. |
| **Kho Ứng Viên (ATS)** | `/nguon-nhan-luc/kho-ung-vien` | Lưu CV, theo dõi pipeline tuyển dụng từ sàng lọc đến nhận việc. |
| **Kho Mô Tả Công Việc (JD)** | `/nguon-nhan-luc/kho-mo-ta-cong-viec` | Quản lý bản mô tả công việc cho từng vị trí, dùng lại khi đăng tuyển. |

---

## Tình Hình Tuyển Dụng Nhân Sự

Dashboard dạng biểu đồ dành cho lãnh đạo và phòng nhân sự: phễu tuyển dụng (mời → nộp → xác nhận → duyệt), xu hướng theo thời gian, cơ cấu lao động và nguồn ứng viên. Đây là trang **chỉ xem**, dữ liệu được tổng hợp tự động từ các phân hệ khác.

## Tình Hình Biến Động Nhân Sự

Báo cáo dành riêng cho phòng Nhân Sự: số nhân sự **vào / ra / ròng**, tỷ lệ nghỉ việc và cơ cấu lao động. Hỗ trợ **báo cáo tăng giảm theo mốc ngày 15** (vào trước ngày 15 / ra sau ngày 15) phục vụ nghiệp vụ BHXH. Báo cáo có thể xuất ra tệp.

## Yêu Cầu Tuyển Dụng

Quản lý nhu cầu tuyển theo quy trình duyệt.

**Thao tác chính:**

1. Nhấn **Thêm yêu cầu**, điền vị trí, số lượng cần tuyển, mức lương, độ ưu tiên, hạn đóng, đính kèm JD.
2. Yêu cầu mới ở trạng thái **Chờ duyệt** → người có quyền duyệt **Chấp nhận** / **Từ chối**.
3. Sau khi duyệt, yêu cầu chuyển sang **Đang mở** và bắt đầu nhận ứng viên; có thể **Tạm dừng**, đánh dấu **Đã tuyển đủ** hoặc **Hủy**.

::: tip Trạng thái yêu cầu
Chờ duyệt · Chờ xử lý · Đang mở · Tạm dừng · Đã tuyển đủ · Đã hủy · Từ chối. Có thể lọc theo phạm vi **Đang xử lý / Đã đóng / Tất cả**, nhân bản yêu cầu và trao đổi qua bình luận.
:::

## Onboarding (tiếp nhận nhân sự mới)

Phân hệ này quản lý nhân sự mới điền **Biểu mẫu thông tin nhận việc** công khai (xem chi tiết tại [Biểu mẫu](/chuc-nang/bieu-mau)).

- **Tab Danh sách:** xem các bản khai nhân sự mới, lọc theo trạng thái, công ty, khoảng ngày nhận việc; xuất báo cáo PDF.
- **Tab Cấu hình biểu mẫu:** bật/tắt và đặt bắt buộc cho từng trường thông tin, cấu hình loại giấy tờ cần nộp.

**Luồng trạng thái:** Chờ điền → Đã nộp → Đã xác nhận → **Chờ QTV duyệt** → Đã duyệt (tạo tài khoản) / Từ chối.

::: info Mở chi tiết để xử lý
Nhấn vào một bản khai để xem chi tiết, kiểm tra thông tin, xác nhận và **gửi quản trị viên duyệt tạo tài khoản** cho nhân sự mới.
:::

## Offboarding (nghỉ việc)

Quản lý quy trình nghỉ việc theo checklist.

1. Nhấn **Tạo quy trình**, chọn nhân viên nghỉ, lý do và ngày nghỉ.
2. Hệ thống tạo **checklist bàn giao**: thu hồi tài sản, vô hiệu hóa tài khoản, các bước bàn giao khác.
3. Theo dõi tiến độ qua trạng thái **Đang xử lý / Hoàn tất / Đã hủy**.

Tab **Cấu hình checklist** cho phép tùy biến danh mục công việc bàn giao mặc định.

## Kho Ứng Viên (ATS)

Lưu trữ và theo dõi ứng viên theo pipeline tuyển dụng dạng **Kanban** hoặc **lưới thẻ**.

- Thêm ứng viên (CV, kỹ năng, kinh nghiệm, đánh giá sao), gắn vào một yêu cầu tuyển dụng.
- Kéo-thả ứng viên qua các **giai đoạn** của pipeline (sàng lọc → phỏng vấn → … → nhận việc).
- Bộ lọc nâng cao theo từ khóa, kỹ năng, kinh nghiệm tối thiểu, số sao, yêu cầu tuyển dụng.

::: warning Cần quyền chỉnh sửa
Thêm/sửa ứng viên cần quyền `Thêm`/`Sửa` trên phân hệ Kho Ứng Viên. Super Admin/Admin có sẵn quyền này.
:::

## Kho Mô Tả Công Việc (JD)

Quản lý ngân hàng bản mô tả công việc theo vị trí. JD được dùng lại khi tạo yêu cầu tuyển dụng và khi đăng tuyển, giúp chuẩn hóa nội dung tuyển dụng giữa các đợt.

## Câu hỏi thường gặp

**Quản lý đặt yêu cầu tuyển dụng thế nào?**
Quản lý đặt yêu cầu cho phòng ban; yêu cầu đi qua **duyệt phân cấp** trước khi mở tuyển. Xem [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau).

**Tải CV lên có tự đọc thông tin ứng viên không?**
Có — hệ thống trích xuất nội dung từ file PDF/Word để tìm kiếm, sàng lọc. Vẫn nên kiểm tra lại thông tin quan trọng.

**Ứng viên trúng tuyển chuyển thành nhân viên ra sao?**
Qua quy trình **onboarding**: gửi biểu mẫu nhận việc để tạo hồ sơ và tài khoản. Xem [Biểu mẫu](/chuc-nang/bieu-mau).

## Bước tiếp theo
- Tiếp nhận nhân sự mới qua [Quản Lý Hồ Sơ (Nhân sự)](/chuc-nang/nhan-su).
- Chuẩn hóa nội dung tuyển bằng Kho JD ở trên.

---

*Liên quan:* [Quản Lý Hồ Sơ](/chuc-nang/nhan-su) · [Biểu mẫu](/chuc-nang/bieu-mau) · [Người dùng](/quan-tri/nguoi-dung) · [Lịch sử](/chuc-nang/lich-su)

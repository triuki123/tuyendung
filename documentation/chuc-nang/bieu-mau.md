# Biểu Mẫu

Module **Biểu Mẫu** cho phép tạo biểu mẫu nội bộ kiểu Google Forms, chia sẻ qua **link công khai** (không cần đăng nhập) và thu thập phản hồi. Bên cạnh đó, hệ thống còn có **biểu mẫu thông tin nhận việc** chuyên dụng cho nhân sự mới (onboarding).

::: info Tóm tắt nhanh
- **Đường dẫn:** `/bieu-mau` (kho biểu mẫu) · `/bieu-mau/{id}` (cấu hình một biểu mẫu).
- **Link công khai biểu mẫu thường:** `/forms/{token}` — ai có link đều điền được, không cần tài khoản.
- **Biểu mẫu nhận việc (onboarding):** `/onboarding/thong-tin-nhan-su-dau-vao` — link cố định, công khai.
:::

## Kho biểu mẫu

![Trang Biểu mẫu](/screenshots/bieu-mau/tong-quan.png)

Mỗi thẻ biểu mẫu cho biết trạng thái, số phản hồi đã thu, số trường, kèm hai nút **Quản lý** và **Copy link công khai**.

### Tạo biểu mẫu mới

1. Nhấn **Tạo Biểu Mẫu**.
2. Nhập **Tiêu đề** (bắt buộc) và mô tả (tùy chọn).
3. Nhấn **Tạo & Cấu Hình** — biểu mẫu mới có sẵn trường *Họ và Tên*; bạn thêm các trường khác ở trang quản lý.

## Cấu hình một biểu mẫu

Tại trang `/bieu-mau/{id}` có hai tab:

- **Trường (Fields):** thêm trường mới, chọn kiểu dữ liệu, **bật/tắt** trường và đặt **bắt buộc**. Lưu các thay đổi đang chỉnh.
- **Phản hồi (Responses):** xem danh sách phản hồi đã thu thập, tải xuống.

Ngoài ra có thể: đổi tiêu đề/mô tả, chuyển trạng thái (Nháp/Đang mở/Đã đóng), bật/tắt **Nội Bộ**, **copy link công khai** và **xóa** biểu mẫu.

::: tip Chia sẻ biểu mẫu
Nhấn **Copy link** rồi gửi đường dẫn `/forms/{token}` cho người cần điền. Khi biểu mẫu ở trạng thái **Đã đóng**, link sẽ không nhận phản hồi mới.
:::

### Công Khai và Nội Bộ

Mỗi biểu mẫu có nhãn cho biết phạm vi truy cập, đổi bằng ô tích **Nội Bộ** ở trang quản lý:

- 🌐 **Công Khai** (mặc định) — ai có link đều điền được, **không cần đăng nhập**. Dùng cho khảo sát, đăng ký, tuyển dụng…
- 🔒 **Nội Bộ** — chỉ tài khoản **đã đăng nhập** mới mở/điền được. Người chưa đăng nhập mở link sẽ được đưa về trang đăng nhập, đăng nhập xong tự quay lại đúng biểu mẫu.

### Người điền biểu mẫu (công khai)

Người nhận link mở `/forms/{token}` mà **không cần đăng nhập**, điền các trường rồi gửi. Phản hồi được lưu về tab **Phản hồi** của biểu mẫu.

---

## Biểu mẫu thông tin nhận việc (Onboarding)

Đây là biểu mẫu công khai cố định để **nhân sự mới tự điền thông tin nhận việc** trước khi được tạo tài khoản.

### Cấu hình biểu mẫu

Cấu hình tại phân hệ [Onboarding](/chuc-nang/nguon-nhan-luc) → tab **Cấu hình biểu mẫu**:

- Bật/tắt và đặt **bắt buộc** cho từng trường thông tin (chia theo nhóm: thông tin cá nhân, công việc…).
- Cấu hình **loại giấy tờ** cần nộp (bắt buộc / cho phép nhiều tệp).

### Nhân sự mới điền form

1. Gửi link cố định `/onboarding/thong-tin-nhan-su-dau-vao` cho nhân sự mới.
2. Nhân sự điền thông tin, đính kèm giấy tờ (mỗi tệp tối đa **10MB**) và gửi — tất cả trong một lần nộp, không cần đăng nhập.
3. Nếu biểu mẫu đang đóng, trang hiển thị thông báo tạm khóa.

![Biểu mẫu thông tin nhận việc (liên kết công khai)](/screenshots/bieu-mau/form-cong-khai.png)

### Luồng duyệt tạo tài khoản

Sau khi nhân sự nộp, phòng nhân sự xử lý tại phân hệ Onboarding theo luồng:

> Chờ điền → **Đã nộp** → **Đã xác nhận** → **Chờ QTV duyệt** → **Đã duyệt** (tạo tài khoản) / **Từ chối**

Quản trị viên duyệt sẽ tạo tài khoản người dùng cho nhân sự mới từ chính dữ liệu đã khai.

::: warning Phân biệt hai loại biểu mẫu
**Biểu mẫu thường** (`/forms/{token}`) dùng để thu thập phản hồi bất kỳ. **Biểu mẫu nhận việc** (`/onboarding/...`) gắn với quy trình onboarding và tạo tài khoản nhân sự — đừng nhầm lẫn.
:::

## Câu hỏi thường gặp

**Người nhận biểu mẫu có cần đăng nhập không?**
Không. Biểu mẫu mở qua liên kết (token) công khai nên người ngoài hệ thống vẫn điền được.

**Điền biểu mẫu nhận việc xong có tự thành nhân viên ngay không?**
Chưa. Dữ liệu phải qua bước **Quản trị viên duyệt** mới tạo tài khoản — tránh tạo nhầm.

**Sửa biểu mẫu sau khi đã gửi đi được không?**
Nên tạo bản mới hoặc thu hồi liên kết cũ; dữ liệu đã nộp vẫn được giữ để tra cứu.

## Bước tiếp theo
- Duyệt hồ sơ nhận việc và tạo tài khoản → [Người dùng](/quan-tri/nguoi-dung).
- Liên kết với tuyển dụng → [Nguồn Nhân Lực](/chuc-nang/nguon-nhan-luc).

---

*Liên quan:* [Nguồn Nhân Lực](/chuc-nang/nguon-nhan-luc) · [Người dùng](/quan-tri/nguoi-dung) · [Quản Lý Hồ Sơ](/chuc-nang/nhan-su)

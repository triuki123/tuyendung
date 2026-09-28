# Người dùng & phân quyền

Module **Người Dùng** giúp quản trị viên tạo, sửa, gán vai trò và **phân quyền chi tiết theo module** cho từng tài khoản.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/users` (nhóm *Quản Trị*).
- **Ai dùng được:** Super Admin, Admin. Quản lý chỉ `Xem`.
- **Phân quyền 2 tầng:** vai trò quyết định mặc định + tinh chỉnh chi tiết cho từng người.
:::

## Giao diện danh sách

![Trang Quản lý Người dùng](/screenshots/quan-tri/nguoi-dung.png)

## Tạo / sửa người dùng

Nhấn **Thêm người dùng** (hoặc bấm vào một người để sửa). Cửa sổ chia thành **5 tab**:

| Tab | Nội dung |
|-----|----------|
| **📝 Thông Tin** | Họ tên, email, số điện thoại, vai trò, công ty, phòng ban, bộ phận, chức vụ, quản lý trực tiếp, thẻ tags, trạng thái. Khi *tạo mới* có thêm trường mật khẩu. |
| **🗂️ Hồ Sơ Nhân Sự** | Thông tin cá nhân, mã nhân viên, ngày vào làm, ngân hàng, liên hệ khẩn cấp... |
| **💰 Chế Độ & Đãi Ngộ** | Phụ cấp ăn ca/gửi xe/đi lại, bảo hiểm xã hội, đơn vị trả lương. |
| **🔐 Phân Quyền** | Ma trận quyền chi tiết theo module (xem bên dưới). |
| **🔑 Đổi Mật Khẩu** | Đặt lại mật khẩu cho người dùng (chỉ khi sửa). |

### Các bước tạo nhanh
1. Mở tab **Thông Tin**, nhập **Họ tên** và **Email** (bắt buộc).
2. Chọn **Vai trò** — hệ thống tự gán bộ quyền mặc định tương ứng.
3. Chọn **Công ty → Phòng ban → Bộ phận → Chức vụ** (lọc theo nhau).
4. Đặt **Mật khẩu** (≥ 8 ký tự, có chữ và số).
5. (Tuỳ chọn) Mở tab **Phân Quyền** để tinh chỉnh.
6. Nhấn **Lưu**.

::: tip Vai trò Super Admin
Chỉ Super Admin mới gán được vai trò **Super Admin** cho người khác.
:::

## Phân quyền chi tiết (tab 🔐 Phân Quyền)

Tab này hiển thị **ma trận module × hành động**. Mỗi ô bật/tắt một quyền cho từng module (và module con thụt cấp). 7 hành động: **Xem, Thêm, Sửa, Xóa, Duyệt, Xuất, Nhận thông báo**.

Công cụ hỗ trợ:

- **Quyền mẫu (preset):** áp dụng nhanh bộ quyền có sẵn (Toàn quyền, Quản trị, Quản lý, Nhân viên) hoặc mẫu tùy chỉnh. Có thể **Lưu mẫu** từ lựa chọn hiện tại, **Sửa/Xóa** mẫu, hoặc **Khôi phục mẫu gốc**.
- **Sao chép từ người khác:** sao toàn bộ quyền của một người dùng đã có.
- **Bật/tắt theo cột:** bấm tên hành động ở đầu cột để bật/tắt cho mọi module.
- **Xóa hết:** bỏ toàn bộ quyền.

<!-- SCREENSHOT: /users — tab Phân Quyền, ma trận module × hành động -->
::: info 📸 Ảnh minh họa
Ma trận phân quyền chi tiết với các nút quyền mẫu. *(Ảnh sẽ được bổ sung.)*
:::

::: warning Kế thừa quyền module con
Module con (ví dụ các phân hệ trong Quản lý Tài sản, Chấm công) **kế thừa quyền module mẹ** nếu chưa cấu hình riêng — tránh khóa nhầm người dùng cũ khi hệ thống thêm phân hệ mới.
:::

## Đổi mật khẩu & trạng thái

- **Đổi mật khẩu:** tab **🔑 Đổi Mật Khẩu** — nhập mật khẩu mới (≥ 8 ký tự, có chữ và số) rồi lưu.
- **Trạng thái:** trường *Trạng thái* ở tab Thông Tin — `Đang hoạt động` / `Không hoạt động`. Tài khoản không hoạt động không đăng nhập được.

---

*Liên quan:* [Phân quyền & vai trò](/bat-dau/phan-quyen) · [Cơ cấu tổ chức](/quan-tri/co-cau-to-chuc)

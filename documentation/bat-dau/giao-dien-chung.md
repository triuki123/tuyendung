# Giao diện chung

Sau khi đăng nhập, mọi trang trong FADO AssetFlow đều dùng chung một bố cục: **thanh điều hướng** (sidebar) bên trái và **thanh trên cùng** (topbar). Hiểu bố cục này giúp bạn di chuyển nhanh giữa các chức năng.

::: info Tóm tắt nhanh
- **Bố cục:** Sidebar (trái) + Topbar (trên) + vùng nội dung chính.
- **Sidebar:** 4 nhóm menu — Tổng Quan · Công Việc · Nhân Sự · Hệ Thống.
- **Topbar:** tìm kiếm · chuông thông báo · quét QR · menu người dùng.
- **Menu hiển thị theo quyền:** mỗi người chỉ thấy các mục mình được phép truy cập.
:::

## Thanh điều hướng (Sidebar)

![Giao diện chung — sidebar và topbar](/screenshots/bat-dau/giao-dien-chung.png)

Sidebar được cố định bên trái, gồm từ trên xuống:

1. **Logo** — nhấn để quay về Dashboard.
2. **Các nhóm menu** chia làm 4 phần:

| Nhóm | Các mục |
|------|--------------------|
| **TỔNG QUAN** | Dashboard · Tra Cứu · Lịch Sử |
| **CÔNG VIỆC** | Ticket Hỗ Trợ · Công Việc · Đặt Phòng Họp · Duyệt Yêu Cầu |
| **NHÂN SỰ** | Dữ Liệu Chấm Công · Hợp đồng & Hồ sơ · Yêu Cầu Tuyển Dụng · Quản Lý Hồ Sơ · Nguồn Nhân Lực |
| **HỆ THỐNG** | Quản lý Tài sản · Tổ Chức · Biểu Mẫu · Người Dùng · Cài Đặt |

3. **Khu vực người dùng** ở dưới cùng — hiển thị avatar, tên, vai trò và nút **Đăng Xuất**.

::: info Menu hiện theo quyền
Mỗi mục menu chỉ hiện nếu vai trò/quyền của bạn cho phép. Ví dụ Dashboard, Quản lý Tài sản, Tổ Chức, Lịch Sử… mặc định dành cho Super Admin/Admin. Các mục **Dữ Liệu Chấm Công**, **Tra Cứu**, **Ticket Hỗ Trợ**, **Đặt Phòng Họp** và **Hợp đồng & Hồ sơ** luôn hiện cho mọi người dùng. Xem chi tiết tại [Phân quyền](/bat-dau/phan-quyen).
:::

### Badge số trên menu

Một số mục menu có **huy hiệu số** (badge) hình vòng cung xoay, cho biết số việc cần xử lý:

- **Duyệt Yêu Cầu** — số yêu cầu chờ duyệt (màu vàng).
- **Ticket Hỗ Trợ** — số ticket cần chú ý (màu đỏ).
- **Công Việc** — số công việc liên quan (màu chàm).
- **Đặt Phòng Họp** — lịch đặt phòng (màu xanh ngọc).
- **Người Dùng**, **Yêu Cầu Tuyển Dụng**, **Hợp đồng & Hồ sơ**, **Quản Lý Hồ Sơ**, **Nguồn Nhân Lực** — số mục chờ xử lý tương ứng.

Badge tự cập nhật định kỳ (khoảng mỗi 60 giây) và theo thời gian thực khi có thay đổi.

### Thu gọn sidebar

- Trên **màn hình lớn**: nhấn nút mũi tên (`‹` / `›`) cạnh logo để **thu gọn/mở rộng** sidebar. Khi thu gọn chỉ hiện biểu tượng; di chuột vào để xem tên mục.
- Lựa chọn thu gọn được ghi nhớ cho lần sau.

## Thanh trên cùng (Topbar)

<!-- SCREENSHOT: /dashboard — topbar với ô tìm kiếm, chuông, QR, menu user -->
::: info 📸 Ảnh minh họa
Topbar: ô tìm kiếm bên trái, các biểu tượng chức năng và menu người dùng bên phải. *(Ảnh sẽ được bổ sung.)*
:::

Từ trái sang phải, topbar gồm:

- **Ô tìm kiếm** — tìm tài sản theo tên hoặc mã (`AF-...`). Trên màn hình lớn hỗ trợ phím tắt `⌘K`.
- **Chuông thông báo** — hiển thị thông báo hệ thống (ví dụ cảnh báo tên miền sắp hết hạn). Số trên chuông là số thông báo chưa đọc.
- **Biểu tượng QR** — mở trình **quét mã QR** để tra cứu nhanh tài sản.
- **Menu người dùng** — nhấn avatar/tên để mở menu:
  - **Hồ Sơ Cá Nhân** — xem sơ yếu lý lịch của chính bạn.
  - **Đăng Xuất**.

## Vùng nội dung chính

Vùng còn lại hiển thị nội dung của trang đang mở. Bố cục được căn giữa, tự co giãn theo kích thước màn hình.

## Responsive — dùng trên điện thoại

Trên **điện thoại/màn hình nhỏ**, giao diện chuyển sang chế độ app: sidebar được thay bằng **thanh tab dưới đáy** (Trang chủ · Chấm công · Duyệt/Công việc · Menu · Tài khoản), mọi chức năng khác nằm trong tab **Menu**. Bố cục các trang tự chuyển sang **1 cột** để dễ thao tác.

::: tip 📱 Cài như một ứng dụng
Bạn có thể **cài FADO AssetFlow lên màn hình chính** điện thoại (Android & iPhone) để mở nhanh, chạy toàn màn hình như app thật. Xem hướng dẫn chi tiết tại **[Dùng trên điện thoại & cài app](/bat-dau/dien-thoai)**.
:::

## Câu hỏi thường gặp

**Tôi không thấy một mục menu mà đồng nghiệp có?**
Menu hiển thị theo quyền của từng tài khoản. Nếu cần truy cập, đề nghị Admin cấp quyền cho module đó.

**Badge số nghĩa là gì?**
Là số lượng mục đang chờ bạn xử lý ở mục tương ứng. Khi xử lý xong, số sẽ giảm.

**Làm sao quay nhanh về Dashboard?**
Nhấn vào **logo** ở sidebar hoặc topbar.

---

*Liên quan:* [Đăng nhập](/bat-dau/dang-nhap) · [Phân quyền](/bat-dau/phan-quyen) · [Dashboard](/chuc-nang/dashboard)

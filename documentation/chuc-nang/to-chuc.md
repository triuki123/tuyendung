# Quản lý Tổ chức

Module **Tổ Chức** quản lý toàn bộ cơ cấu doanh nghiệp: công ty, bộ phận/phòng ban, chức vụ, vị trí công việc và nhãn (tags) phân loại — làm nền tảng cho hồ sơ nhân sự và phân quyền.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/organization` (menu **Tổ Chức** ở nhóm *Điều Hướng*).
- **Ai dùng được:** Super Admin, Admin (mặc định không có quyền Xóa), Quản lý (chỉ xem).
- **Phân hệ:** Cơ Cấu Tổ Chức · Chức Vụ · Vị Trí Công Việc · Tags.
:::

## Giao diện chính

![Trang Tổ chức](/screenshots/to-chuc/tong-quan.png)

Trang tổng quan gồm:

1. **Lưới thống kê** — số liệu nhanh: số Công Ty, Chức Vụ, Bộ Phận, Vị Trí Công Việc, tổng Nhân Viên và Nhân Viên Hoạt Động.
2. **Lưới phân hệ** — 4 thẻ dẫn vào từng phần quản lý chi tiết.

## Các phân hệ

| Phân hệ | Đường dẫn | Dùng để |
|---------|-----------|---------|
| **Cơ Cấu Tổ Chức** | `/organization/companies-organization` | Quản lý công ty, bộ phận, phòng ban và cơ cấu tổ chức chung. |
| **Chức Vụ** | `/organization/positions` | Quản lý chức vụ (vị trí) và gán cho nhân viên của từng công ty. |
| **Vị Trí Công Việc** | `/organization/job-titles` | Tạo danh sách vị trí công việc theo công ty để cấu hình tổ chức. |
| **Tags** | `/organization/tags` | Tạo tags hệ thống để phân loại, đánh dấu người dùng theo tiêu chí. |

## Thao tác chính

### Xem số liệu tổng quan

1. Mở **Tổ Chức** từ menu.
2. Đọc lưới thống kê ở đầu trang để nắm nhanh quy mô tổ chức.

### Quản lý Cơ cấu tổ chức (công ty, bộ phận, phòng ban)

1. Nhấn thẻ **Cơ Cấu Tổ Chức**.
2. Tạo/chỉnh sửa **công ty**, sau đó thêm **bộ phận** và **phòng ban** trực thuộc.
3. (Tùy chọn) Tải **logo công ty** trong cửa sổ thêm/sửa công ty.
4. Lưu thay đổi.

::: tip Logo công ty
Trong cửa sổ thêm/sửa công ty có mục **Logo công ty**: tải ảnh PNG/JPG/SVG (≤ 2MB), hệ thống tự giữ tỉ lệ. Nên dùng **logo nền trong suốt** (PNG/SVG) — ảnh sẽ hiển thị trong sơ đồ tổ chức và ở thẻ nhân sự của công ty đó. Vì giao diện nền tối, ưu tiên logo màu sáng để dễ nhìn.
:::

### Quản lý Chức vụ

1. Nhấn thẻ **Chức Vụ**.
2. Thêm các chức vụ cho từng công ty (ví dụ Trưởng phòng, Chuyên viên…).
3. Chức vụ sẽ dùng để gán cho nhân viên trong hồ sơ nhân sự.

### Quản lý Vị trí công việc

1. Nhấn thẻ **Vị Trí Công Việc**.
2. Tạo danh sách vị trí công việc theo từng công ty.

### Quản lý Tags (nhãn tổ chức)

1. Nhấn thẻ **Tags**.
2. Tạo nhãn để phân loại, đánh dấu người dùng theo các tiêu chí riêng.

::: tip Cần quyền tương ứng
Các nút Thêm/Sửa/Xóa chỉ hiện nếu tài khoản của bạn có quyền trên module Tổ Chức. Vai trò **Quản lý** chỉ xem; **Admin** mặc định không có quyền Xóa. Xem [Phân quyền](/bat-dau/phan-quyen).
:::

## Câu hỏi thường gặp

**Khác nhau giữa "Chức Vụ" và "Vị Trí Công Việc"?**
**Chức Vụ** là cấp bậc/vị trí được gán cho nhân viên (ví dụ Trưởng phòng). **Vị Trí Công Việc** là danh mục vị trí theo công ty dùng để cấu hình cơ cấu. Cả hai đều thiết lập theo từng công ty.

**Tags ở đây có giống tags nhân viên không?**
Tags tổ chức là nhãn hệ thống dùng phân loại người dùng, tách biệt với các nhãn khác. Hãy đặt tên nhãn rõ ràng để dễ quản lý.

**Vì sao tôi chỉ xem được mà không sửa?**
Vai trò Quản lý chỉ có quyền xem module Tổ Chức. Cần chỉnh sửa, hãy đề nghị Admin/Super Admin.

---

*Liên quan:* [Phân quyền](/bat-dau/phan-quyen) · [Dashboard](/chuc-nang/dashboard)

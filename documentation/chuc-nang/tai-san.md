# Quản lý Tài sản

Module **Quản lý Tài sản** giúp doanh nghiệp theo dõi toàn bộ tài sản: phần cứng, phần mềm, tên miền và tài khoản email — kèm thông tin cấp phát và lịch sử thay đổi.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/asset-management` (menu **Quản lý Tài sản** ở nhóm *Điều Hướng*).
- **Ai dùng được:** Super Admin, Admin (mặc định không có quyền Xóa), Quản lý (chỉ xem theo cấu hình).
- **Phân hệ:** Phần cứng · Phần mềm · Tên miền · Email.
:::

## Giao diện chính

![Trang Quản lý Tài sản](/screenshots/tai-san/tong-quan.png)

Trang gồm: thẻ **thống kê** (tổng số tài sản theo loại) → **bộ lọc & tìm kiếm** → **danh sách tài sản**.

## Các phân hệ

| Phân hệ | Đường dẫn | Dùng để |
|---------|-----------|---------|
| **Phần cứng** | `/asset-management/hardware` | Máy tính, thiết bị, đồ dùng có quản lý serial/cấp phát. |
| **Phần mềm** | `/asset-management/software` | Bản quyền, license, gói phần mềm. |
| **Tên miền** | `/asset-management/domains` | Domain công ty và thông tin liên quan. |
| **Email** | `/asset-management/email-accounts` | Tài khoản email cấp cho nhân sự. |

## Thao tác chính

### Thêm tài sản mới

1. Mở phân hệ tương ứng (ví dụ **Phần cứng**).
2. Nhấn nút **Thêm mới** ở góc phải header.
3. Điền thông tin trong cửa sổ hiện ra: tên, loại, ngày cấp…
4. Gán **Người phụ trách** theo cơ cấu tổ chức (xem mục dưới).
5. Nhấn **Lưu**.

::: tip Chọn người phụ trách theo cơ cấu tổ chức
Với **Tên miền**, **Email** và **Phần mềm**, ô chọn người phụ trách đi theo cây cơ cấu: chọn **Công ty → Phòng ban → Bộ phận**, dừng ở cấp nào thì danh sách nhân sự lọc đúng nhánh đó (mỗi ô đều có tìm kiếm). Người được gán phụ trách sẽ thấy tài sản này trong [Tra cứu Tài sản](/chuc-nang/tra-cuu).
:::

![Modal thêm tài sản mới — nhập thông tin cơ bản](/screenshots/tai-san/them-phan-cung.png)

::: tip Cần quyền `Thêm`
Nút **Thêm mới** chỉ hiện nếu tài khoản của bạn có quyền `Thêm` trên module này. Nếu không thấy nút, liên hệ Admin. Xem [Phân quyền](/bat-dau/phan-quyen).
:::

### Chỉnh sửa / Cấp phát

1. Nhấn vào tài sản trong danh sách để mở chi tiết.
2. Cập nhật thông tin hoặc đổi người sử dụng.
3. Nhấn **Lưu** — thay đổi được ghi vào [Lịch sử](/chuc-nang/lich-su).

### Xóa tài sản

Việc xóa tài sản thường đi qua **luồng duyệt** thay vì xóa trực tiếp:

1. Gửi **yêu cầu xóa** từ chi tiết tài sản.
2. Người có quyền duyệt xử lý tại [Duyệt yêu cầu → Xóa tài sản](/chuc-nang/duyet-yeu-cau).

::: warning
Mặc định **Admin không có quyền Xóa** tài sản — chỉ Super Admin. Quy trình duyệt giúp tránh xóa nhầm và lưu vết.
:::

## Câu hỏi thường gặp

## Cấu hình liên quan

Admin có thể quản lý danh mục loại tài sản và người nhận nhắc bảo trì tại [Cấu Hình Tài Sản](/quan-tri/cau-hinh-tai-san).

**Không thấy menu Quản lý Tài sản?**
Module này mặc định dành cho Super Admin/Admin. Nếu bạn là Quản lý/Người dùng, cần được Admin cấp quyền.

---

*Liên quan:* [Tra cứu tài sản](/chuc-nang/tra-cuu) · [Lịch sử](/chuc-nang/lich-su) · [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau)

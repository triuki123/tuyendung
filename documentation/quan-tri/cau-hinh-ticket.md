# Cấu hình Ticket

Trang **Cấu Hình Ticket** định nghĩa **Loại Yêu Cầu** và **Danh Mục** (kèm trường động) cho hệ thống tác vụ/ticket.

::: warning Chỉ Super Admin
Lối vào `/tickets/admin/config` **chỉ hiển thị với Super Admin**. Admin **không** thấy mục này. Người không phải Super Admin chỉ xem được, không chỉnh sửa.
:::

::: info Tóm tắt nhanh
- **Đường dẫn:** `/tickets/admin/config` (vào từ **Quản Lý Ticket** › nút cấu hình).
- **Ai dùng được:** **chỉ Super Admin**.
- **Hai tab:** Loại Yêu Cầu · Danh Mục.
:::

## Giao diện

![Trang Cấu hình Ticket](/screenshots/quan-tri/cau-hinh-ticket.png)

Trang gồm nút **Quay lại Quản Lý Ticket** (←) và hai tab.

## Tab Loại Yêu Cầu

Quản lý danh sách **loại yêu cầu** dùng để phân nhóm ticket.

1. Mở tab **Loại Yêu Cầu**.
2. Nhấn **Thêm** để tạo loại mới: nhập **mã (code)**, **tên**, thứ tự sắp xếp.
3. Bật/tắt **trạng thái hoạt động**, **sửa** hoặc **lưu trữ/xóa** loại đã có.

## Tab Danh Mục

Quản lý **danh mục** ticket, có thể lồng cấp (cha–con) và gắn **trường động (custom fields)**.

1. Mở tab **Danh Mục**.
2. Nhấn **Thêm** để tạo: chọn **danh mục cha** (nếu có), nhập **tên**, gán **loại yêu cầu** liên quan, **thẻ đơn vị mặc định**.
3. Thêm **trường động** cho danh mục — mỗi trường có **nhãn** và **kiểu**:

| Kiểu trường | Dùng cho |
|-------------|----------|
| Văn bản ngắn | Thông tin một dòng |
| Văn bản dài | Mô tả nhiều dòng |
| Số | Giá trị số |
| Ngày | Chọn ngày |
| Chọn (danh sách) | Lựa chọn từ danh sách định sẵn |

4. Đặt trường **bắt buộc** nếu cần, sắp **thứ tự**, rồi **Lưu**.

::: tip Hướng tới ERP
Hệ thống tác vụ/ticket được thiết kế để xử lý công việc nội bộ toàn doanh nghiệp, không chỉ riêng tài sản. Loại yêu cầu & danh mục cấu hình ở đây áp dụng cho toàn bộ luồng tác vụ.
:::

---

*Liên quan:* [Ticket Hỗ trợ](/chuc-nang/tickets) · [Super Admin](/vai-tro/super-admin)

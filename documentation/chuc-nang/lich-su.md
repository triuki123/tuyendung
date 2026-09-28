# Lịch Sử Hoạt Động

Module **Lịch Sử Hoạt Động** là nhật ký toàn hệ thống: ghi lại các sự kiện trên tài sản, người dùng và các thao tác quản trị, giúp tra soát và lưu vết.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/history` (menu **Lịch Sử Hoạt Động**).
- **Ai dùng được:** Super Admin, Admin. Vai trò khác cần quyền module `history`.
- **Tính năng:** thống kê nhanh · tìm kiếm · lọc theo hành động · bộ lọc nâng cao · lưu bộ lọc.
:::

## Giao diện chính

![Trang Lịch sử hoạt động](/screenshots/lich-su/tong-quan.png)

Trang gồm: **thống kê** → **tìm kiếm & bộ lọc** → **danh sách sự kiện**.

### Thống kê nhanh

Bốn thẻ ở đầu trang: **Tổng sự kiện**, **Xóa tài sản phê duyệt**, **Xóa tài sản từ chối**, **Hoạt động khác**.

### Các loại hành động được ghi

Mỗi sự kiện có nhãn hành động tô màu, ví dụ:

| Nhóm | Hành động |
|------|-----------|
| **Tài sản** | Nhập kho · Phân bổ · Bảo trì · Báo hỏng · Thu hồi · Thanh lý · Cập nhật tài sản |
| **Duyệt xóa** | Xóa tài sản (Phê duyệt) · Xóa tài sản (Từ chối) |
| **Người dùng** | Tạo người dùng · Cập nhật người dùng · Vô hiệu hóa người dùng |

Mỗi dòng hiển thị: **thời gian**, **nội dung** (mã + tên tài sản hoặc *Hành động hệ thống*), **hành động**, **người thực hiện** và **ghi chú**.

## Tìm kiếm & lọc

### Tìm kiếm nhanh

Gõ vào ô tìm kiếm để lọc theo **mã tài sản**, **tên tài sản** hoặc **người thực hiện**.

### Lọc theo hành động

Dropdown **Tất cả hành động** liệt kê các loại hành động đang có trong nhật ký để lọc nhanh.

### Bộ lọc nâng cao

1. Nhấn **Bộ lọc nâng cao** để mở trình tạo điều kiện.
2. Chọn trường (Loại thực thể, Hành động, Thực hiện bởi, Thời gian), toán tử (bằng, chứa, bắt đầu/kết thúc bằng…) và giá trị; kết hợp nhiều điều kiện theo AND/OR.
3. Áp dụng — số kết quả khớp hiển thị ở chỉ báo phía trên danh sách.

::: tip Lưu bộ lọc
Nhấn vào khu vực **Bộ lọc đã lưu** ở góc phải để lưu lại tổ hợp điều kiện hay dùng và nạp lại nhanh ở các lần sau.
:::

## Câu hỏi thường gặp

**Nhật ký hiển thị tối đa bao nhiêu sự kiện?**
Trang nạp tối đa khoảng 500 sự kiện gần nhất; dùng tìm kiếm/bộ lọc để khoanh vùng dữ liệu cần xem.

**Không thấy menu Lịch Sử?**
Module mặc định dành cho Super Admin/Admin. Vai trò khác cần được cấp quyền module `history`.

---

*Liên quan:* [Quản lý Tài sản](/chuc-nang/tai-san) · [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau) · [Người dùng](/quan-tri/nguoi-dung)

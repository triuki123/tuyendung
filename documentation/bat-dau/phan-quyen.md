# Phân quyền & vai trò

Hệ thống dùng cơ chế phân quyền **2 tầng**: vai trò (role) quyết định mặc định, và **phân quyền chi tiết theo module** có thể tinh chỉnh cho từng người dùng.

## 4 vai trò

| Vai trò | Mã | Phạm vi dữ liệu | Đặc trưng |
|---------|----|-----------------|-----------|
| **Super Admin** | `super_admin` | Toàn hệ thống | Thấy & làm mọi thứ, kể cả [Cấu hình Ticket](/quan-tri/cau-hinh-ticket). |
| **Quản trị viên** | `admin` | Theo công ty được gán | Gần như toàn quyền, **không có quyền Xóa** ở phần lớn module; **Cài đặt** chỉ xem. |
| **Quản lý** | `manager` | Theo công ty được gán | Quản lý cấp phòng; **Người dùng / Tổ chức / Cài đặt** chỉ xem; duyệt bù công, tăng ca, nghỉ phép và xem bảng công / chuyên cần của cấp dưới. |
| **Người dùng** | `user` | Chỉ dữ liệu cá nhân | Tự phục vụ: ticket, đặt phòng, chấm công, hồ sơ cá nhân, tra cứu. |

::: tip Phạm vi dữ liệu (Tầng 2)
Ngoài việc "thấy module nào", hệ thống còn lọc **dữ liệu**: Super Admin thấy toàn bộ; Admin/Quản lý thấy theo công ty được gán; Người dùng chỉ thấy dữ liệu của chính mình.
:::

## Quyền mặc định theo vai trò

Khi tạo người dùng, hệ thống gán sẵn bộ quyền theo vai trò:

- **Super Admin** — tất cả hành động trên mọi module.
- **Admin** — mọi hành động **trừ `Xóa`**; riêng **Cài đặt** chỉ `Xem`.
- **Quản lý** — như Admin nhưng **Người dùng, Tổ chức, Cài đặt** chỉ `Xem`.
- **Người dùng** — chỉ `Xem` ở những module có hành động `Xem`.

## Các hành động (permission action)

| Hành động | Ý nghĩa |
|-----------|---------|
| `Xem` (view) | Xem dữ liệu của module |
| `Thêm` (create) | Tạo bản ghi mới |
| `Sửa` (edit) | Chỉnh sửa bản ghi |
| `Xóa` (delete) | Xóa bản ghi |
| `Phê duyệt` (approve) | Duyệt/đóng/xác nhận |
| `Xuất dữ liệu` (export) | Xuất file (Excel…) |
| `Nhận thông báo` (notify) | Nhận cảnh báo/nhắc liên quan |

## Module luôn hiển thị cho mọi người đã đăng nhập

Một số module phục vụ tự thân nên **luôn xuất hiện** bất kể phân quyền chi tiết:

- **Tra Cứu** (`/tra-cuu`)
- **Dữ Liệu Chấm Công** (`/tra-cuu/du-lieu-cong`)
- **Hợp đồng & Hồ sơ** của tôi (`/ho-so-cua-toi`)
- **Chữ Ký Email** (`/email-signature`) — mọi người đều có thể tạo chữ ký email cá nhân

## Tinh chỉnh quyền cho từng người

Admin/Super Admin có thể chỉnh quyền chi tiết cho từng người dùng tại **Người Dùng → chọn người → tab Phân Quyền**. Xem [Người dùng & phân quyền](/quan-tri/nguoi-dung).

::: warning Lưu ý
Một số module **con** (ví dụ các trang trong Quản lý Tài sản hay Chấm công) có thể **kế thừa quyền của module mẹ** nếu chưa được cấu hình riêng — để tránh khóa nhầm người dùng cũ khi hệ thống bổ sung module mới.
:::

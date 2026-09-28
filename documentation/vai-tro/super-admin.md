# Super Admin

Trang **lối đi nhanh** cho vai trò **Super Admin** (`super_admin`) — quyền cao nhất, thấy và làm **mọi thứ** trên toàn hệ thống, gồm cả những thao tác Admin không có.

::: info Tóm tắt nhanh
- **Mã vai trò:** `super_admin`.
- **Phạm vi dữ liệu:** **toàn hệ thống** (không bị lọc theo công ty).
- **Quyền mặc định:** **tất cả** hành động trên **mọi** module.
:::

## Đặc quyền riêng của Super Admin

So với Admin, Super Admin có thêm:

- **Quyền `Xóa`** trên mọi module (tài sản, người dùng, tổ chức...).
- **Cấu hình Ticket** (`/tickets/admin/config`): lối vào **chỉ hiện với Super Admin** — Admin không thấy. Xem [Cấu hình Ticket](/quan-tri/cau-hinh-ticket).
- **Cài đặt hệ thống** đầy đủ (Admin chỉ xem).
- Gán được vai trò **Super Admin** cho người dùng khác.

## Công việc thường ngày

- [ ] Cấu hình **loại yêu cầu** & **danh mục** cho hệ thống tác vụ/ticket → [Cấu hình Ticket](/quan-tri/cau-hinh-ticket)
- [ ] Quản lý người dùng & gán vai trò (kể cả Super Admin) → [Người dùng & phân quyền](/quan-tri/nguoi-dung)
- [ ] Thiết lập cơ cấu tổ chức toàn tập đoàn → [Cơ cấu tổ chức](/quan-tri/co-cau-to-chuc)
- [ ] Cấu hình máy chấm công, loại phép, chính sách phép năm → [Cấu hình Chấm công](/quan-tri/cau-hinh-cham-cong)
- [ ] Duyệt/xử lý yêu cầu **xóa tài sản** → [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau)
- [ ] Quản lý quyền mẫu (preset) dùng chung → [Người dùng & phân quyền](/quan-tri/nguoi-dung)
- [ ] Cài đặt hệ thống & cá nhân → [Cài đặt hệ thống](/quan-tri/cai-dat)

<!-- SCREENSHOT: /tickets/admin/config — cấu hình Ticket, chỉ Super Admin thấy -->
::: info 📸 Ảnh minh họa
Lối vào Cấu hình Ticket — đặc quyền riêng của Super Admin. *(Ảnh sẽ được bổ sung.)*
:::

::: tip Dùng quyền cẩn trọng
Super Admin có quyền xóa và cấu hình toàn hệ thống. Ưu tiên dùng **luồng duyệt** thay vì xóa trực tiếp để giữ vết và tránh mất dữ liệu.
:::

---

*Liên quan:* [Phân quyền & vai trò](/bat-dau/phan-quyen) · [Admin](/vai-tro/admin)

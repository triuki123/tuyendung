# Quản trị viên (Admin)

Trang **lối đi nhanh** cho vai trò **Admin** (`admin`) — quản trị gần như toàn bộ hệ thống trong phạm vi công ty được gán. Khác biệt chính so với Super Admin: **không có quyền Xóa** ở phần lớn module, và **Cài đặt** chỉ `Xem`.

::: info Tóm tắt nhanh
- **Mã vai trò:** `admin`.
- **Phạm vi dữ liệu:** theo **công ty được gán**.
- **Quyền mặc định:** mọi hành động **trừ `Xóa`**; riêng **Cài đặt** chỉ `Xem`.
:::

## Bạn thấy những gì?

Admin thấy hầu hết module trong cả 3 nhóm điều hướng:

- **Điều Hướng:** Bảng điều khiển, Quản lý Tài sản, Tổ chức.
- **Hoạt Động:** Ticket, Công việc, Đặt phòng, Yêu cầu tuyển dụng, Chấm công, Thông báo, Lịch sử.
- **Quản Trị:** Quản lý Hồ sơ (Nhân sự), Nguồn Nhân Lực, Biểu mẫu, Người dùng, Cài đặt.

::: warning Admin không xóa được
Mặc định Admin **không có quyền `Xóa`**. Việc xóa tài sản đi qua **luồng duyệt** ([Duyệt yêu cầu xóa](/chuc-nang/duyet-yeu-cau)); xóa người dùng/tổ chức cần Super Admin. **Cấu hình Ticket** cũng chỉ Super Admin mới vào được.
:::

## Công việc thường ngày

- [ ] Tạo/sửa người dùng, gán vai trò & phân quyền chi tiết → [Người dùng & phân quyền](/quan-tri/nguoi-dung)
- [ ] Quản lý tài sản (phần cứng, phần mềm, domain, email) → [Quản lý Tài sản](/chuc-nang/tai-san)
- [ ] Quản lý cơ cấu tổ chức (công ty, phòng ban, bộ phận) → [Cơ cấu tổ chức](/quan-tri/co-cau-to-chuc)
- [ ] Xử lý ticket, công việc, đặt phòng → [Ticket Hỗ trợ](/chuc-nang/tickets) · [Công việc](/chuc-nang/cong-viec)
- [ ] Quản lý hồ sơ nhân sự, hợp đồng → [Quản lý Hồ sơ (Nhân sự)](/chuc-nang/nhan-su)
- [ ] Tuyển dụng, onboarding, kho CV/JD → [Nguồn nhân lực (ATS)](/chuc-nang/nguon-nhan-luc)
- [ ] Đăng thông báo nội bộ → [Thông báo (Truyền thông)](/chuc-nang/dashboard)
- [ ] Cấu hình máy chấm công & loại phép → [Cấu hình Chấm công](/quan-tri/cau-hinh-cham-cong)
- [ ] Theo dõi lịch sử hoạt động → [Lịch sử](/chuc-nang/lich-su)

<!-- SCREENSHOT: /users — màn hình quản trị người dùng của Admin -->
::: info 📸 Ảnh minh họa
Màn hình quản trị của vai trò Admin. *(Ảnh sẽ được bổ sung.)*
:::

---

*Liên quan:* [Phân quyền & vai trò](/bat-dau/phan-quyen) · [Super Admin](/vai-tro/super-admin)

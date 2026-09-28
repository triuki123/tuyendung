# Quản lý (Manager)

Trang **lối đi nhanh** cho vai trò **Quản lý** (`manager`) — phụ trách một phòng/đội. Ngoài các quyền tự phục vụ như người dùng thường, Quản lý còn **xét duyệt** cho cấp dưới và **đặt yêu cầu tuyển dụng**.

::: info Tóm tắt nhanh
- **Mã vai trò:** `manager`.
- **Phạm vi dữ liệu:** theo **công ty được gán** (giống Admin).
- **Quyền mặc định:** như Admin nhưng **Người dùng / Tổ chức / Cài đặt** chỉ `Xem`; không có quyền `Xóa`.
:::

## Bạn thấy những gì?

Quản lý nhìn thấy phần lớn module nghiệp vụ (Bảng điều khiển, Tài sản, Công việc, Ticket, Tổ chức, Lịch sử...), cộng các module luôn mở (**Tra Cứu**, **Chấm công**, **Hồ sơ của tôi**). Hai điểm đặc trưng của vai trò này:

- **Duyệt yêu cầu** (`/duyet-yeu-cau`): Quản lý luôn xét duyệt được **Bù công** và **Tăng ca** của cấp dưới. Nút **Duyệt bảng công** chỉ hiện khi được cấp quyền `Xác nhận bảng công` (attendance.approve).
- **Yêu cầu tuyển dụng** (`/recruitment-order`): cổng đặt yêu cầu tuyển dụng cho phòng ban — Quản lý mặc định thấy.

## Công việc thường ngày

- [ ] Duyệt **bù công** và **tăng ca** của nhân viên trong đội → [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau)
- [ ] Xác nhận **bảng công** đội ngũ (nếu được cấp quyền) → [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau)
- [ ] Theo dõi bảng công, chấm công của phòng → [Chấm công & Nghỉ phép](/chuc-nang/cham-cong)
- [ ] Đặt **yêu cầu tuyển dụng** mới cho phòng ban → [Nguồn nhân lực (ATS)](/chuc-nang/nguon-nhan-luc)
- [ ] Theo dõi công việc & ticket của đội → [Công việc](/chuc-nang/cong-viec) · [Ticket Hỗ trợ](/chuc-nang/tickets)
- [ ] Xem bảng điều khiển tổng quan → [Dashboard](/chuc-nang/dashboard)
- [ ] Tự phục vụ: chấm công, hồ sơ, đặt phòng → [Hồ sơ của tôi](/chuc-nang/ho-so-cua-toi) · [Đặt phòng họp](/chuc-nang/dat-phong)

<!-- SCREENSHOT: /duyet-yeu-cau — màn hình duyệt bù công/tăng ca của Quản lý -->
::: info 📸 Ảnh minh họa
Màn hình duyệt yêu cầu cấp dưới của vai trò Quản lý. *(Ảnh sẽ được bổ sung.)*
:::

::: warning Lưu ý
Quản lý **chỉ xem** với Người dùng, Tổ chức và Cài đặt hệ thống; không tự tạo/sửa người dùng hay cơ cấu tổ chức. Việc đó thuộc Admin/Super Admin.
:::

---

*Liên quan:* [Phân quyền & vai trò](/bat-dau/phan-quyen) · [Cấu hình Chấm công](/quan-tri/cau-hinh-cham-cong)

# Dashboard (Trang chủ)

Dashboard là màn hình đầu tiên sau khi đăng nhập, cung cấp tổng quan nhanh về công việc và số liệu liên quan đến bạn. **Giao diện Dashboard thay đổi theo vai trò** của tài khoản.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/dashboard` (logo và menu *Dashboard* đều dẫn về đây).
- **Ai dùng được:** Mọi người dùng — nhưng nội dung khác nhau theo vai trò.
- **Đặc điểm:** Số liệu đồng bộ thời gian thực; nhấn vào thẻ chỉ số để mở module tương ứng.
:::

## Giao diện theo vai trò

![Trung Tâm Điều Hành](/screenshots/dashboard/tong-quan.png)

Hệ thống hiển thị một trong ba dạng Dashboard:

| Vai trò | Dashboard | Trọng tâm |
|---------|-----------|-----------|
| **Super Admin / Admin** | Trung Tâm Điều Hành | Tổng quan toàn hệ thống |
| **Quản lý (manager)** | Dashboard đội ngũ | Số liệu nhân viên cấp dưới |
| **Người dùng (user)** | Dashboard cá nhân | Công việc và nhiệm vụ của riêng bạn |

## Dashboard Super Admin / Admin — "Trung Tâm Điều Hành"

Hiển thị tổng quan toàn hệ thống, có nhãn **"Đồng bộ thời gian thực"**.

- **Dải KPI** (đầu trang): các thẻ chỉ số đa lĩnh vực, mỗi thẻ là một cổng nhảy vào module:
  - **Tổng Tài Sản** — tổng tài sản và số cảnh báo sắp hết hạn → mở Quản lý Tài sản.
  - **Nhân Sự** — số nhân sự đang làm việc → mở Nguồn Nhân Lực.
  - Ticket đang mở, Công việc đang mở, Yêu cầu chờ duyệt, Phòng họp chờ, Tuyển dụng chờ…
- **Cột chính (2/3):**
  - **Việc cần xử lý** (Action Items).
  - **Phân tích nhân sự** (HR Insights) và xu hướng.
- **Cột phải (1/3):** bảng tin gồm **Thông báo gần đây** và **Văn bản gần đây**.

::: tip
Nhấn vào bất kỳ thẻ chỉ số nào để đi thẳng vào module liên quan.
:::

## Dashboard Quản lý (manager) — đội ngũ

Tập trung vào **nhân viên cấp dưới** của bạn (theo cấu trúc quản lý). Lời chào "Xin chào, [tên]".

- **Dải KPI đội:**
  - **Quân số nhóm** — tổng nhân viên trong nhóm.
  - **Chờ tôi duyệt** — số đơn cấp dưới chờ bạn duyệt → mở Duyệt Yêu Cầu.
  - **Ticket nhóm mở** · **Công việc nhóm**.
- **Cần Tôi Duyệt:** liệt kê đơn theo loại (nghỉ phép, tăng ca, bù công/điều chỉnh); nhấn để vào màn duyệt.
- **Đội Ngũ Hôm Nay:** ticket nhóm hôm nay, task đến hạn hôm nay, số người nghỉ phép, số vắng/chưa chấm công.
- **Việc của tôi:** công việc và ticket cá nhân của bạn.
- **Cột phải:** Thông báo và Văn bản gần đây.

## Dashboard Người dùng (user) — cá nhân

Tập trung vào công việc của chính bạn. Lời chào "Xin chào, [tên]".

- **Thao tác nhanh** (đầu trang): các nút tắt — **Đầu Mối Liên Hệ**, **Tạo ticket**, **Đặt phòng**, **Xin nghỉ phép**.
- **Cột chính:**
  - **Cần xử lý:** số ticket đang mở, số công việc chưa hoàn thành, số phòng họp đang chờ duyệt.
  - **Việc của tôi:** danh sách ticket và công việc được giao cho bạn.
  - **Phòng họp của tôi:** các lượt đặt phòng bạn đã tạo.
- **Cột phải:** Thông báo, Văn bản gần đây, **Thống kê** cá nhân và **Hoạt động gần đây**.

## Câu hỏi thường gặp

**Vì sao Dashboard của tôi khác đồng nghiệp?**
Nội dung Dashboard tùy theo vai trò (Super Admin/Admin, Quản lý, Người dùng). Đây là thiết kế nhằm hiển thị đúng thông tin cần thiết cho từng nhóm.

**Số liệu có cập nhật tức thời không?**
Có. Dashboard đồng bộ theo thời gian thực; các con số tự cập nhật khi dữ liệu thay đổi.

**Nhấn vào thẻ chỉ số thì sao?**
Hệ thống mở module tương ứng (ví dụ thẻ Tổng Tài Sản dẫn tới Quản lý Tài sản).

---

*Liên quan:* [Giao diện chung](/bat-dau/giao-dien-chung) · [Quản lý Tài sản](/chuc-nang/tai-san) · [Công Việc](/chuc-nang/cong-viec)

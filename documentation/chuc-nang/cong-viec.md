# Công Việc

Module **Công Việc** giúp giao việc, theo dõi tiến độ và phối hợp xử lý nhiệm vụ trong tổ chức. Mỗi công việc hỗ trợ công việc con, người thực hiện/theo dõi, bình luận, tệp đính kèm và nhiều cách hiển thị.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/tasks` (menu **Công Việc** ở nhóm *Hoạt Động*).
- **Phân tích:** `/tasks/analytics`.
- **Ai dùng được:** Super Admin, Admin (theo cấu hình quyền). Người dùng/Quản lý thấy công việc liên quan đến mình.
- **Chế độ xem:** Kanban · Lịch (Calendar) · Gantt · Lưới thẻ (Grid).
:::

## Giao diện chính

![Trang Công việc](/screenshots/cong-viec/tong-quan.png)

Bạn có thể chuyển giữa **4 chế độ xem** bằng thanh chuyển đổi:

| Chế độ | Phù hợp khi |
|--------|-------------|
| **Kanban** | Kéo-thả công việc theo trạng thái. |
| **Lịch (Calendar)** | Xem theo ngày/hạn chót. |
| **Gantt** | Theo dõi tiến độ và mốc thời gian. |
| **Lưới (Grid)** | Xem dạng thẻ tổng quan. |

Trạng thái công việc gồm: **Cần làm (todo)** · **Đang làm (in_progress)** · **Hoàn thành (done)** · **Đã hủy (cancelled)**.

## Thao tác chính

### Tạo / Giao việc

1. Nhấn nút thêm công việc.
2. Cửa sổ tạo công việc có các tab thông tin; điền:
   - **Tiêu đề** *(bắt buộc, tối thiểu 3 ký tự)*.
   - **Mô tả** chi tiết.
   - **Loại Công Việc**, **Độ Phức Tạp**.
   - **Người phụ trách** *(bắt buộc)* — mặc định là chính bạn khi tạo mới; chọn người khác để giao việc.
   - **Ngày Bắt Đầu** và **Hạn Chót** — hạn chót phải sau ngày bắt đầu và không nằm trong quá khứ.
   - **Ưu Tiên**, **Trạng Thái**.
   - **Mã Tài Liệu Liên Quan**, **Dự Án**, **Cột Mốc** (tùy chọn).
3. Nhấn lưu để tạo công việc.

::: warning Quy tắc ngày
Hệ thống cảnh báo nếu **Hạn Chót** trước **Ngày Bắt Đầu** hoặc đã nằm trong quá khứ. Hãy chọn lại ngày hợp lệ.
:::

### Công việc con (Subtask)

1. Mở chi tiết công việc.
2. Thêm **công việc con** để chia nhỏ nhiệm vụ.
3. Bạn cũng có thể đặt **Công Việc Cha** ngay khi tạo, bằng cách nhập ID công việc cha.

### Người thực hiện & người theo dõi

- **Người phụ trách** (assigned_to) là người chịu trách nhiệm chính.
- Có thể thêm **người thực hiện bổ sung** để nhiều người cùng tham gia.
- Người dùng có thể **theo dõi** (Follow) công việc để nhận cập nhật mà không cần là người phụ trách.

### Bình luận

1. Mở chi tiết công việc.
2. Thêm bình luận để trao đổi tiến độ, vướng mắc.
3. Bình luận được lưu kèm nhật ký hoạt động của công việc.

### Tệp đính kèm

1. Trong chi tiết công việc, mở phần tệp đính kèm.
2. Tải lên tài liệu liên quan (hợp đồng, ảnh, biên bản…).

### Theo dõi tiến độ & ghi nhận thời gian

- Cập nhật **Trạng Thái** khi công việc tiến triển (hoặc kéo-thả trên Kanban).
- Có thể ghi nhận thời gian làm việc cho từng công việc.

## Phân tích Công Việc

Truy cập `/tasks/analytics` (**Bảng Điều Khiển Thống Kê Tasks**) để xem:

- **Thống Kê Thời Gian**.
- **Phân Bố Theo Trạng Thái**.
- **Xu Hướng 30 Ngày Gần Đây**.
- **Phân Bố Theo Người Dùng** và **Theo Phòng Ban**.

<!-- SCREENSHOT: /tasks/analytics — các biểu đồ thống kê công việc -->
::: info 📸 Ảnh minh họa
Trang **Phân tích Công Việc**: các biểu đồ thống kê thời gian, trạng thái, xu hướng và phân bố. *(Ảnh sẽ được bổ sung.)*
:::

## Xuất báo cáo

Nút **Xuất báo cáo** ở trang Công Việc mở cửa sổ chọn **đối tượng** và **khoảng thời gian** rồi tải file báo cáo PDF/HTML.

::: info Phạm vi đối tượng theo vai trò
- **Quản trị tối cao** — chọn bất kỳ cá nhân, bộ phận, phòng ban hay công ty trong hệ thống.
- **Quản trị viên** — cá nhân, bộ phận, phòng ban hoặc công ty bạn quản lý.
- **Quản lý** — bất kỳ thành viên nào trong đội nhóm (đệ quy theo cây quản lý).
- **Người dùng** — chỉ xuất báo cáo của bản thân.
:::

Báo cáo gộp được làm theo đối tượng đã chọn — thay vì hai báo cáo riêng *Cá nhân* và *Đội nhóm* cũ. Khi chọn một phòng ban hoặc công ty, báo cáo tự gộp tiến độ tất cả thành viên trong phạm vi đó.

Khoảng thời gian mặc định 30 ngày gần nhất — bạn có thể đổi sang khung tuỳ ý. Ngày bắt đầu phải ≤ ngày kết thúc.

## Câu hỏi thường gặp

**Khác nhau giữa Công Việc và Ticket?**
**Ticket** là yêu cầu hỗ trợ cần xử lý; **Công Việc** là nhiệm vụ chủ động giao và theo dõi tiến độ, hỗ trợ công việc con và nhiều chế độ xem.

**Tôi muốn nhiều người cùng làm một việc?**
Đặt một người phụ trách chính và thêm người thực hiện bổ sung; người khác có thể theo dõi để nhận cập nhật.

**Vì sao không lưu được công việc?**
Kiểm tra các trường bắt buộc (Tiêu đề, Người phụ trách) và quy tắc ngày (Hạn chót hợp lệ).

---

*Liên quan:* [Ticket Hỗ Trợ](/chuc-nang/tickets) · [Đặt Phòng Họp](/chuc-nang/dat-phong) · [Dashboard](/chuc-nang/dashboard)

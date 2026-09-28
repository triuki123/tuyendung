# Ticket Hỗ Trợ

Module **Ticket Hỗ Trợ** là kênh xử lý yêu cầu nội bộ: nhân viên gửi ticket khi cần hỗ trợ, bộ phận liên quan tiếp nhận, xử lý và phản hồi. Mọi trao đổi, tệp đính kèm và thay đổi trạng thái đều được lưu vết.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/tickets` (menu **Ticket Hỗ Trợ** ở nhóm *Hoạt Động*).
- **Ai dùng được:** Mọi người dùng. Hệ thống tự điều hướng theo vai trò:
  - Super Admin / Admin → giao diện quản trị `/tickets/admin`.
  - Người dùng / Quản lý → giao diện cá nhân `/tickets/user`.
- **Trạng thái ticket:** Đã gửi → Đang xử lý → Đã hoàn thành → Đóng (hoặc Từ chối).
:::

## Giao diện người dùng — "Ticket Của Tôi"

![Trang Ticket Hỗ trợ](/screenshots/tickets/tong-quan.png)

Màn hình cá nhân có **ba tab**:

| Tab | Hiển thị |
|-----|----------|
| **Ticket được giao cho tôi** | Ticket bạn là người xử lý. |
| **Đã gửi** | Ticket do bạn tạo. |
| **Đang theo dõi** | Ticket bạn đang theo dõi (follow). |

Trên mỗi tab có **ô tìm kiếm** (theo tiêu đề hoặc mã ticket) và **bộ lọc trạng thái**.

## Giao diện quản trị

Super Admin/Admin có thêm bảng điều khiển: thẻ thống kê, bộ lọc nâng cao, bảng/bảng Kanban, thao tác hàng loạt và phân công xử lý.

## Thao tác chính

### Tạo ticket mới

1. Nhấn nút **Tạo ticket** ở góc phải.
2. Trong cửa sổ **Tạo Ticket Mới**, điền:
   - **Tiêu Đề** *(bắt buộc)* — mô tả ngắn gọn vấn đề.
   - **Loại Yêu Cầu** và **Danh Mục** / **Danh Mục Chi Tiết** *(bắt buộc)* — phân loại ticket.
   - **Mô Tả Chi Tiết** — trình bày đầy đủ vấn đề.
   - **Độ Ưu Tiên** — Thấp / Trung bình / Cao.
   - **Đơn Vị Xử Lý** và **Người Được Giao** — chọn bằng cách tìm theo tên, chức vụ, phòng ban.
   - **Tệp đính kèm** (nếu cần) — mỗi tệp tối đa **10MB**.
3. Một số danh mục có thêm **trường tùy chỉnh**; trường có dấu `*` là bắt buộc.
4. Nhấn nút tạo để gửi ticket.

::: tip
Chọn đúng **Danh Mục** và **Đơn Vị Xử Lý** giúp ticket đến đúng người, được xử lý nhanh hơn.
:::

### Theo dõi & xử lý ticket

1. Nhấn vào một ticket để mở **bảng chi tiết**.
2. Bảng chi tiết có các tab:
   - **Tổng quan** — thông tin chính, trạng thái, người được giao.
   - **Tệp đính kèm** — tải lên/xem tài liệu liên quan.
   - **Hoạt động** — nhật ký thay đổi.
   - **Bình luận** — trao đổi trong ticket.
   - **Người theo dõi** — quản lý danh sách người nhận thông báo.
3. Thanh trạng thái hiển thị tiến trình: **Đã gửi → Đang xử lý → Đã hoàn thành → Đóng**.

### Bình luận

1. Mở tab **Bình luận** trong chi tiết ticket.
2. Nhập nội dung; có thể nhắc tên (mention) người khác để họ nhận thông báo.
3. Gửi bình luận — nội dung được lưu vào nhật ký ticket.

### Người theo dõi (Watchers)

1. Mở tab **Người theo dõi**.
2. Thêm người cần nhận cập nhật về ticket; có thể cấu hình thông báo cho từng người.
3. Người dùng cũng có thể tự **theo dõi** ticket để nó xuất hiện ở tab *Đang theo dõi*.

### Công việc liên quan đến ticket

Trong chi tiết ticket, panel **Công Việc Liên Quan** cho phép gắn các công việc (Tasks) phục vụ xử lý ticket. Người được giao xử lý ticket có thể bấm **+ Tạo công việc** để mở nhanh form tạo task — task tạo từ đây tự liên kết về ticket gốc.

::: tip Theo dõi tiến độ chung
Khi ticket có công việc liên kết, bạn theo dõi tiến độ ngay trên panel: số task đã xong / tổng số. Mở từng task để cập nhật trạng thái — ticket không bị tự đóng khi còn task chưa hoàn thành.
:::

### Trạng thái & tự đóng

- Khi ticket được đánh dấu **Đã hoàn thành**, hệ thống hiển thị thông báo *"Ticket đã hoàn thành · Tự đóng sau 3 ngày"* và sẽ **tự đóng** sau 3 ngày nếu không có hoạt động mới.
- Khi ticket bị **Từ chối**, lý do từ chối được ghi lại và ticket cũng **tự đóng sau 3 ngày**.

::: warning
Nếu vấn đề chưa được giải quyết, hãy thêm bình luận trước khi ticket tự đóng, hoặc tạo ticket mới tham chiếu ticket cũ.
:::

### Lưu trữ tự động

Sau khi ticket đã ở trạng thái cuối (Hoàn thành / Đã giải quyết / Từ chối / Đã đóng) quá **7 ngày**, hệ thống **tự ẩn** khỏi danh sách chính (đánh dấu *lưu trữ*). Việc này giữ giao diện gọn — danh sách chính chỉ hiển thị ticket còn cần chú ý.

::: info Vẫn xem lại được
Ticket đã lưu trữ không bị xóa — vẫn nằm trong dữ liệu lịch sử, vẫn tìm được qua thanh tìm kiếm và báo cáo. Khi cần mở lại, liên hệ Quản trị viên.
:::

## Cấu hình liên quan

Người quản trị có thể quản lý loại yêu cầu, danh mục và danh mục chi tiết tại [Cấu Hình Ticket Nâng Cao](/quan-tri/cau-hinh-ticket-nang-cao).

## Câu hỏi thường gặp

**Vì sao tôi vào `/tickets` lại thấy giao diện khác đồng nghiệp?**
Hệ thống điều hướng theo vai trò: quản trị viên thấy bảng điều khiển quản trị, người dùng thường thấy "Ticket Của Tôi".

**Làm sao biết ticket của tôi được xử lý đến đâu?**
Mở ticket và xem thanh trạng thái cùng tab **Hoạt động**. Nếu đang theo dõi, bạn sẽ nhận thông báo khi có cập nhật.

**Ticket đã hoàn thành nhưng vấn đề chưa xong?**
Thêm bình luận trong vòng 3 ngày để ticket không tự đóng, hoặc liên hệ người được giao xử lý.

---

*Liên quan:* [Công Việc](/chuc-nang/cong-viec) · [Dashboard](/chuc-nang/dashboard)

# Có gì mới

Nhật ký cập nhật tính năng của FADO AssetFlow. Trang này liệt kê các thay đổi nổi bật dành cho người dùng.

::: tip Theo dõi cập nhật
Mỗi đợt nâng cấp đáng chú ý sẽ được ghi tại đây. Nếu thấy giao diện thay đổi, hãy ghé trang này để biết "có gì mới".
:::

## Tháng 7 / 2026

### ⏱️ Chấm công & Bảng công
- **Bảng công tự gửi — bỏ nộp/duyệt thủ công.** Nhân viên chỉ cần chấm công đầy đủ; hệ thống **tự chốt & gửi** bảng công về Bộ Phận Chấm Công khi tới hạn. Bỏ nút *Nộp Bảng Công* và trang *Xác Nhận Bảng Công*.
- **Phân hệ "Bảng Công" mới (chỉ xem)** trong Dữ Liệu Chấm Công — nhóm theo **Công Ty → Phòng Ban**, xem chi tiết chấm công theo ngày, có **tìm kiếm theo tên + lọc** Công ty/Phòng ban/Trạng thái. Người dùng thấy mình · Quản lý thấy cấp dưới · Admin thấy công ty · Super Admin thấy toàn hệ thống.
- **🆕 Hồ Sơ Chuyên Cần** — tổng hợp đúng giờ / đi trễ / về sớm / vắng / nghỉ phép và **điểm & xếp loại** chuyên cần từng nhân sự, có chi tiết theo ngày. Lọc theo Tháng/Quý/Năm/Tùy chỉnh.

### 🛠️ Quy Tắc Chấm Công (Super Admin)
- **🆕 Giờ làm theo từng thứ trong tuần** — đặt giờ vào–ra riêng cho mỗi thứ (T7 nửa buổi, CN nghỉ…) thay cho việc chỉ đánh dấu ngày nghỉ. Đi trễ / về sớm tính đúng theo ca thực từng ngày.
- **🆕 Khung Buổi Sáng / Buổi Chiều** — cấu hình được; hỗ trợ nghỉ phép nửa buổi.
- **🆕 Thời gian tự gửi Bảng Công** + tùy chọn **"Mốc rơi vào tháng kế tiếp của kỳ"** (cho công ty tính kỳ theo tháng dương lịch, hạn là ngày đầu tháng sau).
- **🆕 Sửa phiên bản cấu hình đã lưu** — nạp lại vào form và lưu đè.

### 🏖️ Nghỉ phép
- **🆕 Nghỉ nửa buổi** — nút chọn nhanh *Nghỉ buổi sáng / buổi chiều* tự điền khung giờ theo cấu hình công ty (0.5 ngày).

## Tháng 6 / 2026

### 📱 Trải nghiệm điện thoại
- **Giao diện điện thoại kiểu app** — thanh tab dưới đáy (Trang chủ · Chấm công · Duyệt/Công việc · Menu · Tài khoản) thay cho sidebar; mọi chức năng khác gom trong tab **Menu** (vẫn lọc theo quyền).
- **Cài đặt lên màn hình chính (PWA)** — cài thẳng FADO AssetFlow lên điện thoại Android (Chrome) & iPhone/iPad (Safari), mở toàn màn hình như ứng dụng thật, không cần App Store/CH Play. Xem [Dùng trên điện thoại & cài app](/bat-dau/dien-thoai).

### 🆕 Tài sản & Tra cứu
- **Tra Cứu Tài Sản gộp 4 loại** — Phần cứng, Tên miền, Email, Phần mềm hiển thị chung một nơi, có bộ lọc theo loại và thẻ tổng quan.
- **Phân quyền xem tài sản theo vai trò:** Người dùng thấy tài sản của mình · Quản lý thấy thêm cấp dưới · Admin thấy toàn công ty · Super Admin thấy toàn hệ thống.
- **Chọn người phụ trách theo cơ cấu** — khi thêm Tên miền / Email / Phần mềm, chọn người phụ trách theo cây Công ty → Phòng ban → Bộ phận (mỗi cấp có tìm kiếm).
- Form **Tên miền / Email / Phần mềm** bổ sung nhiều trường (tài khoản, SSL, chi phí, ngày mua…).

### 🏢 Tổ chức
- **Logo công ty** — tải logo cho từng công ty trong *Cơ Cấu Tổ Chức*; logo hiển thị trong sơ đồ tổ chức và trên thẻ nhân sự của công ty đó.

### 🏖️ Nghỉ phép
- **Loại phép áp dụng cho nhiều công ty** — một loại phép có thể gán cho nhiều công ty có chính sách riêng (không chọn = áp dụng tất cả).
- **Chính sách phép năm theo công ty** — cộng phép tự động chọn đúng chính sách theo Công ty + Hình thức lao động.
- **Quỹ Phép Nhân Sự**: sửa lại cách tính "đã cộng / đã dùng" cho chính xác, lọc theo công ty, thêm thẻ tổng quan và **xuất Excel**.

### 🧑‍🤝‍🧑 Người dùng
- **Logo công ty trên thẻ nhân sự** (chế độ xem Thẻ) ở góc phải mỗi card.

### 📘 Trung Tâm Trợ Giúp
- **Trợ giúp theo ngữ cảnh** — nút **?** trên thanh trên cùng mở đúng trang hướng dẫn của module bạn đang xem.
- Thêm **widget phản hồi** cuối mỗi trang và lối tắt **mở Ticket Hỗ trợ**.

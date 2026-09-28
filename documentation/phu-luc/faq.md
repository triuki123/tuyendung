# Câu hỏi thường gặp (FAQ)

Tổng hợp các câu hỏi phổ biến khi sử dụng FADO AssetFlow. Nếu gặp sự cố cụ thể, xem thêm [Xử lý sự cố](/phu-luc/xu-ly-su-co).

## Đăng nhập & tài khoản

**Tôi quên mật khẩu, làm sao lấy lại?**
Trên màn hình đăng nhập, nhấn **"Quên mật khẩu?"**, nhập email công ty. Bạn sẽ nhận email chứa link đặt lại mật khẩu (có hạn 24 giờ).

**Tôi không đăng nhập được dù nhập đúng mật khẩu?**
Có thể tài khoản bị khóa (`status` không phải `active`) hoặc email gõ sai. Liên hệ Admin để kiểm tra trạng thái tài khoản.

**Làm sao đổi mật khẩu khi đang đăng nhập?**
Vào **Hồ sơ cá nhân** và chọn đổi mật khẩu.

## Quyền & menu

**Vì sao tôi không thấy một số menu/module?**
Hệ thống phân quyền theo **vai trò** (RBAC). Mỗi vai trò chỉ thấy các module được cấp quyền. Nếu cần truy cập một chức năng, đề nghị Admin/Super Admin cấp quyền cho vai trò của bạn. Xem [Phân quyền](/bat-dau/phan-quyen).

**Có những vai trò nào?**
Bốn vai trò chính: **Super Admin**, **Admin**, **Quản lý**, **Người dùng**. Quyền chi tiết được cấp theo từng module.

**Cấu hình Ticket nằm ở đâu, sao tôi (Admin) không vào được?**
Lối vào **Cấu hình Ticket** (`/tickets/admin/config`) chỉ hiển thị với **Super Admin**. Admin thường không thấy mục này theo thiết kế.

## Chấm công

**Tôi đã điểm danh trên máy nhưng bảng công không hiển thị?**
Thường do mã chấm công (PIN) trên máy chưa được khớp với hồ sơ của bạn. Báo Admin **gán mã** hoặc cập nhật **Mã nhân viên** cho trùng PIN.

**Giờ vào/ra hiển thị sai?**
Kiểm tra **múi giờ trên máy chấm công** đã đặt GMT+7 chưa (báo IT).

**Bù công, tăng ca khác nhau thế nào?**
**Bù công** là khai báo cho lần quên/lỗi chấm công (ví dụ quên vân tay). **Tăng ca** là thời gian làm thêm ngoài ca chuẩn. Xem [Thuật ngữ](/phu-luc/thuat-ngu).

## Ticket & công việc

**Ticket và Task khác gì nhau?**
**Ticket** là yêu cầu hỗ trợ / tác vụ nội bộ toàn doanh nghiệp. **Task (Công việc)** là đầu việc được giao và theo dõi tiến độ. Cả hai đều có thể gửi thông báo cập nhật qua Telegram.

**Tôi có nhận được thông báo khi ticket/task thay đổi không?**
Có — trong ứng dụng, và qua **Telegram** nếu bạn đã liên kết.

## Thông báo

**Làm sao nhận thông báo qua Telegram?**
Liên kết **Telegram Chat ID** trong hồ sơ cá nhân.

**Tôi không nhận được email/thông báo?**
Xem [Xử lý sự cố](/phu-luc/xu-ly-su-co).

## Tệp đính kèm

**Tải ảnh/tệp lên bị lỗi?**
Kiểm tra dung lượng và định dạng tệp; thử lại với mạng ổn định. Nếu vẫn lỗi, báo IT. Xem [Xử lý sự cố](/phu-luc/xu-ly-su-co).

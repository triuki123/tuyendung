# Xử lý sự cố

Các sự cố thường gặp, trình bày theo mẫu **Triệu chứng → Nguyên nhân → Cách xử lý**. Nếu không tự khắc phục được, liên hệ Admin/IT kèm mô tả chi tiết.

## Không đăng nhập được

**Triệu chứng:** nhập email + mật khẩu nhưng không vào được, hoặc báo sai thông tin.

**Nguyên nhân thường gặp:**
- Sai email hoặc mật khẩu.
- Tài khoản bị khóa / chưa kích hoạt (`status` không phải `active`).
- Quên mật khẩu.

**Cách xử lý:**
1. Kiểm tra lại email công ty và mật khẩu (chú ý phím Caps Lock).
2. Dùng **"Quên mật khẩu?"** để đặt lại qua email.
3. Nếu vẫn không được, nhờ Admin kiểm tra trạng thái tài khoản.

## Không thấy module / menu

**Triệu chứng:** thiếu một số mục trong sidebar so với đồng nghiệp.

**Nguyên nhân:** vai trò của bạn chưa được cấp quyền cho module đó (RBAC). Một số mục (như Cấu hình Ticket) chỉ dành cho Super Admin.

**Cách xử lý:** đề nghị Admin/Super Admin cấp quyền module cho vai trò của bạn. Xem [Phân quyền](/bat-dau/phan-quyen).

## Máy chấm công không đẩy dữ liệu

**Triệu chứng:** máy hiển thị **Offline** trong webapp, bảng công không có dữ liệu mới.

**Nguyên nhân & cách xử lý:**
- Máy không ra được Internet → kiểm tra mạng văn phòng, thử truy cập `assetflow.fadoai.com`.
- Cấu hình sai trên máy → kiểm tra Server Address `assetflow.fadoai.com`, Path `/api/attendance/adms`, cổng `443` (hoặc `80` với máy không HTTPS).
- Máy đời cũ dùng HTTP nhưng proxy ép redirect HTTPS → nhờ IT mở route HTTP passthrough cho đường dẫn ADMS.

## Đã chấm công nhưng dữ liệu không hiển thị

**Triệu chứng:** máy Online, có chấm công nhưng bảng công của nhân viên trống.

**Nguyên nhân:** mã/PIN trên máy chưa khớp với nhân viên nào (chưa có mapping).

**Cách xử lý:** Admin vào danh sách **mã chưa gán** và gán mã cho đúng nhân viên; hoặc cập nhật **Mã nhân viên** trùng PIN để lần sau tự khớp.

## Thông báo không tới

**Triệu chứng:** không nhận được thông báo Telegram và/hoặc email.

**Nguyên nhân & cách xử lý:**
- **Telegram:** chưa liên kết **Telegram Chat ID** trong hồ sơ → liên kết lại. Hoặc bot chưa được cấu hình → báo IT.
- **Email:** email vào hộp Spam → kiểm tra Spam. Hoặc dịch vụ gửi email chưa cấu hình → báo IT.

## Ảnh / tệp không tải lên được

**Triệu chứng:** upload avatar hoặc tệp đính kèm thất bại.

**Nguyên nhân & cách xử lý:**
- Tệp quá lớn hoặc sai định dạng → giảm dung lượng / đổi định dạng phù hợp.
- Mạng không ổn định → thử lại.
- Lỗi xử lý ảnh phía server (ví dụ module `sharp` khi đổi avatar) → báo IT kiểm tra log triển khai.

## App không truy cập được

**Triệu chứng:** `assetflow.fadoai.com` không mở (không trả 200).

**Nguyên nhân:** có thể migration deploy thất bại khiến server không khởi động.

**Cách xử lý (IT):** đọc log deployment trên Coolify tìm dòng `❌ FAILED: NNN_*.sql` và liên hệ đội kỹ thuật để xử lý migration lỗi.

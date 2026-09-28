# Thông báo cập nhật tuyển dụng qua Telegram

Các API ghi dữ liệu tuyển dụng dùng `withRecruitmentUpdate`: yêu cầu tuyển,
ứng viên/CV, lịch phỏng vấn, JD, mẫu email, onboarding và offboarding.
Đọc dữ liệu, tìm kiếm, xem CV và quét file không phát thông báo cập nhật.
Chỉ phản hồi thành công mới phát thông báo; lỗi quyền/trùng lịch không phát.

## Kích hoạt

1. Đặt `TELEGRAM_BOT_TOKEN` bằng secret môi trường máy chủ (không đưa vào mã nguồn/client).
2. Đặt `NEXT_PUBLIC_APP_URL` là URL HTTPS triển khai để nút mở ứng dụng hoạt động bên ngoài localhost.
3. Trong Cấu hình hệ thống → Người nhận, chọn người nhận HR (`hr_general`).
4. Người nhận liên kết Telegram với tài khoản và bật nhận thông báo.
5. Khởi động lại máy chủ; đảm bảo worker outbox trong `src/server.ts` đang chạy.

Tin được ghi vào hàng đợi sau cập nhật, worker gửi mỗi 30 giây và tự thử lại
khi lỗi mạng. Đây là gần thời gian thực, không phải cam kết gửi tức thì.
Không gửi nội dung CV, email, file đính kèm hoặc thông tin liên hệ trong tin tổng hợp.
Các thông báo phê duyệt/nghiệp vụ cũ vẫn được giữ cho đúng người liên quan.
Theo dõi pending/failed tại Cấu hình hệ thống → Trạng thái gửi.

Kiểm tra không gửi tin thật: `node scripts/verify-recruitment-updates.cjs`.

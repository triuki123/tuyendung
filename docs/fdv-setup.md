# FDV — FADO Visions

Mở `/nguon-nhan-luc/fdv` hoặc nút FDV trên thanh tuyển dụng.

## Kích hoạt AI

- Cấu hình `OPENAI_API_KEY` bằng secret môi trường máy chủ, không dùng `NEXT_PUBLIC_` và không đưa key vào Git/chat.
- `OPENAI_FDV_MODEL` tuỳ chọn; mặc định `gpt-4.1-mini`. Model cần hỗ trợ Responses API, Structured Outputs và web search.
- API OpenAI có chi phí riêng; ứng dụng không tự lấy key từ tài khoản ChatGPT.
- Áp dụng `migrations/303_fdv_assistant.sql` trên DB triển khai. Local: `node scripts/setup-fdv.mjs`.
- Khởi động lại Next.js để kích hoạt scheduler. Máy chủ chạy liên tục; môi trường serverless phải dùng cron/worker riêng gọi `drainFdvReminders`.

## Chức năng

Nút **Chế độ Demo** bật dữ liệu mẫu cố định cho Phân tích CV và Hỏi FDV, không
gọi OpenAI, không chấm hồ sơ thật và không tra cứu web. Kết quả luôn có nhãn DEMO.
Tắt Demo xoá kết quả giả lập và đặt lại CV/JD đã chọn. Demo không được lưu qua reload.
Công việc & nhắc hạn vẫn là thao tác/dữ liệu thật, được cảnh báo trong banner Demo.
Kiểm tra demo: `node scripts/verify-fdv-demo.mjs`.

Phân tích CV chọn từ kho đã trích xuất. TA xác nhận quyền sử dụng hồ sơ trước khi gửi nội dung sang OpenAI.
Ẩn email/số điện thoại theo regex trước gửi; đây không phải ẩn danh tuyệt đối.
API dùng `store:false`; không lưu kết quả phân tích trên hệ thống, không cam kết zero retention của nhà cung cấp.
Tối đa 24.000 ký tự CV, 8.000 ký tự/JD. Chọn một JD hoặc so sánh 10 JD đang dùng mới nhất.
Giới hạn 30 yêu cầu AI mỗi người/giờ, timeout 90 giây, tối đa 6.000 token đầu ra.

Điểm tham khảo được tính lại ở máy chủ: kỹ năng 40%, kinh nghiệm 30%, trách nhiệm 20%, kiến thức ngành 10%.
Hiển thị bằng chứng, dữ kiện còn thiếu, câu hỏi phỏng vấn. Không dùng thuộc tính nhạy cảm để chấm.
Không tự loại/tuyển ứng viên, không ghi điểm vào trạng thái ATS; TA phải xác minh với CV gốc.

Hỏi chuyên gia một lượt hoặc tra cứu web có nguồn. Câu hỏi web không tự kèm CV/JD nội bộ.
Không nhập thông tin bí mật vào câu hỏi web. FDV không tự thực hiện các chỉ dẫn trong CV/JD/web.

Công việc riêng từng tài khoản: tạo, đánh dấu hoàn thành, xoá xác nhận và nhắc trước hạn.
Lịch phỏng vấn tự tạo nhắc trước 30 phút cho người phỏng vấn, người tạo và recruiter được giao;
sửa ngày/giờ cập nhật nhắc, huỷ/xoá lịch ngừng nhắc. Công việc thủ công không đặt phòng.
Scheduler kiểm tra mỗi phút, Telegram outbox mỗi 30 giây. Cần bot token và người nhận đã liên kết/bật Telegram.
Không đảm bảo nhắc tức thì hoặc exactly-once khi tiến trình dừng/lỗi DB; kiểm tra thông báo và lịch gốc.

Tài liệu API: https://developers.openai.com/api/docs/guides/structured-outputs
và https://developers.openai.com/api/docs/guides/tools-web-search.

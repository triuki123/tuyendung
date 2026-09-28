# Giới thiệu hệ thống

**FADO AssetFlow** là hệ thống **quản lý vòng đời tài sản và vận hành nội bộ doanh nghiệp**, giao diện tiếng Việt, tập trung mọi nghiệp vụ thường ngày vào một nền tảng web duy nhất.

## Hệ thống làm được gì?

| Nhóm nghiệp vụ | Mô tả |
|----------------|-------|
| **Quản lý tài sản** | Phần cứng, phần mềm, tên miền, tài khoản email; cấp phát, thu hồi, lịch sử. |
| **Ticket hỗ trợ** | Tiếp nhận và xử lý yêu cầu hỗ trợ nội bộ (IT, hành chính…). |
| **Công việc (Tasks)** | Giao việc, theo dõi tiến độ, công việc con, bình luận, tệp đính kèm. |
| **Đặt phòng họp** | Đặt lịch phòng, tránh trùng giờ, lịch sử sử dụng. |
| **Nhân sự (C&B)** | Hồ sơ nhân viên, hợp đồng, nhắc gia hạn, tài liệu nhân sự. |
| **Nguồn nhân lực** | Yêu cầu tuyển dụng, kho CV (ATS), kho mô tả công việc, onboarding, offboarding. |
| **Chấm công & nghỉ phép** | Điểm danh, tích hợp máy chấm công, bảng công, bù công/tăng ca, phép năm. |
| **Tổ chức** | Công ty, phòng ban, chức danh, vị trí, nhãn tổ chức. |
| **Tra cứu & Lịch sử** | Tra cứu tài sản, văn bản, thông báo; nhật ký hoạt động toàn hệ thống. |

## Kiến trúc tổng quan (cho IT)

- **Nền tảng:** Next.js (App Router) + React + TypeScript.
- **Cơ sở dữ liệu:** PostgreSQL (self-hosted).
- **Realtime:** Server-Sent Events (SSE) cho thông báo và cập nhật tức thời.
- **Tích hợp:** Telegram (thông báo), máy chấm công ZKTeco/Ronald Jack (giao thức ADMS).
- **Truy cập:** trình duyệt web tại `https://assetflow.fadoai.com`.

## Cách dùng tài liệu này

1. **Mới bắt đầu?** Đọc lần lượt mục [Bắt đầu](/bat-dau/dang-nhap): đăng nhập → giao diện chung → phân quyền.
2. **Cần làm một việc cụ thể?** Vào [Cẩm nang chức năng](/chuc-nang/dashboard) theo đúng module.
3. **Muốn lối đi nhanh theo công việc của mình?** Xem [Hướng dẫn theo vai trò](/vai-tro/nguoi-dung-cuoi).
4. **Gặp trục trặc?** Xem [Xử lý sự cố](/phu-luc/xu-ly-su-co) hoặc [FAQ](/phu-luc/faq).

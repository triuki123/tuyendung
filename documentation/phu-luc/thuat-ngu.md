# Bảng thuật ngữ

Giải thích các thuật ngữ và viết tắt xuất hiện trong FADO AssetFlow.

| Thuật ngữ | Giải thích |
|---|---|
| **RBAC** | *Role-Based Access Control* — phân quyền theo vai trò. Quyền truy cập từng module được cấp theo vai trò của người dùng, không gán trực tiếp cho từng người. |
| **Vai trò (Role)** | Nhóm quyền của người dùng. Bốn vai trò chính: **Super Admin**, **Admin**, **Quản lý**, **Người dùng**. |
| **Super Admin** | Vai trò cao nhất; truy cập mọi module kể cả cấu hình hệ thống (ví dụ Cấu hình Ticket). |
| **Admin** | Quản trị viên nghiệp vụ; quản lý phần lớn module nhưng không thấy một số mục dành riêng Super Admin. |
| **Module** | Một nhóm chức năng của hệ thống (Tài sản, Ticket, Chấm công, Nhân sự...). Quyền được cấp theo từng module. |
| **ADMS** | *Automatic Data Master Server* — giao thức để máy chấm công ZKTeco/Ronald Jack **đẩy (push)** dữ liệu chấm công ra server qua HTTP/HTTPS. |
| **Pull (kéo)** | Chế độ server **chủ động kết nối vào máy** chấm công (TCP/IP) để lấy dữ liệu; yêu cầu server cùng mạng LAN với máy. |
| **Push (đẩy)** | Chế độ máy **chủ động gửi dữ liệu ra** server (qua ADMS); phù hợp khi server đặt trên cloud. |
| **Mapping (gán mã)** | Liên kết mã chấm công/PIN trên máy với nhân viên trong hệ thống, để dữ liệu chấm công hiển thị đúng người. |
| **PIN / Mã chấm công** | Mã định danh nhân viên trên máy chấm công. Nếu trùng **Mã nhân viên** trong hệ thống thì tự khớp (auto-map). |
| **SN (Serial Number)** | Số serial của máy chấm công, dùng làm **Mã máy** khi khai báo máy trong webapp. |
| **Bù công** | Khai báo điều chỉnh khi nhân viên quên/lỗi chấm công, để bổ sung dữ liệu công thiếu. |
| **Tăng ca** | Thời gian làm thêm ngoài ca làm việc chuẩn. |
| **Onboarding** | Quy trình tiếp nhận nhân viên mới (tạo hồ sơ, cấp tài sản, tài khoản...). |
| **Offboarding** | Quy trình nghỉ việc (thu hồi tài sản, vô hiệu tài khoản...). |
| **ATS** | *Applicant Tracking System* — hệ thống theo dõi ứng viên trong quy trình tuyển dụng. |
| **JD** | *Job Description* — bản mô tả công việc của một vị trí tuyển dụng. |
| **CV** | *Curriculum Vitae* — hồ sơ ứng viên. |
| **Ticket** | Yêu cầu hỗ trợ / tác vụ nội bộ toàn doanh nghiệp, hướng tới mô hình xử lý công việc kiểu ERP. |
| **Task (Công việc)** | Đầu việc được giao cho nhân viên, theo dõi trạng thái và tiến độ. |
| **SSE** | *Server-Sent Events* — kỹ thuật server đẩy dữ liệu realtime về trình duyệt (dùng cho cập nhật chấm công, thông báo tức thời). |
| **Migration** | Tệp SQL đánh số thứ tự (`migrations/NNN_*.sql`) thay đổi cấu trúc database; chạy một lần khi triển khai. |
| **reconcile.sql** | Tệp SQL dựng/đồng bộ schema chạy **sau** các migration đánh số khi khởi động; mọi thay đổi constraint phải cập nhật cả hai nơi. |
| **Distribution List** | Nhóm mail — danh sách địa chỉ email nhận chung một thư. |
| **Coolify** | Nền tảng PaaS self-hosted dùng để build và triển khai ứng dụng từ GitHub. |
| **Standalone** | Chế độ đóng gói của Next.js tạo bản chạy độc lập, dùng khi triển khai bằng Docker. |

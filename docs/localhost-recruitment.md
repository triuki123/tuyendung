# Localhost Tuyển dụng

Mở PowerShell tại `D:\TA\FADOAssetFlowPro`:

```powershell
npm.cmd run restart:local
```

Mở http://localhost:4028/nguon-nhan-luc/kho-ung-vien hoặc http://localhost:4028/nguon-nhan-luc/tinh-hinh-tuyen-dung.

Nếu chưa có máy chủ nào đang chạy, có thể dùng `npm.cmd run dev`.

`restart:local` xác minh và dừng đúng tiến trình của dự án trên cổng 4028, rồi mở máy chủ mới ở nền. Cơ chế khóa ngăn hai máy chủ cùng ghi cache khi đang khởi động. Log tại `logs/localhost.log`; cache Next tại `.next-recruitment-dev`; npm cache và thư mục tạm ở `D:\TA\.cache\npm` và `D:\TA\.temp`.

Máy chủ tự làm nóng Kho CV, Tổng quan và các API cần thiết một lần lúc khởi động. Khi log hiện `[warmup] Recruitment pages and APIs are ready.`, các trang đã biên dịch xong. Các lần đổi code vẫn cần biên dịch lại phần vừa sửa.

Chế độ `NEXT_PUBLIC_RECRUITMENT_FOCUS=true` sử dụng Tổng quan tuyển dụng nhẹ, đọc dữ liệu CV và yêu cầu tuyển thực tế; không yêu cầu các bảng chấm công, hợp đồng hay onboarding của hệ thống nhân sự đầy đủ. Quyền truy cập vẫn được xác minh bằng phiên đăng nhập.

Kiểm tra bằng trình duyệt Edge headless:

```powershell
node scripts/verify-recruitment-local.mjs
```

Bài kiểm tra xác minh đăng nhập local giữ đúng trang đang mở, tải dữ liệu, reload liên tiếp, mở Thêm CV tại chỗ và phục hồi sau lỗi đăng nhập. Bài kiểm tra không tạo/xóa hồ sơ ứng viên.

# Chrome Web Store listing

## Tên
AssetFlow CV Collector

## Mô tả ngắn
Đọc thông tin ứng viên từ trang hiện tại và mở bản nháp trong Kho Ứng Viên AssetFlow.

## Mô tả chi tiết
AssetFlow CV Collector hỗ trợ bộ phận tuyển dụng đưa hồ sơ đang xem vào AssetFlow nhanh hơn.

- Chỉ đọc tab hiện tại sau khi người dùng chủ động đồng ý.
- Gợi ý họ tên, email, số điện thoại, vị trí và kỹ năng.
- Cho phép kiểm tra, chỉnh sửa và phân loại trước khi lưu.
- Không đọc mật khẩu, cookie hoặc tab chạy nền.

Extension dành cho tổ chức đang sử dụng AssetFlow. Người dùng cần đăng nhập AssetFlow để lưu hồ sơ.

## Single purpose
Tạo bản nháp ứng viên trong Kho Ứng Viên AssetFlow từ hồ sơ đang được người dùng xem.

## Giải trình quyền
- `activeTab`: đọc duy nhất trang người dùng đang xem sau khi họ bấm extension.
- `scripting`: chạy hàm trích xuất trường hồ sơ từ nội dung hiển thị.
- `storage`: lưu URL AssetFlow và trạng thái đồng ý đọc trang.
- `tabs`: mở tab AssetFlow ở chế độ nền để lưu bằng phiên đăng nhập của chính người dùng và tự đóng khi hoàn tất.
- `unlimitedStorage`: giữ tạm file CV trong lúc chuyển giữa TopCV và AssetFlow; dữ liệu tạm được xóa ngay sau khi xử lý.
- Quyền truy cập `tuyendung.topcv.vn`: hiển thị nút nhập trên từng hồ sơ và đọc đúng khối ứng viên khi người dùng bấm.
- Quyền truy cập `assetflow.fadoai.com`: gửi hồ sơ vào API Kho CV bằng phiên đăng nhập AssetFlow hiện tại.

## Privacy
- Chính sách: https://assetflow.fadoai.com/chrome-extension-privacy.html
- Dữ liệu xử lý: thông tin nhận dạng cá nhân, nội dung website, URL trang.
- Không dùng quảng cáo, không bán hoặc chuyển dữ liệu cho bên thứ ba.

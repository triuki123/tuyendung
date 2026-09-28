# Cấu hình Chấm công

Khu vực cấu hình của module Chấm công gồm **2 phần**: quản lý **máy chấm công** và cấu hình **loại phép & chính sách phép năm**.

::: info Tóm tắt nhanh
- **Máy chấm công:** `/tra-cuu/du-lieu-cong/cau-hinh` (quyền `cham-cong-machines`).
- **Loại phép:** `/tra-cuu/du-lieu-cong/nghi-phep/cau-hinh` (quyền `cham-cong-leave-config`).
- **Ai dùng được:** Super Admin, Admin (theo phân quyền module con của Chấm công).
:::

## Cấu hình máy chấm công

Trang **Quản lý máy chấm công** dùng để thêm, sửa và kiểm tra kết nối với máy chấm công (ZKTeco / Ronald Jack).

![Trang Cấu hình Chấm công](/screenshots/quan-tri/cau-hinh-cham-cong.png)

### Hai chế độ kết nối

| Chế độ | Cách hoạt động |
|--------|----------------|
| **Pull** | Hệ thống chủ động kết nối tới IP/cổng của máy để lấy dữ liệu. Hỗ trợ **kiểm tra kết nối** trước khi lưu. |
| **Push (ADMS)** | Máy tự **gửi** dữ liệu về server qua giao thức ADMS — không cần mở cổng vào, an toàn khi kết nối qua domain. |

### Thêm máy (chế độ Pull)
1. Nhấn **Thêm** trên danh sách máy.
2. Nhập **mã máy**, **tên** (vd: *Ronald Jack - VP A*).
3. Chọn chế độ **Pull**.
4. Nhập **IP / Domain** và **cổng** (port).
5. Chọn hãng (vd **ZKTeco**), nhập **khóa giao tiếp**, vị trí lắp đặt.
6. Nhấn **Kiểm tra kết nối** để xác nhận, rồi **Lưu**.

### Thêm máy (chế độ Push / ADMS)
1. Chọn chế độ **Push (ADMS)**.
2. Trên **máy chấm công**, khai báo Server theo hướng dẫn hiển thị trên màn hình (domain + Port 443, bật HTTPS).
3. Nhập thông tin tham chiếu (host) rồi **Lưu**; máy sẽ tự gửi dữ liệu lên.

Chi tiết kết nối phần cứng và xử lý sự cố máy chấm công: liên hệ IT.

## Quy Tắc Chấm Công (theo công ty, theo ngày hiệu lực)

Ngay trong trang **Cấu Hình Máy Chấm Công**, Super Admin có khối **Quy Tắc Chấm Công** để tùy chỉnh giờ làm, kỳ công, deadline, khung tăng ca… **theo từng công ty**. Mỗi lần lưu tạo một **phiên bản có hiệu lực từ ngày chỉ định** — không ảnh hưởng số liệu kỳ đã chốt.

::: info Chọn phạm vi
Ở đầu khối, chọn **Phạm vi áp dụng**: *Mặc định toàn hệ thống* (fallback khi công ty chưa có riêng) hoặc một công ty cụ thể.
:::

### Các nhóm cấu hình

| Nhóm | Nội dung |
|------|----------|
| **Kỳ công** | Ngày bắt đầu / kết thúc kỳ (theo tháng dương lịch hoặc cross-month, vd 28→27). |
| **Giờ làm & nghỉ trưa** | Giờ nghỉ trưa, ngưỡng đủ 1 ngày công (phút). |
| **Khung phân loại lượt chấm** | Khung giờ nhận diện Vào / Ra. |
| **Deadline & quy tắc bù công** | Hạn gửi Bù Công/Bù Giờ · **Thời gian tự gửi Bảng Công** · giờ sớm nhất gửi bù công trong ngày. |
| **🆕 Giờ làm trong tuần** | Bật/tắt ngày làm và đặt **giờ vào–ra riêng cho từng thứ** (T2…CN). Ngày tắt = nghỉ. |
| **🆕 Khung buổi sáng / chiều** | Khung giờ sáng & chiều — dùng cho nghỉ phép nửa buổi. |
| **Khung tăng ca** | Khung tối / đêm (giờ VN). |

::: tip 🆕 Giờ làm theo từng thứ (thay "Ngày nghỉ trong tuần")
Trước đây chỉ đánh dấu ngày nghỉ. Nay đặt được **giờ vào–ra riêng cho từng thứ** — ví dụ T2–T6 làm 08:00–17:00, T7 làm 07:00–11:00, CN nghỉ. Nhờ đó **đi trễ / về sớm** trong Hồ Sơ Chuyên Cần tính đúng theo ca thực của từng ngày.
:::

::: tip 🆕 Thời gian tự gửi Bảng Công & "tháng kế tiếp"
Đây là mốc hệ thống **tự chốt & gửi** bảng công của kỳ. Nếu công ty tính kỳ theo **tháng dương lịch** (vd 01–30/06) và muốn hạn rơi vào **ngày đầu tháng sau** (01/07), tick ô **"Mốc rơi vào tháng kế tiếp của kỳ"** rồi đặt Ngày = 1. Cùng cơ chế cho **Hạn gửi Bù Công**.
:::

### Lưu, sửa & xoá phiên bản
1. Ở khối **Tạo / cập nhật phiên bản cấu hình**, chọn **Ngày hiệu lực** (nên là ngày bắt đầu kỳ công), chỉnh các nhóm rồi bấm **Lưu phiên bản**.
2. Danh sách **Phiên bản đã lưu** hiển thị theo ngày hiệu lực. Mỗi phiên bản có:
   - 🆕 Nút **Sửa** — nạp lại cấu hình + ngày hiệu lực + ghi chú vào form; lưu lại cùng ngày hiệu lực sẽ **ghi đè** phiên bản đó.
   - Nút **Xoá** — hệ thống dùng phiên bản hiệu lực trước đó (hoặc mặc định).

::: warning Không tính lại kỳ đã chốt
Cấu hình chỉ áp dụng cho kỳ công có ngày làm ≥ ngày hiệu lực. Bảng công đã gửi/chốt không bị tính lại.
:::

## Cấu hình loại phép & chính sách

Trang **Cấu Hình Nghỉ Phép** (`/tra-cuu/du-lieu-cong/nghi-phep/cau-hinh`) gồm **3 tab**:

| Tab | Nội dung |
|-----|----------|
| **Loại Phép** | Khai báo các loại nghỉ phép (phép năm, không lương, ốm...). |
| **Chính Sách** | Quy tắc cấp phép năm, mức cộng dồn, ngày tối đa... |
| **Số Dư** | Theo dõi/điều chỉnh số dư phép của nhân viên. |

### Thêm loại phép
1. Mở tab **Loại Phép**, nhấn **Thêm**.
2. Nhập tên loại phép và thuộc tính liên quan (có trừ lương, có giới hạn...).
3. **Lưu**.

::: tip Liên quan đến duyệt
Loại phép & chính sách cấu hình ở đây áp dụng cho luồng xin nghỉ và bảng công. Việc duyệt bù công/tăng ca xem [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau).
:::

---

*Liên quan:* [Chấm công & Nghỉ phép](/chuc-nang/cham-cong)

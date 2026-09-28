# Quản Lý Hồ Sơ (C&B)

Module **Quản Lý Hồ Sơ** là khu vực nghiệp vụ Compensation & Benefits: quản lý hợp đồng lao động, nhắc gia hạn tự động, lưu trữ hồ sơ – giấy tờ nhân sự và đánh giá thử việc.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/nhan-su` (menu **Quản Lý Hồ Sơ**).
- **Ai dùng được:** Super Admin, Admin (mặc định không có quyền Xóa). Quản lý / Người dùng cần được cấp quyền module `hr`.
- **4 thẻ chức năng:** Tổng quan · Hợp đồng · Đánh giá · Hồ sơ. Thẻ **Cài đặt** chỉ hiện với **Quản trị tối cao**.
:::

::: warning Không có quyền xem?
Nếu tài khoản không có quyền `Xem` trên module `hr`, trang sẽ báo *"Bạn không có quyền truy cập module Quản Lý Hồ Sơ"*. Khi đó bạn vẫn xem được hợp đồng & hồ sơ của riêng mình ở trang [Hồ sơ của tôi](/chuc-nang/ho-so-cua-toi).
:::

## Giao diện chính

![Trang Quản lý Hồ sơ (Nhân sự)](/screenshots/nhan-su/tong-quan.png)

Trang được tổ chức thành các tab; mỗi tab là một mảng nghiệp vụ riêng:

| Tab | Dùng để |
|-----|---------|
| **Tổng quan** | Thống kê hợp đồng và danh sách hợp đồng cần chú ý gia hạn. |
| **Hợp đồng** | Danh sách & lịch sử hợp đồng lao động của nhân viên. |
| **Đánh giá** | Thẻ đánh giá kết thúc thử việc. |
| **Hồ sơ** | Lưu trữ tài liệu, giấy tờ nhân sự đính kèm. |
| **Cài đặt** | Người nhận thông báo Quản Lý Hồ Sơ, cấu hình loại hợp đồng, loại hồ sơ, hình thức làm việc (**chỉ Quản trị tối cao**). |

## Tab Tổng quan

Hiển thị 4 thẻ thống kê: **Tổng hợp đồng**, **Sắp hết hạn (≤30 ngày)**, **Đã quá hạn**, **Vô thời hạn**. Bên dưới là danh sách **Cần chú ý gia hạn** — gồm hợp đồng đã quá hạn hoặc sắp hết hạn trong 30 ngày, sắp theo mức độ gấp.

## Tab Hợp đồng

### Thêm hợp đồng mới

1. Vào tab **Hợp đồng**, nhấn **Thêm mới** (cần quyền `Thêm`).
2. Chọn nhân viên, loại hợp đồng, số hợp đồng, ngày ký / hiệu lực / hết hạn, thông tin lương, ghi chú.
3. Nhấn **Lưu**. Hợp đồng để trống **ngày hết hạn** được hiểu là **vô thời hạn**.

### Nhắc gia hạn

Hệ thống tự đánh dấu hợp đồng **sắp hết hạn** (còn ≤30 ngày) và **quá hạn** để theo dõi ở tab Tổng quan. Trạng thái hợp đồng gồm: Nháp, Chờ ký, Hiệu lực, Đã gia hạn, Đã chấm dứt.

### Đính kèm & người theo dõi

Trong chi tiết hợp đồng, bạn có thể đính kèm tệp scan và thêm **người theo dõi** để nhận thông báo gia hạn.

### Tự động tạo thỏa thuận cho nhân sự mới

Trước **ngày vào làm 1 ngày**, hệ thống tự tạo sẵn **bản nháp** hai thỏa thuận cho nhân sự mới: *Thỏa thuận hợp tác* và *Thỏa thuận bảo mật thông tin (NDA)*. Bản nháp nằm ở tab Hợp đồng (trạng thái Nháp), C&B hoàn thiện nội dung và ký.

Mỗi lần tạo nháp, hệ thống gửi thông báo (in-app + Telegram) cho **người nhận thông báo Quản Lý Hồ Sơ** (cấu hình ở tab Cài đặt) và những **người theo dõi** đã gắn cho hợp đồng đó.

## Tab Đánh giá (thử việc)

Quản lý thẻ đánh giá kết thúc thử việc.

::: tip Tự động tạo
Hệ thống tự sinh thẻ đánh giá khi nhân viên còn **7 ngày** là hết thử việc (thẻ có nhãn **Auto**). Bạn cũng có thể bấm **Tạo đánh giá** để tạo thủ công.
:::

Trạng thái thẻ đánh giá: Nháp → Chờ đánh giá → Đã đánh giá → **Đạt** / **Không đạt** / **Đã gia hạn TV**.

- Thẻ đang ở trạng thái *Chờ đánh giá* / *Đã đánh giá* hiển thị badge **hạn còn lại** (đỏ khi ≤3 ngày hoặc quá hạn).
- Lọc theo trạng thái và hình thức lao động; tìm theo tên nhân viên.
- Chỉ xóa được thẻ **chưa kết luận** (chưa Đạt/Không đạt) và phải có quyền `Xóa`.

## Tab Hồ sơ

Lưu trữ tài liệu nhân sự theo hai chế độ xem: **Theo nhân viên** (chọn 1 nhân viên để xem toàn bộ giấy tờ) và **Tất cả** (toàn bộ hồ sơ).

### Tải hồ sơ lên

1. Chọn chế độ **Theo nhân viên** và chọn nhân viên (hoặc chế độ **Tất cả**).
2. Nhấn **Tải lên** (một tệp) hoặc **Tải lên đồng loạt** (nhiều tệp). Cần quyền `Sửa`.
3. Chọn loại hồ sơ, đặt tiêu đề, chọn tệp rồi lưu.

### Thao tác khác

- **Xem trước** ngay trong app với PDF, ảnh, Word, Excel/CSV.
- **Tải xuống** / **Xóa** từng tệp; ở chế độ **Tất cả** có thể chọn nhiều để **tải / xóa hàng loạt**.
- **Yêu cầu đổi hồ sơ**: nhân viên gửi yêu cầu thay tệp, người có quyền `Sửa` duyệt ngay trong tab.

## Tab Cài đặt

Chỉ hiện với **Quản trị tối cao**. Gồm:

- **Người Nhận Thông Báo Quản Lý Hồ Sơ** — chọn các tài khoản nhận thông báo (in-app + Telegram) cho các sự kiện hồ sơ, ví dụ bản nháp thỏa thuận tự tạo cho nhân sự mới. Để trống = không ai nhận thông báo chung (chỉ còn người theo dõi riêng từng hợp đồng). Người trong danh sách nhưng tắt "Bật Thông Báo" ở Phân Quyền sẽ không nhận.
- **Loại hợp đồng**, **loại hồ sơ**, **hình thức làm việc** (đánh dấu hình thức nào cần đánh giá thử việc).

## Câu hỏi thường gặp

**Vì sao một số tệp không có nút Xem trước?**
Chỉ các định dạng PDF, ảnh, Word, Excel/CSV mới xem trước được; định dạng khác chỉ có thể tải xuống.

**Đánh giá thử việc tự tạo khi nào?**
Khi còn 7 ngày là hết hạn thử việc, áp dụng cho các hình thức lao động được cấu hình *yêu cầu đánh giá*.

---

*Liên quan:* [Nguồn Nhân Lực](/chuc-nang/nguon-nhan-luc) · [Biểu mẫu](/chuc-nang/bieu-mau) · [Lịch sử](/chuc-nang/lich-su)

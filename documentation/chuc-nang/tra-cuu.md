# Tra cứu

Module **Tra Cứu** là cổng tìm kiếm và xem thông tin nội bộ của tổ chức: tài sản được cấp cho bạn, văn bản — quyết định, thông báo nội bộ, danh bạ đầu mối liên hệ và lịch sử hoạt động.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/tra-cuu` (menu **Tra Cứu**, luôn hiện cho mọi người dùng).
- **Ai dùng được:** Tất cả nhân sự. Phạm vi dữ liệu tự giới hạn theo bạn (và cấp dưới nếu là quản lý).
- **Phân hệ:** Văn Bản · Thông Báo · Tra Cứu Tài Sản · Đầu Mối Liên Hệ · Lịch Sử Hoạt Động.
:::

## Giao diện chính

![Trang Tra cứu](/screenshots/tra-cuu/tong-quan.png)

Trang gồm lưới các thẻ dẫn tới từng phân hệ tra cứu:

| Phân hệ | Đường dẫn | Dùng để |
|---------|-----------|---------|
| **Văn Bản - Quyết Định** | `/tra-cuu/van-ban` | Xem văn bản, quyết định, thông tư do công ty ban hành. |
| **Thông Báo - Truyền Thông** | `/tra-cuu/thong-bao` | Đọc bản tin nội bộ từ Phòng Nhân Sự (tự gửi Telegram khi phát hành). |
| **Tra Cứu Tài Sản** | `/tra-cuu/tai-san` | Xem tài sản bạn phụ trách — gồm Phần cứng, Tên miền, Email, Phần mềm. Phạm vi mở rộng theo vai trò. |
| **Đầu Mối Liên Hệ** | `/tra-cuu/dau-moi` | Danh sách nhân sự phụ trách từng mảng để liên hệ khi cần. |
| **Lịch Sử Hoạt Động** | `/tra-cuu/lich-su` | Xem lại việc bạn đã làm, ai giao task, ai nhắc đến bạn. |

::: info Ngoài ra
Nhóm **Dữ Liệu Chấm Công** (`/tra-cuu/du-lieu-cong`) cũng nằm trong khu vực Tra Cứu nhưng được tách thành tài liệu riêng — xem [Dữ liệu Chấm công](/chuc-nang/cham-cong).
:::

## Các phân hệ

### Văn Bản - Quyết Định
Tra cứu kho văn bản, quyết định, thông tư công ty đã ban hành. Dùng để xem nội dung và tải tài liệu liên quan công việc.

Xem chi tiết: [Văn Bản - Quyết Định](/chuc-nang/van-ban-quyet-dinh)

### Thông Báo - Truyền Thông
Bản tin nội bộ do Phòng Nhân Sự phát hành. Khi một thông báo được phát hành, hệ thống tự động gửi kèm qua Telegram.

Xem chi tiết: [Thông Báo - Truyền Thông](/chuc-nang/thong-bao-truyen-thong)

### Tra Cứu Tài Sản
Xem các tài sản bạn được gán phụ trách. Trang gộp **cả 4 loại tài sản** — Phần cứng, Tên miền, Tài khoản email và Phần mềm — với bộ lọc theo loại, ô tìm kiếm và thẻ tổng quan.

**Phạm vi hiển thị theo vai trò:**

| Vai trò | Thấy được |
|---------|-----------|
| **Người dùng** | Tài sản được gán cho chính mình |
| **Quản lý** | Của mình **+ của cấp dưới** (theo sơ đồ quản lý) |
| **Admin** | **Toàn bộ tài sản công ty** của mình |
| **Super Admin** | **Toàn bộ tài sản hệ thống** |

Khi có quyền rộng hơn, giao diện hiện thêm tab thứ hai ("Cấp dưới" / "Toàn công ty" / "Toàn hệ thống") bên cạnh tab "Của tôi".

Đây là chế độ **chỉ xem**; việc cấp phát/chỉnh sửa và gán người phụ trách thực hiện trong module [Quản lý Tài sản](/chuc-nang/tai-san).

::: tip Tài sản chỉ hiện khi đã gán người phụ trách
Một tài sản xuất hiện ở đây khi nó đã được gán **người phụ trách** (hoặc thuộc công ty bạn quản lý). Tài sản cũ chưa gán sẽ không hiện cho tới khi được cập nhật người phụ trách trong Quản lý Tài sản.
:::

### Đầu Mối Liên Hệ
Danh bạ nhân sự phụ trách từng mảng (ai liên hệ về việc gì), giúp tìm đúng người khi cần phối hợp.

Xem chi tiết: [Đầu Mối Liên Hệ](/chuc-nang/dau-moi-lien-he)

### Lịch Sử Hoạt Động
Dòng thời gian các hoạt động liên quan đến bạn: việc bạn đã thực hiện, task được giao, lần bạn được nhắc đến.

## Câu hỏi thường gặp

**Vì sao tôi chỉ thấy một phần tài sản / dữ liệu?**
Tra Cứu tự lọc theo phạm vi của bạn. Quản lý thấy thêm dữ liệu của cấp dưới; người dùng thường chỉ thấy phần của mình.

**Tôi không thấy menu Tra Cứu?**
Module này luôn hiển thị cho mọi vai trò. Nếu không thấy, hãy đăng nhập lại hoặc liên hệ Admin.

---

*Liên quan:* [Quản lý Tài sản](/chuc-nang/tai-san) · [Dữ liệu Chấm công](/chuc-nang/cham-cong) · [Lịch sử](/chuc-nang/lich-su)

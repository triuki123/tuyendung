# Đặt Phòng Họp

Module **Đặt Phòng Họp** giúp nhân viên đặt phòng họp trực tuyến, tránh trùng lịch và theo dõi lịch sử sử dụng phòng. Giao diện hiển thị theo vai trò: người dùng đặt phòng cá nhân, quản trị viên có thêm duyệt/quản lý phòng.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/room-bookings` (menu **Đặt Phòng Họp** ở nhóm *Hoạt Động*).
- **Lịch sử:** `/room-bookings/usage-history`.
- **Ai dùng được:** Mọi người dùng (đặt phòng); quản trị viên có thêm chức năng duyệt và quản lý phòng.
- **Trạng thái lượt đặt:** Chờ duyệt · Đã duyệt · Từ chối.
:::

## Giao diện chính

![Trang Đặt phòng họp](/screenshots/dat-phong/tong-quan.png)

Màn hình hiển thị lịch các lượt đặt phòng. Mỗi lượt đặt thể hiện phòng, khung giờ và trạng thái (Chờ duyệt / Đã duyệt / Từ chối). Có chú thích màu để phân biệt trạng thái.

## Thao tác chính

### Đặt phòng họp

1. Nhấn nút **đặt phòng**.
2. Trong cửa sổ đặt phòng, điền:
   - **Phòng Họp** — chọn phòng.
   - **Ngày Đặt Phòng**.
   - **Giờ Bắt Đầu** và **Giờ Kết Thúc**.
   - **Nội Dung Cuộc Họp** — mô tả mục đích.
   - **Số Lượng Người Tham Dự** và (tùy chọn) chọn người tham dự.
3. Hệ thống tự **kiểm tra trùng giờ** với các lượt đặt khác của cùng phòng.
4. Nhấn lưu để gửi yêu cầu đặt phòng.

::: warning Tránh trùng giờ
Nếu khung giờ bạn chọn **chồng lấn** với một lượt đặt đã có ở cùng phòng, hệ thống sẽ cảnh báo. Hãy đổi giờ hoặc chọn phòng khác trước khi lưu.
:::

::: info Quy tắc trùng giờ
Hai lượt đặt được coi là trùng khi: *giờ bắt đầu của lượt này < giờ kết thúc của lượt kia* **và** *giờ kết thúc của lượt này > giờ bắt đầu của lượt kia*.
:::

### Duyệt yêu cầu (quản trị viên)

1. Quản trị viên xem các lượt **Chờ duyệt**.
2. Bấm vào một lượt đặt (ở cả ba kiểu xem **Lịch · Bảng · Lưới**) để mở cửa sổ chi tiết: xem thông tin, kiểm tra xung đột phòng, **Duyệt Ngay** hoặc **Từ Chối** (có thể nhập lý do), hoặc **Sửa**.

::: tip Duyệt nhanh ngay trên Telegram
Khi có người đặt phòng mới, người nhận thông báo (cấu hình ở mục **Cấu Hình Phòng Họp**) nhận tin nhắn Telegram kèm hai nút **✅ Duyệt** / **❌ Từ chối** và nút **Xem chi tiết**. Bấm thẳng trên Telegram là lượt đặt được xử lý ngay, không cần mở web. Nếu từ chối qua Telegram mà không nhập lý do, hệ thống ghi mặc định *"Phòng họp không khả dụng"*.
:::

::: warning Sửa lượt đã duyệt = duyệt lại
Khi người đặt **chỉnh sửa** một lượt đã được duyệt (đổi phòng/giờ/người tham dự), lượt đó tự chuyển về **Chờ duyệt** và gửi lại yêu cầu cho người duyệt.
:::

### Hủy lượt đặt

1. Mở chi tiết lượt đặt.
2. Chọn **Hủy** và nhập lý do hủy (nếu được yêu cầu).
3. Xác nhận — lượt đặt được gỡ khỏi lịch.

### Xem lịch sử sử dụng phòng

1. Truy cập `/room-bookings/usage-history` (**Lịch Sử Sử Dụng Phòng**).
2. Xem thống kê và lịch sử các lượt sử dụng phòng theo thời gian.

![Lịch sử sử dụng phòng họp](/screenshots/dat-phong/lich-su.png)

Xem thêm trang phân tích: [Hiệu Suất Phòng Họp](/chuc-nang/hieu-suat-phong-hop)

## Cấu Hình Phòng Họp (chỉ Quản trị tối cao)

Ở cuối trang Đặt Phòng Họp, **Quản trị tối cao** thấy nút **⚙️ Cấu Hình Phòng Họp**. Mở ra gồm 2 tab:

- **Người Nhận Thông Báo** — chọn các tài khoản sẽ nhận thông báo (in-app + Telegram kèm nút Duyệt/Từ chối) mỗi khi có lượt đặt phòng mới chờ duyệt. Để trống sẽ dùng tài khoản quản trị tối cao mặc định.
- **Quản Lý Phòng** — thêm/sửa/ẩn danh sách phòng họp.

::: info Điều kiện nhận thông báo
Một người chỉ thực sự nhận được thông báo khi tài khoản của họ **bật "Bật Thông Báo"** trong phần Phân Quyền người dùng. Nếu tắt, dù có trong danh sách Người Nhận Thông Báo cũng sẽ không nhận.
:::

## Ai nhận thông báo khi nào?

| Sự kiện | Người đặt | Người tham dự | Người nhận (cấu hình) |
|---------|:---------:|:-------------:|:---------------------:|
| Tạo lượt đặt mới | — | ✅ | ✅ (kèm nút Duyệt/Từ chối) |
| Được **duyệt** | ✅ | ✅ | — |
| Bị **từ chối** | ✅ | ✅ | — |
| Người đặt **sửa** (duyệt lại) | — | ✅ | ✅ |
| **Hủy** / **Xác nhận đã dùng** | ✅ | ✅ | ✅ |

Mọi thông báo đều gửi **đồng thời in-app và Telegram** (nếu tài khoản đã liên kết Telegram và bật thông báo).

## Câu hỏi thường gặp

**Vì sao tôi không đặt được phòng vào khung giờ mong muốn?**
Khung giờ đó đã có lượt đặt khác cho cùng phòng. Hãy chọn khung giờ trống hoặc một phòng khác.

**Đặt phòng xong có cần chờ duyệt không?**
Tùy cấu hình: một số lượt đặt ở trạng thái *Chờ duyệt* cho đến khi quản trị viên duyệt. Bạn theo dõi trạng thái ngay trên lịch.

**Tôi đặt nhầm thì xử lý thế nào?**
Mở lượt đặt và chọn **Hủy**. Nếu lượt đã được duyệt, có thể cần quản trị viên hỗ trợ hủy/sửa.

---

*Liên quan:* [Công Việc](/chuc-nang/cong-viec) · [Dashboard](/chuc-nang/dashboard)

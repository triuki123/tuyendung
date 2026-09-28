# Kho / Xưởng

Module quản lý **công nhân kho & xưởng sản xuất**: chấm công bằng ảnh mặt + GPS, ghi sản lượng theo sản phẩm, quản lý vật tư, duyệt nghỉ phép / ứng lương, bảng tin nội bộ và báo cáo tháng.

Khác với chấm công văn phòng, công nhân kho **không dùng tài khoản AssetFlow**. Họ đăng nhập vào một mini-app riêng bằng **số căn cước + mã PIN 6 số**, không cần email, chạy tốt trên điện thoại phổ thông.

::: info Ai dùng được
| Vai trò | Vào đâu | Làm gì |
|---|---|---|
| **Công nhân** | `assetflow.fadoai.com/warehouse` | Chấm công, xem bảng công, xem sản lượng, đọc bảng tin, xin nghỉ / ứng lương |
| **Quản lý kho / Admin** | Menu **Kho / Xưởng** trong app chính | Tạo kho, cấu hình, quản lý công nhân, duyệt yêu cầu, xuất báo cáo |
| **Màn hình cổng kho** | `/warehouse/gate?wh=MÃ_KHO` | Hiện mã QR động cho công nhân quét khi GPS lỗi |
:::

::: warning Bắt buộc có quyền
Module này dùng RBAC **nghiêm ngặt**: không được tick quyền **Xem** của module *Kho / Xưởng* thì không thấy dữ liệu — **kể cả Super Admin**. Quyền **Thêm** (tạo kho) và **Sửa** (cấu hình kho) là hai quyền **tách biệt**. Xem thêm ở [Phân quyền](/bat-dau/phan-quyen).
:::

## Phần 1 — App của công nhân

### Đăng nhập

Công nhân mở `assetflow.fadoai.com/warehouse` trên điện thoại (nên **Thêm vào màn hình chính** để dùng như một app).

1. Nhập **số căn cước** (do quản lý kho khai khi tạo hồ sơ công nhân).
2. Nhập **mã PIN 6 chữ số**.
3. Lần đăng nhập đầu tiên, hệ thống **bắt buộc đổi PIN mới** trước khi vào.

### Chấm công (tab Chấm công)

Chấm công kho có **2 lớp kiểm soát**, chặt hơn chấm công văn phòng:

1. **Vị trí GPS** — công nhân phải đứng trong **bán kính** đã cấu hình quanh kho (ví dụ 100m) và bật định vị. Nếu kho chưa khai toạ độ thì bỏ qua bước kiểm tra này.
2. **Ảnh mặt** — **bắt buộc chụp ảnh bằng camera trước** ngay lúc bấm. Không thể chọn ảnh có sẵn trong thư viện, nên không chấm hộ được.

Bấm **Check-in (chụp ảnh)** khi vào ca và **Check-out (chụp ảnh)** khi hết ca. Có thể chọn **ca làm việc**, hoặc để *Theo ca mặc định* của kho.

::: tip GPS lỗi thì làm sao?
Trong xưởng có mái tôn, tầng hầm hoặc máy cũ, GPS hay chập chờn. Khi đó bấm **GPS lỗi? Quét QR tại cổng kho** rồi quét mã QR đang hiển thị trên màn hình treo ở cổng. Quét xong, hệ thống **bỏ qua kiểm tra GPS** — nhưng **vẫn bắt buộc chụp ảnh mặt**.

Mã QR ở cổng **tự đổi mỗi 10 phút**, nên không thể chụp màn hình gửi cho người khác chấm hộ.
:::

### Bảng công · Sản lượng · Bảng tin

- **Bảng công** — công nhân tự xem lại lịch sử vào/ra của mình trong tháng.
- **Sản lượng** — xem số lượng sản phẩm mình đã làm (do quản lý ghi nhận).
- **Bảng tin** — thông báo nội bộ do quản lý kho đăng (lịch nghỉ lễ, quy định mới…).

### Gửi yêu cầu (tab Yêu cầu)

- **Xin nghỉ** — chọn *Từ ngày* → *Đến ngày* + lý do.
- **Ứng lương** — nhập *số tiền muốn ứng* + lý do. Nút này **chỉ hiện khi kho bật tính năng ứng lương** trong cấu hình.

Yêu cầu gửi lên chờ quản lý duyệt ở tab **Duyệt** bên Warehouse Admin.

## Phần 2 — Quản lý kho (trong app chính)

Vào menu **Kho / Xưởng** để xem tổng quan tất cả kho: số công nhân, tình hình chấm công, sản lượng. Từ đây bấm **Mở Warehouse Admin** để vào khu làm việc chi tiết, hoặc **Tạo kho mới** (cần quyền *Thêm*).

### Cấu hình kho

Bấm biểu tượng cấu hình trên thẻ kho (cần quyền *Sửa*):

| Mục | Ý nghĩa |
|---|---|
| **Tên kho · Địa chỉ · Công ty chủ quản** | Thông tin định danh kho |
| **Vĩ độ (lat) · Kinh độ (lng)** | Toạ độ kho — lấy từ Google Maps |
| **Bán kính (m)** | Phạm vi cho phép chấm công quanh toạ độ trên |
| **Giữ ảnh (ngày)** | Ảnh mặt lúc chấm công tự xoá sau số ngày này |
| **Email nhận báo cáo tháng** | Nhiều email cách nhau bằng dấu phẩy |
| **Ca làm việc** | Khai các ca (tên ca + giờ) |
| **Sản phẩm** | Danh mục sản phẩm + đơn vị tính, dùng để ghi sản lượng |
| **Quản lý kho** | Gán user AssetFlow (theo email) làm quản lý kho này |
| **Ứng lương** | Bật/tắt quyền công nhân xin ứng lương |

### Các tab trong Warehouse Admin

| Tab | Dùng để |
|---|---|
| **Công nhân** | Thêm/sửa hồ sơ công nhân (căn cước, PIN), gán vào kho |
| **Chấm công** | Xem lượt chấm kèm **ảnh mặt** đã chụp, đối chiếu gian lận |
| **Sản lượng** | Ghi nhận số lượng sản phẩm từng công nhân làm được |
| **Vật tư** | Quản lý vật tư trong kho: nhập/xuất, tồn kho |
| **Xếp hạng** | Bảng xếp hạng công nhân theo sản lượng |
| **Duyệt** | Duyệt/từ chối đơn nghỉ phép & ứng lương |
| **Bảng tin** | Đăng thông báo cho công nhân đọc trong app |
| **Báo cáo** | Xuất báo cáo tháng (file Excel) |

## Màn hình QR ở cổng kho

Treo một tablet hoặc màn hình cũ ở cổng, mở đường dẫn:

```
https://assetflow.fadoai.com/warehouse/gate?wh=MÃ_KHO
```

Trang này hiện mã QR cỡ lớn, **tự làm mới mỗi phút** và **mã đổi mỗi 10 phút**. Không cần đăng nhập, cứ để mở suốt ngày.

## Câu hỏi thường gặp

**Công nhân có cần email công ty không?**
Không. Họ đăng nhập bằng **căn cước + PIN**, hoàn toàn tách khỏi hệ tài khoản nhân viên văn phòng.

**Công nhân quên PIN thì sao?**
Quản lý kho vào tab **Công nhân** đặt lại PIN. Lần đăng nhập kế tiếp công nhân sẽ bị buộc đổi PIN mới.

**Có chấm công hộ được không?**
Rất khó: phải chụp ảnh mặt bằng camera trước ngay tại thời điểm chấm (không chọn được ảnh cũ), lại phải đứng trong bán kính kho hoặc quét được mã QR ở cổng — mã này đổi 10 phút một lần.

**Ảnh mặt lưu bao lâu?**
Theo số ngày khai ở ô **Giữ ảnh (ngày)** trong cấu hình kho; quá hạn hệ thống tự xoá.

**Chấm công kho có chung dữ liệu với chấm công văn phòng không?**
Không. Đây là hệ chấm công riêng cho công nhân, không nằm trong [Dữ liệu chấm công](/chuc-nang/cham-cong) của nhân viên văn phòng.

---

*Liên quan:* [Phân quyền](/bat-dau/phan-quyen) · [Chấm công (văn phòng)](/chuc-nang/cham-cong) · [Đa công ty](/chuc-nang/da-cong-ty)

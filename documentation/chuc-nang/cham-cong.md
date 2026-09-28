# Dữ liệu Chấm công

Module **Dữ Liệu Chấm Công** là trung tâm điểm danh và quản lý công của nhân sự: chấm công vào/ra trên điện thoại, tra cứu bảng công cá nhân theo tháng, đề xuất bù công — tăng ca, xin nghỉ phép, xem bảng công đội ngũ và theo dõi chuyên cần.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/tra-cuu/du-lieu-cong` (menu **Dữ Liệu Chấm Công**, luôn hiện cho mọi người dùng).
- **Ai dùng được:** Tất cả nhân sự (chấm công, tra cứu, nghỉ phép). Một số phân hệ giới hạn theo vai trò — xem bảng bên dưới.
- **Phân hệ:** Chấm Công · Tra Cứu Dữ Liệu Công · Nghỉ Phép · Bảng Công (Quản Lý) · Hồ Sơ Chuyên Cần (Quản Lý) · Tổng Hợp (HCNS) · Cấu Hình Máy (Admin).
:::

::: tip 🆕 Thay đổi quan trọng
Bảng công **không còn nộp/duyệt thủ công**. Nhân viên chỉ cần chấm công đầy đủ; hệ thống **tự chốt & gửi bảng công** về Bộ Phận Chấm Công khi tới hạn. Quản lý xem bảng công đội ngũ ở phân hệ **Bảng Công** (chỉ xem).
:::

## Giao diện chính

![Trang Dữ liệu Chấm công](/screenshots/cham-cong/tong-quan.png)

Trang chính là lưới các thẻ dẫn tới từng phân hệ. Thẻ nào hiển thị tùy theo quyền của bạn.

| Phân hệ | Đường dẫn | Dành cho |
|---------|-----------|----------|
| **Chấm Công** | `/tra-cuu/du-lieu-cong/cham-cong` | Mọi người — điểm danh vào/ra |
| **Tra Cứu Dữ Liệu Công** | `/tra-cuu/du-lieu-cong/tra-cuu` | Mọi người — xem bảng công cá nhân |
| **Nghỉ Phép** | `/tra-cuu/du-lieu-cong/nghi-phep` | Mọi người — xin nghỉ, xem quỹ phép |
| **Bảng Công** | `/tra-cuu/du-lieu-cong/bang-cong` | Quản Lý — xem bảng công đội ngũ (chỉ xem) |
| **Hồ Sơ Chuyên Cần** | `/tra-cuu/du-lieu-cong/chuyen-can` | Quản Lý — chỉ số đúng giờ/đi trễ/về sớm, điểm chuyên cần |
| **Tổng Hợp Dữ Liệu Công** | `/tra-cuu/du-lieu-cong/tong-hop` | Phòng HCNS — tổng hợp toàn công ty |
| **Cấu Hình Máy Chấm Công** | `/tra-cuu/du-lieu-cong/cau-hinh` | Admin — gán mã máy vân tay |

::: info Cấu hình Quy Tắc Chấm Công
Ngoài các phân hệ trên, Super Admin có trang **Cấu Hình Máy Chấm Công** kèm **Quy Tắc Chấm Công** (giờ làm theo tuần, kỳ công, hạn tự gửi bảng công, khung tăng ca…). Xem [Cấu hình Chấm công](/quan-tri/cau-hinh-cham-cong).
:::

::: info Cấu hình thuộc Quản trị
Phần **Cấu Hình Máy Chấm Công** và **Cấu Hình Loại Phép** là tác vụ quản trị (gán mã máy vân tay, khai báo loại phép, chính sách cộng phép năm). Tài liệu này chỉ hướng dẫn các thao tác nghiệp vụ thường ngày; phần thiết lập do Admin thực hiện.
:::

## 1. Chấm công vào / ra

::: info Ai dùng cách này?
**Đa số nhân viên chấm công bằng máy vân tay** tại văn phòng (dữ liệu tự đẩy về — xem mục *Tra cứu dữ liệu công*). Phần **Chấm Công trên điện thoại** dưới đây chỉ dành cho **một số bộ phận đặc thù**.
:::

Trang **Chấm Công** dùng để điểm danh trực tiếp trên điện thoại. Hệ thống yêu cầu **bắt buộc cả ảnh xác nhận và vị trí GPS** mới cho chấm.

![Màn hình chấm công vào/ra: đồng hồ, GPS, ảnh xác nhận](/screenshots/cham-cong/diem-danh.png)

**Các bước chấm công:**

1. Mở **Chấm Công**. Đồng hồ hiển thị thời gian hiện tại, hai ô **Giờ Vào** / **Giờ Ra** cho biết tình trạng hôm nay.
2. Bật định vị (GPS) — ô **Vị Trí (GPS)** chuyển xanh khi lấy được tọa độ. Nếu chưa có, bấm biểu tượng làm mới để thử lại.
3. Bấm **Chụp ảnh xác nhận** — camera trước mở ra để chụp selfie. Ảnh được tự động đóng dấu thời gian và toạ độ GPS.
4. Bấm nút **Điểm Danh VÀO** (đầu ca) hoặc **Điểm Danh RA** (cuối ca). Hệ thống tự gợi ý nút phù hợp dựa trên trạng thái và giờ hiện tại.
5. Sau khi thành công, một thông báo Telegram được gửi ngay để xác nhận.

::: warning Bắt buộc ảnh + GPS
Thiếu ảnh hoặc thiếu GPS sẽ không chấm được. Trên Safari iPhone/iPad, vào *Cài đặt → Safari → Vị trí* và chọn "Hỏi" hoặc "Cho phép". GPS chỉ hoạt động trên kết nối HTTPS.
:::

::: tip Đề phòng nhầm lẫn
- Nếu sự kiện gần nhất đã là "Vào", hệ thống sẽ hỏi lại trước khi cho chấm Vào lần hai.
- Nếu hôm qua chấm Vào mà quên chấm Ra, trang sẽ cảnh báo và nhắc liên hệ quản lý để bổ sung.
- Vị trí lệch hơn 50km so với lần chấm trước sẽ hiện cảnh báo "vị trí bất thường".
- Mọi lần bấm đều được ghi lại — quản lý có thể kiểm tra, không lo nhấn nhầm.
:::

Phần **Lịch sử hôm nay** liệt kê tất cả lần chấm trong ngày, kèm nhãn nguồn: **App** (điện thoại) hoặc **Máy** (máy vân tay đẩy dữ liệu về).

## 2. Tra cứu dữ liệu công

Trang **Tra Cứu Dữ Liệu Công** cho xem lại toàn bộ chấm công của bạn theo tháng và khai bù công / tăng ca cho ngày thiếu.

![Tra cứu dữ liệu công theo tháng — tab Tổng Hợp / App / Vân Tay](/screenshots/cham-cong/bang-thang.png)

- **Chọn tháng:** dùng mũi tên trái/phải để xem các tháng khác nhau.
- **Thẻ thống kê:** số ngày có chấm công, tổng giờ làm, tổng giờ tăng ca đã duyệt.
- **Ba tab nguồn:** **Tổng Hợp** (App + Máy), **App** (chấm qua ứng dụng), **Vân Tay** (máy chấm công).
- **Realtime:** khi đang xem tháng hiện tại, dữ liệu tự cập nhật khi có lần chấm mới từ máy vân tay (chấm đỏ/xanh "Realtime"). Nút **Làm mới** để tải lại thủ công.
- **Xuất CSV:** bấm **CSV** để tải file chi tiết của tháng.

### Bảng công tự gửi — không cần nộp thủ công

Bạn **không cần bấm nộp** bảng công nữa. Việc của bạn là **chấm công đầy đủ** trong kỳ và khai bù công / tăng ca cho những ngày thiếu (nếu có). Khi tới **thời gian tự gửi** do công ty cấu hình, hệ thống **tự chốt và gửi bảng công** của kỳ về Bộ Phận Chấm Công.

::: tip Kiểm tra trước hạn
Trước thời điểm tự gửi, hãy rà lại tháng: ngày nào thiếu chấm thì khai **Bù Công**, làm thêm giờ thì khai **Tăng Ca** — vì sau khi bảng công được gửi, số liệu đã chốt. Mốc thời gian tự gửi do Super Admin cấu hình theo từng công ty (xem [Cấu hình Chấm công](/quan-tri/cau-hinh-cham-cong)).
:::

## 3. Bù công và tăng ca

Ngay trong bảng công tháng (trang Tra Cứu), mỗi ngày có nút để đề xuất **Bù Công** hoặc khai báo **Tăng Ca**. Các đề xuất này gửi tới quản lý và chỉ có hiệu lực sau khi được duyệt.

<!-- SCREENSHOT: modal Bù Công và Tăng Ca -->
::: info 📸 Ảnh minh họa
Cửa sổ **Đề Xuất Bù Công** (chọn chế độ, giờ vào/ra, lý do) và **Khai Báo Tăng Ca** (giờ bắt đầu/kết thúc, kết quả tính khung tối/đêm). *(Ảnh sẽ được bổ sung.)*
:::

### Đề xuất bù công

Bấm **Bù Công** trên ngày tương ứng, chọn một trong các chế độ:

| Chế độ | Dùng khi |
|--------|----------|
| **Bù công (chấm thiếu giờ)** | Quên hoặc thiếu chấm — đề xuất giờ vào & giờ ra |
| **Công tác** | Đi công tác — tính 1 ngày công đầy đủ |
| **Làm việc tại nhà (WFH)** | Làm tại nhà — tính 1 ngày công đầy đủ |
| **Làm theo ca** | Làm theo ca — tính 1 ngày công đầy đủ |

Nhập **lý do** rồi bấm **Gửi Yêu Cầu**. Với ba chế độ Công tác / WFH / Làm theo ca, hệ thống tự tính 1 ngày công đầy đủ nên không cần nhập giờ.

### Khai báo tăng ca

Bấm nút tăng ca trên ngày tương ứng, chọn **giờ bắt đầu** và **giờ kết thúc**. Hệ thống tự tính theo khung:

- 🌆 **Khung tối:** 17:30 – 22:00
- 🌙 **Khung đêm:** 22:00 – 07:00 (qua ngày hôm sau sẽ hiện nhãn "+1 ngày")

Nhập lý do (tùy chọn) rồi bấm **Gửi Khai Báo**. Khai báo đã được duyệt hoặc từ chối chuyển sang chế độ chỉ xem.

## 4. Nghỉ phép

Trang **Nghỉ Phép** cho theo dõi quỹ phép năm và tạo đơn xin nghỉ.

![Nghỉ phép — quỹ phép năm và đơn của tôi](/screenshots/cham-cong/nghi-phep.png)

Phần trên hiển thị **quỹ phép năm**: số ngày còn lại, đã được cộng trong năm, đã nghỉ — kèm chi tiết theo từng loại phép. Có thể chọn năm ở góc phải. Bên dưới là danh sách **Đơn nghỉ phép của tôi** với trạng thái *Chờ duyệt · Đã duyệt · Từ chối · Đã hủy*.

### Tạo đơn nghỉ phép

1. Bấm **Tạo Nghỉ Phép**.
2. Chọn **loại phép** — mỗi loại hiển thị mô tả, hình thức trả lương (công ty / BHXH / không lương), giới hạn ngày và phép năm còn lại (với loại trừ vào quỹ phép). Danh sách loại phép tự lọc theo **công ty của bạn**: loại dùng chung toàn hệ thống và loại riêng dành cho công ty bạn.
3. Chọn **hình thức nghỉ**: **Theo ngày** (chọn từ ngày → đến ngày) hoặc **Theo giờ** (chọn ngày, giờ bắt đầu, giờ kết thúc). Một số loại phép chỉ cho nghỉ trọn ngày.
   - 🆕 **Nghỉ nửa buổi:** ở hình thức *Theo giờ* có 2 nút chọn nhanh **Nghỉ buổi sáng** / **Nghỉ buổi chiều** — tự điền khung giờ buổi sáng/chiều theo cấu hình công ty (thường tính 0.5 ngày công), không cần nhập giờ tay.
4. Xem **dòng xem trước** số ngày công bị trừ (nghỉ theo ngày đã tự bỏ Chủ Nhật và ngày lễ).
5. Nhập **lý do** rồi bấm **Gửi đơn**. Đơn được gửi tới quản lý trực tiếp xét duyệt.

::: tip Hủy đơn
Đơn đang **chờ duyệt** có thể hủy. Đơn đã duyệt vẫn hủy được nếu ngày bắt đầu nằm ở tương lai.
:::

## 5. Bảng Công — xem bảng công đội ngũ (Quản Lý)

Trang **Bảng Công** cho quản lý **xem** (không duyệt) bảng công của nhân sự trong phạm vi quản lý, **nhóm theo Công Ty → Phòng Ban** giống trang Tổng Hợp.

1. Chọn tháng cần xem bằng mũi tên trái/phải.
2. Dữ liệu hiển thị theo cây **Công Ty → Phòng Ban**; mỗi phòng ban có quản lý (biểu tượng vương miện) ở đầu, kèm số ngày/giờ và trạng thái đã gửi.
3. Bấm vào một nhân viên để **xem chi tiết chấm công theo từng ngày** (giờ vào/ra, nguồn App/Máy, GPS…).
4. Dùng ô **tìm kiếm theo tên** (không cần dấu) và các bộ lọc **Công ty / Phòng ban / Trạng thái** để khoanh vùng nhanh.

::: info Phạm vi theo vai trò
- **Người dùng:** chỉ thấy bảng công của chính mình.
- **Quản lý:** thấy bản thân + toàn bộ cấp dưới (đệ quy) trong công ty.
- **Admin:** toàn bộ công ty đang làm việc.
- **Super Admin:** toàn hệ thống (mọi công ty).

Đây là **chế độ chỉ xem** — bảng công tự gửi về Bộ Phận Chấm Công khi tới hạn, không có thao tác duyệt/từ chối. Việc duyệt **Bù Công / Tăng Ca / Nghỉ Phép** vẫn ở [Duyệt yêu cầu → Duyệt Công](/chuc-nang/duyet-yeu-cau).
:::

## 5b. Hồ Sơ Chuyên Cần (Quản Lý)

Trang **Hồ Sơ Chuyên Cần** tổng hợp chỉ số chuyên cần của từng nhân sự trong phạm vi quản lý: **đúng giờ, đi trễ, về sớm, quên chấm, vắng, nghỉ phép theo loại** và **điểm & xếp loại** chuyên cần.

1. Chọn khoảng thời gian bằng preset **Tháng này · Tháng trước · Quý này · Năm nay · Tùy chỉnh** (hoặc nhập *Từ ngày / Đến ngày*).
2. Xem bảng chỉ số từng người; tìm kiếm theo tên và lọc theo **Công ty / Phòng ban / Xếp loại**, sắp xếp theo điểm/đi trễ/vắng…
3. Bấm vào một người để xem **chi tiết theo ngày** (đích danh ngày đi trễ / về sớm / vắng / nghỉ phép).

::: tip Đi trễ / về sớm tính theo giờ làm từng ngày
Chỉ số đi trễ / về sớm được tính theo **giờ ca của chính ngày đó** trong *Quy Tắc Chấm Công* (ví dụ Thứ 7 làm nửa buổi sẽ tính đúng theo khung nửa buổi). Có thể bật/tắt hiển thị hồ sơ chuyên cần cho từng người.
:::

## 6. Tổng hợp dữ liệu công (HCNS)

Trang **Tổng Hợp Dữ Liệu Công** dành cho Phòng Hành Chính Nhân Sự tiếp nhận bảng công từ các quản lý gửi về, nhóm theo công ty → phòng ban, cảnh báo bảng công bất thường (số ngày quá thấp/quá cao), ghi chú, khóa bảng công và xuất Excel toàn công ty.

<!-- SCREENSHOT: /tra-cuu/du-lieu-cong/tong-hop — bảng tổng hợp theo công ty/phòng ban -->
::: info 📸 Ảnh minh họa
Màn hình **Tổng Hợp Dữ Liệu Công**: cây công ty/phòng ban, trạng thái bảng công, công cụ chọn nhiều và xuất Excel. *(Ảnh sẽ được bổ sung.)*
:::

## Câu hỏi thường gặp

**Tôi chấm bằng máy vân tay, sao trên app không thấy giờ Vào?**
Dữ liệu máy vân tay được đẩy về định kỳ. Trang Chấm Công tự làm mới mỗi 15 giây và trang Tra Cứu cập nhật realtime. Nếu chấm bằng máy rồi, khi dùng app hãy chọn đúng **Điểm Danh RA**.

**Không chấm công được vì không lấy được GPS?**
GPS cần kết nối HTTPS và quyền truy cập vị trí. Kiểm tra cài đặt trình duyệt (đặc biệt Safari iOS) rồi bấm làm mới GPS.

**Bù công / tăng ca tôi gửi bao giờ có hiệu lực?**
Sau khi quản lý duyệt tại [Duyệt yêu cầu → Duyệt Công](/chuc-nang/duyet-yeu-cau), dữ liệu công sẽ tự cập nhật.

**Tôi có phải tự nộp bảng công không?**
Không. Bảng công **tự chốt và gửi** về Bộ Phận Chấm Công khi tới thời gian cấu hình của công ty. Bạn chỉ cần chấm công đầy đủ và khai bù công / tăng ca cho ngày thiếu **trước** thời điểm tự gửi.

**Sau khi bảng công đã gửi tôi phát hiện sai sót thì sao?**
Số liệu đã chốt khi gửi. Hãy liên hệ quản lý hoặc Phòng HCNS để được xử lý.

---

*Liên quan:* [Duyệt yêu cầu](/chuc-nang/duyet-yeu-cau) · [Tra cứu](/chuc-nang/tra-cuu) · [Hồ sơ của tôi](/chuc-nang/ho-so-cua-toi)

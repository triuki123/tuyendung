# Đa Công Ty

FADO AssetFlow hỗ trợ **một tài khoản làm việc ở nhiều công ty** trong cùng một tập đoàn. Người dùng có **một công ty chính** (gán mặc định khi tạo tài khoản) và có thể được bật làm việc thêm ở **các công ty phụ** — mỗi công ty có vai trò, phòng ban, vị trí và quyền riêng.

::: info Tóm tắt nhanh
- **Chuyển công ty đang xem:** dùng **bộ chuyển công ty** ở Topbar (ngay cạnh menu người dùng).
- **Cấu hình công ty phụ:** trong cửa sổ chỉnh sửa người dùng → tab **🏢 Đa Công Ty** (chỉ Quản trị viên / Quản trị tối cao).
- **Mọi danh sách, báo cáo, thông báo** đều được lọc theo công ty đang chọn ở Topbar.
:::

## Bộ chuyển công ty trên Topbar

Nếu tài khoản được bật ở ≥ 2 công ty, Topbar hiển thị tên công ty đang xem kèm mũi tên thả xuống. Bấm để đổi công ty đang xem — toàn bộ dữ liệu hiển thị (tài sản, công việc, hồ sơ, đặt phòng, ticket…) chuyển sang phạm vi công ty đã chọn ngay lập tức, không cần đăng nhập lại.

::: tip Công ty đang chọn được nhớ ở trình duyệt
Lần đăng nhập tiếp theo bạn mở lại đúng công ty đã chọn lần trước. Nếu công ty đó không còn được bật cho bạn, hệ thống tự đổi về công ty chính.
:::

## Cấu hình công ty phụ (Quản trị viên)

::: warning Ai làm được?
- **Quản trị tối cao** — có thể bật ở **bất kỳ công ty nào**.
- **Quản trị viên** — bật được theo phạm vi quản lý của mình.
- **Quản lý / Người dùng** — không sửa được, chỉ chuyển giữa các công ty đã được bật.
:::

Mở menu Quản lý người dùng → chọn một người dùng → mở tab **🏢 Đa Công Ty**. Tab này không hiển thị khi tài khoản đang chỉnh sửa chưa có **Công ty chính** (gán ở tab Thông Tin trước).

Với mỗi công ty muốn bật làm công ty phụ, bạn cấu hình:

| Trường | Ý nghĩa |
|--------|---------|
| **Vai trò** | Vai trò áp dụng trong công ty này (có thể khác công ty chính). |
| **Phòng ban / Bộ phận** | Cây tổ chức tại công ty đó. |
| **Vị trí** | Vị trí công việc tại công ty. |
| **Quản lý trực tiếp** | Người quản lý của người này trong công ty đó. |
| **Quyền module** | Tùy biến quyền chi tiết (tuỳ chọn — mặc định theo vai trò). |

Bấm **Lưu** — tài khoản đó ngay lập tức thấy công ty mới trong bộ chuyển ở Topbar.

::: info Công ty chính
Công ty chính được gán ở tab **Thông Tin** và **không xuất hiện ở tab Đa Công Ty**. Để đổi công ty chính, đổi ở tab Thông Tin — các công ty phụ khác giữ nguyên.
:::

## Phạm vi dữ liệu theo công ty đang chọn

Khi bạn chọn một công ty ở Topbar, hầu hết module tự lọc theo công ty đó:

- **Tài sản, Tổ chức, Nhân sự, Hồ sơ, Đánh giá** — chỉ hiện dữ liệu thuộc công ty.
- **Công việc, Tickets** — chỉ hiện do/giao cho người trong công ty.
- **Đặt phòng họp** — chỉ phòng & lượt đặt thuộc công ty.
- **Báo cáo Công việc** — đối tượng có thể chọn lọc theo công ty bạn đang xem (xem [Báo cáo Công việc](/chuc-nang/cong-viec#xuất-báo-cáo)).

::: tip Không thấy dữ liệu quen thuộc?
Trước tiên kiểm tra công ty đang chọn ở Topbar — chuyển công ty trước khi báo lỗi mất dữ liệu.
:::

## Chuyển công ty = đổi hẳn vai trò

Đây là nguyên tắc quan trọng nhất của chế độ đa công ty: **vai trò của bạn được xét tại công ty bạn đang đứng**, không phải vai trò ở công ty chính.

Khi bạn chuyển sang một công ty phụ, bạn **thoát hẳn vai** ở công ty chính. Vai trò, quyền module, phòng ban và cả **phạm vi dữ liệu được nhìn thấy** đều lấy theo công ty mới.

Ví dụ dễ hiểu: một người là **Super Admin** ở FADO Group nhưng chỉ là **Admin** ở công ty con. Khi người đó chuyển sang công ty con:

- Vai hiệu lực là **Admin** (Topbar hiển thị đúng vai này).
- Trong module **Tổ chức**, họ **chỉ thấy đúng công ty con đó** — không thấy công ty chính, cũng không thấy công ty nào khác trong tập đoàn.
- Ngược lại, khi đứng ở công ty mà vai của họ **vẫn là Super Admin**, họ mới thấy toàn bộ các công ty.

::: warning Tạo dữ liệu mới sẽ vào công ty đang đứng
Khi bạn thêm **phòng ban, chức vụ, vị trí công việc**… mà không chỉ định công ty, dữ liệu sẽ được tạo trong **công ty bạn đang chọn ở Topbar**. Hãy kiểm tra Topbar trước khi thêm mới, tránh tạo nhầm sang công ty khác.
:::

## Câu hỏi thường gặp

**Tôi đăng nhập rồi mà không thấy bộ chuyển công ty ở Topbar?**
Tài khoản của bạn chỉ thuộc một công ty. Yêu cầu Quản trị viên bật thêm công ty cho bạn ở tab Đa Công Ty.

**Mỗi công ty tôi có quyền khác nhau không?**
Có. Vai trò và quyền module được cấu hình riêng cho từng công ty. Ví dụ: bạn là Quản lý ở công ty A nhưng chỉ là Người dùng ở công ty B.

**Đổi công ty đang xem có ảnh hưởng người khác không?**
Không. Lựa chọn này lưu cục bộ ở trình duyệt của bạn, không ảnh hưởng người dùng khác.

**Tôi là Super Admin, sao chuyển sang công ty con lại không thấy các công ty khác nữa?**
Đúng như thiết kế. Vai trò được xét theo công ty bạn đang đứng: ở công ty con bạn chỉ là Admin, nên chỉ thấy công ty đó. Muốn quản trị toàn tập đoàn, hãy chuyển về công ty mà vai của bạn là Super Admin.

**Tôi là Giám đốc ở công ty con, vì sao vẫn hiện tên quản lý bên công ty chính?**
Mỗi công ty có **phân công riêng** kèm người quản lý riêng. Vào hồ sơ nhân sự → tab **Phân Công** → sửa phân công tại công ty con và để trống (hoặc chọn đúng) ô Quản lý.

---

*Liên quan:* [Người dùng & phân quyền](/quan-tri/nguoi-dung) · [Cơ cấu tổ chức](/quan-tri/co-cau-to-chuc)

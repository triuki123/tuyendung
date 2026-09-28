# Cơ cấu tổ chức

Trang **Sơ Đồ Tổ Chức** quản lý cấu trúc doanh nghiệp theo cây 3 cấp: **Công ty → Phòng ban → Bộ phận**, kèm chức danh, vị trí và người phụ trách.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/organization` (nhóm *Điều Hướng*).
- **Ai dùng được:** Super Admin, Admin tạo/sửa; Quản lý chỉ `Xem`.
- **Cấu trúc:** cây Công ty › Phòng ban › Bộ phận, hiển thị quân số và nhân sự.
:::

## Cây tổ chức

![Trang Cơ cấu tổ chức](/screenshots/quan-tri/co-cau-to-chuc.png)

Bấm biểu tượng mũi tên (›) trên mỗi dòng để bung **phòng ban · bộ phận · nhân sự**. Số bên cạnh tên là **quân số**; huy hiệu người phụ trách hiển thị trưởng đơn vị.

## Thêm / sửa / xóa

Mỗi dòng có 3 nút thao tác: **➕ thêm cấp con**, **✏️ sửa**, **🗑️ xóa**.

### Thêm công ty
1. Nhấn **Thêm Công Ty** ở góc phải header.
2. Nhập **Tên** (vd: *FADO Group*), mô tả, mã số thuế, địa chỉ, website...
3. Nhấn **Lưu**.

### Thêm phòng ban
1. Bấm nút **➕** trên dòng công ty.
2. Nhập **Tên phòng ban** (vd: *Phòng Kế Toán*), mã, mô tả, người phụ trách.
3. Nhấn **Lưu**.

### Thêm bộ phận
1. Bung phòng ban, bấm nút **➕** trên dòng phòng ban.
2. Nhập **Tên bộ phận** (vd: *Kế Toán Tổng Hợp*), mô tả.
3. Nhấn **Lưu**.

## Chức danh & vị trí

Ngoài cây tổ chức, module còn quản lý:

- **Chức danh công việc** (`/organization/job-titles`) — danh mục chức danh dùng chung.
- **Vị trí / chức vụ** (`/organization/positions`) — vị trí theo từng công ty, có thể kèm dải lương.
- **Thẻ tổ chức** (`/organization/tags`) — gắn nhãn cho công ty/phòng ban.

Các giá trị này được dùng lại khi gán cho người dùng (xem [Người dùng & phân quyền](/quan-tri/nguoi-dung)).

::: warning Xóa cẩn trọng
Xóa một công ty/phòng ban/bộ phận sẽ ảnh hưởng tới nhân sự đang gắn vào đó. Mặc định **Admin không có quyền Xóa** — thao tác này dành cho Super Admin.
:::

---

*Liên quan:* [Tổ chức (cẩm nang)](/chuc-nang/to-chuc) · [Người dùng & phân quyền](/quan-tri/nguoi-dung)

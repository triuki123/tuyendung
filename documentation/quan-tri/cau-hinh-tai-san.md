# Cấu Hình Tài Sản

Trang **Cấu Hình Tài Sản** dùng để quản trị các danh mục nền của module tài sản và cấu hình nhắc nhở bảo trì/bảo hành.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/asset-management/admin/config`.
- **Ai dùng được:** Admin và Super Admin.
- **Dùng để:** quản lý loại tài sản và cấu hình người nhận nhắc bảo trì/bảo hành.
:::

## Phần 1: Danh mục loại tài sản

Tại đây bạn có thể:

- tạo loại tài sản mới
- sửa tên hoặc quy ước loại tài sản
- ẩn hoặc xóa loại tài sản không còn dùng

Danh mục này ảnh hưởng trực tiếp tới các màn hình tạo/sửa tài sản trong module **Quản lý Tài Sản**.

### Khi nào nên tạo loại mới

Chỉ tạo loại mới khi:

- phát sinh một nhóm tài sản thực sự khác về nghiệp vụ quản lý
- cần tách lọc, báo cáo hoặc nhắc bảo trì riêng

Không nên tạo quá nhiều loại trùng nghĩa vì sẽ làm dữ liệu khó dùng về sau.

## Phần 2: Nhắc bảo trì / bảo hành

Khu vực này dùng để cấu hình:

- loại nhắc liên quan tài sản
- người nhận nhắc nhở
- phạm vi áp dụng cho tài sản không có người dùng trực tiếp

::: tip
Nên rà soát danh sách người nhận định kỳ để tránh tình trạng có nhắc việc nhưng không còn ai chịu trách nhiệm theo dõi.
:::

## Quy tắc quyền

- **Admin** có thể vận hành cấu hình tài sản.
- **Super Admin** có quyền cao hơn với phần người nhận nhắc nhở.
- Người dùng thường sẽ không vào được trang này.

## Câu hỏi thường gặp

**Sửa cấu hình ở đây có ảnh hưởng ngay không?**  
Có. Danh mục và người nhận nhắc nhở thường tác động trực tiếp đến các màn hình nhập liệu và luồng nhắc việc.

**Vì sao tôi vào trang nhưng chỉ thấy thông báo không có quyền?**  
Tài khoản của bạn không phải Admin hoặc Super Admin.

---

*Liên quan:* [Quản lý Tài Sản](/chuc-nang/tai-san)

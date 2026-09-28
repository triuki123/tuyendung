# Cấu Hình Ticket Nâng Cao

Trang **Cấu Hình Ticket** là nơi quản trị các thành phần nền để đội ngũ dùng ticket đúng luồng, đúng nhóm xử lý và đúng biểu mẫu.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/tickets/admin/config`.
- **Ai dùng được:** tài khoản có quyền cấu hình ticket.
- **Dùng để:** quản lý loại yêu cầu, danh mục, danh mục chi tiết và các cấu hình nền liên quan ticket.
:::

## Mục đích của trang cấu hình

Mọi lựa chọn mà người dùng thấy khi tạo ticket như:

- loại yêu cầu
- danh mục
- danh mục chi tiết
- một số trường nghiệp vụ đi kèm

đều phụ thuộc vào cấu hình ở trang này.

## Các thao tác chính

### Tạo danh mục mới

1. Mở trang cấu hình ticket.
2. Tạo **loại yêu cầu** nếu nghiệp vụ chưa tồn tại.
3. Thêm **danh mục** dưới loại yêu cầu tương ứng.
4. Thêm **danh mục chi tiết** nếu cần chia nhỏ hơn.
5. Lưu và kiểm tra lại ở form tạo ticket.

### Sửa danh mục đang dùng

Có thể đổi tên, cập nhật mô tả hoặc sắp xếp lại thứ tự hiển thị để người dùng chọn dễ hơn.

### Lưu trữ hoặc xóa

- **Lưu trữ**: ẩn cấu hình khỏi giao diện tạo mới nhưng vẫn giữ dấu vết lịch sử.
- **Xóa vĩnh viễn**: chỉ nên dùng khi chắc chắn chưa phát sinh dữ liệu quan trọng gắn với cấu hình đó.

::: warning
Đừng xóa vĩnh viễn một danh mục đang được dùng rộng rãi nếu chưa đánh giá tác động đến ticket cũ, báo cáo và thói quen vận hành.
:::

## Nguyên tắc vận hành khuyến nghị

- Danh mục nên bám theo cơ cấu xử lý thật ngoài đời.
- Tên gọi nên ngắn, dễ hiểu và tránh chồng lấn.
- Chỉ tách quá chi tiết khi thực sự cần cho báo cáo hoặc phân công.

## Câu hỏi thường gặp

**Sau khi sửa cấu hình, người dùng có thấy ngay không?**  
Thông thường có. Form tạo ticket sẽ dùng cấu hình mới sau khi dữ liệu được tải lại.

**Khi nào nên lưu trữ thay vì xóa?**  
Khi danh mục không còn dùng cho tương lai nhưng vẫn muốn giữ lịch sử ticket cũ.

---

*Liên quan:* [Ticket Hỗ Trợ](/chuc-nang/tickets)

# Duyệt yêu cầu

Module **Duyệt Yêu Cầu** là trung tâm xét duyệt mọi yêu cầu trong tổ chức. Hiện hỗ trợ **Duyệt Công** (bù công, tăng ca, bảng công, nghỉ phép) và **Duyệt Xóa Tài Sản**; các nhóm khác (công tác, chi phí, mua sắm, lịch làm) sẽ ra mắt sau.

::: info Tóm tắt nhanh
- **Đường dẫn:** `/duyet-yeu-cau` (menu **Duyệt Yêu Cầu**).
- **Ai dùng được:** Quản Lý — Super Admin, Admin, Manager. Người dùng thường sẽ thấy thông báo "Trang này chỉ dành cho Quản Lý".
- **Nhóm đang hoạt động:** Duyệt Công · Duyệt Xóa Tài Sản (chỉ Super Admin).
:::

## Giao diện chính

![Trang Duyệt yêu cầu](/screenshots/duyet-yeu-cau/tong-quan.png)

Đầu trang hiển thị **tổng số yêu cầu đang chờ duyệt**. Mỗi nhóm là một thẻ kèm huy hiệu số lượng chờ. Các nhóm "Sắp ra mắt" hiển thị mờ và chưa bấm được.

| Nhóm | Đường dẫn | Ai duyệt |
|------|-----------|----------|
| **Duyệt Công** | `/duyet-yeu-cau/cong` | Super Admin, Admin, Manager |
| **Duyệt Xóa Tài Sản** | `/duyet-yeu-cau/xoa-tai-san` | Chỉ Super Admin |
| Duyệt Công Tác · Chi Phí · Mua Sắm · Lịch Làm | — | *Sắp ra mắt* |

::: warning Phạm vi duyệt theo vai trò
- **Manager** chỉ thấy và duyệt yêu cầu của **đội mình**.
- **Admin / Super Admin** thấy yêu cầu **toàn tổ chức**.
- Thẻ **Duyệt Xóa Tài Sản** chỉ hiển thị với **Super Admin** (Admin mặc định không có quyền xóa tài sản).
:::

## 1. Duyệt Công

Trang **Duyệt Công** xử lý các yêu cầu liên quan đến thời gian làm việc, chia thành các tab:

![Duyệt công — các tab Bù Công, Tăng Ca, Nghỉ Phép](/screenshots/duyet-yeu-cau/cong.png)

| Tab | Nội dung duyệt |
|-----|----------------|
| **Bù Công** | Đề xuất bù công, công tác, WFH, làm theo ca từ nhân viên. |
| **Tăng Ca** | Khai báo tăng ca (khung tối / khung đêm). |
| **Nghỉ Phép** | Đơn xin nghỉ phép theo ngày hoặc theo giờ. |

::: info Không còn duyệt bảng công
Bảng công **không còn nộp/duyệt thủ công** — hệ thống tự chốt & gửi về Bộ Phận Chấm Công khi tới hạn. Quản lý **xem** bảng công đội ngũ tại [Dữ Liệu Chấm Công → Bảng Công](/chuc-nang/cham-cong#_5-bang-cong-xem-bang-cong-doi-ngu-quan-ly) (chỉ xem).
:::

**Các bước duyệt:**

1. Mở **Duyệt Công**, chọn tab phù hợp.
2. Xem chi tiết yêu cầu: người gửi, ngày, giờ đề xuất, số ngày công / giờ tăng ca, lý do.
3. Nhập **ghi chú / phản hồi** nếu cần.
4. Bấm **Duyệt** để chấp thuận, hoặc **Từ chối** / **Yêu Cầu Sửa** để trả lại.

Sau khi duyệt, dữ liệu công của nhân viên được cập nhật tự động. Yêu cầu đã duyệt vẫn có thể được hủy/đảo trong một số trường hợp (bù công, tăng ca).

::: tip Liên kết với nhân viên
Nhân viên tạo các yêu cầu này từ module [Dữ liệu Chấm công](/chuc-nang/cham-cong) (bù công/tăng ca trong bảng công, đơn nghỉ phép). Bảng công tự gửi nên **không có bước duyệt bảng công**; quản lý xem bảng công đội ngũ tại [Bảng Công](/chuc-nang/cham-cong#_5-bang-cong-xem-bang-cong-doi-ngu-quan-ly).
:::

## 2. Duyệt Xóa Tài Sản

Trang **Duyệt Xóa Tài Sản** liệt kê các đề xuất thanh lý / xóa tài sản đang chờ. Người duyệt xem xét rồi **phê duyệt** hoặc **từ chối** việc xóa tài sản khỏi hệ thống.

![Duyệt yêu cầu xóa tài sản chờ phê duyệt](/screenshots/duyet-yeu-cau/xoa-tai-san.png)

::: warning Chỉ Super Admin
Vì tài sản chỉ bị xóa qua luồng duyệt (không xóa trực tiếp), nhóm này được giới hạn cho **Super Admin**. Đề xuất xóa thường được gửi từ chi tiết tài sản trong [Quản lý Tài sản](/chuc-nang/tai-san).
:::

## Câu hỏi thường gặp

**Tôi là Manager nhưng không thấy hết yêu cầu?**
Đúng quy tắc — Manager chỉ thấy yêu cầu của đội mình. Admin/Super Admin mới thấy toàn tổ chức.

**Tôi là Admin nhưng không thấy thẻ Duyệt Xóa Tài Sản?**
Nhóm này chỉ dành cho Super Admin. Hãy nhờ Super Admin xử lý đề xuất xóa.

**Sau khi tôi duyệt thì điều gì xảy ra?**
Với Duyệt Công, dữ liệu công của nhân viên cập nhật ngay. Với Xóa Tài Sản, tài sản được gỡ khỏi hệ thống sau khi phê duyệt.

---

*Liên quan:* [Dữ liệu Chấm công](/chuc-nang/cham-cong) · [Quản lý Tài sản](/chuc-nang/tai-san) · [Phân quyền](/bat-dau/phan-quyen)

# Đăng nhập & Mật khẩu

Hướng dẫn đăng nhập vào FADO AssetFlow, đăng xuất, và xử lý khi quên mật khẩu.

::: info Tóm tắt nhanh
- **Đường dẫn:** `https://assetflow.fadoai.com/sign-up-login-screen`
- **Ai dùng được:** Tất cả người dùng có tài khoản trong hệ thống.
- **Liên quan:** Quên mật khẩu · Đặt lại mật khẩu qua email · Đăng xuất.
:::

## Giao diện đăng nhập

![Màn hình đăng nhập](/screenshots/bat-dau/dang-nhap.png)

Form đăng nhập gồm các trường:

- **Email đăng nhập** — email tài khoản của bạn (ví dụ `your.email@company.vn`).
- **Mật khẩu** — có nút con mắt để hiện/ẩn mật khẩu.
- **Ghi nhớ đăng nhập** — ô tích để duy trì phiên đăng nhập.

## Thao tác chính

### Đăng nhập

1. Truy cập `https://assetflow.fadoai.com`.
2. Nhập **Email đăng nhập** và **Mật khẩu**.
3. (Tùy chọn) Tích **Ghi nhớ đăng nhập**.
4. Nhấn nút **Đăng Nhập**.
5. Sau khi xác thực thành công, hệ thống hiển thị màn hình chào mừng và chuyển bạn vào **Dashboard**.

::: warning Sai thông tin đăng nhập
Nếu email hoặc mật khẩu không đúng, hệ thống báo: *"Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại."* Kiểm tra lại thông tin và thử lại.
:::

### Quên mật khẩu

1. Tại form đăng nhập, nhấn liên kết **Quên mật khẩu?** (cạnh ô Mật khẩu).
2. Cửa sổ **Quên Mật Khẩu?** hiện ra, hướng dẫn liên hệ quản trị viên để được cấp lại mật khẩu.
3. Liên hệ qua một trong các kênh hiển thị:
   - **Email Quản Trị:** `namtp@fadogroup.com.au`
   - **Hotline:** `0935 29 0953`
4. Nhấn **Quay Lại Đăng Nhập** để đóng cửa sổ.

::: info Vì sao không tự đặt lại?
Để đảm bảo an toàn, việc cấp lại mật khẩu được thực hiện bởi quản trị viên. Quản trị viên có thể gửi cho bạn một liên kết đặt lại mật khẩu qua email.
:::

### Đặt lại mật khẩu qua liên kết email

Khi quản trị viên kích hoạt đặt lại mật khẩu, bạn nhận được email chứa liên kết. Liên kết dẫn tới trang `/reset-password`.

1. Mở liên kết trong email. Hệ thống tự **xác minh token** đính kèm.
2. Nếu token hợp lệ, trang hiển thị **Đặt Mật Khẩu Mới** kèm email tài khoản của bạn.
3. Nhập **Mật Khẩu Mới** (tối thiểu **6 ký tự**) và **Xác Nhận Mật Khẩu**.
4. Dùng nút con mắt để kiểm tra mật khẩu đã nhập đúng.
5. Nhấn **Cập Nhật Mật Khẩu**.
6. Khi thành công, hệ thống tự chuyển về trang đăng nhập sau vài giây.

::: warning Token hết hạn hoặc không hợp lệ
Nếu liên kết đã hết hạn hoặc sai, trang báo **Token Không Hợp Lệ**. Hãy yêu cầu quản trị viên gửi lại liên kết mới.
:::

### Đăng xuất

Có thể đăng xuất từ hai nơi:

1. **Menu người dùng** ở góc phải thanh trên cùng (topbar): nhấn avatar/tên → chọn **Đăng Xuất**.
2. **Cuối thanh điều hướng** (sidebar): nhấn **Đăng Xuất**.

Sau khi đăng xuất, hệ thống đưa bạn trở về màn hình đăng nhập.

## Câu hỏi thường gặp

**Mật khẩu mới cần dài bao nhiêu?**
Tối thiểu 6 ký tự. Nên dùng mật khẩu mạnh, kết hợp chữ và số.

**Tôi không nhận được email đặt lại mật khẩu?**
Kiểm tra hộp thư rác. Nếu vẫn không thấy, liên hệ quản trị viên qua email hoặc hotline ở cửa sổ Quên Mật Khẩu.

**Tích "Ghi nhớ đăng nhập" có an toàn không?**
Chỉ nên dùng trên thiết bị cá nhân. Trên máy dùng chung, hãy bỏ tích và luôn đăng xuất sau khi dùng.

---

*Liên quan:* [Giao diện chung](/bat-dau/giao-dien-chung) · [Phân quyền](/bat-dau/phan-quyen)

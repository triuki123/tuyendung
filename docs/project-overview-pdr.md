# AssetFlow Pro — Tổng Quan Dự Án & PDR

**Phiên bản:** 1.0  
**Cập nhật lần cuối:** 2026-05-27  
**Trạng thái:** Đang phát triển (Phase 2)

---

## 📋 Tổng Quan Sản Phẩm

AssetFlow Pro là hệ thống quản lý vòng đời tài sản doanh nghiệp (Enterprise Asset Lifecycle Management) được thiết kế cho các tổ chức Việt Nam. Nền tảng này tập trung vào việc tối ưu hóa quy trình quản lý tài sản từ nhập kho đến thanh lý.

### Mục Tiêu Chính
- Quản lý toàn bộ vòng đời tài sản: nhập kho → phân bổ → bảo trì → thanh lý
- Cung cấp giao diện tiếng Việt trực quan cho người dùng kinh doanh
- Hỗ trợ quản lý đa công ty, đa phòng ban
- Tích hợp hệ thống phân quyền linh hoạt dựa trên module
- Cung cấp báo cáo và phân tích dữ liệu chi tiết

---

## 👥 Đối Tượng Người Dùng

| Vai Trò | Mô Tả | Quyền Chính |
|---------|-------|-----------|
| **Super Admin** | Quản trị viên cấp cao nhất | Quản lý toàn bộ hệ thống, người dùng, quyền, cấu hình |
| **Admin** | Quản trị viên hệ thống | Quản lý tài sản, người dùng, phòng ban, ticket |
| **Manager** | Quản lý phòng ban/dự án | Xem báo cáo, duyệt yêu cầu, quản lý nhân sự | 
| **User** | Người dùng cuối | Xem tài sản, đặt phòng, gửi ticket, dùng nhiệm vụ |

---

## 🎯 Tính Năng Chính Theo Module

### 1. Quản Lý Tài Sản (Asset Management)
- Quản lý tài sản phần cứng (máy tính, máy in, điện thoại, v.v.)
- Quản lý tài sản phần mềm (license, phần mềm chuyên dụng)
- Quản lý tên miền và tài khoản email công ty
- Theo dõi trạng thái tài sản (hoạt động, bảo trì, thanh lý)
- Quét mã QR để kiểm tra nhanh tài sản
- Lịch sử thay đổi và kiểm tra

### 2. Bảng Điều Khiển (Dashboard)
- Tổng quan tài sản (số lượng, giá trị)
- Xu hướng tài sản theo thời gian
- Phân bố tài sản theo phòng ban
- Lịch bảo trì sắp tới
- Thống kê trạng thái tài sản
- Cảnh báo hệ thống

### 3. Ticket/Yêu Cầu Hỗ Trợ (Tickets)
- Tạo và theo dõi yêu cầu hỗ Trợ từ người dùng
- Hệ thống bình luận và hoạt động
- Lịch sử trạng thái ticket
- Bảng kanban cho admin (To Do, In Progress, Done)
- Bulk actions (thay đổi trạng thái hàng loạt)
- Bộ lọc và tìm kiếm nâng cao

### 4. Nhiệm Vụ (Tasks)
- Tạo và gán nhiệm vụ cho nhân viên
- Lịch hoạt động nhiệm vụ
- Mã tự động tạo cho nhiệm vụ
- Lưu trữ nhiệm vụ cũ
- Theo dõi tiến độ

### 5. Đặt Phòng (Room Bookings)
- Quản lý phòng họp, phòng làm việc
- Lịch đặt phòng theo ngày
- Quét mã QR check-in/check-out
- Lịch sử sử dụng phòng
- Quản lý phòng (thêm/sửa/xóa)

### 6. Tổ Chức (Organization)
- Quản lý công ty (company/tổ chức)
- Quản lý phòng ban (department)
- Quản lý phòng ban con (sub-department)
- Quản lý chức danh công việc (job titles)
- Quản lý chức vụ (positions)
- Gán nhân viên vào cơ cấu tổ chức

### 7. Người Dùng (Users)
- Quản lý tài khoản người dùng (tạo/sửa/xóa)
- Phân quyền chi tiết theo module
- Gán tag cho người dùng
- Xem lịch sử hoạt động
- Quản lý manager (người quản lý cấp cao)
- Nhập xuất dữ liệu

### 8. Lịch Sử & Audit (History)
- Lịch sử hoạt động toàn hệ thống
- Theo dõi ai, làm gì, lúc nào
- Bộ lọc và tìm kiếm chi tiết
- Xuất báo cáo audit

### 9. Yêu Cầu Xóa (Delete Requests)
- Tạo yêu cầu xóa tài sản/dữ liệu
- Quy trình phê duyệt
- Theo dõi yêu cầu

### 10. Thẻ/Tag (Tags)
- Tạo và quản lý thẻ (tag) tùy chỉnh
- Gán tag cho người dùng
- Gán tag cho tài sản
- Phân loại dữ liệu

### 11. Cài Đặt (Settings)
- Cấu hình hệ thống
- Quản lý thông báo
- Cài đặt email

### 12. Quản Trị Zimbra Mail (Zimbra Mail Admin)
- Xem danh sách domain Zimbra
- Xem danh sách nhóm mail (distribution list)
- Thêm/xóa thành viên khỏi nhóm mail
- Tìm kiếm và tạo tài khoản mail
- Đặt lại mật khẩu tài khoản mail
- Kết nối qua Zimbra Admin SOAP API (HTTPS, cổng 7071)
- Chỉ dành cho `super_admin` và `admin`

---

## 🏗️ Phạm Vi Dự Án

### Phase 1 — Hoàn Thành
- ✅ Kiến trúc cơ bản Next.js 13 + PostgreSQL (Docker)
- ✅ Giao diện người dùng responsive (mobile/desktop)
- ✅ Quản lý tài sản cơ bản (CRUD)
- ✅ Hệ thống phân quyền role cơ bản (super_admin, admin, user)
- ✅ Dashboard với biểu đồ
- ✅ Quản lý người dùng

### Phase 2 — Đang Tiến Hành
- ✅ Phân quyền module chi tiết
- ✅ Quản lý phòng ban/tổ chức
- ✅ Hệ thống ticket và kanban
- ✅ Đặt phòng họp + QR check-in
- ✅ Thêm vai trò Manager
- ✅ Tích hợp quản trị Zimbra Mail (domain/group/account/reset password qua Admin SOAP API)
- 🔄 Tối ưu hóa giao diện
- 🔄 Thêm báo cáo nâng cao
- 🔄 Test chi tiết

### Phase 3 — Kế Hoạch
- 📅 Tích hợp thanh toán (nếu SaaS)
- 📅 Ứng dụng mobile (React Native)
- 📅 API public cho tích hợp bên thứ ba
- 📅 Nâng cấp giao diện, UX
- 📅 Tối ưu hóa hiệu năng

---

## 📊 Yêu Cầu Kỹ Thuật

### Stack Công Nghệ
| Thành Phần | Công Nghệ | Phiên Bản |
|-----------|-----------|---------|
| Framework Web | Next.js | 13.5.6 |
| Thư viện UI | React | 19.0.3 |
| Ngôn Ngữ | TypeScript | ^5 |
| CSS | Tailwind CSS | 3.4.6 |
| Cơ Sở Dữ Liệu | PostgreSQL 16 (Docker) + `pg` Pool | 8.20.0 |
| Xác Thực | Custom (plain-text hiện tại — bcrypt cần thêm) | — |
| Email | AWS SES (`@aws-sdk/client-ses`) | — |
| Biểu Đồ | Recharts | 2.15.2 |
| Mã QR | qrcode.react + html5-qrcode | ^2.3.8, ^4.2.0 |
| Hôn Hợp Drag-Drop | react-beautiful-dnd | 13.1.1 |

### Yêu Cầu Về Hiệu Năng
- Load trang < 3 giây (FCP)
- Tương thích đa thiết bị (mobile/tablet/desktop)
- Hỗ trợ tối thiểu Chrome, Firefox, Safari, Edge
- Xử lý dữ liệu 100K+ tài sản (pagination, lazy loading)

### Yêu Cầu Bảo Mật
- Xác thực người dùng bắt buộc
- Mã hóa mật khẩu (bcryptjs)
- Phân quyền chi tiết (RBAC/ABAC)
- Logging toàn bộ hoạt động (audit logs)
- Bảo vệ endpoint API (permission checks)
- HTTPS enforced
- Xử lý CORS cho tích hợp API

---

## 📈 Tiêu Chí Thành Công

| Tiêu Chí | Mục Tiêu | Hiện Tại |
|---------|---------|--------|
| Quản lý tài sản | Theo dõi 100% tài sản | ✅ |
| Quốc tế hóa | Giao diện tiếng Việt | ✅ |
| Phân quyền | Hỗ trợ 11 module + 4 role | ✅ |
| Hiệu năng | Load < 3s FCP | 🔄 |
| Khả dụng | 99.5% uptime | 🔄 |
| Bảo mật | Không lỗ hổng OWASP | 🔄 |

---

## 🔐 Các Ràng Buộc

1. **Dữ liệu nhạy cảm**: Mật khẩu, API key, SERVICE ROLE phải lưu trong .env.local, không commit lên git
2. **Compatibility**: Phải chạy được trên Node.js 18+
3. **Database**: PostgreSQL 16 qua `pg` Pool (`src/lib/db.ts`), không dùng ORM khác. Chạy qua Docker Compose.
4. **Email**: AWS SES (`@aws-sdk/client-ses`), không gửi từ client-side
5. **Deploy**: Docker Compose self-hosted (app port 4028, postgres port 5432)
6. **Ngôn Ngữ**: UI toàn tiếng Việt cho người dùng, comments/commits có thể tiếng Anh/Việt

---

## 📅 Lộ Trình Phát Triển

- **May 2026**: Phase 2 nearing completion (manager role, detailed UI)
- **Jun 2026**: Phase 2 completion, stabilization, extensive testing
- **Jul 2026**: Phase 3 planning (mobile app, public API, advanced reports)
- **Q3-Q4 2026**: Phase 3 implementation

---

## 📞 Liên Hệ & Hỗ Trợ

- **Repo**: GitHub (private)
- **Documentation**: `/docs` folder
- **Issues**: GitHub Issues
- **Main Contact**: nguyenminhtri173@gmail.com

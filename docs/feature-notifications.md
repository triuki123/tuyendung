# Hệ Thống Thông Báo (In-App)

**Cập nhật:** 2026-05-27

---

## Tổng Quan

Hệ thống thông báo in-app quản lý state toàn cục qua React Context. Thông báo hiện tại lưu **trong memory** — reset khi tải lại trang. Tích hợp database persistence là bước phát triển tiếp theo.

---

## Kiến Trúc

```
Action xảy ra (giao task, tạo ticket, v.v.)
  └─ Component gọi useNotificationHelper() hoặc addNotification()
       └─ NotificationContext (React Context)
            └─ NotificationPanel (dropdown UI)
                 └─ Topbar Bell icon (badge đếm chưa đọc)
```

---

## Các Loại Thông Báo

| Type | Mô tả |
|------|-------|
| `task` | Được giao công việc mới |
| `ticket` | Ticket support được tạo/gán |
| `asset` | Cập nhật về tài sản |
| `system` | Thông báo hệ thống |

---

## Interface

```typescript
interface Notification {
  id: string;                                         // tự động sinh
  type: 'task' | 'ticket' | 'asset' | 'system';
  title: string;
  message: string;
  assignedBy?: string;                                // tên người thực hiện
  assignedAt: Date;                                   // tự động sinh
  read: boolean;                                      // mặc định false
}
```

---

## Cách Sử Dụng

### Cách 1 — Helper Hook (khuyến nghị)

`src/lib/notificationHelper.ts` cung cấp các hàm shorthand:

```typescript
import { useNotificationHelper } from '@/lib/notificationHelper';

const notifications = useNotificationHelper();

notifications.notifyTaskAssigned('Kiểm tra server IT-05', 'Nguyễn Văn A');
notifications.notifyTicketAssigned('TK-2026-001', 'Trần Thị B', 'Lỗi login');
notifications.notifyAssetUpdate('Dell XPS 15', 'Đã sửa chữa thành công');
notifications.notifyReminder('Báo cáo tháng này', 'Lê Văn C');
notifications.notifySystemMessage('Bảo trì hệ thống', 'Bảo trì database vào 22:00');
```

### Cách 2 — Context Hook trực tiếp

```typescript
import { useNotifications } from '@/context/NotificationContext';

const { addNotification } = useNotifications();

addNotification({
  type: 'task',
  title: 'Công việc mới',
  message: 'Bạn được giao công việc mới',
  assignedBy: 'Nguyễn Văn A',
});
```

---

## API Context (`useNotifications`)

```typescript
const {
  notifications,       // Notification[]   — tất cả thông báo
  unreadCount,         // number            — số chưa đọc
  addNotification,     // (n: Partial) => void
  markAsRead,          // (id: string) => void
  markAllAsRead,       // () => void
  removeNotification,  // (id: string) => void
  clearNotifications,  // () => void
} = useNotifications();
```

---

## Các Component

| Component | File | Mô tả |
|-----------|------|-------|
| `NotificationContext` | `src/context/NotificationContext.tsx` | State toàn cục |
| `NotificationPanel` | `src/components/NotificationPanel.tsx` | Dropdown danh sách |
| `Topbar` | `src/components/Topbar.tsx` | Bell icon + badge |
| `Sidebar` | `src/components/Sidebar.tsx` | Logo click về Dashboard |
| `DemoNotifications` | `src/app/dashboard/components/DemoNotifications.tsx` | Component test |

`NotificationProvider` bắt buộc bao quanh toàn bộ app (đã thêm vào root layout).

---

## Tích Hợp Ví Dụ

```typescript
// Gửi thông báo sau khi giao task thành công
const handleAssignTask = async (taskData) => {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });

  if (response.ok) {
    notifications.notifyTaskAssigned(taskData.taskName, taskData.assignedByName);
  }
};
```

---

## Lưu Ý Quan Trọng

- Thông báo **không persistent** — reset khi reload trang
- Hiển thị thời gian tương đối: "Xp trước", "Xg trước"
- Hỗ trợ lọc "Tất cả" và "Chưa đọc" trong NotificationPanel
- Badge đỏ trên Bell icon hiển thị `unreadCount`

---

## Phát Triển Tiếp Theo

- Database persistence (bảng `notifications` đã có trong schema)
- Real-time cập nhật qua WebSocket hoặc Server-Sent Events
- Email notification qua AWS SES
- Cài đặt thông báo per-user

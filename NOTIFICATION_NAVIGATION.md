# Notification Click-to-Navigate Feature

## Overview
Implemented automatic navigation when users click notifications. Clicking a ticket notification now takes the user directly to that specific ticket page.

## User Requirement
> Khi bất kỳ ai được nhận thông báo, khi nhấn vào sẽ tự động chuyển đến link của thông báo đó. Ví dụ: Thông báo ticket mới được giao, nhấn vào thì sẽ chuyển thẳng đến phần ticket đó.

Translation: "When anyone receives a notification, clicking it will automatically navigate to that notification's link. Example: New ticket assignment notification, click it to go directly to that ticket."

## Technical Implementation

### 1. Database Schema Update
**File:** `migrations/025_add_notification_navigation_fields.sql`
- Added two new columns to `notifications` table:
  - `related_id TEXT` — ID of the related resource (ticket, task, asset, etc.)
  - `related_url TEXT` — Direct URL for navigation

✅ **Status:** Migration applied successfully

### 2. Service Layer
**File:** `src/lib/services/notificationsService.ts`

#### Updated Notification Interface
```typescript
export interface Notification {
  // ... existing fields ...
  related_id?: string;    // DB field (snake_case)
  related_url?: string;   // DB field (snake_case)
}
```

#### Updated `sendTicketNotification()`
Ticket notifications now include navigation data:
```typescript
const notification = {
  user_id: ticket.assigned_to,
  type: 'ticket_assigned',
  title: `🎫 Ticket mới được giao`,
  message: `Ticket ${ticket.code}: "${ticket.title}" đã được giao cho bạn...`,
  icon: 'ticket',
  read: false,
  created_at: now,
  updated_at: now,
  related_id: ticket.id,                              // ✅ NEW
  related_url: `/tickets/admin?ticketId=${ticket.id}` // ✅ NEW
};
```

#### Updated `sendTicketNotificationToTagUsers()`
Category-assigned ticket notifications also include navigation:
```typescript
{
  // ... notification data ...
  related_id: ticket.id,
  related_url: `/tickets/admin?ticketId=${ticket.id}`
}
```

### 3. API Route
**File:** `src/app/api/notifications/route.ts`

Added field mapping from DB snake_case to client camelCase:
```typescript
// Map DB fields (snake_case) to client format (camelCase)
const mappedNotifications = notifications.map((notif: any) => ({
  ...notif,
  relatedId: notif.related_id,      // ✅ NEW
  relatedUrl: notif.related_url,    // ✅ NEW
}));

return NextResponse.json(mappedNotifications);
```

✅ **Purpose:** Ensures client receives notifications with camelCase field names (relatedId, relatedUrl) matching TypeScript interfaces

### 4. Frontend Context
**File:** `src/context/NotificationContext.tsx`

Notification interface already includes navigation fields:
```typescript
export interface Notification {
  id: string;
  type: 'task' | 'ticket' | 'asset' | 'system';
  title: string;
  message: string;
  // ...
  relatedId?: string;   // ✅ Ticket/Task/Asset ID
  relatedUrl?: string;  // ✅ Direct navigation URL
}
```

### 5. Notification Panel UI
**File:** `src/components/NotificationPanel.tsx`

Updated click handler with intelligent routing:
```typescript
const handleNotificationClick = (notification: any) => {
  // Mark as read
  markAsRead(notification.id);

  // Priority 1: Use relatedUrl if available (most direct)
  if (notification.relatedUrl) {
    router.push(notification.relatedUrl);
    onClose();
  } 
  // Priority 2-4: Fallback to type-specific routing with relatedId
  else if (notification.type === 'ticket' && notification.relatedId) {
    router.push(`/tickets/admin?ticketId=${notification.relatedId}`);
    onClose();
  } 
  else if (notification.type === 'asset' && notification.relatedId) {
    router.push(`/asset-management?assetId=${notification.relatedId}`);
    onClose();
  } 
  else if (notification.type === 'task' && notification.relatedId) {
    router.push(`/tasks?taskId=${notification.relatedId}`);
    onClose();
  }
};
```

✅ **Behavior:**
- Tries `relatedUrl` first (if provided by service)
- Falls back to type-specific routing using `relatedId`
- Marks notification as read before navigating
- Closes notification panel after navigation

## Data Flow

```
1. Create Ticket
   ↓
2. sendTicketNotification() called
   ├─ Creates notification object
   ├─ Includes related_id: ticket.id
   ├─ Includes related_url: `/tickets/admin?ticketId=${ticket.id}`
   └─ Inserts into notifications table
   ↓
3. User opens notification panel
   ↓
4. GET /api/notifications?userId=X
   ├─ Service fetches notifications (snake_case: related_id, related_url)
   ├─ API route maps to camelCase (relatedId, relatedUrl)
   └─ Returns to client
   ↓
5. NotificationPanel renders notification items
   ├─ Shows title, message, timestamp
   ├─ Click handler ready for interaction
   └─ Unread indicator shown
   ↓
6. User clicks notification
   ├─ handleNotificationClick() called
   ├─ markAsRead(notification.id)
   ├─ router.push(notification.relatedUrl)  ← Navigate!
   └─ onClose()  ← Dismiss panel
   ↓
7. Browser navigates to `/tickets/admin?ticketId=<id>`
   ↓
8. TicketDetailPanel receives ?ticketId query param
   └─ Loads and displays specific ticket
```

## Future Extensions

This same pattern can be applied to other notification types:

### Task Notifications
```typescript
// In sendTaskNotification():
{
  related_id: task.id,
  related_url: `/tasks?taskId=${task.id}`
}
```

### Asset Notifications
```typescript
// In asset-related functions:
{
  related_id: asset.id,
  related_url: `/asset-management?assetId=${asset.id}`
}
```

### Room Booking Notifications
```typescript
// In sendRoomBookingCreatedNotification():
{
  related_id: bookingId,
  related_url: `/room-bookings?bookingId=${bookingId}`
}
```

## Testing Checklist

- [ ] Create a new ticket assigned to a user
- [ ] Verify notification appears in notification panel
- [ ] Click the notification
- [ ] Confirm navigation to `/tickets/admin?ticketId=<id>`
- [ ] Verify notification marked as read
- [ ] Confirm notification panel closes after click
- [ ] Repeat with different notification types (if implemented)

## Notes

- All changes are **backwards compatible** — existing notifications without related_id/related_url still work
- Database migration adds columns with `IF NOT EXISTS` clause for safety
- API route uses `buildInsert()` helper which automatically handles field quoting
- Client-side mapping ensures clean camelCase interface regardless of DB schema

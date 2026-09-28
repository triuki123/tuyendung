import { query, queryOne, execute, buildInsert } from '@/lib/db';
import { categorize, type CategoryKey } from '@/lib/notifications/categories';
import { notifyUser, notifyTelegramOnly } from '@/lib/services/notify';
import { notify } from '@/lib/notifications/engine';
import {
  sendRoomBookingApprovalTelegram,
  sendRoomBookingApprovalTelegramToUser,
  sendRoomBookingRejectionTelegram,
  sendRoomBookingRejectionTelegramToUser,
  sendNewRoomBookingTelegramToAdmin,
  sendTelegramMessageToChat,
  sendTaskStatusChangeTelegram,
} from './telegramService';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  domain_id?: string;
  icon: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  related_id?: string;
  related_url?: string;
}

// Get notifications for a user
export async function getUserNotifications(userId: string, unreadOnly = false) {
  if (unreadOnly) {
    return query<Notification>(
      `SELECT * FROM notifications WHERE user_id = $1 AND read = false ORDER BY created_at DESC`,
      [userId]
    );
  }
  return query<Notification>(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
}

// Mark notification as read
export async function markNotificationAsRead(notificationId: string) {
  const data = await queryOne<Notification>(
    `UPDATE notifications SET read = true, updated_at = $1 WHERE id = $2 RETURNING *`,
    [new Date().toISOString(), notificationId]
  );
  if (!data) throw new Error('Notification not found');
  return data;
}

// Mark all notifications as read for a user
export async function markAllNotificationsAsRead(userId: string) {
  await execute(
    `UPDATE notifications SET read = true, updated_at = $1 WHERE user_id = $2`,
    [new Date().toISOString(), userId]
  );
}

// Delete a notification
export async function deleteNotification(notificationId: string) {
  await execute(`DELETE FROM notifications WHERE id = $1`, [notificationId]);
}

// Get unread notification count for a user
export async function getUnreadNotificationCount(userId: string) {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false`,
    [userId]
  );
  return row ? Number(row.count) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trung Tâm Thông Báo (personal notification center)
// ─────────────────────────────────────────────────────────────────────────────

// Bỏ dấu tiếng Việt bằng translate() (không cần extension unaccent). Hai chuỗi PHẢI
// cùng độ dài ký tự: mỗi ký tự có dấu → 1 ký tự cơ sở. Đã lower sẵn nên chỉ cần map thường.
const VN_FROM = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
const VN_TO = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';

/** Biểu thức SQL: bỏ dấu + lower cho một cột/tham số. */
function vnNoAccent(expr: string): string {
  return `translate(lower(${expr}), '${VN_FROM}', '${VN_TO}')`;
}

export type ReadFilter = 'all' | 'unread' | 'read';

export interface PagedOptions {
  category?: CategoryKey | 'all';
  read?: ReadFilter;
  q?: string;
  limit?: number;
  offset?: number;
}

/** Danh sách `type` (của riêng user) thuộc 1 nhóm — để lọc SQL đúng khi phân trang. */
async function typesForCategory(userId: string, category: CategoryKey): Promise<string[]> {
  const rows = await query<{ type: string }>(
    `SELECT DISTINCT type FROM notifications WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.type).filter((t) => categorize(t) === category);
}

/** Lấy thông báo của user có phân trang + lọc nhóm/đọc + tìm kiếm. */
export async function getNotificationsPaged(
  userId: string,
  opts: PagedOptions = {}
): Promise<{ items: Notification[]; total: number }> {
  const { category = 'all', read = 'all', q, limit = 20, offset = 0 } = opts;

  const cond: string[] = ['user_id = $1'];
  const params: any[] = [userId];

  if (read === 'unread') cond.push('read = false');
  else if (read === 'read') cond.push('read = true');

  if (category && category !== 'all') {
    const types = await typesForCategory(userId, category);
    if (types.length === 0) return { items: [], total: 0 };
    params.push(types);
    cond.push(`type = ANY($${params.length})`);
  }

  if (q && q.trim()) {
    // Tìm KHÔNG DẤU tiếng Việt bằng SQL thuần (translate) — KHÔNG cần extension,
    // nên không có rủi ro deploy. Bỏ dấu + lower cả hai vế rồi LIKE.
    params.push(`%${q.trim()}%`);
    const n = params.length;
    cond.push(`(${vnNoAccent('title')} LIKE ${vnNoAccent(`$${n}`)} OR ${vnNoAccent('message')} LIKE ${vnNoAccent(`$${n}`)})`);
  }

  const where = cond.join(' AND ');

  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE ${where}`,
    params
  );
  const total = totalRow ? Number(totalRow.count) : 0;

  params.push(limit);
  const limIdx = params.length;
  params.push(offset);
  const offIdx = params.length;

  const items = await query<Notification>(
    `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );

  return { items, total };
}

/** Đếm tổng / chưa đọc + đếm theo từng nhóm (1 query GROUP BY type, gộp ở JS). */
export async function getNotificationCounts(userId: string): Promise<{
  total: number;
  unread: number;
  byCategory: Record<string, { total: number; unread: number }>;
}> {
  const rows = await query<{ type: string; cnt: number; unread: number }>(
    `SELECT type,
            COUNT(*)::int AS cnt,
            COUNT(*) FILTER (WHERE read = false)::int AS unread
       FROM notifications
      WHERE user_id = $1
      GROUP BY type`,
    [userId]
  );

  const byCategory: Record<string, { total: number; unread: number }> = {};
  let total = 0;
  let unread = 0;
  for (const r of rows) {
    const c = categorize(r.type);
    (byCategory[c] ||= { total: 0, unread: 0 });
    byCategory[c].total += Number(r.cnt);
    byCategory[c].unread += Number(r.unread);
    total += Number(r.cnt);
    unread += Number(r.unread);
  }
  return { total, unread, byCategory };
}

/** Xoá mọi thông báo ĐÃ ĐỌC của user. */
export async function deleteReadNotifications(userId: string): Promise<void> {
  await execute(`DELETE FROM notifications WHERE user_id = $1 AND read = true`, [userId]);
}

// Send ticket notification to assigned user OR to users with matching support category tags
export async function sendTicketNotification(ticket: any) {
  try {
    if (ticket.support_category) {
      await sendTicketNotificationToTagUsers(ticket);
      return;
    }

    if (!ticket.assigned_to) {
      console.log('No assigned_to user or support_category, skipping notification');
      return;
    }

    const now = new Date().toISOString();
    const notification = {
      user_id: ticket.assigned_to,
      type: 'ticket_assigned',
      title: `🎫 Ticket mới được giao`,
      message: `Ticket ${ticket.code}: "${ticket.title}" đã được giao cho bạn. Mức độ ưu tiên: ${getPriorityLabel(ticket.priority)}`,
      icon: 'ticket',
      read: false,
      created_at: now,
      updated_at: now,
      related_id: ticket.id, // Add ticket ID for navigation
      related_url: `/tickets/admin?ticketId=${ticket.id}`, // Add URL for direct navigation
    };

    await notifyUser(notification);
    console.log('Ticket notification sent to:', ticket.assigned_to);
  } catch (error) {
    console.error('Error in sendTicketNotification:', error);
  }
}

// Send ticket notification to all users with matching support category tag
export async function sendTicketNotificationToTagUsers(ticket: any) {
  try {
    if (!ticket.support_category) {
      console.log('No support_category, skipping tag-based notification');
      return;
    }

    console.log('Sending notification to users with tag:', ticket.support_category);

    const allUsers = await query<{ id: string; name: string; tags: any; email: string }>(
      `SELECT id, name, tags, email FROM users WHERE status = $1`,
      ['active']
    );

    if (!allUsers || allUsers.length === 0) {
      console.log('No active users found');
      return;
    }

    const matchingUsers = allUsers.filter((user: any) => {
      if (!user.tags || !Array.isArray(user.tags)) return false;
      return user.tags.includes(ticket.support_category);
    });

    if (matchingUsers.length === 0) {
      console.log(`No users found with tag: "${ticket.support_category}".`);
      return;
    }

    for (const user of matchingUsers) {
      await notifyUser({
        user_id: user.id,
        type: 'ticket_category_assigned',
        title: `🎫 Ticket mới cho danh mục: ${ticket.support_category}`,
        message: `Ticket ${ticket.code}: "${ticket.title}" được tạo cho danh mục "${ticket.support_category}". Mức độ ưu tiên: ${getPriorityLabel(ticket.priority)}`,
        icon: 'ticket',
        related_id: ticket.id,
        related_url: `/tickets/admin?ticketId=${ticket.id}`,
      });
    }

    console.log(`Ticket notification sent to ${matchingUsers.length} users with tag: ${ticket.support_category}`);
  } catch (error) {
    console.error('Error in sendTicketNotificationToTagUsers:', error);
  }
}

// Send task notification when assigned to a user
export async function sendTaskNotification(task: any, previousAssignedTo?: string) {
  try {
    if (!task.assigned_to) {
      console.log('No assigned_to user, skipping task notification');
      return;
    }

    if (previousAssignedTo === task.assigned_to && previousAssignedTo !== undefined) {
      console.log('Task assignment unchanged, skipping notification');
      return;
    }

    await notifyUser({
      user_id: task.assigned_to,
      type: 'task_assigned',
      title: `📋 Công việc mới được giao`,
      message: `Task ${task.task_code || task.code}: "${task.title}" đã được giao cho bạn. Ưu tiên: ${getPriorityLabel(task.priority)}`,
      icon: 'task',
    });
    console.log('Task notification sent to:', task.assigned_to, 'for task:', task.task_code || task.code);
  } catch (error) {
    console.error('Error in sendTaskNotification:', error);
  }
}

// Send task status change notification
export async function sendTaskStatusNotification(task: any, oldStatus: string, changedBy?: string) {
  try {
    if (!task.assigned_to || oldStatus === task.status) return;

    const statusLabel = getStatusLabel(task.status);
    const oldStatusLabel = getStatusLabel(oldStatus);

    // 1. Gửi in-app notification cho assigned_to (skipTelegram vì khối #2 dưới đây
    //    gửi Telegram chi tiết kèm nút).
    await notifyUser({
      user_id: task.assigned_to,
      type: 'task_status_changed',
      title: `🔄 Trạng thái công việc thay đổi`,
      message: `Task ${task.task_code || task.code}: "${task.title}" đã được chuyển từ "${oldStatusLabel}" → "${statusLabel}"`,
      icon: 'update',
      skipTelegram: true,
    });
    console.log('Task status notification sent to:', task.assigned_to);

    // 2. Gửi Telegram notification (tương tự Tickets: gửi cho assigned_to và created_by)
    try {
      const { sendTaskStatusChangeTelegram: sendTelegramFunc } = await import('./telegramService');

      // Gửi cho người được giao (assigned_to)
      if (task.assigned_to) {
        const assignedUser = await queryOne<any>(
          'SELECT "telegram_chat_id" FROM users WHERE id = $1',
          [task.assigned_to]
        );
        if (assignedUser?.telegram_chat_id) {
          await sendTelegramFunc(
            task,
            oldStatus,
            task.status,
            changedBy || 'Hệ thống',
            assignedUser.telegram_chat_id
          );
        }
      }

      // Gửi cho người tạo task (created_by) - nếu khác assigned_to
      if (task.created_by && task.created_by !== task.assigned_to) {
        const creatorUser = await queryOne<any>(
          'SELECT "telegram_chat_id" FROM users WHERE id = $1',
          [task.created_by]
        );
        if (creatorUser?.telegram_chat_id) {
          await sendTelegramFunc(
            task,
            oldStatus,
            task.status,
            changedBy || 'Hệ thống',
            creatorUser.telegram_chat_id
          );
        }
      }

      console.log(`Task status change notification sent for ${task.code}`);
    } catch (telegramError) {
      console.log('Telegram notification skipped for task status change:', telegramError);
    }
  } catch (error) {
    console.error('Error in sendTaskStatusNotification:', error);
  }
}

// Send domain expiring notifications
export async function sendDomainNotifications(domain: any) {
  try {
    const superAdmins = await query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM users WHERE role = $1`,
      ['super_admin']
    );

    if (!superAdmins || superAdmins.length === 0) return;

    const expDate = new Date(domain.expirationdate);
    const today = new Date();
    const daysLeft = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let notificationType = '';
    let title = '';
    let message = '';

    if (daysLeft < 0) {
      const daysSinceExpiry = Math.floor((today.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceExpiry === 1) {
        notificationType = 'domain_expired';
        title = `⚠️ Tên miền đã hết hạn`;
        message = `Tên miền ${domain.domainname} đã hết hạn vào ngày ${domain.expirationdate}. Vui lòng gia hạn ngay!`;
      } else {
        return;
      }
    } else if (daysLeft === 30) {
      notificationType = 'domain_expiring_30';
      title = `🔔 Tên miền sắp hết hạn (30 ngày)`;
      message = `Tên miền ${domain.domainname} sẽ hết hạn vào ${domain.expirationdate}. Còn 30 ngày để gia hạn.`;
    } else if (daysLeft === 20) {
      notificationType = 'domain_expiring_20';
      title = `🔔 Tên miền sắp hết hạn (20 ngày)`;
      message = `Tên miền ${domain.domainname} sẽ hết hạn vào ${domain.expirationdate}. Còn 20 ngày để gia hạn.`;
    } else if (daysLeft === 10) {
      notificationType = 'domain_expiring_10';
      title = `⚠️ Tên miền sắp hết hạn (10 ngày)`;
      message = `Tên miền ${domain.domainname} sẽ hết hạn vào ${domain.expirationdate}. Còn 10 ngày để gia hạn.`;
    } else if (daysLeft === 1) {
      notificationType = 'domain_expiring_1';
      title = `🚨 Tên miền sắp hết hạn (1 ngày)`;
      message = `Tên miền ${domain.domainname} sẽ hết hạn ngày mai. Vui lòng gia hạn ngay!`;
    } else {
      return;
    }

    // Skip if a notification of this type was already sent today for this domain
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const historyCheck = await query<any>(
      `SELECT id FROM notification_history
       WHERE domain_id = $1 AND notification_type = $2 AND created_at >= $3`,
      [domain.id, notificationType, todayStart]
    );

    if (historyCheck && historyCheck.length > 0) return;

    // Qua engine: in-app (kèm domain_id) + Telegram. Giữ dedup bằng notification_history.
    const milestone = daysLeft < 0 ? 'expired' : String(daysLeft);
    await notify('domain.alert', {
      milestone, notifType: notificationType, domain: domain.domainname, expirationDate: domain.expirationdate,
    }, { recipients: superAdmins.map(a => a.id), domainId: domain.id });

    // Record in history to prevent duplicate sends on the same day
    const { text: hText, params: hParams } = buildInsert('notification_history', {
      domain_id: domain.id,
      notification_type: notificationType,
      created_at: new Date().toISOString(),
    });
    await execute(hText, hParams);
  } catch (error) {
    console.error('Error in sendDomainNotifications:', error);
  }
}

// Send room booking created notification to participants and admins
export async function sendRoomBookingCreatedNotification(
  bookingId: string,
  creator: any,
  participants: any[],
  roomName: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  purpose: string,
  /** TRUE = sau chỉnh sửa (reset về pending), tiêu đề thông báo sẽ làm rõ. */
  isEdit: boolean = false
) {
  try {
    const editPrefix = isEdit ? ' (sau chỉnh sửa)' : '';
    // Send invite notification to each participant (in-app + Telegram qua notifyUser)
    for (const participant of participants) {
      const participantUserId = participant.id;
      if (participantUserId) {
        await notifyUser({
          user_id: participantUserId,
          type: 'room_booking_invite',
          title: `📅 Bạn được mời tham dự cuộc họp${editPrefix}`,
          message: `${creator.name} mời bạn tham dự cuộc họp tại phòng ${roomName} vào ${bookingDate} từ ${startTime} đến ${endTime}. Nội dung: "${purpose}"`,
          icon: 'calendar',
          related_id: bookingId,
          related_url: `/room-bookings?bookingId=${bookingId}`,
        });
      }
    }

    // Người nhận in-app: ưu tiên cấu hình UI; rỗng → fallback toàn bộ super_admin
    // (giữ tương thích cũ — trước đây luôn gửi cho mọi super_admin).
    const { getNotifyUserIds } = await import('@/lib/services/roomBookingSettingsService');
    let adminIds = await getNotifyUserIds();
    if (adminIds.length === 0) {
      const admins = await query<{ id: string }>(
        `SELECT id FROM users WHERE role = $1`,
        ['super_admin']
      );
      adminIds = admins.map(a => a.id);
    }

    for (const adminId of adminIds) {
      // skipTelegram: admin sẽ nhận Telegram chi tiết (kèm nút Duyệt/Từ chối) từ
      // sendNewRoomBookingNotificationToAdmin() — tránh gửi trùng.
      await notifyUser({
        user_id: adminId,
        type: 'room_booking_created',
        title: `📅 ${isEdit ? 'Đặt phòng họp đã chỉnh sửa — chờ duyệt lại' : 'Đặt phòng họp mới'}`,
        message: `${creator.name} ${isEdit ? 'đã chỉnh sửa và yêu cầu duyệt lại' : 'đã đặt'} phòng họp ${roomName} vào ${bookingDate} từ ${startTime} đến ${endTime}`,
        icon: 'calendar',
        related_id: bookingId,
        related_url: `/room-bookings?bookingId=${bookingId}`,
        skipTelegram: true,
      });
    }

    console.log(`Room booking notification sent to ${participants.length} participants and ${adminIds.length} recipient(s)`);
  } catch (error) {
    console.error('Error in sendRoomBookingCreatedNotification:', error);
  }
}

// Send room booking status change notification
export async function sendRoomBookingStatusChangeNotification(
  bookingId: string,
  newStatus: string,
  creatorId: string,
  creatorName: string,
  roomName: string,
  bookingDate: string,
  participantIds: string[]
) {
  try {
    const statusLabel = getRoomBookingStatusLabel(newStatus);
    const bookingUrl = `/room-bookings?bookingId=${bookingId}`;

    // Send notification to creator (in-app + Telegram)
    await notifyUser({
      user_id: creatorId,
      type: 'room_booking_status_changed',
      title: `🔄 Trạng thái đặt phòng thay đổi`,
      message: `Đặt phòng họp ${roomName} vào ${bookingDate} của bạn đã được cập nhật sang: ${statusLabel}`,
      icon: 'update',
      related_id: bookingId,
      related_url: bookingUrl,
    });

    // Send notification to all participants (in-app + Telegram)
    for (const participantId of participantIds) {
      await notifyUser({
        user_id: participantId,
        type: 'room_booking_status_changed',
        title: `🔄 Cuộc họp đã cập nhật trạng thái`,
        message: `Cuộc họp tại phòng ${roomName} vào ${bookingDate} được tổ chức bởi ${creatorName} đã có cập nhật: ${statusLabel}`,
        icon: 'update',
        related_id: bookingId,
        related_url: bookingUrl,
      });
    }

    // Báo admin (in-app) — danh sách người nhận lấy từ Cấu Hình Phòng Họp; rỗng
    // → fallback toàn bộ super_admin. Trước đây admin "mất hút" khi user hủy
    // booking đã duyệt → admin tưởng phòng vẫn chiếm.
    const { getNotifyUserIds } = await import('@/lib/services/roomBookingSettingsService');
    let adminIds = await getNotifyUserIds();
    if (adminIds.length === 0) {
      const admins = await query<{ id: string }>(
        `SELECT id FROM users WHERE role = $1`, ['super_admin']
      );
      adminIds = admins.map(a => a.id);
    }
    // Bỏ creator + participants khỏi danh sách admin để tránh nhận trùng.
    const dedup = new Set<string>([creatorId, ...participantIds]);
    for (const adminId of adminIds) {
      if (dedup.has(adminId)) continue;
      await notifyUser({
        user_id: adminId,
        type: 'room_booking_status_changed',
        title: `🔄 Cập nhật đặt phòng họp`,
        message: `Đặt phòng ${roomName} ngày ${bookingDate} (${creatorName}) đã chuyển sang: ${statusLabel}`,
        icon: 'update',
        related_id: bookingId,
        related_url: bookingUrl,
      });
    }

    console.log(`Room booking status notification sent to creator + ${participantIds.length} participants + ${adminIds.length} admin recipient(s)`);
  } catch (error) {
    console.error('Error in sendRoomBookingStatusChangeNotification:', error);
  }
}

// Send room booking approval notification
export async function sendRoomBookingApprovalNotification(
  booking: any,
  approvedBy: string
) {
  try {
    // Creator + participants in-app — skipTelegram vì 2 block bên dưới gửi Telegram
    // chi tiết riêng (sendRoomBookingApprovalTelegramToUser).
    await notifyUser({
      user_id: booking.requested_by,
      type: 'room_booking_approved',
      title: `✅ Phòng họp ${booking.room_name} đã được duyệt`,
      message: `Yêu cầu đặt phòng họp của bạn tại ${booking.room_name} vào ngày ${booking.booking_date} từ ${booking.start_time} đến ${booking.end_time} đã được duyệt bởi ${approvedBy}`,
      icon: 'calendar',
      related_id: booking.id,
      related_url: `/room-bookings?bookingId=${booking.id}`,
      skipTelegram: true,
    });

    if (booking.participants && booking.participants.length > 0) {
      for (const participant of booking.participants) {
        await notifyUser({
          user_id: participant.id,
          type: 'room_booking_approved',
          title: `✅ Cuộc họp tại ${booking.room_name} đã được duyệt`,
          message: `Cuộc họp do ${booking.requested_by_name} tổ chức tại phòng ${booking.room_name} vào ngày ${booking.booking_date} từ ${booking.start_time} đến ${booking.end_time} đã được duyệt`,
          icon: 'calendar',
          related_id: booking.id,
          related_url: `/room-bookings?bookingId=${booking.id}`,
          skipTelegram: true,
        });
      }
    }

    // Send Telegram notification to requester
    const requesterUser = await queryOne<any>(
      `SELECT "telegram_chat_id" FROM users WHERE id = $1`,
      [booking.requested_by]
    );
    if (requesterUser?.telegram_chat_id) {
      await sendRoomBookingApprovalTelegramToUser(
        booking,
        approvedBy,
        requesterUser.telegram_chat_id
      );
    }

    // Send Telegram notification to participants
    if (booking.participants && booking.participants.length > 0) {
      for (const participant of booking.participants) {
        const participantUser = await queryOne<any>(
          `SELECT "telegram_chat_id" FROM users WHERE id = $1`,
          [participant.id]
        );
        if (participantUser?.telegram_chat_id) {
          await sendRoomBookingApprovalTelegramToUser(
            {
              ...booking,
              requested_by_name: `Cuộc họp do ${booking.requested_by_name}`,
            },
            approvedBy,
            participantUser.telegram_chat_id
          );
        }
      }
    }

  } catch (error) {
    console.error('Error in sendRoomBookingApprovalNotification:', error);
  }
}

// Send room booking rejection notification
export async function sendRoomBookingRejectionNotification(
  booking: any,
  rejectedBy: string,
  reason?: string
) {
  try {
    const reasonText = reason ? ` Lý do: ${reason}` : '';

    // Creator + participants in-app — skipTelegram vì 2 block bên dưới gửi Telegram
    // chi tiết riêng (sendRoomBookingRejectionTelegramToUser).
    await notifyUser({
      user_id: booking.requested_by,
      type: 'room_booking_rejected',
      title: `❌ Phòng họp ${booking.room_name} bị từ chối`,
      message: `Yêu cầu đặt phòng họp của bạn tại ${booking.room_name} vào ngày ${booking.booking_date} từ ${booking.start_time} đến ${booking.end_time} không được duyệt.${reasonText}`,
      icon: 'calendar',
      related_id: booking.id,
      related_url: `/room-bookings?bookingId=${booking.id}`,
      skipTelegram: true,
    });

    if (booking.participants && booking.participants.length > 0) {
      for (const participant of booking.participants) {
        await notifyUser({
          user_id: participant.id,
          type: 'room_booking_rejected',
          title: `❌ Cuộc họp tại ${booking.room_name} bị từ chối`,
          message: `Cuộc họp do ${booking.requested_by_name} tổ chức tại phòng ${booking.room_name} vào ngày ${booking.booking_date} từ ${booking.start_time} đến ${booking.end_time} không được duyệt.${reasonText}`,
          icon: 'calendar',
          related_id: booking.id,
          related_url: `/room-bookings?bookingId=${booking.id}`,
          skipTelegram: true,
        });
      }
    }

    // Send Telegram notification to requester
    const requesterUser = await queryOne<any>(
      `SELECT "telegram_chat_id" FROM users WHERE id = $1`,
      [booking.requested_by]
    );
    if (requesterUser?.telegram_chat_id) {
      await sendRoomBookingRejectionTelegramToUser(
        booking,
        rejectedBy,
        reason,
        requesterUser.telegram_chat_id
      );
    }

    // Send Telegram notification to participants
    if (booking.participants && booking.participants.length > 0) {
      for (const participant of booking.participants) {
        const participantUser = await queryOne<any>(
          `SELECT "telegram_chat_id" FROM users WHERE id = $1`,
          [participant.id]
        );
        if (participantUser?.telegram_chat_id) {
          await sendRoomBookingRejectionTelegramToUser(
            {
              ...booking,
              requested_by_name: `Cuộc họp do ${booking.requested_by_name}`,
            },
            rejectedBy,
            reason,
            participantUser.telegram_chat_id
          );
        }
      }
    }

    console.log(`Room booking rejection notification sent for booking ${booking.id}`);
  } catch (error) {
    console.error('Error in sendRoomBookingRejectionNotification:', error);
  }
}

/**
 * Gửi thông báo booking mới tới Super Admin qua Telegram
 * Sử dụng SUPER_ADMIN_TELEGRAM_CHAT_ID từ env
 */
export async function sendNewRoomBookingNotificationToAdmin(booking: any, isEdit: boolean = false) {
  try {
    // Ưu tiên danh sách user được cấu hình trong /api/room-bookings/settings.
    // Rỗng → fallback về SUPER_ADMIN_TELEGRAM_CHAT_ID (giữ tương thích cũ).
    const { getNotifyTelegramChatIds } = await import('@/lib/services/roomBookingSettingsService');
    const { sendTelegramApprovalRequest } = await import('@/lib/services/telegramService');
    const { buildCallbackData, REGISTRY } = await import('@/lib/telegram/approvalRegistry');

    let chatIds = await getNotifyTelegramChatIds();
    if (chatIds.length === 0) {
      const fallback = process.env.SUPER_ADMIN_TELEGRAM_CHAT_ID;
      if (fallback) chatIds = [fallback];
    }
    if (chatIds.length === 0) {
      console.log('Không có người nhận thông báo đặt phòng (cả cấu hình lẫn env đều rỗng).');
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
    const headerEmoji = isEdit ? '🔄' : '🏢';
    const headerText = isEdit ? 'Đặt Phòng Họp (Sau Chỉnh Sửa)' : 'Yêu Cầu Đặt Phòng Họp';
    const text = [
      `${headerEmoji} *${headerText}*`,
      ``,
      `👤 Người đặt: *${booking.requested_by_name ?? ''}*`,
      `🚪 Phòng: ${booking.room_name ?? ''}`,
      `📅 Ngày: ${booking.booking_date ?? ''}`,
      `🕐 Giờ: ${booking.start_time ?? ''} - ${booking.end_time ?? ''}`,
      `📝 Mục đích: ${booking.purpose ?? ''}`,
      ``,
      `⏳ *${isEdit ? 'Chờ duyệt lại' : 'Chờ duyệt'}*`,
    ].join('\n');
    const opts = {
      approveData: buildCallbackData('room', 'a', booking.id),
      rejectData: buildCallbackData('room', 'r', booking.id),
      detailUrl: `${appUrl}${REGISTRY.room.detailPath(booking.id)}`,
    };

    // Gửi song song tới tất cả người nhận; mỗi người fail riêng không ảnh hưởng nhau.
    const { recordApprovalMessage } = await import('@/lib/telegram/approvalMessageSync');
    await Promise.all(chatIds.map(async (chatId) => {
      try {
        const sent = await sendTelegramApprovalRequest(chatId, text, opts);
        if (!sent) await sendNewRoomBookingTelegramToAdmin(booking, chatId);
        else await recordApprovalMessage('room', booking.id, sent.chat_id, sent.message_id);
      } catch (e) {
        console.error('Send room booking notification to', chatId, 'failed:', e);
      }
    }));
    console.log(`New room booking approval request sent to ${chatIds.length} recipient(s)`);
  } catch (error) {
    console.error('Error in sendNewRoomBookingNotificationToAdmin:', error);
  }
}

// ---------------------------------------------------------------------------
// Telegram Notifications for Tickets
// ---------------------------------------------------------------------------

/**
 * Format thời gian thành "Hôm nay HH:MM" hoặc "X ngày trước"
 */
function formatTicketTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Hôm nay ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return 'Hôm qua';
    } else if (diffDays < 7) {
      return `${diffDays} ngày trước`;
    } else {
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  } catch {
    return dateString;
  }
}

/**
 * Lấy mô tả ngắn (150 ký tự đầu)
 */
function getTruncatedDescription(description: string, maxLength: number = 150): string {
  if (!description) return 'N/A';
  if (description.length <= maxLength) return description;
  return description.substring(0, maxLength).trim() + '...';
}


/** Nhãn trạng thái ticket (emoji) — dùng chung cho các thông báo ticket. */
function ticketStatusTg(status: string): string {
  return ({
    open: '🔵 Mở', in_progress: '🟡 Đang Xử Lý', resolved: '✅ Đã Xử Lý', closed: '⚫ Đóng',
  } as Record<string, string>)[status] || status;
}

/** Ghép các dòng chi tiết tùy chọn (Loại Yêu Cầu / Danh Mục / Chi tiết). Rỗng nếu không có. */
function buildTicketDetailLines(ticket: any): string {
  const parts: string[] = [];
  if (ticket.request_type) parts.push(`• Loại Yêu Cầu: ${ticket.request_type}`);
  if (ticket.support_category) parts.push(`• Danh Mục: ${ticket.support_category}`);
  if (ticket.category_name) parts.push(`• Chi tiết: ${ticket.category_name}`);
  return parts.length ? '\n' + parts.join('\n') : '';
}

/**
 * Thông báo khi ticket được giao cho 1 user — qua engine (chỉ Telegram).
 * Nội dung do admin sửa được tại mẫu `ticket_assigned`; engine tự resolve
 * telegram_chat_id + tôn trọng telegram_enabled.
 */
export async function sendTicketAssignmentTelegram(ticket: any) {
  try {
    if (!ticket.assigned_to || ticket.assigned_to === 'undefined') return;
    await notify('ticket.assigned', {
      code: ticket.code || '',
      title: ticket.title || '',
      description: getTruncatedDescription(ticket.description || ''),
      priorityLabel: getPriorityLabel(ticket.priority),
      statusLabel: ticketStatusTg(ticket.status),
      detailLines: buildTicketDetailLines(ticket),
      requesterName: ticket.requester_name || ticket.created_by_name || 'Unknown',
      formattedTime: formatTicketTime(ticket.created_at),
    }, { recipients: [ticket.assigned_to], relatedId: ticket.id });
  } catch (error) {
    console.error('Error in sendTicketAssignmentTelegram:', error);
  }
}

/**
 * Cảnh báo leo thang khi ticket lên mức ưu tiên cao — qua engine (chỉ Telegram).
 * Mẫu `ticket_escalated`. Chỉ gửi khi ưu tiên thuộc critical/urgent/high.
 */
export async function sendTicketEscalationAlert(ticket: any, oldPriority: string) {
  try {
    const criticalPriorities = ['critical', 'urgent', 'high'];
    if (!criticalPriorities.includes((ticket.priority || '').toLowerCase())) return;
    if (!ticket.assigned_to || ticket.assigned_to === 'undefined') return;
    await notify('ticket.escalated', {
      code: ticket.code || '',
      title: ticket.title || '',
      description: getTruncatedDescription(ticket.description || ''),
      oldPriorityLabel: getPriorityLabel(oldPriority),
      newPriorityLabel: getPriorityLabel(ticket.priority),
      statusLabel: ticketStatusTg(ticket.status),
      detailLines: buildTicketDetailLines(ticket),
      requesterName: ticket.requester_name || ticket.created_by_name || 'Unknown',
      formattedTime: formatTicketTime(ticket.created_at),
    }, { recipients: [ticket.assigned_to], relatedId: ticket.id });
  } catch (error) {
    console.error('Error in sendTicketEscalationAlert:', error);
  }
}

/**
 * Thông báo đổi trạng thái ticket cho người được giao + người tạo — qua engine
 * (chỉ Telegram). Mẫu `ticket_status_party`. Người theo dõi (watchers) được xử lý
 * riêng qua notifyTicketWatchers.
 */
export async function sendTicketStatusChangeTelegram(
  ticket: any,
  oldStatus: string,
  newStatus: string,
  changedBy: string
): Promise<void> {
  try {
    if (oldStatus === newStatus) return;
    const recipients = [...new Set(
      [ticket.assigned_to, ticket.created_by].filter(Boolean).map(String)
    )];
    if (recipients.length === 0) return;

    const tgPriority = ticket.priority === 'critical' ? '🔴 Critical'
      : ticket.priority === 'urgent' ? '🟠 Urgent'
      : ticket.priority === 'high' ? '🟡 High' : '🟢 Normal';

    await notify('ticket.statusChanged', {
      code: ticket.code || '', title: ticket.title || '',
      oldStatusTg: ticketStatusTg(oldStatus), newStatusTg: ticketStatusTg(newStatus),
      priorityTg: tgPriority, actorName: changedBy || 'Hệ thống',
    }, { recipients, relatedId: ticket.id });
  } catch (error) {
    console.error('Error in sendTicketStatusChangeTelegram:', error);
  }
}

// ============================================================================
// TASK TELEGRAM NOTIFICATIONS
// ============================================================================

/**
 * Thông báo khi user được nhắc tên trong bình luận task — qua engine (chỉ Telegram).
 * Mẫu `task_mention`; engine tự resolve telegram_chat_id + tôn trọng telegram_enabled.
 */
export async function sendTaskMentionTelegram(
  task: any,
  commentAuthor: string,
  mentionedUserIds: string[],
  commentExcerpt: string
): Promise<void> {
  try {
    if (!mentionedUserIds || mentionedUserIds.length === 0) return;
    const excerpt = commentExcerpt.length > 100
      ? commentExcerpt.substring(0, 100) + '...'
      : commentExcerpt;
    await notify('task.mention', {
      code: task.task_code || task.code || '',
      title: task.title || '',
      authorName: commentAuthor || 'Người dùng',
      excerpt,
    }, { recipients: mentionedUserIds.map(String), relatedId: task.id });
  } catch (error) {
    console.error('Error in sendTaskMentionTelegram:', error);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPriorityLabel(priority: string): string {
  const labels: { [key: string]: string } = {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    critical: 'Khẩn cấp',
  };
  return labels[priority] || priority;
}

function getStatusLabel(status: string): string {
  const labels: { [key: string]: string } = {
    todo: 'Chờ làm',
    in_progress: 'Đang làm',
    done: 'Hoàn thành',
    cancelled: 'Đã hủy',
  };
  return labels[status] || status;
}

function getTicketStatusLabel(status: string): string {
  const labels: { [key: string]: string } = {
    submitted: 'Chờ xử lý',
    in_progress: 'Đang xử lý',
    completed: 'Hoàn thành',
    rejected: 'Từ chối',
    closed: 'Đã đóng',
  };
  return labels[status] || status;
}

/**
 * Gửi thông báo tới tất cả Người Theo Dõi (watchers) của ticket.
 * Lọc theo watch_type: 'status' | 'comment' | 'all'
 * Bỏ qua: actor (người thực hiện), assigned_to, created_by (đã nhận notify riêng)
 */
export async function notifyTicketWatchers(opts: {
  ticket: any;
  eventType: 'status' | 'comment';
  actorId: string;
  actorName: string;
  // Dùng cho status change
  oldStatus?: string;
  newStatus?: string;
  // Dùng cho comment
  commentExcerpt?: string;
  /** User IDs đã được notify riêng (assigned_to, created_by...) — bỏ qua */
  excludeUserIds?: string[];
}): Promise<void> {
  const { ticket, eventType, actorId, actorName, oldStatus, newStatus, commentExcerpt, excludeUserIds = [] } = opts;

  try {
    // Lấy danh sách watchers phù hợp watch_type, bỏ actor + đã notify riêng
    const skipIds = [...new Set([actorId, ...excludeUserIds])].filter(Boolean);
    const skipPlaceholders = skipIds.map((_, i) => `$${i + 2}`).join(', ');

    const watchTypeFilter = eventType === 'status'
      ? `w.watch_type IN ('status', 'all')`
      : `w.watch_type IN ('comments', 'all')`;

    const watchers = await query<{
      user_id: string;
      user_name: string;
      telegram_chat_id: string | null;
      watch_type: string;
    }>(
      `SELECT w.user_id, u.name as user_name, u.telegram_chat_id, w.watch_type
         FROM ticket_watchers w
         JOIN users u ON w.user_id = u.id
        WHERE w.ticket_id = $1
          AND ${watchTypeFilter}
          ${skipIds.length ? `AND w.user_id NOT IN (${skipPlaceholders})` : ''}
        ORDER BY w.created_at ASC`,
      [ticket.id, ...skipIds]
    );

    if (watchers.length === 0) return;
    const ids = watchers.map(w => w.user_id);

    if (eventType === 'status' && oldStatus && newStatus) {
      const tgStatus: Record<string, string> = {
        open: '🔵 Mở', in_progress: '🟡 Đang Xử Lý', resolved: '✅ Đã Xử Lý', closed: '⚫ Đóng',
      };
      const tgPriority = ticket.priority === 'critical' ? '🔴 Critical'
        : ticket.priority === 'urgent' ? '🟠 Urgent'
        : ticket.priority === 'high' ? '🟡 High' : '🟢 Normal';
      await notify('ticket.watcherStatus', {
        code: ticket.code || '', title: ticket.title || '', actorName,
        oldLabel: getTicketStatusLabel(oldStatus), newLabel: getTicketStatusLabel(newStatus),
        oldStatusTg: tgStatus[oldStatus] || oldStatus, newStatusTg: tgStatus[newStatus] || newStatus, priorityTg: tgPriority,
      }, { recipients: ids, relatedId: ticket.id });
    } else if (eventType === 'comment' && commentExcerpt) {
      const excerptShort = commentExcerpt.substring(0, 80) + (commentExcerpt.length > 80 ? '...' : '');
      const excerptLong = commentExcerpt.length > 150 ? commentExcerpt.substring(0, 150) + '...' : commentExcerpt;
      await notify('ticket.watcherComment', {
        code: ticket.code || '', title: ticket.title || '', actorName, excerptShort, excerptLong,
      }, { recipients: ids, relatedId: ticket.id });
    }
  } catch (error) {
    console.error('[notifyTicketWatchers] error:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING NOTIFICATIONS — định tuyến theo Phân Quyền (in-app + Telegram)
//
// Người nhận = ai giữ quyền tương ứng trong module Phân Quyền:
//   - admin / super_admin: luôn nhận (mặc định có đủ quyền)
//   - người được cấp action 'notify' (Nhận thông báo) trên module liên quan
//   - người giữ action nghiệp vụ tự nhiên (vd hr-resources.approve, users.approve)
// → Cấu hình người nhận = tích/bỏ quyền trong Phân Quyền, không hardcode.
// ─────────────────────────────────────────────────────────────────────────────

interface NotifyRecipient {
  id: string;
  name: string;
  telegram_chat_id: string | null;
  telegram_enabled: boolean | null;
}

/**
 * Lấy danh sách người nhận thông báo cho 1 module:
 * admin/super_admin + bất kỳ ai có một trong các action (gồm 'notify') trên module đó.
 */
export async function getModulePermissionHolders(
  moduleId: string,
  actions: string[]
): Promise<NotifyRecipient[]> {
  const acts = [...new Set([...actions, 'notify'])];
  return query<NotifyRecipient>(
    `SELECT id, name, telegram_chat_id, telegram_enabled
       FROM users
      WHERE status = 'active'
        AND (role IN ('super_admin', 'admin')
             OR (module_permissions -> $1) ?| $2::text[])`,
    [moduleId, acts]
  );
}

/**
 * Lấy người nhận thông báo có scope theo công ty:
 * - super_admin: nhận tất cả (không lọc company)
 * - admin/HR permission: chỉ nhận nếu cùng company với companyId
 * Dùng cho các sự kiện offboarding/HR chỉ liên quan 1 công ty cụ thể.
 * EXPORT để mọi luồng thông báo fan-out theo vai trò dùng chung — KHÔNG tự query
 * "tất cả admin" trong service khác (sẽ bắn nhầm admin công ty không liên quan).
 */
export async function getModulePermissionHoldersByCompany(
  moduleId: string,
  actions: string[],
  companyId: string | null
): Promise<string[]> {
  const acts = [...new Set([...actions, 'notify'])];
  // Kèm công ty kiêm nhiệm (user_company_memberships) — admin/HR kiêm nhiệm
  // công ty liên quan vẫn nhận dù công ty chính khác.
  const rows = await query<{ id: string; role: string; company_id: string | null; member_company_ids: string[] }>(
    `SELECT u.id, u.role, u.company_id::text AS company_id,
            COALESCE(array_agg(DISTINCT m.company_id::text) FILTER (WHERE m.company_id IS NOT NULL), '{}') AS member_company_ids
       FROM users u
       LEFT JOIN user_company_memberships m ON m.user_id = u.id AND m.is_active = TRUE
      WHERE u.status = 'active'
        AND (u.role IN ('super_admin', 'admin')
             OR (u.module_permissions -> $1) ?| $2::text[])
      GROUP BY u.id, u.role, u.company_id`,
    [moduleId, acts]
  );
  return rows
    .filter((r) => {
      if (r.role === 'super_admin') return true;
      // Chưa xác định công ty (vd form public chưa chuẩn hóa): KHÔNG bắn cho admin
      // mọi công ty — chỉ người thực sự giữ quyền module + super_admin nhận.
      if (!companyId) return r.role !== 'admin';
      return r.company_id === companyId || (r.member_company_ids || []).includes(companyId);
    })
    .map((r) => r.id);
}

function _jobTitleOf(sub: any): string {
  return sub?.data?.job_title || sub?.data?.position || '';
}

/**
 * Thêm người chuẩn hóa (confirmed_by) vào danh sách nhận, kể cả khi họ không còn giữ quyền.
 * Lỗi tra cứu (vd id không hợp lệ) KHÔNG được làm hỏng việc gửi cho những người còn lại.
 */
async function addRecruiterRecipient(recipients: NotifyRecipient[], recruiterId?: string | null): Promise<void> {
  if (!recruiterId || recipients.some((r) => r.id === recruiterId)) return;
  try {
    const extra = await queryOne<NotifyRecipient>(
      `SELECT id, name, telegram_chat_id, telegram_enabled FROM users WHERE id = $1`,
      [recruiterId]
    );
    if (extra) recipients.push(extra);
  } catch (e) {
    console.error('[addRecruiterRecipient] lookup skipped:', e instanceof Error ? e.message : e);
  }
}

/** Nhân sự mới nộp biểu mẫu → báo bộ phận Tuyển Dụng cùng công ty (hr-resources). */
export async function notifyOnboardingSubmitted(sub: any): Promise<void> {
  try {
    const companyId: string | null = sub.data?.company_id ?? null;
    const ids = await getModulePermissionHoldersByCompany('hr-resources', ['view', 'edit', 'approve'], companyId);
    const jt = _jobTitleOf(sub);
    await notify('onboarding.submitted', {
      candidateName: sub.candidate_name,
      jtSuffix: jt ? ` · ${jt}` : '',
      jtLine: jt ? `💼 ${jt}\n` : '',
      emailLine: sub.candidate_email ? `✉️ ${sub.candidate_email}\n` : '',
    }, { recipients: ids.filter(Boolean), relatedId: sub.id });
  } catch (e) { console.error('[notifyOnboardingSubmitted]', e); }
}

/** Tuyển dụng gửi QTV → báo người có quyền duyệt người dùng cùng công ty (users.approve). */
export async function notifyOnboardingSentToAdmin(sub: any, actorId?: string | null): Promise<void> {
  try {
    const companyId: string | null = sub.data?.company_id ?? null;
    const ids = await getModulePermissionHoldersByCompany('users', ['approve'], companyId);
    const jt = _jobTitleOf(sub);
    await notify('onboarding.sentToAdmin', {
      candidateName: sub.candidate_name,
      jtSuffix: jt ? ` · ${jt}` : '',
      jtLine: jt ? `💼 ${jt}\n` : '',
    }, { recipients: ids.filter(id => id && id !== actorId), relatedId: sub.id });
  } catch (e) { console.error('[notifyOnboardingSentToAdmin]', e); }
}

/** QTV duyệt xong → báo lại bộ phận Tuyển Dụng cùng công ty (và người chuẩn hóa). */
export async function notifyOnboardingApproved(sub: any, actorId?: string | null): Promise<void> {
  try {
    const companyId: string | null = sub.data?.company_id ?? null;
    const hrIds = await getModulePermissionHoldersByCompany('hr-resources', ['view', 'edit', 'approve'], companyId);
    const ids = [...new Set([...hrIds, sub.confirmed_by].filter(Boolean))].filter(id => id !== actorId);
    await notify('onboarding.approved', { candidateName: sub.candidate_name },
      { recipients: ids, relatedId: sub.id });
  } catch (e) { console.error('[notifyOnboardingApproved]', e); }
}

/** QTV/Tuyển dụng từ chối → báo lại bộ phận Tuyển Dụng cùng công ty (và người chuẩn hóa). */
export async function notifyOnboardingRejected(sub: any, actorId?: string | null, reason?: string): Promise<void> {
  try {
    const companyId: string | null = sub.data?.company_id ?? null;
    const hrIds = await getModulePermissionHoldersByCompany('hr-resources', ['view', 'edit', 'approve'], companyId);
    const ids = [...new Set([...hrIds, sub.confirmed_by].filter(Boolean))].filter(id => id !== actorId);
    await notify('onboarding.rejected', {
      candidateName: sub.candidate_name,
      reasonSuffix: reason ? ` Lý do: ${reason}` : '',
      reasonLine: reason ? `📝 Lý do: ${reason}\n` : '',
    }, { recipients: ids, relatedId: sub.id });
  } catch (e) { console.error('[notifyOnboardingRejected]', e); }
}

function getRoomBookingStatusLabel(status: string): string {
  const labels: { [key: string]: string } = {
    pending: 'Chờ Duyệt',
    approved: 'Đã Duyệt',
    rejected: 'Từ Chối',
    cancelled: 'Đã Hủy',
    completed: 'Hoàn Thành',
  };
  return labels[status] || status;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE IN-APP NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

function _fmtVN(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleString('vi-VN', { ...opts, timeZone: 'Asia/Ho_Chi_Minh' });
}

/** ✅ Check-in thành công → gửi cho nhân viên */
export async function sendAttendanceCheckinNotification(
  userId: string,
  source: 'app' | 'machine' = 'app',
  userName?: string,
  at?: Date
): Promise<void> {
  try {
    const now = at ?? new Date();
    const time = _fmtVN(now, { hour: '2-digit', minute: '2-digit' });
    const date = _fmtVN(now, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const src  = source === 'machine' ? 'Máy vân tay' : 'Ứng dụng';
    const name = userName ?? await _resolveUserName(userId);
    await notify('attendance.checkin', { time, date, src, userName: name }, { recipients: [userId] });
  } catch (e) { console.error('[sendAttendanceCheckinNotification]', e); }
}

/** 🔚 Check-out thành công → gửi cho nhân viên */
export async function sendAttendanceCheckoutNotification(
  userId: string,
  source: 'app' | 'machine' = 'app',
  userName?: string,
  at?: Date
): Promise<void> {
  try {
    const now = at ?? new Date();
    const time = _fmtVN(now, { hour: '2-digit', minute: '2-digit' });
    const date = _fmtVN(now, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const src  = source === 'machine' ? 'Máy vân tay' : 'Ứng dụng';
    const name = userName ?? await _resolveUserName(userId);
    await notify('attendance.checkout', { time, date, src, userName: name }, { recipients: [userId] });
  } catch (e) { console.error('[sendAttendanceCheckoutNotification]', e); }
}

/** Tra tên hiển thị của user (fallback 'Nhân sự') — dùng cho biến thể Telegram cá nhân hoá. */
async function _resolveUserName(userId: string): Promise<string> {
  try {
    const u = await queryOne<{ name: string | null }>(`SELECT name FROM users WHERE id = $1`, [userId]);
    return u?.name || 'Nhân sự';
  } catch { return 'Nhân sự'; }
}

/**
 * 🎯 Bộ phận Tuyển Dụng liên kết ứng viên (CV) vào 1 yêu cầu tuyển dụng
 * → báo cho NGƯỜI TẠO yêu cầu: có CV phù hợp, vui lòng kiểm tra & đánh giá.
 * Self-contained: tự tra requisition (created_by, title) + tên ứng viên + telegram.
 */
export async function sendCandidateLinkedNotification(requisitionId: string, cvId: string): Promise<void> {
  try {
    const req = await queryOne<{ created_by: string | null; title: string }>(
      `SELECT created_by, title FROM requisitions WHERE id = $1`, [requisitionId]
    );
    if (!req?.created_by) return; // không xác định người yêu cầu → bỏ qua

    const cv = await queryOne<{ candidate_name: string | null }>(
      `SELECT candidate_name FROM hr_cv_pool WHERE id = $1`, [cvId]
    );
    const candidate = cv?.candidate_name || 'một ứng viên';
    const reqTitle = req.title || 'yêu cầu tuyển dụng';
    await notify('requisition.candidateLinked', { candidate, reqTitle }, { recipients: [req.created_by], relatedId: requisitionId });
  } catch (e) {
    console.error('[sendCandidateLinkedNotification]', e);
  }
}

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  new: 'Mới', screening: 'Sàng lọc', interviewed: 'Phỏng vấn',
  offered: 'Offer', hired: 'Đã Onboard', rejected: 'Loại', pool: 'Lưu kho',
};

/**
 * Đổi trạng thái ứng viên theo vị trí → báo cho PHÍA CÒN LẠI (người yêu cầu ↔ tuyển dụng).
 * - Người yêu cầu thao tác → báo người phụ trách (owner_id).
 * - Tuyển dụng thao tác → báo người yêu cầu (created_by).
 */
export async function sendApplicationStatusNotification(opts: {
  requisitionId: string; cvId: string; toStatus: string;
  actorRole: 'requester' | 'recruiter'; changedBy: string | null;
}): Promise<void> {
  try {
    const req = await queryOne<{ title: string; owner_id: string | null; created_by: string | null }>(
      `SELECT title, owner_id, created_by FROM requisitions WHERE id = $1`, [opts.requisitionId]
    );
    if (!req) return;

    // Người nhận = phía ĐỐI diện với người thao tác.
    const recipient = opts.actorRole === 'requester' ? req.owner_id : req.created_by;
    if (!recipient || recipient === opts.changedBy) return; // không tự báo cho chính mình

    const cv = await queryOne<{ candidate_name: string | null }>(
      `SELECT candidate_name FROM hr_cv_pool WHERE id = $1`, [opts.cvId]
    );
    let actorName = 'Hệ thống';
    if (opts.changedBy) {
      const u = await queryOne<{ name: string | null }>(`SELECT name FROM users WHERE id::text = $1`, [opts.changedBy]);
      actorName = u?.name || actorName;
    }
    // Người nhận là bên nào → mở đúng trang của họ.
    const url = opts.actorRole === 'requester' ? '/nguon-nhan-luc/yeu-cau-tuyen-dung' : '/yeu-cau-tuyen-dung';

    await notify('application.statusChanged', {
      candidate: cv?.candidate_name || 'một ứng viên',
      reqTitle: req.title || 'yêu cầu tuyển dụng',
      statusLabel: APPLICATION_STATUS_LABELS[opts.toStatus] || opts.toStatus,
      actorName,
      actorSide: opts.actorRole === 'requester' ? 'Người yêu cầu' : 'Bộ phận Tuyển dụng',
      url,
    }, { recipients: [recipient], relatedId: opts.requisitionId });
  } catch (e) {
    console.error('[sendApplicationStatusNotification]', e);
  }
}

const INTERVIEW_MODE_LABELS: Record<string, string> = { onsite: 'Trực tiếp', online: 'Online', phone: 'Điện thoại' };

/**
 * Lịch phỏng vấn (đặt / huỷ) → báo NGƯỜI PHỎNG VẤN + người phụ trách yêu cầu (in-app + Telegram).
 * `interview` là bản ghi từ interviewService (đã kèm interviewer_ids).
 */
export async function sendInterviewNotification(
  interview: {
    id: string; requisition_id: string; cv_id: string; round_label: string;
    scheduled_at: string; mode: string; location: string | null; meeting_link: string | null;
    interviewer_ids: string[];
  },
  kind: 'scheduled' | 'cancelled',
): Promise<void> {
  try {
    const req = await queryOne<{ title: string; owner_id: string | null }>(
      `SELECT title, owner_id FROM requisitions WHERE id = $1`, [interview.requisition_id]
    );
    const cv = await queryOne<{ candidate_name: string | null }>(
      `SELECT candidate_name FROM hr_cv_pool WHERE id = $1`, [interview.cv_id]
    );
    // Người nhận = người phỏng vấn + người phụ trách (loại trùng, bỏ rỗng).
    const recipients = [...new Set([...(interview.interviewer_ids || []), req?.owner_id].filter(Boolean) as string[])];
    if (recipients.length === 0) return;

    const when = new Date(interview.scheduled_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const candidate = cv?.candidate_name || 'ứng viên';
    const reqTitle = req?.title || 'yêu cầu tuyển dụng';

    if (kind === 'cancelled') {
      await notify('interview.cancelled', { candidate, reqTitle, round: interview.round_label, when },
        { recipients, relatedId: interview.requisition_id });
      return;
    }
    const where = interview.mode === 'online'
      ? (interview.meeting_link || 'link online')
      : (interview.location || 'sẽ thông báo');
    await notify('interview.scheduled', {
      candidate, reqTitle, round: interview.round_label, when,
      mode: INTERVIEW_MODE_LABELS[interview.mode] || interview.mode, where,
    }, { recipients, relatedId: interview.requisition_id });
  } catch (e) {
    console.error('[sendInterviewNotification]', e);
  }
}

/** ⏰ Khai báo tăng ca mới → gửi cho Quản Lý Trực Tiếp */
export async function sendOvertimeSubmittedNotification(opts: {
  managerId: string;
  employeeName: string;
  workDate: string;   // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  totalHours: string;
  overtimeId: string;
  /** Tên công ty của nhân viên — ngữ cảnh cho quản lý kiêm nhiệm. */
  companyName?: string | null;
}): Promise<void> {
  try {
    const d = new Date(opts.workDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const companyLine = opts.companyName ? `🏢 ${opts.companyName} · ` : '';
    await notify('overtime.submitted', {
      companyLine, employeeName: opts.employeeName, date: d, startTime: opts.startTime, endTime: opts.endTime, totalHours: opts.totalHours,
    }, { recipients: [opts.managerId], relatedId: opts.overtimeId });
  } catch (e) { console.error('[sendOvertimeSubmittedNotification]', e); }
}

/** ✅/❌ Kết quả duyệt tăng ca → gửi cho nhân viên */
export async function sendOvertimeReviewedNotification(opts: {
  employeeId: string;
  action: 'approved' | 'rejected';
  workDate: string;
  startTime: string;
  endTime: string;
  totalHours: string;
  reviewNote?: string | null;
  reviewerId?: string | null;
  overtimeId: string;
}): Promise<void> {
  try {
    const d = new Date(opts.workDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const reviewerName = opts.reviewerId ? await _resolveUserName(opts.reviewerId) : '';
    await notify('overtime.reviewed', {
      action: opts.action, date: d, startTime: opts.startTime, endTime: opts.endTime, totalHours: opts.totalHours,
      noteSuffix: opts.reviewNote ? ` — ${opts.reviewNote}` : '',
      reviewerLine: reviewerName ? `\n👤 Người duyệt: ${reviewerName}` : '',
      noteLine: opts.reviewNote ? `\n💬 Lý do từ chối: ${opts.reviewNote}` : '',
    }, { recipients: [opts.employeeId], relatedId: opts.overtimeId });
  } catch (e) { console.error('[sendOvertimeReviewedNotification]', e); }
}

/** 📋 Đề xuất bù công mới → gửi cho Quản Lý Trực Tiếp */
export async function sendAdjustmentSubmittedNotification(opts: {
  managerId: string;
  employeeName: string;
  adjustmentType: string; // code work-mode động (nhãn có fallback 'Bù Công')
  workDate: string;
  adjustmentId: string;
  /** Tên công ty của nhân viên — ngữ cảnh cho quản lý kiêm nhiệm. */
  companyName?: string | null;
}): Promise<void> {
  try {
    const typeLabel = ({
      bu_cong: 'Bù Công', bu_cong_dac_biet: 'Bù Công Đặc Thù', bu_checkin: 'Bù Giờ Vào', bu_checkout: 'Bù Giờ Ra',
      cong_tac: 'Công Tác', wfh: 'Làm Việc Tại Nhà', lam_theo_ca: 'Làm Theo Ca',
    } as Record<string, string>)[opts.adjustmentType] ?? 'Bù Công';
    const d = new Date(opts.workDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const companyLine = opts.companyName ? `🏢 ${opts.companyName} · ` : '';
    await notify('adjustment.submitted', { companyLine, typeLabel, employeeName: opts.employeeName, date: d },
      { recipients: [opts.managerId], relatedId: opts.adjustmentId });
  } catch (e) { console.error('[sendAdjustmentSubmittedNotification]', e); }
}

/** ✅/❌ Kết quả duyệt bù công → gửi cho nhân viên */
export async function sendAdjustmentReviewedNotification(opts: {
  employeeId: string;
  action: 'approved' | 'rejected';
  adjustmentType: string; // code work-mode động (nhãn có fallback 'Bù Công')
  workDate: string;
  reviewNote?: string | null;
  reviewerId?: string | null;
  adjustmentId: string;
}): Promise<void> {
  try {
    const typeLabel = ({
      bu_cong: 'Bù Công', bu_cong_dac_biet: 'Bù Công Đặc Thù', bu_checkin: 'Bù Giờ Vào', bu_checkout: 'Bù Giờ Ra',
      cong_tac: 'Công Tác', wfh: 'Làm Việc Tại Nhà', lam_theo_ca: 'Làm Theo Ca',
    } as Record<string, string>)[opts.adjustmentType] ?? 'Bù Công';
    const d     = new Date(opts.workDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const reviewerName = opts.reviewerId ? await _resolveUserName(opts.reviewerId) : '';
    await notify('adjustment.reviewed', {
      action: opts.action, typeLabel, date: d, noteSuffix: opts.reviewNote ? ` — ${opts.reviewNote}` : '',
      reviewerLine: reviewerName ? `\n👤 Người duyệt: ${reviewerName}` : '',
      noteLine: opts.reviewNote ? `\n💬 Lý do từ chối: ${opts.reviewNote}` : '',
    }, { recipients: [opts.employeeId], relatedId: opts.adjustmentId });
  } catch (e) { console.error('[sendAdjustmentReviewedNotification]', e); }
}

/** 🔄 Bù công tự động hủy → gửi cho nhân viên + Quản Lý */
export async function sendAdjustmentAutoCancelledNotification(opts: {
  employeeId: string;
  managerId?: string | null;
  employeeName?: string;
  adjustmentType: string; // code work-mode động (nhãn có fallback 'Bù Công')
  workDate: string;
  adjustmentId: string;
}): Promise<void> {
  try {
    const typeLabel = ({
      bu_cong: 'Bù Công', bu_cong_dac_biet: 'Bù Công Đặc Thù', bu_checkin: 'Bù Giờ Vào', bu_checkout: 'Bù Giờ Ra',
      cong_tac: 'Công Tác', wfh: 'Làm Việc Tại Nhà', lam_theo_ca: 'Làm Theo Ca',
    } as Record<string, string>)[opts.adjustmentType] ?? 'Bù Công';
    const d = new Date(opts.workDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Gửi cho nhân viên
    await notify('adjustment.autoCancelledEmployee', { typeLabel, date: d },
      { recipients: [opts.employeeId], relatedId: opts.adjustmentId });

    // Gửi cho Quản Lý Trực Tiếp
    if (opts.managerId) {
      await notify('adjustment.autoCancelledManager', { typeLabel, employeeName: opts.employeeName ?? 'Nhân viên', date: d },
        { recipients: [opts.managerId], relatedId: opts.adjustmentId });
    }
  } catch (e) { console.error('[sendAdjustmentAutoCancelledNotification]', e); }
}

/** 🌴 Đơn nghỉ phép mới → gửi cho Quản Lý Trực Tiếp */
export async function sendLeaveSubmittedNotification(opts: {
  managerId: string;
  employeeName: string;
  typeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  leaveId: string;
  /** Tên công ty của nhân viên — hiển thị ngữ cảnh (quan trọng cho quản lý kiêm nhiệm). */
  companyName?: string | null;
}): Promise<void> {
  try {
    const s = new Date(opts.startDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const e = new Date(opts.endDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const range = s === e ? s : `${s} → ${e}`;
    const companyLine = opts.companyName ? `🏢 ${opts.companyName} · ` : '';
    await notify('leave.submitted', {
      companyLine, employeeName: opts.employeeName, typeName: opts.typeName, range, totalDays: opts.totalDays,
    }, { recipients: [opts.managerId], relatedId: opts.leaveId });
  } catch (e) { console.error('[sendLeaveSubmittedNotification]', e); }
}

/** ✅/❌ Kết quả duyệt đơn nghỉ phép → gửi cho nhân viên */
export async function sendLeaveReviewedNotification(opts: {
  employeeId: string;
  action: 'approved' | 'rejected';
  typeName: string;
  startDate: string;
  endDate: string;
  totalDays?: number;
  reviewNote?: string | null;
  leaveId: string;
}): Promise<void> {
  try {
    const s = new Date(opts.startDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const e = new Date(opts.endDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const range = s === e ? s : `${s} → ${e}`;
    await notify('leave.reviewed', {
      action: opts.action, typeName: opts.typeName, range, noteSuffix: opts.reviewNote ? ` — ${opts.reviewNote}` : '',
      totalDays: opts.totalDays ?? '', noteLine: opts.reviewNote ? `\n💬 Ghi chú: ${opts.reviewNote}` : '',
    }, { recipients: [opts.employeeId], relatedId: opts.leaveId });
  } catch (e) { console.error('[sendLeaveReviewedNotification]', e); }
}

/** 📦 Tài sản được cấp/thu hồi → báo nhân viên (in-app + Telegram qua engine). */
export async function sendAssetAssignmentNotification(opts: {
  asset: { id: string; name: string; code?: string | null; brand?: string | null; model?: string | null; serial_number?: string | null };
  newAssignedTo?: string | null;
  oldAssignedTo?: string | null;
  performedByName: string;
}): Promise<void> {
  try {
    const a = opts.asset;
    const code = a.code || 'N/A';
    // Cấp cho người mới
    if (opts.newAssignedTo && opts.newAssignedTo !== opts.oldAssignedTo) {
      const brandLine  = a.brand ? `🏭 *Hãng:* ${a.brand}${a.model ? ' ' + a.model : ''}\n` : '';
      const serialLine = a.serial_number ? `🔖 *Serial:* ${a.serial_number}\n` : '';
      await notify('asset.assigned',
        { name: a.name, code, brandLine, serialLine, performedBy: opts.performedByName },
        { recipients: [opts.newAssignedTo], relatedId: a.id });
    }
    // Thu hồi từ người cũ
    if (opts.oldAssignedTo && (!opts.newAssignedTo || opts.newAssignedTo !== opts.oldAssignedTo)) {
      await notify('asset.revoked',
        { name: a.name, code, performedBy: opts.performedByName },
        { recipients: [opts.oldAssignedTo], relatedId: a.id });
    }
  } catch (e) { console.error('[sendAssetAssignmentNotification]', e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offboarding — Quy Trình Nghỉ Việc
// ─────────────────────────────────────────────────────────────────────────────

/** HCNS tạo quy trình nghỉ việc → báo người giữ quyền hr-resources. */
export async function notifyOffboardingCreated(proc: any, actorId?: string | null): Promise<void> {
  try {
    const emp = await queryOne<{ company_id: string | null }>(
      `SELECT company_id::text AS company_id FROM users WHERE id::text = $1`, [proc.user_id]
    ).catch(() => null);
    const companyId = emp?.company_id ?? null;

    const configured = await query<NotifyRecipient & { role: string; company_id: string | null }>(
      `SELECT u.id, u.name, u.telegram_chat_id, u.telegram_enabled, u.role, u.company_id::text AS company_id
         FROM offboarding_notify_recipients r
         JOIN users u ON u.id = r.user_id
        WHERE u.status = 'active'`
    ).catch(() => [] as (NotifyRecipient & { role: string; company_id: string | null })[]);

    let ids: string[];
    if (configured.length > 0) {
      ids = configured
        .filter((r) => r.role === 'super_admin' || !companyId || r.company_id === companyId)
        .map((r) => r.id)
        .filter((id) => id && id !== actorId);
    } else {
      ids = (await getModulePermissionHoldersByCompany('hr-resources', ['view', 'edit', 'approve'], companyId))
        .filter((id) => id !== actorId);
    }

    const deptLine = proc.department_name ? `🏢 ${proc.department_name}\n` : '';
    const dateLine = proc.last_working_date ? `📅 Ngày làm việc cuối: ${String(proc.last_working_date).slice(0, 10)}\n` : '';
    await notify('offboarding.created', {
      userName: proc.user_name || proc.user_id, deptLine, dateLine,
    }, { recipients: ids, relatedId: proc.id });
  } catch (e) { console.error('[notifyOffboardingCreated]', e); }
}

/** Thông báo riêng cho từng assignee về item được giao trong quy trình vừa tạo. */
export async function notifyOffboardingAssignees(proc: any, items: any[]): Promise<void> {
  try {
    const byAssignee = new Map<string, string[]>();
    for (const item of items) {
      if (!item.assignee_id) continue;
      if (!byAssignee.has(item.assignee_id)) byAssignee.set(item.assignee_id, []);
      byAssignee.get(item.assignee_id)!.push(item.title);
    }
    for (const [assigneeId, titles] of byAssignee.entries()) {
      const preview = titles.slice(0, 2).join(', ') + (titles.length > 2 ? `… (+${titles.length - 2})` : '');
      await notify('offboarding.assigned', {
        count: titles.length, userName: proc.user_name || proc.user_id, preview,
      }, { recipients: [assigneeId], relatedId: proc.id });
    }
  } catch (e) { console.error('[notifyOffboardingAssignees]', e); }
}

/** HCNS xác nhận đủ thủ tục → tài khoản đã inactive. Báo hr-resources + admin duyệt users (cùng công ty). */
export async function notifyOffboardingCompleted(proc: any, actorId?: string | null): Promise<void> {
  try {
    const emp = await queryOne<{ company_id: string | null }>(
      `SELECT company_id::text AS company_id FROM users WHERE id::text = $1`, [proc.user_id]
    ).catch(() => null);
    const companyId = emp?.company_id ?? null;

    const [hrIds, adminIds] = await Promise.all([
      getModulePermissionHoldersByCompany('hr-resources', ['view', 'edit', 'approve'], companyId),
      getModulePermissionHoldersByCompany('users', ['approve'], companyId),
    ]);
    const ids = [...new Set([...hrIds, ...adminIds])].filter((id) => id && id !== actorId);
    const deptLine = proc.department_name ? `🏢 ${proc.department_name}\n` : '';
    await notify('offboarding.completed', {
      userName: proc.user_name || proc.user_id, deptLine,
    }, { recipients: ids, relatedId: proc.id });
  } catch (e) { console.error('[notifyOffboardingCompleted]', e); }
}

/**
 * Telegram Bot Service
 * Gửi thông báo booking approval/rejection tới Telegram
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';

/**
 * Format ngày booking thành string dễ đọc (VD: "Thu 26/05/2026")
 */
function formatBookingDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Gửi thông báo duyệt booking tới Telegram cho một user (với inline button)
 */
export async function sendRoomBookingApprovalTelegramToUser(
  booking: any,
  approvedBy: string,
  userTelegramChatId?: string
): Promise<void> {
  // Nếu user không có telegram_chat_id, không gửi
  if (!userTelegramChatId) {
    console.log(
      `User ${booking.requested_by_name} không có Telegram Chat ID, bỏ qua`
    );
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram Bot Token chưa cấu hình, bỏ qua notification');
    return;
  }

  try {
    const message = `
✅ *BOOKING CỦA BẠN ĐÃ ĐƯỢC DUYỆT*

📍 *Phòng:* ${booking.room_name}
📅 *Ngày:* ${formatBookingDate(booking.booking_date)}
🕐 *Thời gian:* ${booking.start_time} - ${booking.end_time}
📝 *Mục đích:* ${booking.purpose}
✔️ *Duyệt bởi:* ${approvedBy}
`.trim();

    // Use production domain for booking URL (must be HTTPS)
    const bookingUrl = `${APP_URL}/room-bookings?bookingId=${booking.id}`;

    await sendTelegramMessageWithButton(
      message,
      userTelegramChatId,
      'Xem chi tiết',
      bookingUrl
    );
  } catch (error) {
    console.error(
      `Error sending Telegram approval to user ${booking.requested_by_name}:`,
      error
    );
  }
}

/**
 * Gửi thông báo duyệt booking tới Telegram (công khai - cho admin/broadcast)
 */
export async function sendRoomBookingApprovalTelegram(
  booking: any,
  approvedBy: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn(
      'Telegram Bot Token hoặc Chat ID chưa cấu hình, bỏ qua notification'
    );
    return;
  }

  try {
    const message = `
✅ *BOOKING ĐÃ ĐƯỢC DUYỆT*

📍 *Phòng:* ${booking.room_name}
👤 *Yêu cầu bởi:* ${booking.requested_by_name || 'N/A'}
📅 *Ngày:* ${formatBookingDate(booking.booking_date)}
🕐 *Thời gian:* ${booking.start_time} - ${booking.end_time}
📝 *Mục đích:* ${booking.purpose}
✔️ *Duyệt bởi:* ${approvedBy}

[Xem chi tiết](${process.env.NEXT_PUBLIC_APP_URL}/room-bookings)
`.trim();

    await sendTelegramMessage(message);
  } catch (error) {
    console.error('Error sending Telegram approval notification:', error);
  }
}

/**
 * Gửi thông báo từ chối booking tới Telegram cho một user (với inline button)
 */
export async function sendRoomBookingRejectionTelegramToUser(
  booking: any,
  rejectedBy: string,
  reason?: string,
  userTelegramChatId?: string
): Promise<void> {
  // Nếu user không có telegram_chat_id, không gửi
  if (!userTelegramChatId) {
    console.log(
      `User ${booking.requested_by_name} không có Telegram Chat ID, bỏ qua`
    );
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram Bot Token chưa cấu hình, bỏ qua notification');
    return;
  }

  try {
    const reasonText = reason ? `\n❌ *Lý do:* ${reason}` : '';
    const message = `
❌ *BOOKING CỦA BẠN BỊ TỪ CHỐI*

📍 *Phòng:* ${booking.room_name}
📅 *Ngày:* ${formatBookingDate(booking.booking_date)}
🕐 *Thời gian:* ${booking.start_time} - ${booking.end_time}
📝 *Mục đích:* ${booking.purpose}
👮 *Từ chối bởi:* ${rejectedBy}${reasonText}
`.trim();

    // Use production domain for booking URL (must be HTTPS)
    const bookingUrl = `${APP_URL}/room-bookings?bookingId=${booking.id}`;

    await sendTelegramMessageWithButton(
      message,
      userTelegramChatId,
      'Xem chi tiết',
      bookingUrl
    );
  } catch (error) {
    console.error(
      `Error sending Telegram rejection to user ${booking.requested_by_name}:`,
      error
    );
  }
}

/**
 * Gửi thông báo từ chối booking tới Telegram (công khai - broadcast)
 */
export async function sendRoomBookingRejectionTelegram(
  booking: any,
  rejectedBy: string,
  reason?: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn(
      'Telegram Bot Token hoặc Chat ID chưa cấu hình, bỏ qua notification'
    );
    return;
  }

  try {
    const reasonText = reason ? `\n❌ *Lý do:* ${reason}` : '';
    const message = `
❌ *BOOKING BỊ TỪ CHỐI*

📍 *Phòng:* ${booking.room_name}
👤 *Yêu cầu bởi:* ${booking.requested_by_name || 'N/A'}
📅 *Ngày:* ${formatBookingDate(booking.booking_date)}
🕐 *Thời gian:* ${booking.start_time} - ${booking.end_time}
📝 *Mục đích:* ${booking.purpose}
👮 *Từ chối bởi:* ${rejectedBy}${reasonText}

[Xem chi tiết](${process.env.NEXT_PUBLIC_APP_URL}/room-bookings)
`.trim();

    await sendTelegramMessage(message);
  } catch (error) {
    console.error('Error sending Telegram rejection notification:', error);
  }
}

/**
 * Gửi thông báo booking mới tới Super Admin qua Telegram (với inline button)
 */
export async function sendNewRoomBookingTelegramToAdmin(
  booking: any,
  adminTelegramChatId: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram Bot Token chưa cấu hình, bỏ qua notification');
    return;
  }

  try {
    // Escape markdown special characters
    const escapeMarkdown = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/-/g, '\\-')
        .replace(/\=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.');
    };

    const message = `📌 *BOOKING MỚI*

📍 *Phòng:* ${escapeMarkdown(booking.room_name)}
👤 *Yêu cầu bởi:* ${escapeMarkdown(booking.requested_by_name || 'N/A')}
📅 *Ngày:* ${formatBookingDate(booking.booking_date)}
🕐 *Thời gian:* ${booking.start_time} - ${booking.end_time}
📝 *Mục đích:* ${escapeMarkdown(booking.purpose || '')}

⏳ *Trạng thái:* Chờ duyệt`;

    // Use production domain for booking URL (must be HTTPS)
    const bookingUrl = `${APP_URL}/room-bookings?bookingId=${booking.id}`;

    // Send with inline button
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: adminTelegramChatId,
        text: message,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Xem chi tiết',
                url: bookingUrl,
              },
            ],
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      throw new Error(
        `Telegram API error: ${error.description || response.statusText}`
      );
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram error: ${result.description}`);
    }

    console.log(`✓ New booking notification with button sent to admin`);
  } catch (error) {
    console.error('Error sending new booking notification to admin:', error);
  }
}

/**
 * Gửi message tới Telegram Chat ID cụ thể
 * @param text - Nội dung message (hỗ trợ Markdown)
 * @param chatId - Chat ID đích
 */
export async function sendTelegramMessageToChat(
  text: string,
  chatId: string,
  botToken?: string
): Promise<void> {
  const tok = botToken || TELEGRAM_BOT_TOKEN;
  if (!tok) {
    throw new Error('Telegram Bot Token missing');
  }
  const apiBase = `https://api.telegram.org/bot${tok}`;

  // Tương thích CẢ 2 thứ tự gọi: (text, chatId) lẫn (chatId, text).
  // chat_id Telegram LUÔN là số nguyên (âm cho group/channel); nội dung tin nhắn thì không.
  // Nếu tham số "chatId" không phải số mà "text" lại là số → caller gọi ngược → tự hoán đổi.
  const isId = (v: string) => /^-?\d+$/.test((v ?? '').trim());
  let realChatId = chatId;
  let realText = text;
  if (!isId(chatId) && isId(text)) {
    realChatId = text;
    realText = chatId;
  }

  try {
    const response = await fetch(`${apiBase}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: realChatId,
        text: realText,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      throw new Error(
        `Telegram API error: ${error.description || response.statusText}`
      );
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram error: ${result.description}`);
    }

    console.log(`✓ Telegram notification sent to ${realChatId}`);
  } catch (error) {
    console.error(
      `Error sending Telegram message to ${realChatId}:`,
      error
    );
    throw error;
  }
}

/**
 * Gửi ẢNH (poster) tới 1 chat Telegram — dùng cho broadcast thông báo có ảnh.
 * @param chatId  chat/group đích
 * @param photo   nội dung ảnh (Buffer)
 * @param caption chú thích (Markdown), tối đa 1024 ký tự
 */
export async function sendTelegramPhotoToChat(
  chatId: string,
  photo: Buffer,
  caption?: string,
  fileName = 'poster.jpg',
  mimeType = 'image/jpeg',
  botToken?: string,
): Promise<void> {
  const tok = botToken || TELEGRAM_BOT_TOKEN;
  if (!tok) throw new Error('Telegram Bot Token missing');
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) { form.append('caption', caption.slice(0, 1024)); form.append('parse_mode', 'Markdown'); }
  form.append('photo', new Blob([new Uint8Array(photo)], { type: mimeType }), fileName);
  const res = await fetch(`https://api.telegram.org/bot${tok}/sendPhoto`, { method: 'POST', body: form });
  const j = await res.json().catch(() => ({} as any));
  if (!j.ok) {
    console.error('Telegram sendPhoto error:', j.description);
    throw new Error(`Telegram sendPhoto: ${j.description || res.statusText}`);
  }
  console.log(`✓ Telegram photo sent to ${chatId}`);
}

/**
 * Gửi message tới Telegram với inline button
 * @param text - Nội dung message
 * @param chatId - Chat ID đích
 * @param buttonText - Text của button
 * @param buttonUrl - URL khi click button
 */
export async function sendTelegramMessageWithButton(
  text: string,
  chatId: string,
  buttonText: string,
  buttonUrl: string,
  botToken?: string
): Promise<void> {
  const tok = botToken || TELEGRAM_BOT_TOKEN;
  if (!tok) {
    throw new Error('Telegram Bot Token missing');
  }
  const apiBase = `https://api.telegram.org/bot${tok}`;

  try {
    const response = await fetch(`${apiBase}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: buttonText,
                url: buttonUrl,
              },
            ],
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      throw new Error(
        `Telegram API error: ${error.description || response.statusText}`
      );
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram error: ${result.description}`);
    }

    console.log(`✓ Telegram notification with button sent to ${chatId}`);
  } catch (error) {
    console.error(
      `Error sending Telegram message with button to ${chatId}:`,
      error
    );
    throw error;
  }
}

/**
 * Gửi message tới Telegram (công khai - chat ID cố định từ env)
 * @param text - Nội dung message (hỗ trợ Markdown)
 */
async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Telegram configuration missing');
  }

  try {
    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      throw new Error(
        `Telegram API error: ${error.description || response.statusText}`
      );
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram error: ${result.description}`);
    }

    console.log('✓ Telegram notification sent successfully');
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error;
  }
}

/**
 * Gửi thông báo thay đổi trạng thái ticket tới Telegram cho một user (với inline button)
 */
export async function sendTicketStatusChangeTelegram(
  ticket: any,
  oldStatus: string,
  newStatus: string,
  changedBy: string,
  userTelegramChatId?: string
): Promise<void> {
  if (!userTelegramChatId) {
    console.log(`User không có Telegram Chat ID, bỏ qua`);
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram Bot Token chưa cấu hình, bỏ qua notification');
    return;
  }

  try {
    const statusLabels: { [key: string]: string } = {
      'open': '🔵 Mở',
      'in_progress': '🟡 Đang Xử Lý',
      'resolved': '✅ Đã Xử Lý',
      'closed': '⚫ Đóng',
    };

    const oldStatusLabel = statusLabels[oldStatus] || oldStatus;
    const newStatusLabel = statusLabels[newStatus] || newStatus;
    const priorityLabel = ticket.priority === 'critical' ? '🔴 Critical' :
                         ticket.priority === 'urgent' ? '🟠 Urgent' :
                         ticket.priority === 'high' ? '🟡 High' : '🟢 Normal';

    const message = `🔄 *TICKET CỦA BẠN CÓ CẬP NHẬT*

🎫 *Mã:* ${ticket.code}
📝 *Tiêu đề:* ${ticket.title}
━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Cập nhật:*
• Trạng thái: ${oldStatusLabel} → ${newStatusLabel}
• Ưu tiên: ${priorityLabel}
• Cập nhật bởi: ${changedBy}
`.trim();

    // Use production domain for ticket URL (must be HTTPS)
    const ticketUrl = `${APP_URL}/tickets/admin?ticketId=${ticket.id}`;

    await sendTelegramMessageWithButton(
      message,
      userTelegramChatId,
      'Xem chi tiết',
      ticketUrl
    );
  } catch (error) {
    console.error(
      `Error sending Telegram ticket status change:`,
      error
    );
  }
}

/**
 * Gửi thông báo cập nhật trạng thái Task tới Telegram
 */
export async function sendTaskStatusChangeTelegram(
  task: any,
  oldStatus: string,
  newStatus: string,
  changedBy: string,
  userTelegramChatId?: string
): Promise<void> {
  if (!userTelegramChatId) {
    console.log(`User không có Telegram Chat ID, bỏ qua`);
    return;
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram Bot Token chưa cấu hình, bỏ qua notification');
    return;
  }

  try {
    const statusLabels: { [key: string]: string } = {
      'todo': '📌 Chưa Bắt Đầu',
      'in_progress': '🟡 Đang Thực Hiện',
      'done': '✅ Hoàn Thành',
      'cancelled': '⚫ Đã Hủy',
    };

    const priorityLabels: { [key: string]: string } = {
      'low': '🟢 Thấp',
      'medium': '🟡 Trung Bình',
      'high': '🔴 Cao',
    };

    const oldStatusLabel = statusLabels[oldStatus] || oldStatus;
    const newStatusLabel = statusLabels[newStatus] || newStatus;
    const priorityLabel = priorityLabels[task.priority] || task.priority;

    const message = `🔄 *CÔNG VIỆC CỦA BẠN CÓ CẬP NHẬT*

📋 *Mã:* ${task.code}
📝 *Tiêu đề:* ${task.title}
━━━━━━━━━━━━━━━━━━━━━━━━
📊 *Cập nhật:*
• Trạng thái: ${oldStatusLabel} → ${newStatusLabel}
• Ưu tiên: ${priorityLabel}
• Cập nhật bởi: ${changedBy}
`.trim();

    // Use production domain for task URL (must be HTTPS)
    const taskUrl = `${APP_URL}/tasks?taskId=${task.id}`;

    await sendTelegramMessageWithButton(
      message,
      userTelegramChatId,
      'Xem chi tiết',
      taskUrl
    );
  } catch (error) {
    console.error(
      `Error sending Telegram task status change:`,
      error
    );
  }
}

// ============================================================================
// PHÊ DUYỆT TRỰC TIẾP TRÊN TELEGRAM (inline callback buttons)
// ============================================================================

/**
 * Gửi yêu cầu phê duyệt tới Telegram của người duyệt, kèm nút:
 *  [✅ Duyệt] [❌ Từ chối]  (callback_data — xử lý ở webhook)
 *  [🔍 Xem chi tiết]        (URL mở web app)
 * Trả về { chat_id, message_id } để có thể sửa tin nhắn sau (hoặc null nếu lỗi).
 */
export async function sendTelegramApprovalRequest(
  chatId: string,
  text: string,
  opts: { approveData: string; rejectData: string; detailUrl?: string; detailText?: string },
): Promise<{ chat_id: string; message_id: number } | null> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('Telegram Bot Token chưa cấu hình, bỏ qua approval request');
    return null;
  }
  if (!chatId) return null;

  const rows: any[] = [
    [
      { text: '✅ Duyệt', callback_data: opts.approveData },
      { text: '❌ Từ chối', callback_data: opts.rejectData },
    ],
  ];
  if (opts.detailUrl) rows.push([{ text: opts.detailText || '🔍 Xem chi tiết', url: opts.detailUrl }]);

  try {
    const res = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: rows },
      }),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error('sendTelegramApprovalRequest error:', json.description);
      return null;
    }
    return { chat_id: String(chatId), message_id: json.result.message_id };
  } catch (e) {
    console.error('sendTelegramApprovalRequest exception:', e);
    return null;
  }
}

/**
 * Nhắc trả phòng kèm nút GIA HẠN NHANH (callback_data — xử lý ở webhook):
 *  [＋15 phút] [＋30 phút] [＋60 phút]
 *  [🔍 Xem lịch đặt phòng] (URL)
 * callback_data dạng `xtd:<bookingId>:<minutes>`.
 */
export async function sendTelegramCheckoutReminder(
  chatId: string,
  text: string,
  bookingId: string,
  detailUrl?: string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return false;
  const rows: any[] = [
    [15, 30, 60].map((m) => ({ text: `＋${m} phút`, callback_data: `xtd:${bookingId}:${m}` })),
  ];
  if (detailUrl) rows.push([{ text: '🔍 Xem lịch đặt phòng', url: detailUrl }]);
  try {
    const res = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: rows },
      }),
    });
    const json = await res.json();
    if (!json.ok) { console.error('sendTelegramCheckoutReminder error:', json.description); return false; }
    return true;
  } catch (e) {
    console.error('sendTelegramCheckoutReminder exception:', e);
    return false;
  }
}

/** Trả lời callback_query (toast nhỏ hiện trên Telegram). */
export async function answerTelegramCallback(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200), show_alert: showAlert }),
    });
  } catch (e) {
    console.error('answerTelegramCallback error:', e);
  }
}

/** Sửa nội dung 1 tin nhắn + gỡ nút (sau khi đã xử lý xong để chống bấm lại). */
export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`${TELEGRAM_API_URL}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch (e) {
    console.error('editTelegramMessage error:', e);
  }
}

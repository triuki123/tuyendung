/**
 * bookingBotHandler — máy trạng thái hội thoại /booking cho bot FADO Notification.
 * Luồng: phòng → ngày → giờ bắt đầu → giờ kết thúc → mục đích → xác nhận.
 * Slot cố định (bookingConfig); slot trùng lịch tô 🔴 và chặn chọn.
 * Trả về true nếu đã xử lý update (để webhook dừng, không rơi xuống luồng duyệt).
 */
import {
  sendMessage, editMessageText, answerCallback, setBookingCommands, esc, type TgKeyboard,
} from '@/lib/telegram/bookingBot';
import {
  getLinkedUser, getActiveRooms, getBusyIntervals, getState, saveState, clearState,
  createBookingFromBot, type BookingState, type LinkedUser,
} from '@/lib/services/bookingBotService';
import { generateSlots, toMin, compactToHHMM, DEFAULT_BOOKING_SLOTS } from '@/lib/config/bookingConfig';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
const compact = (hhmm: string) => hhmm.replace(':', '');

// ─── Tiện ích ngày (giờ VN) ──────────────────────────────────────────────────
function vnToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
/** Danh sách N ngày kế tiếp tính từ hôm nay (giờ VN) — {value: YYYY-MM-DD, label}. */
function vnDateOptions(n: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const todayStr = vnToday();
  // Mốc 12:00 +07 cho ngày hôm nay để cộng ngày không bị lệch múi giờ.
  const base = new Date(`${todayStr}T12:00:00+07:00`);
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
    let label: string;
    if (i === 0) label = 'Hôm nay';
    else if (i === 1) label = 'Ngày mai';
    else {
      const wd = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(d);
      const dm = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(d);
      label = `${wd} ${dm}`;
    }
    out.push({ value, label });
  }
  return out;
}
function fmtDateLabel(value: string): string {
  const d = new Date(`${value}T12:00:00+07:00`);
  const wd = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(d);
  const dm = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  return `${wd} ${dm}`;
}

// ─── Dựng màn hình theo bước ─────────────────────────────────────────────────
interface Screen { text: string; kb: TgKeyboard }
const CANCEL_ROW = [{ text: '✖️ Huỷ', callback_data: 'b:cancel' }];

async function roomScreen(): Promise<Screen> {
  const rooms = await getActiveRooms();
  if (rooms.length === 0) return { text: '🏢 Hiện chưa có phòng họp nào khả dụng.', kb: [] };
  const kb: TgKeyboard = rooms.map(r => [{
    text: `🏟️ ${r.name}${r.capacity ? ` · ${r.capacity} chỗ` : ''}`,
    callback_data: `b:room:${r.id}`,
  }]);
  kb.push(CANCEL_ROW);
  return { text: '📅 *Đặt phòng họp*\n\nChọn phòng:', kb };
}

function dateScreen(roomName: string): Screen {
  const days = vnDateOptions(7);
  const kb: TgKeyboard = [];
  for (let i = 0; i < days.length; i += 2) {
    kb.push(days.slice(i, i + 2).map(d => ({ text: d.label, callback_data: `b:date:${d.value}` })));
  }
  kb.push(CANCEL_ROW);
  return { text: `🏟️ *${esc(roomName)}*\n\nChọn ngày:`, kb };
}

async function startScreen(state: BookingState): Promise<Screen> {
  const busy = await getBusyIntervals(state.roomName!, state.date!);
  const busyMin = busy.map(b => ({ s: toMin(b.start), e: toMin(b.end) }));
  const slots = generateSlots().filter(s => s !== DEFAULT_BOOKING_SLOTS.closeTime); // giờ bắt đầu < giờ đóng
  const kb: TgKeyboard = [];
  let row: { text: string; callback_data: string }[] = [];
  for (const s of slots) {
    const t = toMin(s);
    const isBusy = busyMin.some(b => t >= b.s && t < b.e);
    row.push({ text: `${isBusy ? '🔴' : '🟢'} ${s}`, callback_data: isBusy ? 'b:busy' : `b:start:${compact(s)}` });
    if (row.length === 3) { kb.push(row); row = []; }
  }
  if (row.length) kb.push(row);
  kb.push(CANCEL_ROW);
  return {
    text: `🏟️ *${esc(state.roomName!)}* · ${fmtDateLabel(state.date!)}\n\nChọn *giờ bắt đầu* (🟢 trống · 🔴 đã đặt):`,
    kb,
  };
}

async function endScreen(state: BookingState): Promise<Screen> {
  const busy = await getBusyIntervals(state.roomName!, state.date!);
  const busyMin = busy.map(b => ({ s: toMin(b.start), e: toMin(b.end) }));
  const startMin = toMin(state.start!);
  const slots = generateSlots().filter(s => toMin(s) > startMin); // giờ kết thúc sau giờ bắt đầu
  const kb: TgKeyboard = [];
  let row: { text: string; callback_data: string }[] = [];
  for (const s of slots) {
    const endMin = toMin(s);
    // Hợp lệ nếu khoảng [start, end) KHÔNG chồng bất kỳ khoảng bận nào.
    const overlap = busyMin.some(b => b.s < endMin && b.e > startMin);
    row.push({ text: `${overlap ? '🔴' : '🟢'} ${s}`, callback_data: overlap ? 'b:busy' : `b:end:${compact(s)}` });
    if (row.length === 3) { kb.push(row); row = []; }
  }
  if (row.length) kb.push(row);
  kb.push(CANCEL_ROW);
  return {
    text: `🏟️ *${esc(state.roomName!)}* · ${fmtDateLabel(state.date!)}\n🕐 Bắt đầu: *${state.start}*\n\nChọn *giờ kết thúc*:`,
    kb,
  };
}

function purposeScreen(state: BookingState): Screen {
  return {
    text: `🏟️ *${esc(state.roomName!)}* · ${fmtDateLabel(state.date!)}\n🕐 *${state.start}–${state.end}*\n\nNhập *mục đích* cuộc họp (gõ tin nhắn), hoặc bấm Bỏ qua:`,
    kb: [[{ text: '⏭️ Bỏ qua', callback_data: 'b:purpose_skip' }], CANCEL_ROW],
  };
}

function confirmScreen(state: BookingState): Screen {
  return {
    text:
      `📋 *Xác nhận đặt phòng*\n\n` +
      `🏟️ Phòng: *${esc(state.roomName!)}*\n` +
      `📅 Ngày: *${fmtDateLabel(state.date!)}*\n` +
      `🕐 Giờ: *${state.start}–${state.end}*\n` +
      `📝 Mục đích: ${esc(state.purpose || '(không ghi)')}\n\n` +
      `_Đặt xong sẽ chờ quản trị duyệt._`,
    kb: [[
      { text: '✅ Xác nhận đặt', callback_data: 'b:confirm' },
      { text: '✖️ Huỷ', callback_data: 'b:cancel' },
    ]],
  };
}

function notLinkedScreen(): Screen {
  return {
    text: '🔗 Tài khoản Telegram của bạn chưa liên kết với FADO AssetFlow.\n\nVào webapp → *Hồ sơ cá nhân* để liên kết Telegram, sau đó quay lại gõ /booking.',
    kb: [[{ text: 'Mở AssetFlow', url: APP_URL }]],
  };
}

// ─── Điểm vào: tin nhắn (message) ────────────────────────────────────────────
export async function handleBookingMessage(message: any): Promise<boolean> {
  const text: string = (message?.text ?? '').trim();
  const chatId = message?.chat?.id;
  const fromId = String(message?.from?.id ?? '');
  if (!chatId || !fromId) return false;

  const isStart = /^\/start\b/.test(text);
  const isBooking = /^\/booking\b/.test(text);

  if (isStart || isBooking) {
    void setBookingCommands();
    const user = await getLinkedUser(fromId);
    if (!user) { const s = notLinkedScreen(); await sendMessage(chatId, s.text, s.kb); return true; }
    await saveState(fromId, { step: 'room' });
    const s = await roomScreen();
    await sendMessage(chatId, s.text, s.kb);
    return true;
  }

  // Đang chờ nhập mục đích → nhận text làm mục đích.
  const state = await getState(fromId);
  if (state?.awaitingPurpose && text) {
    state.purpose = text.slice(0, 300);
    state.awaitingPurpose = false;
    state.step = 'confirm';
    await saveState(fromId, state);
    const s = confirmScreen(state);
    await sendMessage(chatId, s.text, s.kb);
    return true;
  }

  return false; // không thuộc luồng booking
}

// ─── Điểm vào: callback (bấm nút) ────────────────────────────────────────────
export async function handleBookingCallback(cb: any): Promise<boolean> {
  const data: string = cb?.data ?? '';
  if (!data.startsWith('b:')) return false;

  const callbackId: string = cb.id;
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const fromId = String(cb.from?.id ?? '');

  const user = await getLinkedUser(fromId);
  if (!user) { await answerCallback(callbackId, 'Tài khoản chưa liên kết Telegram', true); return true; }

  if (data === 'b:busy') {
    await answerCallback(callbackId, 'Khung giờ này đã có người đặt — chọn giờ khác nhé.', true);
    return true;
  }
  if (data === 'b:cancel') {
    await clearState(fromId);
    await editMessageText(chatId, messageId, '✖️ Đã huỷ thao tác đặt phòng.');
    await answerCallback(callbackId, 'Đã huỷ');
    return true;
  }

  const state = (await getState(fromId)) ?? { step: 'room' as const };

  // b:room:<id>
  if (data.startsWith('b:room:')) {
    const roomId = data.slice('b:room:'.length);
    const rooms = await getActiveRooms();
    const room = rooms.find(r => r.id === roomId);
    if (!room) { await answerCallback(callbackId, 'Phòng không khả dụng', true); return true; }
    state.roomId = room.id; state.roomName = room.name; state.step = 'date';
    await saveState(fromId, state);
    const s = dateScreen(room.name);
    await editMessageText(chatId, messageId, s.text, s.kb);
    await answerCallback(callbackId);
    return true;
  }

  // b:date:<YYYY-MM-DD>
  if (data.startsWith('b:date:')) {
    state.date = data.slice('b:date:'.length); state.step = 'start';
    await saveState(fromId, state);
    const s = await startScreen(state);
    await editMessageText(chatId, messageId, s.text, s.kb);
    await answerCallback(callbackId);
    return true;
  }

  // b:start:<HHMM>
  if (data.startsWith('b:start:')) {
    state.start = compactToHHMM(data.slice('b:start:'.length)); state.step = 'end';
    await saveState(fromId, state);
    const s = await endScreen(state);
    await editMessageText(chatId, messageId, s.text, s.kb);
    await answerCallback(callbackId);
    return true;
  }

  // b:end:<HHMM>
  if (data.startsWith('b:end:')) {
    const end = compactToHHMM(data.slice('b:end:'.length));
    // Kiểm tra lại chống trùng (đề phòng có người vừa đặt trong lúc đang chọn).
    const busy = await getBusyIntervals(state.roomName!, state.date!);
    const sMin = toMin(state.start!); const eMin = toMin(end);
    const overlap = busy.some(b => toMin(b.start) < eMin && toMin(b.end) > sMin);
    if (!(eMin > sMin) || overlap) {
      await answerCallback(callbackId, 'Khung giờ vừa bị đặt — chọn lại giúp mình nhé.', true);
      const s = await endScreen(state);
      await editMessageText(chatId, messageId, s.text, s.kb);
      return true;
    }
    state.end = end; state.step = 'purpose'; state.awaitingPurpose = true;
    await saveState(fromId, state);
    const s = purposeScreen(state);
    await editMessageText(chatId, messageId, s.text, s.kb);
    await answerCallback(callbackId);
    return true;
  }

  // b:purpose_skip
  if (data === 'b:purpose_skip') {
    state.purpose = ''; state.awaitingPurpose = false; state.step = 'confirm';
    await saveState(fromId, state);
    const s = confirmScreen(state);
    await editMessageText(chatId, messageId, s.text, s.kb);
    await answerCallback(callbackId);
    return true;
  }

  // b:confirm — tạo booking (clear state TRƯỚC để chống bấm 2 lần).
  if (data === 'b:confirm') {
    const captured = await getState(fromId);
    if (!captured || !captured.roomName || !captured.date || !captured.start || !captured.end) {
      await answerCallback(callbackId, 'Phiên đặt đã hết hạn, gõ /booking để đặt lại.', true);
      return true;
    }
    await clearState(fromId);
    try {
      await createBookingFromBot({
        user: user as LinkedUser,
        roomName: captured.roomName, date: captured.date,
        start: captured.start, end: captured.end, purpose: captured.purpose ?? '',
      });
      await editMessageText(
        chatId, messageId,
        `✅ *Đã gửi yêu cầu đặt phòng!*\n\n🏟️ ${esc(captured.roomName)} · ${fmtDateLabel(captured.date)}\n🕐 ${captured.start}–${captured.end}\n\n_Đang chờ quản trị duyệt — bạn sẽ nhận thông báo khi có kết quả._`
      );
      await answerCallback(callbackId, 'Đã gửi yêu cầu');
    } catch (e) {
      console.error('booking confirm error:', e);
      await answerCallback(callbackId, 'Lỗi tạo đặt phòng, thử lại sau.', true);
    }
    return true;
  }

  await answerCallback(callbackId);
  return true;
}

/**
 * solaceBotHandler — bộ não bot Solace: /start + liên kết + FSM đặt món (chọn TỪNG BƯỚC),
 * mã giảm giá, giao hàng trong toà nhà, "Đơn của tôi", và ADMIN điều khiển đơn qua nút.
 * Tái dùng nghiệp vụ: getPosMenu, createWebOrder, validateVoucher, VietQR.
 * Policy A: phải liên kết tài khoản mới đặt.
 */
import QRCode from 'qrcode';
import { formatVND } from '@/lib/format';
import { getPosMenu } from '@/lib/services/solaceCatalogService';
import { createWebOrder, listMyOrders, cancelMyOrder } from '@/lib/services/solaceCustomerOrderService';
import { getBankConfig, getDebtConfig, getOperatingConfig, getMinigameConfig } from '@/lib/services/solaceSettingsService';
import { validateVoucher } from '@/lib/services/solaceVoucherService';
import { claimMinigame } from '@/lib/services/solaceMinigameService';
import { getOrCreateWallet } from '@/lib/services/solaceWalletService';
import { isShopOpen } from '@/lib/config/solaceConfig';
import { buildVietQrPayload } from '@/lib/vietqr';
import { updateOrderStatus, markOrderPaid, getOrder, cancelOrder, changeUnpaidOrderMethodByCustomer, type OrderStatus, type PaymentForm } from '@/lib/services/solaceOrderService';
import { canManageSolace } from '@/lib/services/solacePermissionService';
import { sendMessage, editMessageText, answerCallback, sendPhoto, esc, type TgKeyboard } from '@/lib/solace/solaceBot';
import { controlKeyboard, sendToOperators, editAllOrderMessages, orderSummary } from '@/lib/solace/solaceBotAdmin';
import {
  getLinkedUser, linkByToken, getCart, saveCart, clearCart, claimCart, claimCooldown,
  recordSubscriber, setSubscriberOptOut, type CartData, type CartLine,
} from '@/lib/solace/solaceBotService';

const MAX_LINES = 30;   // chặn giỏ quá lớn
const MAX_QTY = 99;     // chặn số lượng phi lý

/** Giờ VN hiện tại "HH:MM". */
function vnNowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';

type Menu = Awaited<ReturnType<typeof getPosMenu>>;
type MenuProduct = Menu['products'][number];
interface Screen { text: string; kb: TgKeyboard }

function lineTotal(l: CartLine): number { return l.unit_price * l.qty; }
function subtotal(c: CartData): number { return c.lines.reduce((s, l) => s + lineTotal(l), 0); }

/**
 * Bàn phím menu chính. Async vì cần đọc cấu hình minigame (ẩn nút quà khi tắt)
 * và số dư ví hiện có để hiển thị ngay trên nút.
 */
async function mainMenuKb(userId: string): Promise<TgKeyboard> {
  const kb: TgKeyboard = [[{ text: '☕ Đặt món', callback_data: 's:menu' }, { text: '🧾 Đơn của tôi', callback_data: 's:orders' }]];

  // Chỉ hiện "Nhận quà sáng" khi minigame đang bật.
  let mgEnabled = false;
  try { mgEnabled = (await getMinigameConfig()).enabled; } catch { /* lỗi đọc cấu hình → ẩn nút cho an toàn */ }
  if (mgEnabled) kb.push([{ text: '🎁 Nhận quà sáng', callback_data: 's:gift' }]);

  // Nút ví: hiển thị số dư hiện có (vẫn dẫn tới trang Ví của webapp).
  let balance = 0;
  if (userId) { try { balance = (await getOrCreateWallet(userId)).balance; } catch { /* không lấy được số dư → hiện 0 */ } }
  kb.push([{ text: `👛 Số dư ví: ${formatVND(balance)}`, url: `${APP_URL}/solace/vi` }]);

  return kb;
}
function welcomeText(name: string): string {
  return `☕ *Chào ${esc(name)}!*\nChào mừng đến *Quán Cà Phê Solace* 🐾\n\nChọn *Đặt món* để bắt đầu.`;
}

// ─── ENTRY ───────────────────────────────────────────────────────────────────
export async function handleUpdate(update: Record<string, unknown>): Promise<void> {
  const cb = update.callback_query as Record<string, unknown> | undefined;
  if (cb) return handleCallback(cb);
  const msg = update.message as Record<string, unknown> | undefined;
  if (msg) return handleMessage(msg);
}

// ─── MESSAGE (/start, nhập tầng / mã giảm giá / ghi chú) ─────────────────────
async function handleMessage(msg: Record<string, unknown>): Promise<void> {
  const chat = (msg.chat as { id: number })?.id;
  const fromObj = msg.from as { id: number; first_name?: string; last_name?: string; username?: string } | undefined;
  const from = fromObj?.id;
  const text = String((msg.text as string) ?? '').trim();
  if (!chat || !from) return;
  const tgId = String(from);
  const fromName = [fromObj?.first_name, fromObj?.last_name].filter(Boolean).join(' ') || null;

  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1];
    if (payload) {
      const linked = await linkByToken(payload, tgId);
      if (linked) {
        const lu = await getLinkedUser(tgId);
        await recordSubscriber(tgId, linked.name, fromObj?.username ?? null, lu?.id ?? null);
        await sendMessage(chat, `✅ Đã liên kết tài khoản!\n\n${welcomeText(linked.name)}`, await mainMenuKb(lu?.id ?? '')); return;
      }
      await sendMessage(chat, '⚠️ Mã liên kết không hợp lệ/hết hạn. Vào webapp Solace → *Liên kết bot Solace* lấy mã mới.');
      return;
    }
    const user = await getLinkedUser(tgId);
    // Ghi danh bạ broadcast cho MỌI người /start — kể cả chưa liên kết tài khoản FADO.
    await recordSubscriber(tgId, user?.name ?? fromName, fromObj?.username ?? null, user?.id ?? null);
    if (user) { await sendMessage(chat, welcomeText(user.name), await mainMenuKb(user.id)); return; }
    await sendMessage(chat, '👋 Bạn chưa liên kết tài khoản FADO.\n\nMở webapp Solace → bấm *Liên kết bot Solace* để đặt món.',
      [[{ text: '🔗 Mở webapp Solace', url: `${APP_URL}/solace` }]]);
    return;
  }

  // Hủy nhận tin quảng bá (chính sách Telegram: phải cho người dùng tự tắt).
  if (text === '/stop' || text === '/huy' || text === '/unsubscribe') {
    await setSubscriberOptOut(tgId, true);
    await sendMessage(chat, '🔕 Đã tắt nhận tin quảng bá từ Solace. Gõ /start bất cứ lúc nào để nhận lại.');
    return;
  }

  if (!text) return;
  const cart = await getCart(tgId);

  // Admin đang chờ nhập LÝ DO HUỶ → thực hiện huỷ kèm lý do + đồng bộ mọi chat.
  if (cart.awaitingCancel) {
    const orderId = cart.awaitingCancel;
    cart.awaitingCancel = null; await saveCart(tgId, cart);
    const admin = await getLinkedUser(tgId);
    if (!admin || !(await canManageSolace(admin.id, 'solace-pos', 'edit'))) { await sendMessage(chat, '⚠️ Bạn không có quyền huỷ đơn.'); return; }
    try {
      await cancelOrder(orderId, admin.id, text.slice(0, 200), { creditToWallet: true });
      const o = await getOrder(orderId);
      if (o) await editAllOrderMessages(o);
      await sendMessage(chat, `❌ Đã huỷ đơn ${esc(o?.code ?? '')}.\n📝 Lý do: ${esc(text.slice(0, 200))}`);
    } catch (e) {
      await sendMessage(chat, `⚠️ ${(e as Error).message || 'Không huỷ được đơn'}`);
    }
    return;
  }

  if (cart.awaiting === 'floor') {
    cart.floor = text.slice(0, 60); cart.awaiting = null; await saveCart(tgId, cart);
    const s = await paymentScreen(cart); await sendMessage(chat, s.text, s.kb);
    return;
  }
  if (cart.awaiting === 'voucher') {
    cart.awaiting = null;
    const vc = await validateVoucher(text, subtotal(cart));
    if (vc.ok) { cart.voucherCode = vc.code; cart.discount = vc.discount; await saveCart(tgId, cart); await sendMessage(chat, `🎁 Áp dụng mã *${esc(vc.code)}* — giảm ${formatVND(vc.discount)}`); }
    else { cart.voucherCode = null; cart.discount = 0; await saveCart(tgId, cart); await sendMessage(chat, `⚠️ ${esc(vc.message)}`); }
    const s = cartScreen(cart); await sendMessage(chat, s.text, s.kb);
    return;
  }
  if (cart.awaiting === 'note' && cart.draft) {
    const menu = await getPosMenu();
    const p = menu.products.find(x => x.id === cart.draft!.product_id);
    cart.awaiting = null;
    if (p) {
      if (!addLine(cart, p, Object.values(cart.draft.selected).flat(), cart.draft.qty, text)) await sendMessage(chat, `⚠️ Giỏ đã đầy (tối đa ${MAX_LINES} món).`);
      cart.draft = null; await saveCart(tgId, cart); const s = cartScreen(cart); await sendMessage(chat, s.text, s.kb);
    }
    return;
  }

  // Tin nhắn thường (không phải lệnh, không đang chờ nhập) → mở menu chính, khỏi phải gõ /start lại.
  const user = await getLinkedUser(tgId);
  if (!user) {
    await sendMessage(chat, '👋 Bạn chưa liên kết tài khoản FADO.\n\nMở webapp Solace → bấm *Liên kết bot Solace* để đặt món.',
      [[{ text: '🔗 Mở webapp Solace', url: `${APP_URL}/solace` }]]);
    return;
  }
  await sendMessage(chat, welcomeText(user.name), await mainMenuKb(user.id));
}

// ─── CALLBACK ────────────────────────────────────────────────────────────────
async function handleCallback(cb: Record<string, unknown>): Promise<void> {
  const id = String(cb.id);
  const from = (cb.from as { id: number })?.id;
  const message = cb.message as { message_id: number; chat: { id: number } } | undefined;
  const data = String((cb.data as string) ?? '');
  if (!from || !message) { await answerCallback(id); return; }
  const tgId = String(from);
  const chat = message.chat.id;
  const mid = message.message_id;

  if (data.startsWith('a:')) return handleAdmin(id, tgId, chat, mid, data);
  if (data === 's:noop') { await answerCallback(id); return; }

  const user = await getLinkedUser(tgId);
  if (!user) {
    await answerCallback(id, 'Vui lòng liên kết tài khoản trước', true);
    await editMessageText(chat, mid, 'Bạn chưa liên kết tài khoản FADO. Mở webapp Solace để liên kết.',
      [[{ text: '🔗 Mở webapp Solace', url: `${APP_URL}/solace` }]]);
    return;
  }

  const menu = await getPosMenu();
  const cart = await getCart(tgId);
  try {
    if (data === 's:menu') {
      const op = await getOperatingConfig();
      if (!isShopOpen(op, vnNowHHMM())) {
        await edit(chat, mid, { text: `😴 *Quán đang đóng cửa*\nGiờ mở cửa: ${op.openTime}–${op.closeTime}.\nHẹn gặp lại bạn nhé! 🐾`, kb: [[{ text: '🧾 Đơn của tôi', callback_data: 's:orders' }]] });
      } else await edit(chat, mid, categoriesScreen(menu));
    }
    else if (data === 's:orders') { await edit(chat, mid, await ordersScreen(user.id)); }
    else if (data === 's:gift') {
      await answerCallback(id, '🎁 Đang kiểm tra…');
      try {
        const g = await claimMinigame(user.id, { notify: false });
        const exp = new Date(g.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        await sendMessage(chat,
          `🎁🎉 *Quà chào ngày mới từ Solace!*\n\nChúc mừng bạn đến sớm hôm nay!\nMã quà: *${esc(g.code)}*\nChọn 1 món miễn phí: _${esc(g.items.map(i => i.name).join(', '))}_\n⏱ Dùng trước *${exp}* (trong ${g.validMinutes} phút)\n\n_Đưa mã cho nhân viên hoặc nhập khi đặt món._`,
          [[{ text: '☕ Đặt món ngay', callback_data: 's:menu' }]]);
      } catch (e) { await sendMessage(chat, `🥲 ${esc((e as Error).message)}`, await mainMenuKb(user.id)); }
      return;
    }
    else if (data === 's:back' && cart.draft) {
      const p = menu.products.find(x => x.id === cart.draft!.product_id);
      if (cart.draft.step > 0) { cart.draft.step -= 1; await saveCart(tgId, cart); if (p) await edit(chat, mid, stepScreen(p, cart)); }
      else { cart.draft = null; await saveCart(tgId, cart); await edit(chat, mid, categoriesScreen(menu)); }
    }
    else if (data.startsWith('s:c:')) { await edit(chat, mid, productsScreen(menu, data.slice(4))); }
    else if (data.startsWith('s:p:')) {
      const p = menu.products.find(x => x.id === data.slice(4));
      if (!p) { await answerCallback(id, 'Món không còn'); return; }
      if (p.available === false) { await answerCallback(id, `😔 "${p.name}" tạm hết, bạn chọn món khác nhé!`, true); return; }
      if (p.optionGroups.length > 0) { cart.draft = { product_id: p.id, selected: {}, qty: 1, step: 0 }; await saveCart(tgId, cart); await edit(chat, mid, stepScreen(p, cart)); }
      else { if (!addLine(cart, p, [], 1)) { await answerCallback(id, `Giỏ tối đa ${MAX_LINES} món`, true); return; } cart.draft = null; await saveCart(tgId, cart); await edit(chat, mid, cartScreen(cart)); }
    }
    else if (data.startsWith('s:o:') && cart.draft) {
      const valId = data.slice(4);
      const p = menu.products.find(x => x.id === cart.draft!.product_id);
      if (p) {
        const grp = p.optionGroups[cart.draft.step];
        if (grp && (grp.values ?? []).some(v => v.id === valId)) {
          const cur = cart.draft.selected[grp.id] ?? [];
          // 'multi' → bật/tắt; còn lại (single/không rõ) → chỉ 1 lựa chọn. Luôn hiện ✅, KHÔNG tự nhảy (bấm "Tiếp ▶").
          if (grp.selection_type === 'multi') cart.draft.selected[grp.id] = cur.includes(valId) ? cur.filter(x => x !== valId) : [...cur, valId];
          else cart.draft.selected[grp.id] = [valId];
          await saveCart(tgId, cart); await edit(chat, mid, stepScreen(p, cart));
        }
      }
    }
    else if (data === 's:next' && cart.draft) {
      const p = menu.products.find(x => x.id === cart.draft!.product_id);
      if (p) {
        const grp = p.optionGroups[cart.draft.step];
        if (grp?.is_required && (cart.draft.selected[grp.id] ?? []).length === 0) { await answerCallback(id, `Chọn: ${grp.name}`, true); return; }
        cart.draft.step += 1; await saveCart(tgId, cart); await edit(chat, mid, stepScreen(p, cart));
      }
    }
    else if (data === 's:q:1' || data === 's:q:-1') {
      if (cart.draft) { cart.draft.qty = Math.max(1, Math.min(MAX_QTY, cart.draft.qty + (data === 's:q:1' ? 1 : -1))); await saveCart(tgId, cart); }
      const p = menu.products.find(x => x.id === cart.draft?.product_id);
      if (p) await edit(chat, mid, stepScreen(p, cart));
    }
    else if (data === 's:note' && cart.draft) { cart.awaiting = 'note'; await saveCart(tgId, cart); await answerCallback(id); await sendMessage(chat, '📝 Nhập ghi chú cho món (vd: ít ngọt, không khuấy):'); return; }
    else if (data === 's:add' && cart.draft) {
      const p = menu.products.find(x => x.id === cart.draft!.product_id);
      if (p) {
        if (!addLine(cart, p, Object.values(cart.draft.selected).flat(), cart.draft.qty)) { await answerCallback(id, `Giỏ tối đa ${MAX_LINES} món`, true); return; }
        cart.draft = null; await saveCart(tgId, cart); await edit(chat, mid, cartScreen(cart));
      }
    }
    else if (data === 's:cart') { await edit(chat, mid, cartScreen(cart)); }
    else if (data === 's:clr') { await clearCart(tgId); await edit(chat, mid, { text: '🗑️ Đã xoá giỏ hàng.', kb: [[{ text: '☕ Đặt món', callback_data: 's:menu' }]] }); }
    else if (data === 's:voucher') { cart.awaiting = 'voucher'; await saveCart(tgId, cart); await answerCallback(id); await sendMessage(chat, '🎁 Nhập *mã giảm giá*:'); return; }
    else if (data === 's:co') { if (cart.lines.length === 0) { await answerCallback(id, 'Giỏ trống'); return; } await edit(chat, mid, fulfillmentScreen()); }
    else if (data === 's:f:c') { cart.fulfillment = 'counter'; cart.floor = undefined; await saveCart(tgId, cart); await edit(chat, mid, await paymentScreen(cart)); }
    else if (data === 's:f:d') { cart.fulfillment = 'dine_in'; cart.awaiting = 'floor'; await saveCart(tgId, cart); await answerCallback(id); await edit(chat, mid, { text: '🪑 *Nhận tại chỗ* — vui lòng nhập *tầng / vị trí* (gõ tin nhắn):', kb: [] }); return; }
    else if (data.startsWith('s:pay:')) {
      const method = data.slice(6) as 'wallet' | 'bankqr' | 'cash' | 'debt';
      // Pre-check để bật pop-up rõ ràng trước khi tạo đơn.
      if (method === 'debt' && !(await getDebtConfig()).enabled) {
        await answerCallback(id, '📒 Tính năng ghi nợ đang tắt, vui lòng chọn hình thức khác', true); return;
      }
      if (method === 'wallet') {
        const sub = subtotal(cart); const total = sub - Math.min(cart.discount ?? 0, sub);
        const bal = (await getOrCreateWallet(user.id)).balance;
        if (bal < total) { await answerCallback(id, `👛 Số dư ví không đủ (cần ${formatVND(total)}, hiện có ${formatVND(bal)})`, true); return; }
      }
      await answerCallback(id, 'Đang xử lý…');
      await doPay(chat, tgId, user.id, mid, method);
      return;
    }
    else if (data.startsWith('s:nudge:')) { await nudgeOrder(id, user.id, data.slice(8)); return; }
    else if (data.startsWith('s:cxl:')) {
      try { await cancelMyOrder(user.id, data.slice(6)); await answerCallback(id, 'Đã huỷ đơn'); await edit(chat, mid, await ordersScreen(user.id)); }
      catch (e) { await answerCallback(id, (e as Error).message || 'Không huỷ được', true); }
      return;
    }
    else if (data.startsWith('s:paid:')) { await customerSaysPaid(id, user.id, data.slice(7)); return; }
    else if (data.startsWith('s:qr:')) { await answerCallback(id); await showVietQr(chat, user.id, data.slice(5)); return; }
    else if (data.startsWith('s:ord:')) { await answerCallback(id); await edit(chat, mid, await orderActionsScreen(user.id, data.slice(6))); return; }
    else if (data.startsWith('s:chp:')) { await answerCallback(id); await edit(chat, mid, await changeMethodScreen(user.id, data.slice(6))); return; }
    else if (data.startsWith('s:setp:')) { await applyChangeMethod(id, user.id, chat, mid, data.slice(7)); return; }
    await answerCallback(id);
  } catch (e) { await answerCallback(id, (e as Error).message || 'Lỗi', true); }
}

// ─── ADMIN điều khiển đơn ────────────────────────────────────────────────────
async function handleAdmin(id: string, tgId: string, chat: number, mid: number, data: string): Promise<void> {
  const [, action, orderId] = data.split(':');
  const user = await getLinkedUser(tgId);
  if (!user || !(await canManageSolace(user.id, 'solace-pos', 'edit'))) { await answerCallback(id, 'Bạn không có quyền', true); return; }

  // Huỷ đơn: BẮT nhập lý do trước (không huỷ ngay). Lưu trạng thái chờ theo chat.
  if (action === 'cancel') {
    const o = await getOrder(orderId);
    if (!o) { await answerCallback(id, 'Không tìm thấy đơn', true); return; }
    if (o.status === 'cancelled' || o.status === 'done') { await answerCallback(id, 'Đơn đã kết thúc', true); return; }
    const cart = await getCart(tgId);
    cart.awaitingCancel = orderId; await saveCart(tgId, cart);
    await answerCallback(id);
    await sendMessage(chat, `📝 Nhập *lý do huỷ* đơn ${esc(o.code)} (gõ tin nhắn):`);
    return;
  }

  try {
    if (action === 'pay') await markOrderPaid(orderId, null, user.id); // giữ nguyên phương thức gốc của đơn
    else await updateOrderStatus(orderId, action as OrderStatus, user.id);
    const o = await getOrder(orderId);
    if (o) {
      // Đồng bộ mọi chat nhân viên đã do tầng service lo (updateOrderStatus/markOrderPaid).
      // Ở đây chỉ phòng trường hợp bản tin của chính người bấm chưa được lưu (đơn cũ trước bản vá).
      await editMessageText(chat, mid, orderSummary(o), controlKeyboard(o)).catch(() => {});
    }
    await answerCallback(id, 'Đã cập nhật');
  } catch (e) { await answerCallback(id, (e as Error).message || 'Lỗi', true); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function addLine(cart: CartData, p: MenuProduct, optionValueIds: string[], qty: number, note?: string): boolean {
  if (cart.lines.length >= MAX_LINES) return false;
  const opts = p.optionGroups.flatMap(g => (g.values ?? []).filter(v => optionValueIds.includes(v.id)));
  const extra = opts.reduce((s, o) => s + Number(o.extra_price), 0);
  const names = opts.map(o => o.name);
  const q = Math.max(1, Math.min(MAX_QTY, qty));
  cart.lines.push({ product_id: p.id, qty: q, option_value_ids: optionValueIds, note: note ? note.slice(0, 100) : null, name: names.length ? `${p.name} (${names.join(', ')})` : p.name, unit_price: Number(p.price) + extra });
  return true;
}
async function edit(chat: number, mid: number, s: Screen): Promise<void> { await editMessageText(chat, mid, s.text, s.kb); }

function categoriesScreen(menu: Menu): Screen {
  const kb: TgKeyboard = [[{ text: '🍵 Tất cả', callback_data: 's:c:all' }]];
  // Danh mục xếp 2 cột cho gọn (text nút không parse Markdown nên an toàn)
  for (let i = 0; i < menu.categories.length; i += 2) {
    kb.push(menu.categories.slice(i, i + 2).map(c => ({ text: c.name, callback_data: `s:c:${c.id}` })));
  }
  kb.push([{ text: '🛒 Giỏ hàng', callback_data: 's:cart' }]);
  return { text: '☕ *Chọn danh mục:*', kb };
}
function productsScreen(menu: Menu, catId: string): Screen {
  const items = menu.products.filter(p => catId === 'all' || p.category_id === catId);
  // Telegram không cho tô màu nút → đánh dấu món tạm hết bằng 🔴 + chữ "Tạm hết".
  // Vẫn render thành nút để bấm vào bật pop-up cảnh báo (xử lý ở callback s:p:).
  const kb: TgKeyboard = items.map(p => p.available === false
    ? [{ text: `🔴 ${p.name} — Tạm hết`, callback_data: `s:p:${p.id}` }]
    : [{ text: `${p.name} — ${formatVND(p.price)}`, callback_data: `s:p:${p.id}` }]);
  kb.push([{ text: '« Danh mục', callback_data: 's:menu' }, { text: '🛒 Giỏ', callback_data: 's:cart' }]);
  return { text: '🧋 *Chọn món:*', kb };
}

/** Màn chọn TỪNG BƯỚC: hiện nhóm option thứ draft.step; hết nhóm → màn xác nhận (qty + ghi chú + thêm). */
function stepScreen(p: MenuProduct, cart: CartData): Screen {
  const d = cart.draft!;
  if (d.step < p.optionGroups.length) {
    const g = p.optionGroups[d.step];
    const sel = d.selected[g.id] ?? [];
    const kb: TgKeyboard = (g.values ?? []).map(v => {
      const on = sel.includes(v.id);
      const px = Number(v.extra_price) > 0 ? ` +${formatVND(v.extra_price)}` : '';
      return [{ text: `${on ? '✅' : '⬜'} ${v.name}${px}`, callback_data: `s:o:${v.id}` }];
    });
    // Luôn có nút Tiếp (kể cả nhóm chọn-1) để người dùng thấy ✅ rồi mới sang bước sau.
    kb.push([{ text: 'Tiếp ▶', callback_data: 's:next' }]);
    kb.push([{ text: d.step > 0 ? '◀ Lùi' : '« Danh mục', callback_data: 's:back' }]);
    const kind = g.selection_type === 'multi' ? 'chọn nhiều' : 'chọn 1';
    return { text: `🧋 *${esc(p.name)}*\n*${esc(g.name)}*${g.is_required ? ' (bắt buộc)' : ''} — ${kind}:`, kb };
  }
  // Màn xác nhận
  const chosen = p.optionGroups.flatMap(g => (g.values ?? []).filter(v => (d.selected[g.id] ?? []).includes(v.id)));
  const extra = chosen.reduce((s, o) => s + Number(o.extra_price), 0);
  const unit = Number(p.price) + extra;
  const optTxt = chosen.length ? `\n${chosen.map(o => `• ${esc(o.name)}`).join('\n')}` : '';
  const kb: TgKeyboard = [
    [{ text: '➖', callback_data: 's:q:-1' }, { text: `SL: ${d.qty}`, callback_data: 's:noop' }, { text: '➕', callback_data: 's:q:1' }],
    [{ text: '📝 Ghi chú', callback_data: 's:note' }],
    [{ text: `✔️ Thêm vào giỏ · ${formatVND(unit * d.qty)}`, callback_data: 's:add' }],
    [{ text: '◀ Lùi', callback_data: 's:back' }, { text: '« Danh mục', callback_data: 's:menu' }],
  ];
  return { text: `🧋 *${esc(p.name)}* — ${formatVND(unit)}${optTxt}${d.note ? `\n_Ghi chú: ${esc(d.note)}_` : ''}`, kb };
}

function cartScreen(cart: CartData): Screen {
  if (cart.lines.length === 0) return { text: '🛒 Giỏ hàng trống.', kb: [[{ text: '☕ Đặt món', callback_data: 's:menu' }]] };
  const lines = cart.lines.map((l, i) => `${i + 1}. ${l.qty}× ${esc(l.name)}${l.note ? ` _(${esc(l.note)})_` : ''} — ${formatVND(lineTotal(l))}`).join('\n');
  const sub = subtotal(cart);
  const disc = Math.min(cart.discount ?? 0, sub);
  let body = `🛒 *Giỏ hàng*\n\n${lines}\n\nTạm tính: ${formatVND(sub)}`;
  if (disc > 0) body += `\nGiảm giá${cart.voucherCode ? ` (${esc(cart.voucherCode)})` : ''}: -${formatVND(disc)}`;
  body += `\n*Tổng: ${formatVND(sub - disc)}*`;
  const kb: TgKeyboard = [
    [{ text: '➕ Thêm món', callback_data: 's:menu' }, { text: '🗑️ Xoá giỏ', callback_data: 's:clr' }],
    [{ text: cart.voucherCode ? `🎁 Mã: ${cart.voucherCode}` : '🎁 Mã giảm giá', callback_data: 's:voucher' }],
    [{ text: `💳 Thanh toán · ${formatVND(sub - disc)}`, callback_data: 's:co' }],
  ];
  return { text: body, kb };
}

function fulfillmentScreen(): Screen {
  const kb: TgKeyboard = [
    [{ text: '🏪 Nhận tại quán', callback_data: 's:f:c' }],
    [{ text: '🪑 Tại chỗ (nhập tầng)', callback_data: 's:f:d' }],
    [{ text: '« Giỏ', callback_data: 's:cart' }],
  ];
  return { text: '📍 *Nhận ở đâu?*', kb };
}

async function paymentScreen(cart: CartData): Promise<Screen> {
  const sub = subtotal(cart);
  const disc = Math.min(cart.discount ?? 0, sub);
  const place = cart.fulfillment === 'dine_in' ? `Tại chỗ · ${esc(cart.floor)}` : 'Tại quầy';
  const total = sub - disc;
  let body = `💳 *Thanh toán*\nNhận: ${place}\nTạm tính: ${formatVND(sub)}`;
  if (disc > 0) body += `\nGiảm: -${formatVND(disc)}`;
  body += `\n*Tổng: ${formatVND(total)}*\n\nChọn hình thức:`;
  return {
    text: body,
    kb: [
      [{ text: '🏦 Chuyển khoản (VietQR)', callback_data: 's:pay:bankqr' }],
      [{ text: '💵 Tiền mặt khi nhận', callback_data: 's:pay:cash' }],
      [{ text: '👛 Ví tín dụng', callback_data: 's:pay:wallet' }],
      [{ text: '📒 Ghi nợ', callback_data: 's:pay:debt' }],
      [{ text: '« Giỏ', callback_data: 's:cart' }],
    ],
  };
}

const ST: Record<string, string> = { pending: 'Chờ thanh toán', preparing: 'Đang pha', ready: 'Sẵn sàng', delivering: 'Đang giao', done: 'Hoàn thành', cancelled: 'Đã huỷ' };
const ACTIVE = new Set(['pending', 'preparing', 'ready', 'delivering']);

/** Nhãn ngắn cho 1 phương thức/nhãn trạng thái thanh toán. */
function methodShort(curr: string | null): string {
  return curr === 'bankqr' ? '🏦 VietQR' : curr === 'cash' ? '💵 Tiền mặt' : curr === 'wallet' ? '👛 Ví' : curr === 'mixed' ? '🔀 Hỗn hợp' : curr === 'debt' ? '📒 Ghi nợ' : '—';
}
function payText(o: { payment_status: string }): string {
  return o.payment_status === 'paid' ? 'Đã thanh toán' : o.payment_status === 'partial' ? 'Đã thu một phần' : o.payment_status === 'debt' ? 'Ghi nợ' : 'Chưa thu';
}

async function ordersScreen(userId: string): Promise<Screen> {
  const orders = await listMyOrders(userId, 5);
  if (orders.length === 0) return { text: '🧾 Bạn chưa có đơn nào.', kb: [[{ text: '☕ Đặt món', callback_data: 's:menu' }]] };
  const body = orders.map(o => `*${o.code}* — ${formatVND(o.total)}\n${ST[o.status] ?? o.status} · ${payText(o)}`).join('\n\n');
  // Mỗi đơn còn hoạt động → 1 nút "⚙️ Đơn" mở submenu (Nhắc / Đổi cách trả / QR / Huỷ).
  const kb: TgKeyboard = orders
    .filter(o => ACTIVE.has(o.status))
    .map(o => [{ text: `⚙️ Đơn ${(o.code ?? '').slice(-4)}`, callback_data: `s:ord:${o.id}` }]);
  kb.push([{ text: '☕ Đặt món', callback_data: 's:menu' }]);
  return { text: `🧾 *Đơn gần đây của bạn:*\n\n${body}`, kb };
}

/** Submenu hành động cho 1 đơn (chỉ chủ đơn; đơn còn hoạt động). */
async function orderActionsScreen(userId: string, orderId: string): Promise<Screen> {
  const o = await getOrder(orderId);
  if (!o || o.customer_user_id !== userId) return { text: 'Không tìm thấy đơn của bạn.', kb: [[{ text: '🧾 Đơn của tôi', callback_data: 's:orders' }]] };
  const unpaid = o.payment_status !== 'paid';
  const active = ACTIVE.has(o.status);
  const kb: TgKeyboard = [];
  if (active) kb.push([{ text: '🔔 Nhắc nhân viên', callback_data: `s:nudge:${o.id}` }]);
  if (active && unpaid) kb.push([{ text: '🔄 Đổi cách trả', callback_data: `s:chp:${o.id}` }]);
  if (o.payment_method === 'bankqr' && unpaid) kb.push([{ text: '🏦 Xem QR chuyển khoản', callback_data: `s:qr:${o.id}` }]);
  if (o.status === 'pending') kb.push([{ text: '❌ Huỷ đơn', callback_data: `s:cxl:${o.id}` }]);
  kb.push([{ text: '« Đơn của tôi', callback_data: 's:orders' }]);
  return { text: `⚙️ *Đơn ${esc(o.code)}* — ${formatVND(o.total)}\n${ST[o.status] ?? o.status} · ${payText(o)} (${methodShort(o.payment_status === 'debt' ? 'debt' : o.payment_method)})`, kb };
}

/** Menu chọn hình thức thanh toán mới (ẩn cái đang dùng; ẩn Ghi nợ khi tắt). */
async function changeMethodScreen(userId: string, orderId: string): Promise<Screen> {
  const o = await getOrder(orderId);
  if (!o || o.customer_user_id !== userId) return { text: 'Không tìm thấy đơn của bạn.', kb: [[{ text: '🧾 Đơn của tôi', callback_data: 's:orders' }]] };
  if (o.payment_status === 'paid' || !ACTIVE.has(o.status)) return { text: `Đơn ${esc(o.code)} không còn đổi được cách trả.`, kb: [[{ text: '« Quay lại', callback_data: `s:ord:${o.id}` }]] };
  const curr = o.payment_status === 'debt' ? 'debt' : o.payment_method;
  const opts: { key: PaymentForm; label: string }[] = [
    { key: 'bankqr', label: '🏦 Chuyển khoản (VietQR)' },
    { key: 'cash', label: '💵 Tiền mặt khi nhận' },
    { key: 'wallet', label: '👛 Ví tín dụng' },
  ];
  if ((await getDebtConfig()).enabled) opts.push({ key: 'debt', label: '📒 Ghi nợ' });
  const kb: TgKeyboard = opts.filter(op => op.key !== curr).map(op => [{ text: op.label, callback_data: `s:setp:${o.id}:${op.key}` }]);
  kb.push([{ text: '« Quay lại', callback_data: `s:ord:${o.id}` }]);
  return { text: `🔄 *Đổi cách trả — đơn ${esc(o.code)}*\nHiện tại: ${methodShort(curr)}\nChọn hình thức mới:`, kb };
}

/** Áp dụng đổi cách trả → đồng bộ thẻ nhân viên + nhắc gọn khi cần đối chiếu. */
async function applyChangeMethod(cbId: string, userId: string, chat: number, mid: number, payload: string): Promise<void> {
  const [orderId, method] = payload.split(':') as [string, PaymentForm];
  try {
    const order = await changeUnpaidOrderMethodByCustomer(orderId, userId, method);
    // Cập nhật đồng bộ mọi thẻ đơn bên nhân viên.
    await editAllOrderMessages(order).catch(() => {});
    // Nhắc gọn nhân viên (tin thuần, không nút) khi cần đối chiếu/đã thu — có cooldown chống spam.
    if (method === 'bankqr' && await claimCooldown('chpnotice', orderId)) {
      await sendToOperators(`🔄 *Khách đổi đơn ${esc(order.code)}* → 🏦 Chờ chuyển khoản (VietQR). _Thẻ đơn đã cập nhật._`).catch(() => {});
    } else if (method === 'wallet' && await claimCooldown('chpnotice', orderId)) {
      await sendToOperators(`🔄 *Đơn ${esc(order.code)}* — khách đã trả bằng 👛 ví (đã thu đủ).`).catch(() => {});
    }
    // Phản hồi khách.
    if (method === 'bankqr') {
      await answerCallback(cbId, 'Đã đổi sang VietQR');
      await sendVietQrFor(chat, order, userId);
    } else {
      await answerCallback(cbId, method === 'wallet' ? 'Đã thanh toán bằng ví ✅' : method === 'debt' ? 'Đã chuyển sang Ghi nợ' : 'Đã đổi sang Tiền mặt');
      await edit(chat, mid, await orderActionsScreen(userId, orderId));
    }
  } catch (e) {
    await answerCallback(cbId, (e as Error).message || 'Không đổi được cách trả', true);
  }
}

/** Khách bấm 🔔 Nhắc đơn → báo nhân viên vận hành (giới hạn 1 lần / 5 phút / đơn). */
async function nudgeOrder(cbId: string, userId: string, orderId: string): Promise<void> {
  const o = await getOrder(orderId);
  if (!o || o.customer_user_id !== userId) { await answerCallback(cbId, 'Không tìm thấy đơn của bạn', true); return; }
  if (!ACTIVE.has(o.status)) { await answerCallback(cbId, 'Đơn đã xong/huỷ', true); return; }
  if (!(await claimCooldown('nudge', orderId))) { await answerCallback(cbId, 'Bạn vừa nhắc rồi, chờ chút nhé', true); return; }
  await sendToOperators(`🔔 *Khách nhắc đơn ${esc(o.code)}*\n👤 ${esc(o.customer_name)} · ${formatVND(o.total)} · ${ST[o.status] ?? o.status}`, controlKeyboard(o), o.id).catch(() => {});
  await answerCallback(cbId, 'Đã nhắc nhân viên giúp bạn ✅', true);
}

/** Khách bấm "Tôi đã chuyển khoản" → báo nhân viên kiểm tra & xác nhận (1 lần / 5 phút / đơn). */
async function customerSaysPaid(cbId: string, userId: string, orderId: string): Promise<void> {
  const o = await getOrder(orderId);
  if (!o || o.customer_user_id !== userId) { await answerCallback(cbId, 'Không tìm thấy đơn của bạn', true); return; }
  if (o.payment_status === 'paid') { await answerCallback(cbId, 'Đơn đã được xác nhận thanh toán', true); return; }
  if (!(await claimCooldown('paidnotice', orderId))) { await answerCallback(cbId, 'Đã gửi báo, chờ nhân viên xác nhận nhé', true); return; }
  // Tin báo THUẦN (không nút, không gắn vào đơn) → tránh tạo thẻ đơn thứ 2 bị nhân đôi.
  // Nhân viên xác nhận thu tiền bằng nút "💵 Đã nhận tiền" ngay trên thẻ đơn gốc.
  await sendToOperators(`💸 *Khách báo ĐÃ CHUYỂN KHOẢN — đơn ${esc(o.code)}*\n👤 ${esc(o.customer_name ?? 'Khách')} · ${formatVND(o.total)}\n_Vui lòng kiểm tra & bấm “💵 Đã nhận tiền” trên thẻ đơn để xác nhận._`).catch(() => {});
  await answerCallback(cbId, 'Đã báo nhân viên kiểm tra ✅', true);
}

/** Hiện lại mã VietQR cho 1 đơn chưa thu (khách bấm 🏦 QR). */
async function showVietQr(chat: number, userId: string, orderId: string): Promise<void> {
  const o = await getOrder(orderId);
  if (!o || o.customer_user_id !== userId) { await sendMessage(chat, 'Không tìm thấy đơn của bạn.'); return; }
  if (o.payment_status === 'paid') { await sendMessage(chat, `Đơn ${esc(o.code)} đã thanh toán rồi nhé.`); return; }
  await sendVietQrFor(chat, o, userId);
}

/** Dựng & gửi ảnh VietQR cho 1 đơn (dùng chung cho lúc đặt + xem lại). */
async function sendVietQrFor(chat: number, order: { code: string | null; total: number; id: string }, userId: string): Promise<void> {
  const bank = await getBankConfig();
  const payload = buildVietQrPayload({ bankBin: bank.bankBin, accountNo: bank.accountNo, amount: Number(order.total), addInfo: order.code ?? undefined });
  if (!payload) { await sendMessage(chat, `Quán chưa cấu hình VietQR cho đơn ${esc(order.code)} — vui lòng trả tiền mặt.`, await mainMenuKb(userId)); return; }
  const png = await QRCode.toBuffer(payload, { width: 360, margin: 1 });
  await sendPhoto(chat, png,
    `🏦 *Chuyển khoản VietQR* — đơn ${esc(order.code)}\n💵 ${formatVND(order.total)}\n${esc(bank.accountName)} · ${esc(bank.accountNo)}\nNội dung: *${esc(order.code)}*\n\n_Quét bằng app ngân hàng. Bấm nút bên dưới sau khi đã chuyển._`,
    [[{ text: '✅ Tôi đã chuyển khoản', callback_data: `s:paid:${order.id}` }],
     [{ text: '☕ Đặt món', callback_data: 's:menu' }, { text: '🧾 Đơn của tôi', callback_data: 's:orders' }]]);
}

// ─── Thanh toán → tạo đơn ────────────────────────────────────────────────────
async function doPay(chat: number, tgId: string, userId: string, mid: number, method: 'wallet' | 'bankqr' | 'cash' | 'debt'): Promise<void> {
  // CLAIM giỏ (xoá nguyên tử): double-tap / Telegram gửi lại update → chỉ MỘT lần lấy được ⇒ không tạo đơn trùng.
  const cart = await claimCart(tgId);
  if (!cart || cart.lines.length === 0) { await editMessageText(chat, mid, '⏳ Đơn đang được xử lý hoặc giỏ đã trống.', await mainMenuKb(userId)); return; }
  await editMessageText(chat, mid, '⏳ Đang xử lý đơn của bạn…');  // vô hiệu nút ngay
  try {
    const { order } = await createWebOrder(userId, {
      channel: 'telegram',
      fulfillment_type: cart.fulfillment ?? 'counter',
      floor_note: cart.floor ?? null,
      voucher_code: cart.voucherCode ?? null,
      payment_method: method,
      items: cart.lines.map(l => ({ product_id: l.product_id, qty: l.qty, option_value_ids: l.option_value_ids, note: l.note ?? null })),
    });

    if (method === 'bankqr') { await sendVietQrFor(chat, order, userId); return; }
    const msgByMethod: Record<string, string> = {
      wallet: `✅ Đã đặt & thanh toán bằng ví!\nĐơn *${esc(order.code)}* — ${formatVND(order.total)}`,
      cash: `✅ Đã đặt đơn *${esc(order.code)}* — ${formatVND(order.total)}.\n💵 Trả tiền mặt khi nhận.`,
      debt: `✅ Đã đặt đơn *${esc(order.code)}* — ${formatVND(order.total)} (ghi nợ).`,
    };
    await sendMessage(chat, `${msgByMethod[method]}\n\nBạn sẽ nhận thông báo khi đơn *sẵn sàng*. ☕`, await mainMenuKb(userId));
  } catch (e) {
    // Tạo đơn lỗi → TRẢ giỏ về để khách thử lại (không mất món đã chọn).
    await saveCart(tgId, cart).catch(() => {});
    await sendMessage(chat, `⚠️ ${esc((e as Error).message)}`, [[{ text: '🛒 Xem giỏ', callback_data: 's:cart' }]]);
  }
}

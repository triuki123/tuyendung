import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { REGISTRY, parseCallbackData } from '@/lib/telegram/approvalRegistry';
import { answerTelegramCallback, editTelegramMessage } from '@/lib/services/telegramService';
import { signIdentity, SESSION_COOKIE } from '@/lib/authCookie';
import { handleBookingMessage, handleBookingCallback } from '@/lib/telegram/bookingBotHandler';
import { handleRsvpCallback } from '@/lib/services/rsvpService';
import { requireHeaderSecret } from '@/lib/requestSecurity';
import {
  clearPendingApprovalAction,
  getPendingApprovalAction,
  upsertPendingApprovalAction,
} from '@/lib/telegram/approvalPendingState';

export const dynamic = 'force-dynamic';

type ParsedApproval = { type: keyof typeof REGISTRY; action: 'approve' | 'reject'; id: string };
type Approver = { id: string; name: string; role: string };

async function findTelegramApprover(telegramId: string): Promise<Approver | null> {
  return queryOne<Approver>(
    `SELECT id::text AS id, name, role FROM users
     WHERE telegram_chat_id = $1 AND status = 'active'`,
    [telegramId],
  );
}

async function sendPlainTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}

async function callInternalApproval(parsed: ParsedApproval, approver: Approver, body: Record<string, unknown>) {
  const cfg = REGISTRY[parsed.type];
  const port = process.env.PORT || '4028';
  const host = process.env.HOSTNAME && process.env.HOSTNAME !== '0.0.0.0'
    ? process.env.HOSTNAME
    : '127.0.0.1';
  const origin = `http://${host}:${port}`;
  const issuedAt = Math.floor(Date.now() / 1000);
  const internalToken = await signIdentity({
    uid: approver.id,
    role: approver.role,
    sid: `telegram-webhook-${parsed.id}`,
    name: approver.name,
    kind: 'service',
    iat: issuedAt,
    exp: issuedAt + 120,
  });

  try {
    const res = await fetch(`${origin}${cfg.endpoint(parsed.id)}`, {
      method: cfg.method,
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE}=${internalToken}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true as const, errMsg: '' };
    const j = await res.json().catch(() => ({}));
    return { ok: false as const, errMsg: j.error || `Lỗi ${res.status}` };
  } catch (e) {
    console.error('telegram webhook internal call error:', e);
    return { ok: false as const, errMsg: 'Lỗi kết nối nội bộ' };
  }
}

async function auditTelegramAction(parsed: ParsedApproval, approver: Approver, telegramId: string, extra?: Record<string, unknown>) {
  try {
    await execute(
      `INSERT INTO audit_logs (action, details, admin_id) VALUES ($1, $2, $3)`,
      [
        `telegram_${parsed.action}_${parsed.type}`,
        JSON.stringify({
          via: 'telegram',
          type: parsed.type,
          request_id: parsed.id,
          telegram_id: telegramId,
          action: parsed.action,
          at: new Date().toISOString(),
          ...extra,
        }),
        approver.id,
      ],
    );
  } catch (e) {
    console.error('telegram webhook audit error:', e);
  }
}

async function handlePendingRejectMessage(update: any): Promise<boolean> {
  const message = update?.message;
  if (!message?.from?.id) return false;

  const telegramId = String(message.from.id);
  const pending = await getPendingApprovalAction(telegramId).catch(() => null);
  if (!pending || pending.action !== 'reject') return false;

  const approver = await findTelegramApprover(telegramId);
  if (!approver || approver.id.toLowerCase() !== pending.approver_user_id.toLowerCase()) {
    await clearPendingApprovalAction(telegramId).catch(() => {});
    return true;
  }

  const reason = String(message.text || '').trim();
  if (!reason) return true;

  if (/^\/cancel$/i.test(reason) || /^(huy|huỷ)$/i.test(reason)) {
    await clearPendingApprovalAction(telegramId).catch(() => {});
    await sendPlainTelegramMessage(telegramId, 'Đã hủy thao tác từ chối phiếu chi.');
    return true;
  }

  const parsed: ParsedApproval = {
    type: pending.approval_type as keyof typeof REGISTRY,
    action: 'reject',
    id: pending.request_id,
  };
  const body = REGISTRY[parsed.type].rejectBody(approver, reason);
  const result = await callInternalApproval(parsed, approver, body);
  if (!result.ok) {
    await sendPlainTelegramMessage(telegramId, `Không thể từ chối phiếu chi: ${result.errMsg}`);
    return true;
  }

  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  await editTelegramMessage(
    pending.source_chat_id,
    pending.source_message_id,
    `❌ *Đã từ chối* — ${REGISTRY[parsed.type].label}\n\n👤 Người xử lý: ${approver.name}\n💬 Lý do: ${reason}\n🕒 ${now}`,
  ).catch(() => {});
  await clearPendingApprovalAction(telegramId).catch(() => {});
  await sendPlainTelegramMessage(telegramId, 'Đã từ chối phiếu chi thành công.');
  await auditTelegramAction(parsed, approver, telegramId, { reason });
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const secretGuard = requireHeaderSecret(
      request,
      'x-telegram-bot-api-secret-token',
      process.env.TELEGRAM_WEBHOOK_SECRET,
    );
    if (secretGuard) return secretGuard;

    const update = await request.json().catch(() => null);

    if (await handlePendingRejectMessage(update)) {
      return NextResponse.json({ ok: true });
    }

    if (update?.message) {
      await handleBookingMessage(update.message).catch((e) => {
        console.error('booking message handler error:', e);
      });
      return NextResponse.json({ ok: true });
    }

    if (typeof update?.callback_query?.data === 'string' && update.callback_query.data.startsWith('b:')) {
      await handleBookingCallback(update.callback_query).catch((e) => {
        console.error('booking callback handler error:', e);
      });
      return NextResponse.json({ ok: true });
    }

    if (typeof update?.callback_query?.data === 'string' && update.callback_query.data.startsWith('rsvp:')) {
      const cbq = update.callback_query;
      const result = await handleRsvpCallback(cbq.data, String(cbq.from?.id ?? '')).catch((e) => {
        console.error('rsvp callback handler error:', e);
        return { ok: false, toast: 'Lỗi xử lý', alert: true };
      });
      await answerTelegramCallback(cbq.id, result.toast, result.alert).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (typeof update?.callback_query?.data === 'string' && update.callback_query.data.startsWith('xtd:')) {
      const cbq = update.callback_query;
      const callbackId: string = cbq.id;
      const fromTgId = String(cbq.from?.id ?? '');
      const m = /^xtd:([^:]+):(\d+)$/.exec(cbq.data);
      if (!m) {
        await answerTelegramCallback(callbackId, 'Yêu cầu không hợp lệ');
        return NextResponse.json({ ok: true });
      }
      const bookingId = m[1];
      const minutes = parseInt(m[2], 10);
      const user = await queryOne<{ id: string; name: string }>(
        `SELECT id::text AS id, name FROM users WHERE telegram_chat_id = $1 AND status = 'active'`,
        [fromTgId],
      );
      if (!user) {
        await answerTelegramCallback(callbackId, 'Tài khoản Telegram chưa liên kết hoặc đã khóa', true);
        return NextResponse.json({ ok: true });
      }
      const { extendBooking } = await import('@/lib/services/roomCheckinService');
      const res = await extendBooking(bookingId, minutes, user.id);
      if (!res.ok) {
        await answerTelegramCallback(callbackId, `Không thể gia hạn: ${res.error}`, true);
        return NextResponse.json({ ok: true });
      }

      await execute(
        `DELETE FROM room_checkin_log WHERE booking_id = $1 AND kind IN ('checkout_reminder_10','checkout_reminder_5')`,
        [bookingId],
      ).catch(() => {});

      const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      await editTelegramMessage(
        cbq.message?.chat?.id,
        cbq.message?.message_id,
        `✅ *Đã gia hạn thêm ${minutes} phút* — kết thúc mới *${res.newEnd}*\n\n👤 ${user.name}\n🕒 ${nowStr}`,
      );
      await answerTelegramCallback(callbackId, `Đã gia hạn tới ${res.newEnd}`);
      return NextResponse.json({ ok: true });
    }

    const cb = update?.callback_query;
    if (!cb) return NextResponse.json({ ok: true });

    const callbackId: string = cb.id;
    const fromTgId = String(cb.from?.id ?? '');
    const chatId = cb.message?.chat?.id;
    const messageId = cb.message?.message_id;

    const parsed = parseCallbackData(cb.data ?? '') as ParsedApproval | null;
    if (!parsed) {
      await answerTelegramCallback(callbackId, 'Yêu cầu không hợp lệ');
      return NextResponse.json({ ok: true });
    }

    const approver = await findTelegramApprover(fromTgId);
    if (!approver) {
      await answerTelegramCallback(callbackId, 'Tài khoản Telegram chưa được liên kết hoặc đã khóa', true);
      return NextResponse.json({ ok: true });
    }

    if (parsed.type === 'expense' && parsed.action === 'reject') {
      await upsertPendingApprovalAction({
        telegram_chat_id: fromTgId,
        approver_user_id: approver.id,
        approval_type: parsed.type,
        request_id: parsed.id,
        action: 'reject',
        source_chat_id: String(chatId ?? ''),
        source_message_id: Number(messageId ?? 0),
      }).catch((e) => console.error('store pending expense reject error:', e));
      await answerTelegramCallback(callbackId, 'Nhập lý do từ chối ở tin nhắn tiếp theo. Gõ /cancel để hủy.', true);
      return NextResponse.json({ ok: true });
    }

    const body = parsed.action === 'approve'
      ? REGISTRY[parsed.type].approveBody(approver)
      : REGISTRY[parsed.type].rejectBody(approver);
    const { ok: resOk, errMsg } = await callInternalApproval(parsed, approver, body);

    if (!resOk) {
      await answerTelegramCallback(callbackId, `Không thể xử lý: ${errMsg}`, true);
      return NextResponse.json({ ok: true });
    }

    const actionLabel = parsed.action === 'approve' ? 'Đã duyệt' : 'Đã từ chối';
    const icon = parsed.action === 'approve' ? '✅' : '❌';
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    await editTelegramMessage(
      chatId,
      messageId,
      `${icon} *${actionLabel}* — ${REGISTRY[parsed.type].label}\n\n👤 Người xử lý: ${approver.name}\n🕒 ${now}`,
    );
    await answerTelegramCallback(callbackId, actionLabel);
    await auditTelegramAction(parsed, approver, fromTgId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/telegram/webhook error:', err);
    return NextResponse.json({ ok: true });
  }
}

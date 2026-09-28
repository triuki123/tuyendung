/**
 * engine.ts — cửa DUY NHẤT phát thông báo theo SỰ KIỆN (M1).
 *
 *   await notify('contract.expiring', vars, { recipients, relatedId });
 *
 * Engine tự: tra event catalog → render template → ghi in-app → đẩy Telegram (nút
 * theo event). Template/registry rỗng → render từ DEFAULT (hành vi cũ). CHƯA call
 * site nào dùng ở M1 (additive); M2 sẽ refactor ~17 chỗ phát thông báo về đây.
 *
 * Lưu ý: M1 chưa lọc theo preference người nhận (bậc 4) — gửi cho mọi recipient.
 */
import { query, queryOne } from '@/lib/db';
import { sendTelegramMessageWithButton, sendTelegramMessageToChat } from '@/lib/services/telegramService';
import { enqueueTelegram } from '@/lib/services/notificationOutboxService';
import { renderNotification, isTemplateEnabled } from '@/lib/services/notificationTemplateService';
import { getEvent } from './eventCatalog';
import { sendWebPushToUsers } from './webpush';
import { getDisabledChannelsForEvent } from '@/lib/services/notificationPreferenceService';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';

export interface NotifyOptions {
  /** Danh sách user_id nhận thông báo. */
  recipients: string[];
  /** ID entity gốc (lưu vào notifications.related_id + dùng cho related_url). */
  relatedId?: string | null;
  /** Bỏ qua Telegram cho lần phát này (in-app vẫn tạo). */
  skipTelegram?: boolean;
  /** Cột domain_id (chỉ dùng cho cảnh báo tên miền). */
  domainId?: string | null;
}

/** Phát 1 sự kiện thông báo tới nhiều người nhận. Trả về số bản in-app đã tạo. */
export async function notify(
  eventKey: string,
  vars: Record<string, string | number>,
  opts: NotifyOptions,
): Promise<{ sent: number }> {
  const ev = getEvent(eventKey);
  if (!ev) {
    console.error(`[notify] event không tồn tại trong catalog: ${eventKey}`);
    return { sent: 0 };
  }

  const templateKey = typeof ev.templateKey === 'function' ? ev.templateKey(vars) : ev.templateKey;
  const notifType = typeof ev.notifType === 'function' ? ev.notifType(vars) : ev.notifType;

  // Mẫu bị admin TẮT → không phát (cả in-app lẫn Telegram). Mặc định bật.
  if (!(await isTemplateEnabled(templateKey))) return { sent: 0 };

  const rendered = await renderNotification(templateKey, vars);
  if (!rendered) {
    console.error(`[notify] template không tồn tại: ${templateKey} (event ${eventKey})`);
    return { sent: 0 };
  }

  const recipients = Array.from(new Set(opts.recipients.filter(Boolean)));
  if (recipients.length === 0) return { sent: 0 };

  const relatedUrl = ev.relatedUrl
    ? ev.relatedUrl({ ...vars, relatedId: opts.relatedId ?? '' })
    : null;

  // Lấy thông tin Telegram của người nhận (1 query) nếu cần.
  const useTelegram = ev.channels.includes('telegram') && !opts.skipTelegram;
  const tgMap = new Map<string, { chat: string | null; enabled: boolean }>();
  if (useTelegram) {
    const rows = await query<{ id: string; telegram_chat_id: string | null; telegram_enabled: boolean | null }>(
      `SELECT id::text AS id, telegram_chat_id, telegram_enabled FROM users WHERE id::text = ANY($1)`,
      [recipients]
    );
    for (const r of rows) tgMap.set(r.id, { chat: r.telegram_chat_id, enabled: r.telegram_enabled !== false });
  }

  const useInApp = ev.channels.includes('inapp');

  // Tùy chọn người nhận: kênh nào BỊ TẮT cho event này (chỉ telegram/webpush).
  // In-app luôn gửi. Bảng rỗng ⇒ map rỗng ⇒ không bỏ ai (hành vi cũ).
  const prefDisabled = (useTelegram || useInApp)
    ? await getDisabledChannelsForEvent(eventKey, recipients)
    : new Map<string, Set<string>>();

  let sent = 0;

  for (const uid of recipients) {
    if (useInApp) {
      try {
        // Dùng NOW() (giờ địa phương của DB) cho created_at/updated_at — ĐÚNG chuẩn
        // với DEFAULT now() của cột (timestamp without time zone = giờ VN naive).
        // Trước đây truyền new Date().toISOString() (UTC) → thông báo lệch -7h.
        await queryOne(
          `INSERT INTO notifications
             (user_id, type, title, message, icon, read, related_id, related_url, domain_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,NOW(),NOW()) RETURNING id`,
          [uid, notifType, rendered.title, rendered.message, rendered.icon, opts.relatedId ?? null, relatedUrl, opts.domainId ?? null]
        );
        sent++;
      } catch (e) {
        console.error('[notify] in-app error:', (e as Error).message);
      }
    }

    if (useTelegram && !prefDisabled.get(uid)?.has('telegram')) {
      const tg = tgMap.get(uid);
      if (tg?.chat && tg.enabled) {
        const text = rendered.telegram ?? `*${rendered.title}*\n\n${rendered.message}`;
        const label = typeof ev.telegramButtonLabel === 'function'
          ? ev.telegramButtonLabel({ ...vars, relatedId: opts.relatedId ?? '' })
          : (ev.telegramButtonLabel || 'Xem chi tiết');
        const buttonUrl = relatedUrl ? `${APP_URL}${relatedUrl}` : null;
        const chat = tg.chat;

        // Sự kiện Solace → CHỈ gửi qua bot Solace (token riêng), gửi thẳng (bỏ qua outbox)
        // để bot chính KHÔNG bao giờ nhận tin Solace.
        if (eventKey.startsWith('solace.')) {
          const solaceTok = process.env.SOLACE_BOT_TOKEN;
          if (solaceTok) {
            void (buttonUrl
              ? sendTelegramMessageWithButton(text, chat, label, buttonUrl, solaceTok)
              : sendTelegramMessageToChat(text, chat, solaceTok)
            ).catch((e) => console.error('[notify] solace telegram error:', (e as Error).message));
          }
          continue; // không đẩy vào outbox (bot chính)
        }

        const dg = typeof ev.digest === 'function' ? ev.digest(vars) : ev.digest;
        // Đẩy vào hộp thư đi (worker lo gửi + retry + gộp). Outbox lỗi/chưa migrate →
        // fallback gửi thẳng để KHÔNG mất hành vi cũ.
        const queued = enqueueTelegram({
          chatId: chat, text, buttonLabel: buttonUrl ? label : null, buttonUrl, userId: uid,
          digestGroup: dg?.group ?? null,
          digestTitle: dg?.title ?? null,
          digestLine: dg ? rendered.message : null,
          landingUrl: dg ? `${APP_URL}${dg.landingUrl}` : null,
        }).catch(() => {
          void (buttonUrl
            ? sendTelegramMessageWithButton(text, chat, label, buttonUrl)
            : sendTelegramMessageToChat(text, chat)
          ).catch((e) => console.error('[notify] telegram fallback error:', (e as Error).message));
        });
        // Recruitment API waits for persistence, not for Telegram network delivery.
        if (eventKey === 'recruitment.updated' || eventKey === 'fdv.reminder') await queued;
      }
    }
  }

  // Web Push (mirror in-app): đẩy tới thiết bị đã đăng ký của người nhận. Ngủ nếu
  // thiếu VAPID env hoặc chưa ai bật (bảng rỗng) → không đổi hành vi khi deploy.
  if (useInApp) {
    const webpushRecipients = recipients.filter(
      (uid) => !prefDisabled.get(uid)?.has('webpush')
    );
    if (webpushRecipients.length > 0) {
      void sendWebPushToUsers(webpushRecipients, {
        title: rendered.title,
        body: rendered.message,
        url: relatedUrl,
        icon: rendered.icon,
      }).catch((e) => console.error('[notify] webpush error:', (e as Error).message));
    }
  }

  return { sent };
}

import { queryOne } from '@/lib/db';
import { sendTelegramApprovalRequest } from '@/lib/services/telegramService';
import { REGISTRY, buildCallbackData, type ApprovalType } from '@/lib/telegram/approvalRegistry';
import { recordApprovalMessage } from '@/lib/telegram/approvalMessageSync';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';

export async function sendApprovalRequest(opts: {
  type: ApprovalType;
  id: string;
  approverUserId: string | null | undefined;
  title?: string;
  lines?: string[];
  text?: string;
  detailLabel?: string;
}): Promise<void> {
  try {
    if (!opts.approverUserId) return;

    const approver = await queryOne<{ telegram_chat_id: string | null; telegram_enabled: boolean }>(
      `SELECT telegram_chat_id, telegram_enabled FROM users WHERE id::text = $1 AND status = 'active'`,
      [opts.approverUserId],
    );
    if (!approver?.telegram_chat_id || approver.telegram_enabled !== true) return;

    const cfg = REGISTRY[opts.type];
    const text = opts.text
      ?? `📋 *${opts.title || cfg.label}*\n\n${(opts.lines || []).filter(Boolean).join('\n')}\n\n⏳ *Chờ duyệt*`;

    const sent = await sendTelegramApprovalRequest(approver.telegram_chat_id, text, {
      approveData: buildCallbackData(opts.type, 'a', opts.id),
      rejectData: buildCallbackData(opts.type, 'r', opts.id),
      detailUrl: `${APP_URL}${cfg.detailPath(opts.id)}`,
      detailText: opts.detailLabel,
    });

    if (sent) await recordApprovalMessage(opts.type, opts.id, sent.chat_id, sent.message_id);
  } catch (e) {
    console.error('sendApprovalRequest error:', e);
  }
}

import crypto from 'crypto';
import { execute, queryOne } from '@/lib/db';

export interface PendingApprovalAction {
  id: string;
  telegram_chat_id: string;
  approver_user_id: string;
  approval_type: string;
  request_id: string;
  action: 'reject';
  source_chat_id: string;
  source_message_id: number;
}

export async function upsertPendingApprovalAction(input: Omit<PendingApprovalAction, 'id'>): Promise<void> {
  await execute(
    `INSERT INTO telegram_pending_approval_actions
       (id, telegram_chat_id, approver_user_id, approval_type, request_id, action, source_chat_id, source_message_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (telegram_chat_id) DO UPDATE SET
       approver_user_id = EXCLUDED.approver_user_id,
       approval_type = EXCLUDED.approval_type,
       request_id = EXCLUDED.request_id,
       action = EXCLUDED.action,
       source_chat_id = EXCLUDED.source_chat_id,
       source_message_id = EXCLUDED.source_message_id,
       updated_at = NOW()`,
    [
      `tpaa_${crypto.randomBytes(8).toString('hex')}`,
      input.telegram_chat_id,
      input.approver_user_id,
      input.approval_type,
      input.request_id,
      input.action,
      input.source_chat_id,
      input.source_message_id,
    ],
  );
}

export async function getPendingApprovalAction(telegramChatId: string): Promise<PendingApprovalAction | null> {
  return queryOne<PendingApprovalAction>(
    `SELECT id, telegram_chat_id, approver_user_id, approval_type, request_id, action, source_chat_id, source_message_id
       FROM telegram_pending_approval_actions
      WHERE telegram_chat_id = $1`,
    [telegramChatId],
  );
}

export async function clearPendingApprovalAction(telegramChatId: string): Promise<void> {
  await execute('DELETE FROM telegram_pending_approval_actions WHERE telegram_chat_id = $1', [telegramChatId]);
}

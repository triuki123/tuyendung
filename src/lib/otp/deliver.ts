import { createChallenge, issueOtpById } from '@/lib/services/otpChallengeService';
import { sendOtpMagicLink, isOtpSmtpConfigured } from './email';
import { sendTelegramMessageToChat } from '@/lib/services/telegramService';

/**
 * Giao OTP đa kênh với FALLBACK: email magic-link (kênh chính) → nếu email lỗi/không
 * cấu hình thì gửi THẲNG OTP qua Telegram bot FADO Notification (nếu user đã liên kết).
 */
export interface DeliverInput {
  purpose: string;
  subjectId?: string | null;
  requestedBy?: string | null;
  email: string;
  telegramChatId?: string | null;
  appBaseUrl: string;
}
export interface DeliverResult { channel: 'email' | 'telegram'; emailMasked?: string }

function mask(e: string): string {
  const [u, d] = e.split('@');
  if (!d) return e;
  return `${u.slice(0, 2)}***@${d}`;
}

export async function deliverOtp(input: DeliverInput): Promise<DeliverResult> {
  const { linkToken, challengeId, linkExpiresText } = await createChallenge({
    purpose: input.purpose, subjectId: input.subjectId, requestedBy: input.requestedBy, email: input.email,
  });
  const link = `${input.appBaseUrl.replace(/\/$/, '')}/otp?token=${linkToken}`;

  // 1) Kênh chính: email magic-link.
  if (isOtpSmtpConfigured()) {
    try {
      await sendOtpMagicLink(input.email, link, linkExpiresText);
      return { channel: 'email', emailMasked: mask(input.email) };
    } catch (e) {
      console.error('[otp] Email lỗi, thử fallback Telegram:', e instanceof Error ? e.message : e);
    }
  }

  // 2) Fallback: gửi thẳng OTP qua Telegram.
  if (input.telegramChatId) {
    const otp = await issueOtpById(challengeId);
    const msg = `🔐 *FADO AssetFlow*\nMã xác thực của bạn: *${otp}*\n\nMã có hiệu lực 10 phút. Không chia sẻ mã này với bất kỳ ai.`;
    await sendTelegramMessageToChat(msg, String(input.telegramChatId));
    return { channel: 'telegram' };
  }

  throw new Error('Không gửi được mã: email đang lỗi và tài khoản chưa liên kết Telegram.');
}

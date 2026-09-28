'use client';

import { useEffect, useState } from 'react';
import type { TelegramAuthData } from '@/lib/services/telegramAuthService';

interface TelegramLoginButtonProps {
  /** Bot username KHÔNG kèm @. Mặc định lấy từ NEXT_PUBLIC_TELEGRAM_BOT_USERNAME. */
  botUsername?: string;
  /** Bot ID (dãy số, KHÔNG bí mật). Mặc định NEXT_PUBLIC_TELEGRAM_BOT_ID, fallback id đã biết. */
  botId?: string;
  onAuth: (user: TelegramAuthData) => void;
  size?: 'small' | 'medium' | 'large';
  /** Yêu cầu quyền gửi tin nhắn cho user. */
  requestAccess?: boolean;
  className?: string;
}

/** API toàn cục do telegram-widget.js cung cấp. */
interface TelegramLoginAPI {
  Login: {
    auth: (
      options: { bot_id: string; request_access?: string; lang?: string },
      callback: (data: TelegramAuthData | false) => void
    ) => void;
  };
}

const TG_SCRIPT_SRC = 'https://telegram.org/js/telegram-widget.js?22';

/**
 * Nút đăng nhập Telegram TỰ VẼ (nhãn tiếng Việt) + gọi `Telegram.Login.auth()`.
 *
 * Khác cách nhúng iframe widget chính thức (chữ nút do Telegram tự dịch, không
 * kiểm soát được — hay ra tiếng Pháp/Anh): cách này dùng nút của ta nên nhãn luôn
 * là tiếng Việt; popup xác thực vẫn do Telegram xử lý và trả về cùng payload.
 *
 * ⚠️ Bot phải được /setdomain đúng tên miền đang chạy, nếu không popup báo lỗi domain.
 */
export default function TelegramLoginButton({
  botUsername,
  botId,
  onAuth,
  size = 'large',
  requestAccess = true,
  className,
}: TelegramLoginButtonProps) {
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  const username = botUsername || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  // Bot ID không phải bí mật (lộ công khai qua mọi lượt tra cứu bot). Fallback id đã biết.
  const resolvedBotId = botId || process.env.NEXT_PUBLIC_TELEGRAM_BOT_ID || '8714581563';

  // Nạp telegram-widget.js (định nghĩa window.Telegram.Login) — chỉ 1 lần.
  useEffect(() => {
    const w = window as unknown as { Telegram?: TelegramLoginAPI };
    if (w.Telegram?.Login) { setReady(true); return; }

    let script = document.querySelector<HTMLScriptElement>(`script[src="${TG_SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = TG_SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    const onLoad = () => setReady(true);
    script.addEventListener('load', onLoad);
    // Nếu script đã load xong trước khi gắn listener
    if (w.Telegram?.Login) setReady(true);
    return () => script?.removeEventListener('load', onLoad);
  }, []);

  function handleClick() {
    const w = window as unknown as { Telegram?: TelegramLoginAPI };
    if (!w.Telegram?.Login || !resolvedBotId) return;
    setPending(true);
    w.Telegram.Login.auth(
      { bot_id: resolvedBotId, request_access: requestAccess ? 'write' : undefined },
      (data) => {
        setPending(false);
        if (data) onAuth(data);
      }
    );
  }

  if (!username && !resolvedBotId) {
    return (
      <p className="text-xs text-amber-400">
        Chưa cấu hình <code>NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</code> — không hiển thị được nút Telegram.
      </p>
    );
  }

  const heightCls = size === 'small' ? 'h-9 text-sm' : size === 'medium' ? 'h-10 text-sm' : 'h-11 text-sm';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ready || pending}
      className={
        className ||
        `inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 font-600 text-white transition-colors disabled:opacity-60 ${heightCls}`
      }
      style={{ background: '#229ED9' }}
    >
      {/* Icon Telegram */}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
      {pending ? 'Đang xác thực…' : 'Đăng nhập bằng Telegram'}
    </button>
  );
}

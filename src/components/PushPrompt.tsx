'use client';

import React, { useEffect, useState } from 'react';
import { BellRing, X, Share } from 'lucide-react';
import {
  isPushSupported,
  isIOS,
  isStandalone,
  getPermission,
  hasActiveSubscription,
  subscribeToPush,
} from '@/lib/push/client';

interface PushPromptProps {
  userId?: string;
}

const DISMISS_KEY = 'push_prompt_dismissed_v1';

type Mode = 'none' | 'enable' | 'ios-install';

/**
 * Lời mời bật thông báo — TỰ hiện lần đầu mở app (không cần vào chuông bấm "Bật đẩy").
 *  - Trình duyệt hỗ trợ + chưa quyết định → banner "Bật thông báo".
 *  - iPhone chưa cài PWA → hướng dẫn "Thêm vào Màn hình chính" (Safari không cho push
 *    tới khi cài). Đã bấm/đã tắt (localStorage) → không làm phiền lại.
 *
 * Vì Safari/iOS bắt buộc requestPermission() nằm trong thao tác chạm, ta hiển thị lời
 * mời rồi mới xin quyền khi người dùng bấm — không tự gọi lúc tải trang.
 */
export default function PushPrompt({ userId }: PushPromptProps) {
  const [mode, setMode] = useState<Mode>('none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        return;
      }

      // iPhone chưa cài PWA: không push được → mời cài (hiện 1 lần).
      if (isIOS() && !isStandalone()) {
        if (!cancelled) setMode('ios-install');
        return;
      }

      if (!isPushSupported()) return;
      if (getPermission() !== 'default') return; // đã granted/denied → thôi
      if (await hasActiveSubscription()) return;

      // Chờ một nhịp để không chen ngay lúc trang đang tải nặng.
      setTimeout(() => {
        if (!cancelled) setMode('enable');
      }, 2500);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const remember = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* bỏ qua */
    }
  };

  const dismiss = () => {
    remember();
    setMode('none');
  };

  const enable = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await subscribeToPush(userId); // thành công hay bị từ chối đều không mời lại
    } catch (e) {
      console.error('[push-prompt] lỗi:', e);
    } finally {
      remember();
      setBusy(false);
      setMode('none');
    }
  };

  if (mode === 'none') return null;

  return (
    <div
      className="fixed inset-x-0 z-[70] flex justify-center px-3 pointer-events-none"
      style={{ bottom: 'calc(0.75rem + 46px + env(safe-area-inset-bottom))' }}
    >
      <div
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 shrink-0 rounded-xl bg-indigo-500/15 p-2">
            <BellRing className="h-5 w-5 text-indigo-400" />
          </div>

          {mode === 'enable' ? (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-600 text-foreground">Bật thông báo?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Nhận nhắc việc được giao, duyệt yêu cầu, ticket… ngay trên thiết bị dù không mở app.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={enable}
                  disabled={busy}
                  className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {busy ? 'Đang bật…' : 'Bật thông báo'}
                </button>
                <button
                  onClick={dismiss}
                  className="rounded-xl px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-white/5"
                >
                  Để sau
                </button>
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-600 text-foreground">Nhận thông báo trên iPhone</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Bấm <Share className="inline h-3.5 w-3.5 align-text-bottom" /> (Chia sẻ) →{' '}
                <span className="text-foreground">Thêm vào MH chính</span>, mở app từ biểu tượng vừa
                tạo rồi bật thông báo trong chuông.
              </p>
              <div className="mt-3">
                <button
                  onClick={dismiss}
                  className="rounded-xl px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-white/5"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          )}

          <button
            onClick={dismiss}
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/5"
            title="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

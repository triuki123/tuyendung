'use client';

import { useEffect } from 'react';

/**
 * useEscapeKey — gọi handler khi nhấn phím ESC.
 * Chuẩn UX: mọi modal/panel/sheet phải đóng được bằng ESC.
 *
 * @param onEscape  hàm chạy khi nhấn ESC (thường là onClose)
 * @param enabled   bật/tắt (mặc định true). Đặt false khi modal đang bận/đang khoá.
 *
 * Dùng: useEscapeKey(onClose); hoặc useEscapeKey(handleClose, !isSaving);
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}

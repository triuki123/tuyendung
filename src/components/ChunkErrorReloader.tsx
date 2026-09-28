'use client';

import { useEffect } from 'react';

/**
 * Tự phục hồi khi tab đang MỞ gặp deploy mới.
 *
 * Bối cảnh: app chạy SPA (Next App Router). Khi deploy bản mới, hash các chunk JS đổi;
 * tab đang mở vẫn giữ hash CŨ trong bộ nhớ → điều hướng sau deploy sẽ nạp chunk cũ đã bị
 * xoá khỏi server → ChunkLoadError → màn "Application error: a client-side exception".
 * Full reload (F5) lấy HTML tươi + hash mới là hết — nên ở đây bắt đúng loại lỗi đó và
 * TỰ RELOAD MỘT LẦN (chống lặp vô hạn bằng mốc thời gian trong sessionStorage).
 *
 * Chỉ reload cho lỗi NẠP CHUNK — không đụng lỗi runtime thật (tránh reload loop che bug).
 */
const CHUNK_ERROR_RE =
  /Loading chunk [\d]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

const GUARD_KEY = 'chunk_reload_at';
const MIN_INTERVAL_MS = 15_000; // đã reload trong 15s gần đây thì thôi (chống loop)

function isChunkError(message: unknown): boolean {
  return typeof message === 'string' && CHUNK_ERROR_RE.test(message);
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) || '0');
    if (Date.now() - last < MIN_INTERVAL_MS) return; // vừa reload rồi → không lặp
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch { /* sessionStorage bị chặn → vẫn reload 1 lần dưới đây */ }
  // reload không dùng cache để chắc chắn lấy HTML + chunk mới
  window.location.reload();
}

export default function ChunkErrorReloader() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      if (isChunkError(e?.message) || isChunkError((e?.error as Error)?.message)) reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e?.reason;
      if (isChunkError(reason?.message) || isChunkError(reason?.name) || isChunkError(String(reason))) reloadOnce();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}

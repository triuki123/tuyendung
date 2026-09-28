'use client';

import { useEffect } from 'react';

/**
 * Error boundary cấp trang (App Router). Thay màn "Application error: a client-side
 * exception" mặc định của Next bằng:
 *  - Lỗi NẠP CHUNK (thường do deploy mới khi tab đang mở) → tự reload 1 lần lấy bản mới.
 *  - Lỗi khác → thông báo tiếng Việt + nút Thử lại / Tải lại trang.
 * Xem thêm [[ChunkErrorReloader]] xử lý lỗi async (dynamic import reject) ngoài render.
 */
const CHUNK_ERROR_RE =
  /Loading chunk [\d]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

const GUARD_KEY = 'chunk_reload_at';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunk = CHUNK_ERROR_RE.test(error?.message || '') || error?.name === 'ChunkLoadError';

  useEffect(() => {
    if (!isChunk) return;
    try {
      const last = Number(sessionStorage.getItem(GUARD_KEY) || '0');
      if (Date.now() - last < 15_000) return; // vừa reload → không lặp vô hạn
      sessionStorage.setItem(GUARD_KEY, String(Date.now()));
    } catch { /* noop */ }
    window.location.reload();
  }, [isChunk]);

  if (isChunk) {
    // Đang tự reload — hiện màn chờ gọn thay vì lỗi đỏ
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060e1a' }}>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Đang cập nhật phiên bản mới…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#060e1a', padding: 24, textAlign: 'center' }}>
      <p style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600 }}>Đã xảy ra lỗi hiển thị</p>
      <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420 }}>
        Xin lỗi vì sự cố. Bấm thử lại; nếu vẫn lỗi, tải lại trang.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => reset()}
          style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Thử lại
        </button>
        <button onClick={() => window.location.reload()}
          style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Tải lại trang
        </button>
      </div>
    </div>
  );
}

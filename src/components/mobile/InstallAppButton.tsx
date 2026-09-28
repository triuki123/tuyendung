'use client';

import React, { useEffect, useState } from 'react';
import { Download, Share, Plus, Check, MoreVertical } from 'lucide-react';
import BottomSheet from './BottomSheet';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Nút "Tải app về máy" thông minh:
 *  - Android/Chrome có beforeinstallprompt → bấm là tự bật hộp thoại cài.
 *  - iOS Safari (Apple chặn tự cài) → mở hướng dẫn Chia sẻ → Thêm vào MH chính.
 *  - Trình duyệt khác → hướng dẫn chung.
 *  - Đã cài (standalone) → ẩn nút.
 */
export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true); // mặc định ẩn tới khi biết chắc chưa cài
  const [isIOS, setIsIOS] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
    setIsIOS(ios);

    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      try { await deferred.userChoice; } catch { /* bỏ qua */ }
      setDeferred(null);
    } else {
      setSheet(true); // iOS hoặc trình duyệt không hỗ trợ tự cài → hướng dẫn
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3.5 text-left hover:bg-indigo-500/15 transition-colors"
      >
        <span className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400">
          <Download size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-600 text-foreground">Tải app về máy</span>
          <span className="block text-xs text-muted-foreground">Cài lên màn hình chính, mở chạy như app</span>
        </span>
      </button>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Cài app lên màn hình chính">
        <div className="px-4 pb-4 space-y-3">
          {isIOS ? (
            <>
              <Step n={1} icon={<Share size={18} className="text-blue-400" />}>
                Bấm nút <b className="text-foreground">Chia sẻ</b> (hình ô vuông có mũi tên ↑) ở thanh dưới <b className="text-foreground">Safari</b>.
              </Step>
              <Step n={2} icon={<Plus size={18} className="text-indigo-400" />}>
                Cuộn xuống chọn <b className="text-foreground">“Thêm vào MH chính”</b>.
              </Step>
              <Step n={3} icon={<Check size={18} className="text-emerald-400" />}>
                Bấm <b className="text-foreground">Thêm</b> — icon app xuất hiện ở màn hình chính.
              </Step>
              <p className="text-2xs text-muted-foreground pt-1">Lưu ý: trên iPhone bắt buộc dùng trình duyệt Safari.</p>
            </>
          ) : (
            <>
              <Step n={1} icon={<MoreVertical size={18} className="text-indigo-400" />}>
                Mở menu trình duyệt (nút <b className="text-foreground">⋮</b> góc trên phải).
              </Step>
              <Step n={2} icon={<Download size={18} className="text-indigo-400" />}>
                Chọn <b className="text-foreground">“Cài đặt ứng dụng”</b> hoặc <b className="text-foreground">“Thêm vào màn hình chính”</b>.
              </Step>
              <Step n={3} icon={<Check size={18} className="text-emerald-400" />}>
                Xác nhận — app xuất hiện trên màn hình chính.
              </Step>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/5 p-3" style={{ background: 'var(--secondary)' }}>
      <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-indigo-500/15 text-indigo-400 text-xs font-700">{n}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="flex-shrink-0">{icon}</span>
        <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

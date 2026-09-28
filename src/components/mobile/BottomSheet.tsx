'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Tiêu đề header (tùy chọn). */
  title?: React.ReactNode;
  /** Chiều cao tối đa của sheet (mặc định 88vh). */
  maxHeight?: string;
  children: React.ReactNode;
}

/**
 * Bottom sheet kiểu app native — trượt lên từ đáy, backdrop mờ, kéo tay để đóng.
 * Render qua portal vào <body> để KHÔNG dính containing block của backdrop-filter
 * (vd Topbar). Dùng thay modal-giữa-màn trên mobile.
 *
 * Desktop vẫn dùng được nhưng khuyến nghị chỉ bật ở mobile (kết hợp useIsMobile).
 */
export default function BottomSheet({ open, onClose, title, maxHeight = '88vh', children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Khóa cuộn nền + đóng bằng phím Esc khi sheet mở.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : 'Bảng thao tác'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 fade-in"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="relative w-full rounded-t-3xl border-t border-white/10 overflow-hidden sheet-up"
        style={{ background: 'var(--card)', maxHeight, boxShadow: '0 -8px 40px rgba(0,0,0,0.5)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Tay kéo */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-9 rounded-full bg-white/20" />
        </div>
        {title && (
          <div className="px-5 pb-3 pt-1 text-base font-700 text-foreground">{title}</div>
        )}
        <div className="overflow-y-auto px-1" style={{ maxHeight: `calc(${maxHeight} - 48px)` }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

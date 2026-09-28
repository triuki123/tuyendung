'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';

export interface PopupItem {
  id: string;
  title: string;
  message: string;
  icon?: string;
  /** Nếu có → click mở trang; rỗng → chỉ là thông báo đọc rồi tắt. */
  url?: string;
}

interface NotificationPopupProps {
  items: PopupItem[];
  onDismiss: (id: string) => void;
  onOpen: (id: string) => void;
  /** Thời gian tự tắt (ms). */
  duration?: number;
}

/**
 * Popup nổi góc phải cho các thông báo "thuần" (chỉ để đọc). Dark-safe, auto-dismiss.
 * Render qua portal để không bị kẹt trong ngăn xếp z-index của Topbar.
 */
export default function NotificationPopup({
  items,
  onDismiss,
  onOpen,
  duration = 8000,
}: NotificationPopupProps) {
  if (typeof document === 'undefined' || items.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[60] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-sm pointer-events-none"
      style={{
        top: 'calc(5rem + env(safe-area-inset-top))',
        right: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      {items.map((item) => (
        <PopupCard
          key={item.id}
          item={item}
          duration={duration}
          onDismiss={() => onDismiss(item.id)}
          onOpen={() => onOpen(item.id)}
        />
      ))}
    </div>,
    document.body
  );
}

function PopupCard({
  item,
  duration,
  onDismiss,
  onOpen,
}: {
  item: PopupItem;
  duration: number;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clickable = !!item.url;

  return (
    <div
      onClick={clickable ? onOpen : undefined}
      className={`pointer-events-auto rounded-2xl border border-white/10 shadow-2xl overflow-hidden ${
        clickable ? 'cursor-pointer' : ''
      }`}
      style={{ background: 'var(--card)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0 text-lg leading-none">
          {item.icon ? <span>{item.icon}</span> : <Bell className="h-4 w-4 text-indigo-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-600 text-foreground truncate">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{item.message}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          title="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

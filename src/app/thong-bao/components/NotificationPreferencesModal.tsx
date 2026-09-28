'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Send, Smartphone, ChevronDown } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { getPreferenceCatalog } from '@/lib/notifications/eventLabels';

interface Props {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

type Channel = 'telegram' | 'webpush';

export default function NotificationPreferencesModal({ userId, isOpen, onClose }: Props) {
  const toast = useToast();
  const catalog = useMemo(() => getPreferenceCatalog(), []);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !userId) return;
    setLoading(true);
    fetch(`/api/notifications/preferences?userId=${userId}`)
      .then((r) => (r.ok ? r.json() : { disabled: [] }))
      .then((data) => {
        const set = new Set<string>();
        for (const d of data.disabled || []) set.add(`${d.event_key}:${d.channel}`);
        setDisabled(set);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, userId]);

  const toggle = async (eventKey: string, channel: Channel) => {
    const key = `${eventKey}:${channel}`;
    const currentlyEnabled = !disabled.has(key);
    const newEnabled = !currentlyEnabled;

    // optimistic
    setDisabled((prev) => {
      const next = new Set(prev);
      if (newEnabled) next.delete(key);
      else next.add(key);
      return next;
    });

    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, eventKey, channel, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // revert
      setDisabled((prev) => {
        const next = new Set(prev);
        if (newEnabled) next.add(key);
        else next.delete(key);
        return next;
      });
      toast.show('Không thể lưu tùy chọn', 'error');
    }
  };

  const toggleGroup = (k: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <h2 className="text-base font-700 text-foreground">Tùy chọn thông báo</h2>
            <p className="text-xs text-muted-foreground">
              Tắt kênh đẩy cho loại bạn không muốn. Thông báo trong ứng dụng luôn được giữ.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chú thích cột */}
        <div className="flex items-center justify-end gap-4 border-b border-white/5 px-6 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" /> Telegram</span>
          <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> Đẩy</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            catalog.map((g) => {
              const isOpenG = openGroups.has(g.key);
              return (
                <div key={g.key} className="mb-1">
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left hover:bg-white/5"
                  >
                    <span>{g.icon}</span>
                    <span className="flex-1 text-sm font-600 text-foreground">{g.label}</span>
                    <span className="text-[11px] text-muted-foreground">{g.items.length}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition ${isOpenG ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpenG && (
                    <div className="pl-4">
                      {g.items.map((it) => (
                        <div
                          key={it.eventKey}
                          className="flex items-center gap-3 rounded-lg px-4 py-2 hover:bg-white/[0.03]"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{it.label}</span>
                          <Switch
                            on={it.telegram && !disabled.has(`${it.eventKey}:telegram`)}
                            disabled={!it.telegram}
                            onToggle={() => toggle(it.eventKey, 'telegram')}
                          />
                          <Switch
                            on={it.webpush && !disabled.has(`${it.eventKey}:webpush`)}
                            disabled={!it.webpush}
                            onToggle={() => toggle(it.eventKey, 'webpush')}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Switch({ on, disabled, onToggle }: { on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        disabled ? 'cursor-not-allowed bg-white/5' : on ? 'bg-indigo-600' : 'bg-white/15'
      }`}
      title={disabled ? 'Không áp dụng cho loại này' : on ? 'Đang bật' : 'Đang tắt'}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          on ? 'left-4' : 'left-0.5'
        } ${disabled ? 'opacity-40' : ''}`}
      />
    </button>
  );
}

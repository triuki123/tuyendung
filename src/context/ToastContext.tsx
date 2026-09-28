'use client';

/**
 * ToastContext — hệ thống toast nổi (transient) cho toàn webapp.
 * Thay thế alert() native. Toast hiện góc phải-trên, tự tắt, có nút đóng.
 *
 * Dùng: const toast = useToast(); toast.success('Đã lưu'); toast.error('Lỗi...');
 * Hoặc qua useNotification().showNotification(msg, 'success'|'error'|'info').
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number; // ms
}

interface ToastContextType {
  toasts: Toast[];
  show: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  warning: 4000,
  error: 5000,
};

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    counter += 1;
    const id = `toast-${counter}`;
    const ms = duration ?? DEFAULT_DURATION[type];
    setToasts(prev => {
      // Giới hạn tối đa 4 toast cùng lúc — bỏ cái cũ nhất
      const next = [...prev, { id, type, message, duration: ms }];
      return next.slice(-4);
    });
    timers.current[id] = setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  const success = useCallback((m: string, d?: number) => show(m, 'success', d), [show]);
  const error = useCallback((m: string, d?: number) => show(m, 'error', d), [show]);
  const info = useCallback((m: string, d?: number) => show(m, 'info', d), [show]);
  const warning = useCallback((m: string, d?: number) => show(m, 'warning', d), [show]);

  return (
    <ToastContext.Provider value={{ toasts, show, success, error, info, warning, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const TOAST_STYLES: Record<ToastType, { icon: React.ReactNode; ring: string; bar: string }> = {
  success: { icon: <CheckCircle2 className="h-5 w-5 text-green-400" />, ring: 'border-green-500/30', bar: 'bg-green-500' },
  error: { icon: <XCircle className="h-5 w-5 text-red-400" />, ring: 'border-red-500/30', bar: 'bg-red-500' },
  info: { icon: <Info className="h-5 w-5 text-indigo-400" />, ring: 'border-indigo-500/30', bar: 'bg-indigo-500' },
  warning: { icon: <AlertTriangle className="h-5 w-5 text-yellow-400" />, ring: 'border-yellow-500/30', bar: 'bg-yellow-500' },
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-80 pointer-events-none"
      style={{
        // Tôn trọng vùng an toàn (notch/status bar trên, khuyết cạnh khi xoay ngang)
        top: 'calc(env(safe-area-inset-top) + 1rem)',
        right: 'calc(env(safe-area-inset-right) + 1rem)',
      }}
    >
      {toasts.map(t => {
        const s = TOAST_STYLES[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border ${s.ring} shadow-lg flex items-start gap-3 px-4 py-3 toast-enter`}
            style={{ background: 'var(--card)' }}
            role="alert"
          >
            <div className="shrink-0 mt-0.5">{s.icon}</div>
            <p className="flex-1 text-sm text-foreground leading-snug break-words">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 btn-ghost rounded-lg p-1 text-muted-foreground hover:text-foreground"
              aria-label="Đóng"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {/* Thanh đếm ngược thời gian */}
            <div className={`absolute bottom-0 left-0 h-0.5 ${s.bar} toast-progress`} style={{ animationDuration: `${t.duration}ms` }} />
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Truy cập an toàn ngoài provider (no-op nếu chưa mount) — dùng cho code không chắc context. */
export function useToastSafe(): ToastContextType | null {
  return useContext(ToastContext) ?? null;
}

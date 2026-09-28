'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { POS_MODAL_Z } from '@/app/solace/pos/components/modalLayers';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  busy?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy bỏ',
  onConfirm,
  onCancel,
  danger = true,
  busy = false,
}: ConfirmModalProps) {
  // ESC để huỷ
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, busy, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.confirm} flex items-center justify-center p-4 fade-in`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-3xl border border-white/08 p-6 modal-entrance"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
      >
        <button
          onClick={onCancel}
          aria-label="Đóng"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl btn-ghost text-muted-foreground"
        >
          <X size={16} />
        </button>

        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${danger ? 'bg-red-500/15' : 'bg-indigo-500/15'}`}>
          <AlertTriangle size={24} className={danger ? 'text-red-400' : 'text-indigo-400'} />
        </div>

        <h3 className="text-lg font-700 text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-10 rounded-xl btn-ghost text-sm font-600 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 h-10 rounded-xl text-sm font-600 disabled:opacity-50 ${danger ? 'btn-accent' : 'btn-indigo'}`}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

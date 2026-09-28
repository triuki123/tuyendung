'use client';

import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEscapeKey(onCancel, !isLoading);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={isLoading ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-line overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            {isDangerous && <AlertCircle className="h-5 w-5 text-red-400" />}
            <h2 className="text-base font-600 text-foreground">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="btn-ghost rounded-lg p-1.5 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="btn-ghost rounded-xl px-4 py-2 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-xl px-4 py-2 text-sm font-600 flex items-center gap-2 disabled:opacity-50 ${
              isDangerous
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

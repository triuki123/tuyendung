'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface RejectReasonModalProps {
  isOpen: boolean;
  ticketCount: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function RejectReasonModal({
  isOpen,
  ticketCount,
  onConfirm,
  onCancel,
  isLoading = false,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEscapeKey(onCancel, isOpen);

  // Focus textarea khi modal mở
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm(reason.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter để submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md animate-in fade-in-50 zoom-in-95 duration-200">
        <div className="bg-slate-900 border border-line rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-500/20 to-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-start justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-600 text-foreground">Từ Chối {ticketCount} Ticket</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Vui lòng cung cấp lý do từ chối (tùy chọn)
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Reason Textarea */}
            <div className="space-y-2">
              <label className="text-sm font-500 text-foreground">
                Lý do từ chối
              </label>
              <textarea
                ref={textareaRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ví dụ: Trùng lặp với yêu cầu khác, không hợp lệ, v.v..."
                disabled={isLoading}
                className="w-full px-4 py-3 rounded-lg bg-hover border border-line text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500 focus:bg-hover-strong transition-colors disabled:opacity-50 resize-none min-h-[120px] text-sm"
              />
              <p className="text-xs text-muted-foreground">
                💡 Nhấn Ctrl+Enter (Cmd+Enter trên Mac) để gửi
              </p>
            </div>

            {/* Character count */}
            <div className="text-xs text-muted-foreground text-right">
              {reason.length} / 500
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-800/50 border-t border-line-subtle px-6 py-4 flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 rounded-lg border border-line text-foreground hover:bg-hover transition-colors disabled:opacity-50 font-500 text-sm"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50 font-600 text-sm"
            >
              {isLoading ? 'Đang gửi...' : 'Từ Chối'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

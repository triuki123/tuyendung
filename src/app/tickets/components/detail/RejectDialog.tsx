'use client';

import { useState } from 'react';
import { XCircle, X, AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface RejectDialogProps {
  ticketCode: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}

export default function RejectDialog({ ticketCode, onConfirm, onCancel }: RejectDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEscapeKey(onCancel);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do từ chối');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch {
      setError('Có lỗi xảy ra, thử lại.');
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div className="bg-card border border-border rounded-2xl shadow-modal w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Từ chối ticket</h3>
              <p className="text-xs text-muted-foreground">{ticketCode}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400 leading-relaxed">
              Ticket sẽ được chuyển sang trạng thái <strong>Từ chối</strong> và tự động đóng sau 3 ngày.
              Người gửi sẽ nhận được thông báo kèm lý do.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">
              Lý do từ chối <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(''); }}
              placeholder="Nhập lý do từ chối rõ ràng để thông báo cho người gửi..."
              rows={4}
              className="w-full p-3 bg-input border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-colors"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground bg-muted hover:bg-secondary rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle className="w-4 h-4" />
            {loading ? 'Đang xử lý...' : 'Xác nhận từ chối'}
          </button>
        </div>
      </div>
    </div>
  );
}

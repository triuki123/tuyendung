'use client';

import React from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { MyRequestItem, KIND_META, STATUS_META, fmtRangeVN, fmtAmount, canCancel } from './types';

interface Props {
  item: MyRequestItem;
  cancelling: boolean;
  onCancel: (item: MyRequestItem) => void;
  onClose: () => void;
}

/** Chi tiết 1 đơn — modal giữa màn hình (desktop) / bottom-sheet cảm giác mobile. */
export default function RequestDetailSheet({ item, cancelling, onCancel, onClose }: Props) {
  const kind = KIND_META[item.kind];
  const status = STATUS_META[item.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-600 ${kind.badge}`}>{kind.label}</span>
            <h2 className="text-base font-700 text-foreground">{item.sub_label}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <Row label="Thời gian">
            {fmtRangeVN(item.start_date, item.end_date)}
            {item.day_part && (
              <span className="ml-1 text-muted-foreground">({item.day_part === 'morning' ? 'buổi sáng' : 'buổi chiều'})</span>
            )}
          </Row>
          <Row label={item.kind === 'overtime' ? 'Số giờ' : 'Số ngày'}>{fmtAmount(item)}</Row>
          {item.reason && <Row label="Lý do">{item.reason}</Row>}
          <Row label="Trạng thái">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-600 ${status.cls}`}>{status.label}</span>
          </Row>
          {item.approver_name && <Row label="Người duyệt">{item.approver_name}</Row>}
          {item.decided_at && (
            <Row label="Ngày quyết định">
              {new Date(item.decided_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </Row>
          )}
          {item.status === 'rejected' && item.reject_reason && (
            <Row label="Lý do từ chối">
              <span className="text-red-400">{item.reject_reason}</span>
            </Row>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
          {canCancel(item) && (
            <button
              onClick={() => onCancel(item)}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-600 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Hủy đơn
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-600 text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{children}</p>
    </div>
  );
}

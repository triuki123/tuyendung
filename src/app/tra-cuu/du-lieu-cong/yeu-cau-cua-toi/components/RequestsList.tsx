'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { MyRequestItem, RequestKind, UnifiedStatus, KIND_META, STATUS_META, fmtRangeVN, fmtAmount, canCancel } from './types';

interface Props {
  items: MyRequestItem[];
  cancellingId: string | null;
  onSelectItem: (item: MyRequestItem) => void;
  onCancel: (item: MyRequestItem) => void;
}

const KIND_FILTERS: Array<{ key: RequestKind | 'all'; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'leave', label: 'Nghỉ phép' },
  { key: 'adjustment', label: 'Bù công' },
  { key: 'overtime', label: 'Tăng ca' },
];

const STATUS_FILTERS: Array<{ key: UnifiedStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Tất cả trạng thái' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'rejected', label: 'Từ chối' },
  { key: 'cancelled', label: 'Đã hủy' },
];

/** Danh sách đơn dạng bảng, có lọc nhanh theo loại + trạng thái. */
export default function RequestsList({ items, cancellingId, onSelectItem, onCancel }: Props) {
  const [kindFilter, setKindFilter] = useState<RequestKind | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UnifiedStatus | 'all'>('all');

  const filtered = useMemo(
    () => items.filter((it) =>
      (kindFilter === 'all' || it.kind === kindFilter) &&
      (statusFilter === 'all' || it.status === statusFilter)
    ),
    [items, kindFilter, statusFilter]
  );

  return (
    <div className="space-y-3">
      {/* Lọc nhanh */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-white/5 p-1" style={{ background: 'var(--card)' }}>
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setKindFilter(f.key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-500 transition-colors ${
                kindFilter === f.key ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl border border-white/5 p-1 overflow-x-auto" style={{ background: 'var(--card)' }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-500 transition-colors ${
                statusFilter === f.key ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bảng / danh sách */}
      <div className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: 'var(--card)' }}>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Không có đơn khớp bộ lọc</p>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((it) => {
              const kind = KIND_META[it.kind];
              const status = STATUS_META[it.status];
              return (
                <div
                  key={`${it.kind}-${it.id}`}
                  onClick={() => onSelectItem(it)}
                  className="flex cursor-pointer flex-col gap-2 p-3 transition-colors hover:bg-white/5 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-600 ${kind.badge}`}>
                      {it.sub_label}
                    </span>
                    <span className="shrink-0 text-xs text-foreground">{fmtRangeVN(it.start_date, it.end_date)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtAmount(it)}</span>
                    {it.reason && (
                      <span className="hidden min-w-0 truncate text-xs text-muted-foreground md:inline">{it.reason}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-600 ${status.cls}`}
                      title={it.status === 'rejected' && it.reject_reason ? `Lý do: ${it.reject_reason}` : undefined}
                    >
                      {status.label}
                    </span>
                    {(it.approver_name || it.decided_at) && (
                      <span className="text-xs text-muted-foreground">
                        {it.approver_name ?? ''}
                        {it.decided_at &&
                          ` · ${new Date(it.decided_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`}
                      </span>
                    )}
                    {canCancel(it) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCancel(it); }}
                        disabled={cancellingId === it.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-600 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {cancellingId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Hủy
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

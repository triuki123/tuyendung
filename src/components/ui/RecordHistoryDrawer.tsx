'use client';

import React, { useEffect, useState } from 'react';
import {
  X, History, Loader2, Plus, Pencil, Trash2, CheckCircle, RefreshCw,
  Paperclip, FileX, ThumbsUp, ThumbsDown, ArrowRight, Lock, Unlock, Eye,
} from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';

/** hr-audit: contract | evaluation | hr_document; legal: document | contract | authorization | seal_log | compliance_item */
type EntityType = string;

interface FieldChange { label: string; from: string | null; to: string | null }

interface AuditEntry {
  id: string;
  action: string;
  details: string | null;
  changes: Record<string, FieldChange> | null;
  performed_by_name: string | null;
  created_at: string;
}

/** Icon + màu theo MÃ hành động (không đoán theo chuỗi tiếng Việt — đổi chữ không vỡ). */
const ACTION_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  create:          { label: 'Tạo mới',            icon: <Plus size={14} className="text-emerald-400" />,   cls: 'bg-emerald-500/15 border-emerald-500/30' },
  update:          { label: 'Cập nhật',           icon: <Pencil size={14} className="text-indigo-400" />,  cls: 'bg-indigo-500/15 border-indigo-500/30' },
  delete:          { label: 'Xóa',                icon: <Trash2 size={14} className="text-red-400" />,     cls: 'bg-red-500/15 border-red-500/30' },
  conclude:        { label: 'Chốt kết quả',       icon: <CheckCircle size={14} className="text-emerald-400" />, cls: 'bg-emerald-500/15 border-emerald-500/30' },
  renew:           { label: 'Gia hạn',            icon: <RefreshCw size={14} className="text-sky-400" />,  cls: 'bg-sky-500/15 border-sky-500/30' },
  attach:          { label: 'Đính kèm tệp',       icon: <Paperclip size={14} className="text-amber-400" />, cls: 'bg-amber-500/15 border-amber-500/30' },
  detach:          { label: 'Gỡ tệp đính kèm',    icon: <FileX size={14} className="text-orange-400" />,   cls: 'bg-orange-500/15 border-orange-500/30' },
  replace_approve: { label: 'Duyệt thay thế',     icon: <ThumbsUp size={14} className="text-emerald-400" />, cls: 'bg-emerald-500/15 border-emerald-500/30' },
  replace_reject:  { label: 'Từ chối thay thế',   icon: <ThumbsDown size={14} className="text-red-400" />, cls: 'bg-red-500/15 border-red-500/30' },
  // Mã hành động của module Pháp Chế
  status_change:   { label: 'Đổi trạng thái',     icon: <RefreshCw size={14} className="text-indigo-400" />, cls: 'bg-indigo-500/15 border-indigo-500/30' },
  mark_done:       { label: 'Đánh dấu đã nộp',    icon: <CheckCircle size={14} className="text-emerald-400" />, cls: 'bg-emerald-500/15 border-emerald-500/30' },
  unmark_done:     { label: 'Bỏ đánh dấu',        icon: <FileX size={14} className="text-orange-400" />,    cls: 'bg-orange-500/15 border-orange-500/30' },
  lock:            { label: 'Đặt khóa BMHS',      icon: <Lock size={14} className="text-amber-400" />,      cls: 'bg-amber-500/15 border-amber-500/30' },
  unlock:          { label: 'Gỡ khóa BMHS',       icon: <Unlock size={14} className="text-sky-400" />,      cls: 'bg-sky-500/15 border-sky-500/30' },
  view_file:       { label: 'Xem / tải tệp',      icon: <Eye size={14} className="text-muted-foreground" />, cls: 'bg-slate-500/15 border-slate-500/30' },
};

const FALLBACK = { label: 'Thao tác', icon: <History size={14} className="text-blue-400" />, cls: 'bg-blue-500/15 border-blue-500/30' };

interface Props {
  entityType: EntityType;
  entityId: string;
  /** Tên bản ghi hiện ở tiêu đề drawer (vd số hợp đồng, tên nhân viên). */
  title?: string;
  /** API gốc — mặc định hr-audit (Quản Lý Hồ Sơ); module Pháp Chế truyền '/api/legal/audit'. */
  apiBase?: string;
  onClose: () => void;
}

/**
 * Lịch sử xử lý tác vụ của 1 bản ghi — đọc từ GET {apiBase}/{type}/{id}.
 * Dùng chung cho Quản Lý Hồ Sơ (mặc định) và Pháp Chế (apiBase='/api/legal/audit').
 */
export default function RecordHistoryDrawer({ entityType, entityId, title, apiBase = '/api/hr-audit', onClose }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(onClose);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/${entityType}/${entityId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.success) throw new Error(j.error || 'Không tải được lịch sử');
        setEntries(Array.isArray(j.data) ? j.data : []);
      })
      .catch((e) => { if (alive) setError(e.message || 'Lỗi tải lịch sử'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [entityType, entityId, apiBase]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className="w-full sm:max-w-md h-full flex flex-col border-l border-white/08"
        style={{ background: 'var(--card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 px-4 sm:px-6 py-4 border-b border-white/08 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-700 text-foreground flex items-center gap-2">
              <History size={16} className="text-indigo-400" /> Lịch Sử Xử Lý
            </h2>
            {title && <p className="text-xs text-muted-foreground truncate mt-0.5">{title}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost rounded-lg p-2.5 -m-1 shrink-0" title="Đóng">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <History size={32} className="opacity-30" />
              <p className="text-sm">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <History size={32} className="opacity-30" />
              <p className="text-sm">Chưa có lịch sử nào</p>
              <p className="text-xs opacity-60 text-center">Các thao tác từ nay sẽ được ghi lại tại đây.</p>
            </div>
          ) : (
            <>
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-4">
                {entries.length} sự kiện
              </p>

              <div className="relative">
                {/* Đường timeline dọc */}
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/08" />

                <div className="space-y-4">
                  {entries.map((e) => {
                    const meta = ACTION_META[e.action] ?? FALLBACK;
                    const changes = e.changes ? Object.values(e.changes) : [];
                    return (
                      <div key={e.id} className="flex gap-4 relative">
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 z-10 ${meta.cls}`}
                          style={{ background: 'var(--card)' }}
                        >
                          {meta.icon}
                        </div>

                        <div className="flex-1 min-w-0 pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-600 text-foreground">{meta.label}</span>
                            <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                              {new Date(e.created_at).toLocaleString('vi-VN')}
                            </span>
                          </div>

                          {e.details && (
                            <p className="text-xs text-muted-foreground mt-1 break-words">{e.details}</p>
                          )}

                          {/* Diff "cũ → mới" */}
                          {changes.length > 0 && (
                            <div className="mt-2 space-y-1 rounded-lg border border-white/5 p-2" style={{ background: 'var(--background)' }}>
                              {changes.map((c, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-2xs flex-wrap">
                                  <span className="text-muted-foreground/70">{c.label}:</span>
                                  <span className="text-muted-foreground line-through">{c.from ?? '—'}</span>
                                  <ArrowRight size={10} className="text-muted-foreground/50 shrink-0" />
                                  <span className="text-foreground font-600">{c.to ?? '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <p className="text-2xs text-muted-foreground/60 mt-1.5">
                            Thực hiện bởi: <span className="text-muted-foreground">{e.performed_by_name || 'Hệ thống'}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-white/08 shrink-0">
          <button onClick={onClose} className="w-full h-10 rounded-xl btn-ghost text-sm font-600">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

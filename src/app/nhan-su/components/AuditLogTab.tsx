'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  History, Loader2, Search, FileText, ClipboardCheck, FolderOpen,
  Plus, Pencil, Trash2, CheckCircle, RefreshCw, Paperclip, FileX,
  ThumbsUp, ThumbsDown, ArrowRight, ChevronLeft, ChevronRight,
} from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface FieldChange { label: string; from: string | null; to: string | null }

interface FeedEntry {
  id: string;
  entity_type: 'contract' | 'evaluation' | 'hr_document';
  entity_id: string;
  entity_label: string | null;
  action: string;
  details: string | null;
  changes: Record<string, FieldChange> | null;
  performed_by_name: string | null;
  created_at: string;
}

const ENTITY_META: Record<string, { label: string; icon: typeof FileText; cls: string }> = {
  contract:    { label: 'Hợp đồng', icon: FileText,       cls: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30' },
  evaluation:  { label: 'Đánh giá', icon: ClipboardCheck, cls: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  hr_document: { label: 'Hồ sơ',    icon: FolderOpen,     cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
};

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  create:          { label: 'Tạo mới',          icon: <Plus size={14} className="text-emerald-400" />,        cls: 'bg-emerald-500/15 border-emerald-500/30' },
  update:          { label: 'Cập nhật',         icon: <Pencil size={14} className="text-indigo-400" />,       cls: 'bg-indigo-500/15 border-indigo-500/30' },
  delete:          { label: 'Xóa',              icon: <Trash2 size={14} className="text-red-400" />,          cls: 'bg-red-500/15 border-red-500/30' },
  conclude:        { label: 'Chốt kết quả',     icon: <CheckCircle size={14} className="text-emerald-400" />, cls: 'bg-emerald-500/15 border-emerald-500/30' },
  renew:           { label: 'Gia hạn',          icon: <RefreshCw size={14} className="text-sky-400" />,       cls: 'bg-sky-500/15 border-sky-500/30' },
  attach:          { label: 'Đính kèm tệp',     icon: <Paperclip size={14} className="text-amber-400" />,     cls: 'bg-amber-500/15 border-amber-500/30' },
  detach:          { label: 'Gỡ tệp đính kèm',  icon: <FileX size={14} className="text-orange-400" />,        cls: 'bg-orange-500/15 border-orange-500/30' },
  replace_approve: { label: 'Duyệt thay thế',   icon: <ThumbsUp size={14} className="text-emerald-400" />,    cls: 'bg-emerald-500/15 border-emerald-500/30' },
  replace_reject:  { label: 'Từ chối thay thế', icon: <ThumbsDown size={14} className="text-red-400" />,      cls: 'bg-red-500/15 border-red-500/30' },
};
const FALLBACK = { label: 'Thao tác', icon: <History size={14} className="text-blue-400" />, cls: 'bg-blue-500/15 border-blue-500/30' };

const PAGE_SIZE = 30;
const SELECT_CLS = 'h-9 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/50';

/** Lịch sử xử lý tác vụ TOÀN MODULE Quản Lý Hồ Sơ — gom cả Hợp đồng, Đánh giá, Hồ sơ. */
export default function AuditLogTab() {
  const [items, setItems] = useState<FeedEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);

  // Gõ tìm kiếm → chờ 350ms mới gọi API (tránh gọi mỗi ký tự).
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({
        entityType, action,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (debounced.trim()) qs.set('search', debounced.trim());

      const r = await fetch(`/api/hr-audit?${qs.toString()}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Lỗi tải lịch sử');
      setItems(Array.isArray(j.items) ? j.items : []);
      setTotal(Number(j.total) || 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [entityType, action, debounced, page]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Bộ lọc */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 border border-line px-3 flex-1 min-w-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo hợp đồng, nhân viên, người thực hiện…"
            className="w-full bg-transparent py-2 text-sm text-foreground outline-none"
          />
        </div>
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(0); }} className={SELECT_CLS}>
          <option value="all">Tất cả nhóm</option>
          <option value="contract">Hợp đồng</option>
          <option value="evaluation">Đánh giá</option>
          <option value="hr_document">Hồ sơ</option>
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} className={SELECT_CLS}>
          <option value="all">Tất cả thao tác</option>
          {Object.entries(ACTION_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState message="Không tải được lịch sử xử lý." onRetry={load} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <History className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Chưa có lịch sử nào khớp bộ lọc</p>
          <p className="text-xs mt-1 opacity-60">Mọi thao tác trên Hợp đồng, Đánh giá, Hồ sơ sẽ hiện tại đây.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{total} sự kiện</p>

          <div className="space-y-2.5">
            {items.map((e) => {
              const am = ACTION_META[e.action] ?? FALLBACK;
              const em = ENTITY_META[e.entity_type];
              const EIcon = em?.icon ?? History;
              const changes = e.changes ? Object.values(e.changes) : [];

              return (
                <div key={e.id} className="flex gap-3 rounded-2xl border border-white/5 p-4" style={{ background: 'var(--card)' }}>
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${am.cls}`}
                    style={{ background: 'var(--background)' }}>
                    {am.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {em && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-600 ${em.cls}`}>
                            <EIcon className="h-3 w-3" /> {em.label}
                          </span>
                        )}
                        <span className="text-sm font-600 text-foreground">{am.label}</span>
                      </div>
                      <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
                        {new Date(e.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    {e.entity_label && (
                      <p className="text-xs text-foreground/80 mt-1 truncate">{e.entity_label}</p>
                    )}
                    {e.details && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{e.details}</p>
                    )}

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

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Trước
              </button>
              <span className="text-xs text-muted-foreground">Trang {page + 1}/{totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Sau <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, Search, Loader2, Package, AlertTriangle } from 'lucide-react';
import {
  createObProcess, searchObEligibleUsers, ObEligibleUser, ObProcess, OB_REASON_LABELS,
} from '@/lib/api/offboardingApi';
import UserAvatar from '@/components/UserAvatar';
import DateInputVN from '@/components/ui/DateInputVN';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';

interface CreateProcessModalProps {
  onClose: () => void;
  onCreated: (p: ObProcess) => void;
}

/** Modal tạo quy trình nghỉ việc: chọn nhân sự → lý do → ngày làm việc cuối → ticket nguồn. */
export default function CreateProcessModal({ onClose, onCreated }: CreateProcessModalProps) {
  const { markDirty, markClean, guardedClose } = useUnsavedGuard(onClose);
  useEscapeKey(guardedClose);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ObEligibleUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ObEligibleUser | null>(null);
  const [reason, setReason] = useState('resignation');
  const [reasonNote, setReasonNote] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [sourceTicketId, setSourceTicketId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce tìm nhân sự
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchObEligibleUsers(query)); }
      catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const submit = async () => {
    if (!selected) { setError('Vui lòng chọn nhân sự'); return; }
    setSubmitting(true); setError('');
    try {
      const p = await createObProcess({
        user_id: selected.id,
        reason,
        reason_note: reasonNote.trim() || undefined,
        last_working_date: lastWorkingDate || undefined,
        source_ticket_id: sourceTicketId.trim() || undefined,
      });
      markClean();
      onCreated(p);
    } catch (e: any) { setError(e.message || 'Lỗi server'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={guardedClose}>
      <div className="w-full max-w-lg rounded-3xl border border-line overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: 'var(--card)' }} onChange={markDirty} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Tạo Quy Trình Nghỉ Việc</h2>
          <button onClick={guardedClose} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Chọn nhân sự */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Nhân sự nghỉ việc *</label>
            {selected ? (
              <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                <UserAvatar name={selected.name} avatarUrl={selected.avatar} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-600 text-foreground truncate">{selected.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[selected.job_title_name, selected.department_name, selected.company_name].filter(Boolean).join(' · ') || selected.email}
                  </p>
                  <p className="text-2xs text-amber-400 mt-0.5 inline-flex items-center gap-1">
                    <Package className="h-3 w-3" /> {selected.asset_count} tài sản đang cấp phát — sẽ tự thêm vào checklist thu hồi
                  </p>
                </div>
                <button onClick={() => { setSelected(null); setQuery(''); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="mt-1.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
                    placeholder="Gõ tên hoặc email nhân sự (tối thiểu 2 ký tự)..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {results.length > 0 && (
                  <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-line divide-y divide-line-subtle" style={{ background: 'var(--surface-2)' }}>
                    {results.map((u) => (
                      <button key={u.id} disabled={u.has_active_process}
                        onClick={() => { setSelected(u); setResults([]); }}
                        className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed">
                        <UserAvatar name={u.name} avatarUrl={u.avatar} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">{u.name}</p>
                          <p className="text-2xs text-muted-foreground truncate">
                            {[u.department_name, u.company_name].filter(Boolean).join(' · ') || u.email}
                          </p>
                        </div>
                        {u.has_active_process
                          ? <span className="text-2xs text-amber-400 shrink-0">Đã có quy trình</span>
                          : u.asset_count > 0 && (
                            <span className="text-2xs text-muted-foreground shrink-0 inline-flex items-center gap-1">
                              <Package className="h-3 w-3" /> {u.asset_count}
                            </span>
                          )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lý do */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Lý do nghỉ *</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}
                className="mt-1.5 w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60">
                {Object.entries(OB_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Ngày làm việc cuối</label>
              <DateInputVN value={lastWorkingDate} onChange={(e) => setLastWorkingDate(e.target.value)}
                className="mt-1.5 w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Mã ticket nguồn (nếu có)</label>
            <input value={sourceTicketId} onChange={(e) => setSourceTicketId(e.target.value)}
              placeholder="VD: TK-2026-0123 — ticket nhân sự gửi xin nghỉ việc"
              className="mt-1.5 w-full h-10 rounded-xl px-3 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider">Ghi chú</label>
            <textarea value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} rows={2}
              placeholder="Ghi chú thêm về trường hợp nghỉ việc này..."
              className="mt-1.5 w-full rounded-xl px-3 py-2 text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 resize-none" />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-line-subtle px-6 py-4">
          <button onClick={guardedClose} className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-hover">Hủy</button>
          <button onClick={submit} disabled={submitting || !selected}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-600 text-white disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Tạo Quy Trình
          </button>
        </div>
      </div>
    </div>
  );
}

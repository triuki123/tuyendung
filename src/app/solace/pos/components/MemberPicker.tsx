'use client';

import React, { useEffect, useState } from 'react';
import { X, Search, Loader2, User } from 'lucide-react';
import { api } from '../../quan-ly/lib/solaceApi';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { POS_MODAL_Z } from './modalLayers';

export interface Member { id: string; name: string; email: string; }

/** Tìm & chọn 1 thành viên FADO (cho thanh toán ví / gắn đơn). */
export default function MemberPicker({ title = 'Chọn thành viên', onPick, onClose }: {
  title?: string; onPick: (m: Member) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  useEscapeKey(onClose);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ data: Member[] }>(`/api/solace/members?q=${encodeURIComponent(q.trim())}`);
        if (!cancel) setResults(r.data);
      } catch { if (!cancel) setResults([]); }
      finally { if (!cancel) setLoading(false); }
    }, 300);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className={`fixed inset-0 ${POS_MODAL_Z.child} flex items-center justify-center p-4`} style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden max-h-[80vh] flex flex-col" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 shrink-0">
          <h2 className="text-base font-700 text-foreground">{title}</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên hoặc email…"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-foreground border border-white/10" style={{ background: '#162033' }} />
          </div>
        </div>
        <div className="px-4 pb-4 overflow-y-auto space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : q.trim().length < 2 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nhập ít nhất 2 ký tự để tìm</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Không tìm thấy thành viên</p>
          ) : results.map(m => (
            <button key={m.id} onClick={() => onPick(m)}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5 border border-white/5">
              <div className="h-8 w-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0"><User className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{m.name}</p>
                <p className="text-2xs text-muted-foreground truncate">{m.email}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

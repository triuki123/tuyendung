'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScrollText, ArrowRight, Loader2, Paperclip, FileText } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

interface DocItem {
  id: string;
  title: string;
  doc_number: string | null;
  doc_type: string;
  issued_by: string | null;
  issued_date: string | null;
  created_at: string;
  attachment_count: number;
}

const DOC_TYPES: Record<string, string> = {
  document: 'Văn bản',
  decision: 'Quyết định',
  circular: 'Thông tư',
  notice: 'Thông báo',
  other: 'Khác',
};
const DOC_TYPE_COLORS: Record<string, string> = {
  document: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  decision: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  circular: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  notice: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  other: 'bg-slate-500/15 text-ink-bright border-slate-500/30',
};

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Thẻ Dashboard: văn bản / quyết định mới nhất (đọc public từ /api/documents). */
export default function RecentDocumentsCard() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setDocs(json.data.slice(0, 5));
      else throw new Error('Phản hồi không hợp lệ');
    } catch (e) {
      console.error('Error loading documents:', e);
      setError(true);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="rounded-2xl border border-line-subtle overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-line-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-sky-500/15 shrink-0">
            <ScrollText size={16} className="text-sky-400" />
          </div>
          <div>
            <h3 className="text-base font-600 text-foreground leading-tight">Văn Bản - Quyết Định</h3>
            <p className="text-2xs text-muted-foreground">Văn bản ban hành gần đây</p>
          </div>
        </div>
        <Link href="/tra-cuu/van-ban" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0">
          Xem tất cả <ArrowRight size={13} />
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <ScrollText className="h-9 w-9 mb-2.5 opacity-30" />
          <p className="text-sm">Chưa có văn bản nào</p>
          <p className="text-2xs mt-1 opacity-60">Văn bản, quyết định ban hành sẽ hiển thị tại đây</p>
        </div>
      ) : (
        <div className="divide-y divide-line-subtle">
          {docs.map(d => (
            <Link
              key={d.id}
              href="/tra-cuu/van-ban"
              className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-hover shrink-0 mt-0.5">
                <FileText size={15} className="text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-2xs font-600 rounded-full border px-1.5 py-0.5 shrink-0 ${DOC_TYPE_COLORS[d.doc_type] ?? DOC_TYPE_COLORS.other}`}>
                    {DOC_TYPES[d.doc_type] ?? 'Khác'}
                  </span>
                  {d.doc_number && <span className="text-2xs font-mono text-muted-foreground truncate">{d.doc_number}</span>}
                </div>
                <p className="text-sm font-500 text-foreground truncate">{d.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-2xs text-muted-foreground">
                  <span>{fmtDate(d.issued_date ?? d.created_at)}</span>
                  {d.issued_by && <><span className="opacity-40">·</span><span className="truncate">{d.issued_by}</span></>}
                  {d.attachment_count > 0 && (
                    <><span className="opacity-40">·</span><span className="inline-flex items-center gap-0.5"><Paperclip size={10} />{d.attachment_count}</span></>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

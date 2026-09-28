'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, Package, Ticket, User, ClipboardList, FileText } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';

type SearchType = 'asset' | 'ticket' | 'user' | 'task' | 'document';

interface SearchResult {
  type: SearchType;
  id: string;
  label: string;
  sublabel?: string | null;
  url: string;
}

const GROUP_META: Record<SearchType, { label: string; icon: React.ReactNode }> = {
  asset: { label: 'Tài sản', icon: <Package size={14} /> },
  ticket: { label: 'Ticket', icon: <Ticket size={14} /> },
  user: { label: 'Người dùng', icon: <User size={14} /> },
  task: { label: 'Công việc', icon: <ClipboardList size={14} /> },
  document: { label: 'Văn bản', icon: <FileText size={14} /> },
};

const GROUP_ORDER: SearchType[] = ['asset', 'ticket', 'user', 'task', 'document'];

interface GlobalSearchProps {
  variant: 'desktop' | 'mobile';
  /** Gọi khi đã điều hướng tới 1 kết quả (để đóng overlay mobile chẳng hạn). */
  onNavigate?: () => void;
  autoFocus?: boolean;
}

/**
 * Tìm kiếm toàn cục — dùng chung cho ô search desktop (dropdown) và overlay mobile.
 * Debounce 250ms, gọi /api/search, nhóm kết quả theo loại, click để điều hướng.
 */
export default function GlobalSearch({ variant, onNavigate, autoFocus }: GlobalSearchProps) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const user = getCurrentUser();
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        headers: {
          'x-current-user-id': user?.id || '',
          'x-current-user-role': (user as any)?.role || 'user',
        },
      });
      const json = await res.json();
      if (myReq !== reqIdRef.current) return; // bỏ kết quả cũ (race)
      setResults(Array.isArray(json.data) ? json.data : []);
    } catch {
      if (myReq === reqIdRef.current) setResults([]);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, runSearch]);

  // Click-outside để đóng dropdown desktop
  useEffect(() => {
    if (variant !== 'desktop') return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [variant]);

  const go = (url: string) => {
    setOpen(false);
    setQ('');
    setResults([]);
    onNavigate?.();
    router.push(url);
  };

  const grouped = GROUP_ORDER.map(type => ({
    type,
    items: results.filter(r => r.type === type),
  })).filter(g => g.items.length > 0);

  const showPanel = q.trim().length >= 2 && (variant === 'mobile' || open);

  const ResultsBody = (
    <>
      {loading && results.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Không tìm thấy kết quả cho “{q.trim()}”
        </div>
      ) : (
        <div className="py-1">
          {grouped.map(group => (
            <div key={group.type} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-2xs font-600 uppercase tracking-wider text-muted-foreground">
                {GROUP_META[group.type].icon}
                {GROUP_META[group.type].label}
              </div>
              {group.items.map(item => (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => go(item.url)}
                  className="w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-white/05 transition-colors rounded-lg"
                >
                  <span className="text-sm text-foreground truncate w-full">{item.label}</span>
                  {item.sublabel && (
                    <span className="text-2xs text-muted-foreground truncate w-full">{item.sublabel}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (variant === 'mobile') {
    return (
      <div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus={autoFocus}
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Tìm tài sản, ticket, người dùng, công việc, văn bản..."
            className="w-full h-11 pl-9 pr-4 rounded-xl text-sm bg-surface-2 border border-line text-foreground placeholder:text-ink-faint focus:outline-none focus:border-indigo/50"
          />
        </div>
        {showPanel && (
          <div className="mt-2 max-h-[60vh] overflow-y-auto">{ResultsBody}</div>
        )}
      </div>
    );
  }

  // desktop
  return (
    <div className="relative" ref={wrapRef}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Tìm kiếm tài sản, ticket, người dùng, công việc..."
        className="w-full h-9 pl-9 pr-10 rounded-xl text-sm bg-surface-2 border border-white/08 text-foreground placeholder:text-ink-faint focus:outline-none focus:border-indigo/50 focus:bg-[#1a2740] transition-all"
      />
      {loading && (
        <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      )}
      {showPanel && (
        <div
          className="absolute left-0 right-0 top-11 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/08 z-50 modal-entrance"
          style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
        >
          {ResultsBody}
        </div>
      )}
    </div>
  );
}

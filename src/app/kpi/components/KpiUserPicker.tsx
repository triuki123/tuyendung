'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface KpiUserOption {
  id: string;
  name: string;
  email: string;
}

interface Props {
  value: KpiUserOption | null;
  onChange: (u: KpiUserOption | null) => void;
  companyId?: string | null;
  placeholder?: string;
  className?: string;
}

/** Dropdown tìm nhân sự THUỘC ĐÚNG công ty đang thao tác (giao KPI/gán quản lý/cấp cao). */
export default function KpiUserPicker({ value, onChange, companyId, placeholder = 'Chọn nhân sự…', className }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<KpiUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ q });
        if (companyId) qs.set('company_id', companyId);
        const r = await fetch(`/api/kpi/company-users?${qs.toString()}`);
        const j = await r.json();
        setOptions(j.data || []);
      } finally {
        setLoading(false);
      }
    }, q === '' ? 0 : 200);
  }, [q, open, companyId]);

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#162033] px-3 py-2 text-xs text-left"
      >
        <span className={value ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
          {value ? value.name : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onChange(null); }} />
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-xl border border-white/10 overflow-hidden shadow-xl" style={{ background: 'var(--card)' }}>
          <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên/email…"
              className="flex-1 bg-transparent text-xs text-foreground outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Đang tải…</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Không có nhân sự nào khớp trong công ty này.</p>
            ) : (
              options.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u); setOpen(false); setQ(''); }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-white/5"
                >
                  <span className="text-foreground">{u.name}</span>
                  {u.email && <span className="block text-2xs text-muted-foreground">{u.email}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

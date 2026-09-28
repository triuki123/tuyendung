'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { searchUsers, UserOption } from './hrApi';

interface Props {
  value: UserOption | null;
  onChange: (u: UserOption | null) => void;
  placeholder?: string;
}

/** Dropdown tìm kiếm nhân viên (giống pattern UserDropdown ở Đầu Mối). */
export default function EmployeePicker({ value, onChange, placeholder = 'Chọn nhân viên…' }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<UserOption[]>([]);
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
        setOptions(await searchUsers(q));
      } finally {
        setLoading(false);
      }
    }, q === '' ? 0 : 200);
  }, [q, open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm text-left text-foreground"
        style={{ background: 'var(--input)' }}
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value ? value.name : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-xl border border-line overflow-hidden shadow-xl"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên/email…"
              className="flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Đang tải…</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Không có kết quả</p>
            ) : (
              options.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    onChange(u);
                    setOpen(false);
                    setQ('');
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-hover"
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

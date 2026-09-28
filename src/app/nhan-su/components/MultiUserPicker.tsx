'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X, UserPlus } from 'lucide-react';
import { searchUsers, UserOption } from './hrApi';

interface Props {
  value: UserOption[];
  onChange: (users: UserOption[]) => void;
  placeholder?: string;
  excludeIds?: string[];
}

/** Multi-select user picker — thêm nhiều người vào danh sách theo dõi. */
export default function MultiUserPicker({ value, onChange, placeholder = 'Thêm người theo dõi…', excludeIds = [] }: Props) {
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
      try { setOptions(await searchUsers(q)); }
      finally { setLoading(false); }
    }, q === '' ? 0 : 200);
  }, [q, open]);

  const alreadyIds = new Set([...value.map((u) => u.id), ...excludeIds]);

  function add(u: UserOption) {
    if (alreadyIds.has(u.id)) return;
    onChange([...value, u]);
    setQ('');
    setOpen(false);
  }

  function remove(id: string) {
    onChange(value.filter((u) => u.id !== id));
  }

  return (
    <div ref={ref} className="space-y-2">
      {/* Tags đã chọn */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((u) => (
            <span key={u.id}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 text-xs text-indigo-300">
              {u.name}
              <button type="button" onClick={() => remove(u.id)} className="hover:text-white ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-left text-muted-foreground hover:border-line-strong"
          style={{ background: 'var(--input)' }}
        >
          <UserPlus className="h-4 w-4 shrink-0" />
          <span>{placeholder}</span>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-line overflow-hidden shadow-xl"
            style={{ background: 'var(--card)' }}>
            <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên hoặc email…"
                className="flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Đang tìm…</p>
              ) : options.filter((u) => !alreadyIds.has(u.id)).length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  {q ? 'Không tìm thấy' : 'Nhập tên để tìm kiếm'}
                </p>
              ) : (
                options.filter((u) => !alreadyIds.has(u.id)).map((u) => (
                  <button key={u.id} type="button" onClick={() => add(u)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-hover flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-indigo-500/20 text-indigo-400 text-2xs flex items-center justify-center font-600 shrink-0">
                      {(u.name || '?')[0].toUpperCase()}
                    </span>
                    <span>
                      <span className="text-foreground">{u.name}</span>
                      {u.email && <span className="block text-2xs text-muted-foreground">{u.email}</span>}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

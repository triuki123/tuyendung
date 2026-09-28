'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { NAV_ITEMS, NAV_GROUPS } from './Sidebar';
import { shouldShowNavigationModule } from '@/lib/rolePolicy';
import { normalizeVi } from '@/lib/ui/uiMode';
import type { UserModulePermissions } from '@/lib/modules';

interface Props {
  role: string | undefined;
  perms: UserModulePermissions | undefined;
}

/** Command Palette ⌘K / Ctrl+K — gõ nhảy nhanh tới mọi trang. Có ở MỌI kiểu giao diện. */
export default function CommandPalette({ role, perms }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const groupOf = (id: string) => NAV_GROUPS.find((g) => g.ids.includes(id))?.label || '';

  const items = useMemo(() => {
    if (!role) return [];
    return NAV_ITEMS
      .filter((i) => shouldShowNavigationModule(role, i.id, perms))
      .map((i) => ({ id: i.id, label: i.label, href: i.href, group: groupOf(i.id) }));
  }, [role, perms]);

  const results = useMemo(() => {
    const nq = normalizeVi(q.trim());
    if (!nq) return items;
    return items.filter((i) => normalizeVi(i.label).includes(nq) || normalizeVi(i.group).includes(nq));
  }, [items, q]);

  // Phím tắt mở/đóng
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);

  const go = (href: string) => { setOpen(false); router.push(href); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].href); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 overflow-hidden modal-entrance"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-white/5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Gõ để nhảy nhanh tới trang… (vd: chấm công, nghỉ phép, QR)"
            className="w-full bg-transparent py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <kbd className="text-[10px] text-muted-foreground border border-white/10 rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Không tìm thấy trang phù hợp</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.href)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-indigo-600/15' : ''}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm ${i === active ? 'text-indigo-300 font-600' : 'text-foreground'}`}>{r.label}</span>
                  {r.group && <span className="text-[11px] text-muted-foreground truncate">· {r.group}</span>}
                </span>
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

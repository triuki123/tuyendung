'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { NAV_ITEMS, NAV_GROUPS } from '@/components/Sidebar';
import { getCurrentUser } from '@/lib/authStore';
import { shouldShowModule } from '@/lib/permissions';

const BADGE_KEY: Record<string, keyof Counts> = {
  'nav-duyet-yeu-cau': 'duyetYeuCau',
  'nav-tickets': 'tickets',
  'nav-tasks': 'tasks',
  'nav-room-bookings': 'roomBookings',
  'nav-hr-resources': 'hrPending',
  'nav-users': 'users',
  'nav-recruitment-order': 'recruitment',
  'nav-my-hr': 'myContracts',
  'nav-hr': 'hrDocReplace',
};
type Counts = {
  duyetYeuCau: number; tickets: number; tasks: number; roomBookings: number;
  hrPending: number; users: number; recruitment: number; myContracts: number; hrDocReplace: number;
};

/** Màu ô app theo module (text icon + nền tint). Mặc định indigo. */
const MODULE_COLOR: Record<string, { text: string; bg: string }> = {
  'nav-dashboard':         { text: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
  'nav-tra-cuu':           { text: 'text-blue-400',    bg: 'bg-blue-500/15' },
  'nav-history':           { text: 'text-slate-300',   bg: 'bg-slate-500/15' },
  'nav-tickets':           { text: 'text-red-400',     bg: 'bg-red-500/15' },
  'nav-tasks':             { text: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
  'nav-room-bookings':     { text: 'text-teal-400',    bg: 'bg-teal-500/15' },
  'nav-duyet-yeu-cau':     { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  'nav-recruitment-order': { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  'nav-cham-cong':         { text: 'text-violet-400',  bg: 'bg-violet-500/15' },
  'nav-my-hr':             { text: 'text-rose-400',    bg: 'bg-rose-500/15' },
  'nav-email-signature':   { text: 'text-blue-400',    bg: 'bg-blue-500/15' },
  'nav-hr':                { text: 'text-amber-400',   bg: 'bg-amber-500/15' },
  'nav-hr-resources':      { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  'nav-assets':            { text: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  'nav-organization':      { text: 'text-cyan-400',    bg: 'bg-cyan-500/15' },
  'nav-forms':             { text: 'text-sky-400',     bg: 'bg-sky-500/15' },
  'nav-users':             { text: 'text-rose-400',    bg: 'bg-rose-500/15' },
  'nav-system-config':     { text: 'text-slate-300',   bg: 'bg-slate-500/15' },
  'nav-settings':          { text: 'text-slate-300',   bg: 'bg-slate-500/15' },
};
const DEFAULT_COLOR = { text: 'text-indigo-400', bg: 'bg-indigo-500/15' };

/** Bỏ dấu để tìm kiếm không phân biệt dấu. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function MenuPage() {
  const [user, setUser] = useState<{ role: string; module_permissions?: unknown } | null>(null);
  const [counts, setCounts] = useState<Partial<Counts>>({});
  const [q, setQ] = useState('');

  useEffect(() => {
    const u = getCurrentUser();
    if (u) setUser({ role: u.role, module_permissions: (u as { module_permissions?: unknown }).module_permissions });
    fetch('/api/sidebar-counts').then(r => (r.ok ? r.json() : null)).then(j => { if (j?.counts) setCounts(j.counts); }).catch(() => {});
  }, []);

  const visibleIds = useMemo(() => {
    if (!user) return new Set<string>();
    const perms = user.module_permissions as Parameters<typeof shouldShowModule>[2];
    return new Set(NAV_ITEMS.filter(i => shouldShowModule(user.role, i.id, perms)).map(i => i.id));
  }, [user]);

  const groups = useMemo(() => {
    const nq = norm(q.trim());
    return NAV_GROUPS.map(g => ({
      label: g.label,
      items: g.ids
        .map(id => NAV_ITEMS.find(i => i.id === id))
        .filter((i): i is (typeof NAV_ITEMS)[number] => !!i && visibleIds.has(i.id))
        .filter(i => !nq || norm(i.label).includes(nq)),
    })).filter(g => g.items.length > 0);
  }, [visibleIds, q]);

  return (
    <AppLayout activePath="/menu">
      <div className="space-y-4 max-w-2xl mx-auto w-full">
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Menu</h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Tìm chức năng…"
            className="w-full h-11 pl-9 pr-4 rounded-xl text-sm bg-surface-2 border border-white/8 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground">
            <Search className="h-9 w-9 mb-2 opacity-30" />
            <p className="text-sm">{user ? 'Không tìm thấy chức năng' : 'Đang tải…'}</p>
          </div>
        ) : (
          groups.map(g => (
            <div key={g.label}>
              <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground/60 px-1 pb-2.5">{g.label}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2 gap-y-4">
                {g.items.map((item) => {
                  const badge = BADGE_KEY[item.id] ? counts[BADGE_KEY[item.id]] ?? 0 : 0;
                  const color = MODULE_COLOR[item.id] ?? DEFAULT_COLOR;
                  return (
                    <Link key={item.id} href={item.href} className="flex flex-col items-center gap-2 group">
                      <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center ${color.bg} ${color.text} group-active:scale-95 transition-transform`}>
                        {item.icon}
                        {badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-[9px] font-700 text-white border-2" style={{ borderColor: 'var(--background)' }}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] leading-tight text-center text-foreground/90 line-clamp-2">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}

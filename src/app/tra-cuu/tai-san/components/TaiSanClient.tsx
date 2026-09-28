'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Package, Search, Users, ArrowLeft, Globe, Mail, AppWindow, HardDrive, Building2, Network, Loader2 } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';

type AssetType = 'hardware' | 'domain' | 'email' | 'software';
type LookupScope = 'none' | 'subordinates' | 'company' | 'system';

interface Asset {
  id: string;
  type: AssetType;
  code: string | null;
  name: string;
  category_name: string | null;
  status: string | null;
  value: number | null;
  assigned_user_name: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:         { label: 'Đang dùng',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  inactive:       { label: 'Không dùng', cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
  maintenance:    { label: 'Bảo trì',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  disposed:       { label: 'Thanh lý',   cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  decommissioned: { label: 'Ngừng dùng', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  expiring:       { label: 'Sắp hết hạn', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  expired:        { label: 'Hết hạn',    cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  locked:         { label: 'Tạm khoá',   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  archived:       { label: 'Lưu trữ',    cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' },
};

const TYPE_CONFIG: Record<AssetType, { label: string; icon: typeof Package; cls: string }> = {
  hardware: { label: 'Phần cứng',  icon: HardDrive, cls: 'bg-emerald-500/10 text-emerald-400' },
  domain:   { label: 'Tên miền',   icon: Globe,     cls: 'bg-blue-500/10 text-blue-400' },
  email:    { label: 'Email',      icon: Mail,      cls: 'bg-amber-500/10 text-amber-400' },
  software: { label: 'Phần mềm',   icon: AppWindow, cls: 'bg-violet-500/10 text-violet-400' },
};

const SCOPE_TAB: Record<Exclude<LookupScope, 'none'>, { label: string; icon: typeof Users }> = {
  subordinates: { label: 'Cấp dưới',      icon: Users },
  company:      { label: 'Toàn công ty',  icon: Building2 },
  system:       { label: 'Toàn hệ thống', icon: Network },
};

function formatCurrency(v: number | null) {
  if (v == null) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);
}

export default function TaiSanClient() {
  const [mine, setMine] = useState<Asset[]>([]);
  const [others, setOthers] = useState<Asset[]>([]);
  const [scope, setScope] = useState<LookupScope>('none');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<'mine' | 'others'>('mine');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AssetType>('all');
  const [userRole, setUserRole] = useState('');

  const hasOthers = scope !== 'none';

  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try { const u = JSON.parse(stored); setUserRole(u.role ?? ''); } catch { /* empty */ }
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
      const uid = stored ? JSON.parse(stored).id ?? '' : '';
      const res = await fetch('/api/asset-lookup', {
        headers: { 'x-current-user-id': uid, 'x-current-user-role': userRole },
      });
      const json = await res.json();
      if (json.success) {
        setMine(json.data.mine ?? []);
        setOthers(json.data.others ?? []);
        setScope(json.data.scope ?? 'none');
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally { setLoading(false); }
  }, [userRole]);

  useEffect(() => { load(); }, [load]);

  const currentList = (tab === 'mine' ? mine : others).filter(
    (a) => typeFilter === 'all' || a.type === typeFilter,
  );
  const filtered = currentList.filter((a) =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.category_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fadeIn">
      <Link href="/tra-cuu" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Tra Cứu
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Tra Cứu Tài Sản</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tài sản được gán cho bạn</p>
      </div>

      {/* Tabs (quản lý / admin / super admin) */}
      {hasOthers && (
        <div className="mb-4 flex gap-1 rounded-xl border border-line p-1 w-fit" style={{ background: 'var(--secondary)' }}>
          <button
            onClick={() => setTab('mine')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-500 transition-all ${
              tab === 'mine'
                ? 'bg-indigo/20 text-indigo-300 border border-indigo-500/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Package className="h-4 w-4" />
            Của tôi ({mine.length})
          </button>
          {(() => {
            const sc = SCOPE_TAB[scope as Exclude<LookupScope, 'none'>];
            const Icon = sc.icon;
            return (
              <button
                onClick={() => setTab('others')}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-500 transition-all ${
                  tab === 'others'
                    ? 'bg-indigo/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {sc.label} ({others.length})
              </button>
            );
          })()}
        </div>
      )}

      {/* Search + lọc loại tài sản */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo/60 focus:outline-none"
            placeholder="Tìm theo tên, mã, danh mục..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'hardware', 'domain', 'email', 'software'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-500 transition-all border ${
                typeFilter === t
                  ? 'bg-indigo/20 text-indigo-300 border-indigo-500/30'
                  : 'text-muted-foreground border-line hover:text-foreground'
              }`}
            >
              {t === 'all' ? 'Tất cả' : TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <ErrorState onRetry={load} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Package className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">{search ? 'Không tìm thấy kết quả' : 'Không có tài sản nào'}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-line-subtle overflow-x-auto" style={{ background: 'var(--card)' }}>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line-subtle">
                <th className="px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground">Tài sản</th>
                <th className="hidden px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground sm:table-cell">Loại</th>
                <th className="px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground">Trạng thái</th>
                <th className="hidden px-4 py-3 text-right text-xs font-600 uppercase tracking-wider text-muted-foreground md:table-cell">Giá trị</th>
                {tab === 'others' && (
                  <th className="hidden px-4 py-3 text-left text-xs font-600 uppercase tracking-wider text-muted-foreground lg:table-cell">Phụ trách</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const s = STATUS_CONFIG[a.status ?? ''] ?? { label: a.status ?? '—', cls: 'bg-slate-500/15 text-ink-muted border-slate-500/30' };
                const tc = TYPE_CONFIG[a.type] ?? TYPE_CONFIG.hardware;
                const TypeIcon = tc.icon;
                return (
                  <tr key={`${a.type}-${a.id}`} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tc.cls}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-500 text-foreground">{a.name}</p>
                          {a.code && <p className="text-xs text-muted-foreground">{a.code}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-sm text-muted-foreground sm:table-cell">{tc.label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-500 ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="hidden px-4 py-3 text-right text-sm text-muted-foreground md:table-cell">{formatCurrency(a.value)}</td>
                    {tab === 'others' && (
                      <td className="hidden px-4 py-3 text-sm text-muted-foreground lg:table-cell">{a.assigned_user_name ?? '—'}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Users, Layers, Briefcase, Package, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';

interface InactiveCompany {
  id: string;
  name: string;
  code?: string | null;
  user_count: number;
  department_count: number;
  position_count: number;
  asset_count: number;
}

export default function InactiveCompaniesClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<InactiveCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch('/api/organizations/companies/inactive');
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setList(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error('load inactive companies error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRestore(c: InactiveCompany) {
    setBusyId(c.id);
    try {
      const res = await fetch('/api/organizations/companies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: true }),
      });
      if (!res.ok) throw new Error('restore failed');
      setList(prev => prev.filter(x => x.id !== c.id));
      toast.success(`Đã khôi phục "${c.name}"`);
    } catch {
      toast.error('Khôi phục thất bại, thử lại');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(c: InactiveCompany) {
    const attached: string[] = [];
    if (c.user_count) attached.push(`${c.user_count} nhân viên`);
    if (c.department_count) attached.push(`${c.department_count} phòng ban/bộ phận`);
    if (c.position_count) attached.push(`${c.position_count} chức vụ`);
    if (c.asset_count) attached.push(`${c.asset_count} tài sản`);

    const warn = attached.length
      ? `Công ty này đang dính: ${attached.join(', ')}. Xoá sẽ XOÁ luôn phòng ban/chức vụ/chính sách; nhân viên sẽ bị bỏ trống công ty; tài sản bị gỡ liên kết. KHÔNG THỂ HOÀN TÁC.`
      : 'Công ty này không còn dữ liệu nào dính vào. Xoá vĩnh viễn khỏi hệ thống. KHÔNG THỂ HOÀN TÁC.';

    const ok = await confirm({
      title: `Xoá vĩnh viễn "${c.name}"?`,
      message: warn,
      confirmLabel: 'Xoá vĩnh viễn',
      danger: true,
    });
    if (!ok) return;

    setBusyId(c.id);
    try {
      const res = await fetch(`/api/organizations/companies?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setList(prev => prev.filter(x => x.id !== c.id));
      toast.success(`Đã xoá "${c.name}"`);
    } catch {
      toast.error('Xoá thất bại, thử lại');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-700 text-foreground">Công Ty Ngừng Hoạt Động</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Các công ty đã ẩn (is_active = false). Khôi phục để hiện lại, hoặc xoá vĩnh viễn khỏi hệ thống.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : list.length === 0 ? (
        <EmptyState icon={Building2} title="Không có công ty ngừng hoạt động" description="Tất cả công ty đều đang hoạt động." />
      ) : (
        <div className="space-y-3">
          {list.map(c => {
            const hasData = c.user_count + c.department_count + c.position_count + c.asset_count > 0;
            const busy = busyId === c.id;
            return (
              <div key={c.id} className="rounded-2xl border border-white/05 p-4 sm:p-5" style={{ background: 'var(--card)' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-500/15 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-600 text-foreground truncate">{c.name}</p>
                      {c.code && <p className="text-2xs text-muted-foreground">{c.code}</p>}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <Badge icon={Users} n={c.user_count} label="nhân viên" danger />
                        <Badge icon={Layers} n={c.department_count} label="phòng ban" danger />
                        <Badge icon={Briefcase} n={c.position_count} label="chức vụ" danger />
                        <Badge icon={Package} n={c.asset_count} label="tài sản" />
                        {!hasData && <span className="text-2xs text-emerald-400">✓ Trống — an toàn xoá</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleRestore(c)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl btn-ghost border border-white/10 px-3 py-2 text-xs font-600 text-foreground disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" /> Khôi phục
                    </button>
                    <button onClick={() => handleDelete(c)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-500 px-3 py-2 text-xs font-600 text-white disabled:opacity-50">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Xoá vĩnh viễn
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ icon: Icon, n, label, danger }: { icon: React.ElementType; n: number; label: string; danger?: boolean }) {
  if (!n) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs ${danger ? 'border-amber-500/30 text-amber-400' : 'border-white/10 text-muted-foreground'}`}>
      <Icon className="h-3 w-3" /> {n} {label}
    </span>
  );
}

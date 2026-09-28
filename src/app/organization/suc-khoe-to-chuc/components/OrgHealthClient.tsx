'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, UserX, Crown, Layers, AlertTriangle, EyeOff } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import {
  HealthUser,
  HealthUnit,
  HealthJobTitle,
  HiddenUnit,
  UsersWithoutPrimarySection,
  UnitsWithoutHeadSection,
  JobTitlesDefaultRankSection,
  HiddenUnitsSection,
} from './OrgHealthSections';

interface HealthData {
  usersWithoutPrimary: HealthUser[];
  unitsWithoutHead: HealthUnit[];
  positionsDefaultRank: HealthJobTitle[];
}

interface Company {
  id: string;
  name: string;
}

interface AuthInfo {
  userId: string;
  role: string;
  companyId: string;
}

/** Đọc user hiện tại từ localStorage (pattern chung của các trang client). */
function readAuth(): AuthInfo | null {
  try {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (!stored) return null;
    const user = JSON.parse(stored);
    if (!user?.id) return null;
    const activeCompany = localStorage.getItem('active_company_id') || user.company_id || '';
    return { userId: user.id, role: user.role || '', companyId: activeCompany };
  } catch {
    return null;
  }
}

/** Trang client "Sức Khoẻ Tổ Chức": 3 chỉ số + 3 danh sách cần bổ sung dữ liệu. */
export default function OrgHealthClient() {
  const toast = useToast();
  const confirm = useConfirm();
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilter] = useState('');
  const [data, setData] = useState<HealthData | null>(null);
  const [hiddenUnits, setHiddenUnits] = useState<HiddenUnit[]>([]);
  const [hiddenBusyKey, setHiddenBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = auth?.role === 'super_admin';

  useEffect(() => {
    setAuth(readAuth());
    setAuthReady(true);
  }, []);

  // Danh sách công ty cho filter (chỉ super_admin cần)
  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch('/api/organizations/companies')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : []))
      .catch(() => setCompanies([]));
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const qs = companyFilter ? `?company_id=${encodeURIComponent(companyFilter)}` : '';
      const headers: Record<string, string> = { 'x-current-user-id': auth.userId };
      if (auth.companyId) headers['x-current-user-company'] = auth.companyId;
      const [healthRes, hiddenRes] = await Promise.all([
        fetch(`/api/organizations/health${qs}`, { headers }),
        fetch(`/api/organizations/hidden-units${qs}`, { headers }),
      ]);
      const json = await healthRes.json();
      if (!healthRes.ok) throw new Error(json.error || 'Lỗi tải dữ liệu');
      setData(json.data ?? null);
      // Đơn vị ẩn: lỗi riêng không chặn cả trang
      if (hiddenRes.ok) {
        const hiddenJson = await hiddenRes.json();
        setHiddenUnits(Array.isArray(hiddenJson.data) ? hiddenJson.data : []);
      } else {
        setHiddenUnits([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
      setData(null);
      setHiddenUnits([]);
    } finally {
      setLoading(false);
    }
  }, [auth, companyFilter]);

  useEffect(() => {
    if (authReady) load();
  }, [authReady, load]);

  /** Tải lại riêng danh sách đơn vị ẩn (sau khi xoá cứng) — không chớp cả trang. */
  const reloadHiddenUnits = useCallback(async () => {
    if (!auth) return;
    try {
      const qs = companyFilter ? `?company_id=${encodeURIComponent(companyFilter)}` : '';
      const headers: Record<string, string> = { 'x-current-user-id': auth.userId };
      if (auth.companyId) headers['x-current-user-company'] = auth.companyId;
      const res = await fetch(`/api/organizations/hidden-units${qs}`, { headers });
      if (!res.ok) return;
      const json = await res.json();
      setHiddenUnits(Array.isArray(json.data) ? json.data : []);
    } catch {
      // giữ nguyên danh sách hiện tại
    }
  }, [auth, companyFilter]);

  /** Xoá cứng một đơn vị ẩn (chỉ super_admin) — confirm dialog rõ hậu quả. */
  const handleHardDelete = useCallback(
    async (unit: HiddenUnit) => {
      if (!auth) return;
      const isCompany = unit.unit_type === 'company';
      const typeLabel = isCompany ? 'công ty' : unit.unit_type === 'department' ? 'phòng ban' : 'bộ phận';
      const message = isCompany
        ? `Xoá vĩnh viễn CÔNG TY khỏi DB: toàn bộ ${unit.child_units} phòng ban/bộ phận bên trong bị xoá theo, ${unit.active_assignments} phân công bị tắt, ${unit.users_referencing} người được đưa về 'chưa có công ty' (sẽ hiện ở mục Nhân sự chưa có phân công chính). Không thể hoàn tác.`
        : `Xoá vĩnh viễn khỏi DB. ${unit.active_assignments} phân công sẽ được gỡ liên kết, ${unit.users_referencing} người được đưa về chưa-phân-phòng-ban. Không thể hoàn tác.`;
      const ok = await confirm({
        title: `Xoá cứng ${typeLabel} "${unit.name}"?`,
        message,
        confirmLabel: 'Xoá vĩnh viễn',
        danger: true,
      });
      if (!ok) return;

      const key = `${unit.unit_type}-${unit.id}`;
      setHiddenBusyKey(key);
      try {
        const res = await fetch('/api/organizations/hidden-units', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-current-user-id': auth.userId,
          },
          body: JSON.stringify({ unit_type: unit.unit_type, id: unit.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Xoá thất bại');
        toast.success(
          `Đã xoá vĩnh viễn "${unit.name}" — gỡ ${json.cleaned_assignments ?? 0} phân công, đưa ${json.cleaned_users ?? 0} người về ${isCompany ? 'chưa có công ty' : 'chưa-phân-phòng-ban'}`
        );
        await reloadHiddenUnits();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Xoá thất bại, thử lại');
      } finally {
        setHiddenBusyKey(null);
      }
    },
    [auth, confirm, toast, reloadHiddenUnits]
  );

  const stats = [
    {
      id: 'users',
      label: 'Người chưa có phân công chính',
      count: data?.usersWithoutPrimary.length ?? 0,
      icon: <UserX size={20} />,
      zeroTone: 'emerald' as const,
    },
    {
      id: 'units',
      label: 'Đơn vị chưa có trưởng',
      count: data?.unitsWithoutHead.length ?? 0,
      icon: <Crown size={20} />,
      zeroTone: 'emerald' as const,
    },
    {
      id: 'job-titles',
      label: 'Chức danh chưa xếp cấp',
      count: data?.positionsDefaultRank.length ?? 0,
      icon: <Layers size={20} />,
      zeroTone: 'emerald' as const,
    },
    {
      id: 'hidden-units',
      label: 'Đơn vị ẩn còn trong DB',
      count: hiddenUnits.length,
      icon: <EyeOff size={20} />,
      zeroTone: 'slate' as const,
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Sức Khoẻ Tổ Chức</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Dữ liệu cơ cấu cần bổ sung để sơ đồ và phân quyền hoạt động chính xác
          </p>
        </div>

        {/* Filter công ty — chỉ super_admin (admin bị API khoá theo công ty hiệu lực) */}
        {isSuperAdmin && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50"
          >
            <option value="">Tất cả công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {stats.map((s) => {
          const warning = s.count > 0;
          const box = warning
            ? 'border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-600/5'
            : s.zeroTone === 'slate'
              ? 'border-white/10 bg-gradient-to-br from-slate-500/10 to-slate-600/5'
              : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5';
          const tone = warning ? 'text-amber-400' : s.zeroTone === 'slate' ? 'text-slate-400' : 'text-emerald-400';
          return (
            <div key={s.id} className={`rounded-2xl border p-4 sm:p-5 ${box}`}>
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 ${tone}`}>{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-2xl sm:text-3xl font-700 ${tone}`}>
                    {loading ? '—' : s.count}
                  </div>
                  <p className="text-2xs sm:text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Nội dung chính */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <AlertTriangle className="h-10 w-10 mb-3 text-amber-400 opacity-70" />
          <p className="text-sm">{error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : data ? (
        <div className="space-y-4 sm:space-y-5">
          <UsersWithoutPrimarySection items={data.usersWithoutPrimary} />
          <UnitsWithoutHeadSection items={data.unitsWithoutHead} />
          <JobTitlesDefaultRankSection items={data.positionsDefaultRank} />
          <HiddenUnitsSection
            items={hiddenUnits}
            isSuperAdmin={isSuperAdmin}
            busyKey={hiddenBusyKey}
            onDelete={handleHardDelete}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center py-20 text-muted-foreground">
          <p className="text-sm">Chưa có dữ liệu</p>
          <p className="text-xs mt-1 opacity-60">Vui lòng đăng nhập lại nếu tình trạng kéo dài</p>
        </div>
      )}
    </div>
  );
}

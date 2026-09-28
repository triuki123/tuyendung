'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock, Trash2, Briefcase, Receipt,
  ShoppingCart, CalendarClock, ChevronRight,
  CheckCircle2, AlertCircle, Loader2, Lock,
} from 'lucide-react';

interface ModuleCard {
  id: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  href?: string;
  comingSoon?: boolean;
  badgeCount?: number;
  badgeColor?: string;
  roles?: string[];
  /** Override hiển thị theo quyền (ưu tiên hơn roles). */
  canShow?: boolean;
}

interface PendingCounts {
  cong: number;
  tai_san: number;
  chi_phi: number;
}

function useCurrentUser() {
  const [role, setRole] = useState('');
  const [id, setId] = useState('');
  const [canDeleteAssets, setCanDeleteAssets] = useState(false);
  const [canApproveRequests, setCanApproveRequests] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('assetflow_auth') ?? localStorage.getItem('currentUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setRole(u.role ?? '');
        setId(u.id ?? '');
        // super_admin VÀ có quyền Xóa ở Quản Lý Tài Sản → được duyệt yêu cầu xoá
        const approveReq = u.module_permissions?.['duyet-yeu-cau'];
        const attendancePerms = u.module_permissions?.['cham-cong'];
        setCanApproveRequests(
          u.role === 'super_admin' ||
          u.role === 'admin' ||
          u.role === 'manager' ||
          (Array.isArray(approveReq) && (approveReq.includes('view') || approveReq.includes('approve'))) ||
          (Array.isArray(attendancePerms) && attendancePerms.includes('approve'))
        );
        const a = u.module_permissions?.['asset-management'];
        setCanDeleteAssets(u.role === 'super_admin' && Array.isArray(a) && a.includes('delete'));
      } catch { /* empty */ }
    }
  }, []);
  return { role, id, canDeleteAssets, canApproveRequests, isAdmin: role === 'super_admin' || role === 'admin' };
}

export default function DuyetYeuCauClient() {
  const { role, id, canApproveRequests, canDeleteAssets } = useCurrentUser();
  const [counts, setCounts] = useState<PendingCounts>({ cong: 0, tai_san: 0, chi_phi: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role) return;
    async function fetchCounts() {
      setLoading(true);
      try {
        // Số đơn Duyệt Công chờ duyệt (nghỉ phép + tăng ca + bù công) — đã scope theo role
        // (manager → đội của mình, admin → toàn bộ) ở /api/dashboard/overview.
        const [deleteRes, overviewRes, expenseRes] = await Promise.all([
          fetch('/api/delete-requests?status=pending', {
            headers: { 'x-current-user-role': role },
          }),
          fetch('/api/dashboard/overview', {
            headers: { 'x-current-user-role': role, 'x-current-user-id': id },
          }),
          fetch('/api/expenses?scope=approve', {
            headers: { 'x-current-user-role': role, 'x-current-user-id': id },
          }),
        ]);
        const deleteJson = await deleteRes.json();
        // GET /api/delete-requests trả MẢNG THÔ → đếm trực tiếp. (Có fallback {data}/{total}.)
        const deleteCount = Array.isArray(deleteJson) ? deleteJson.length
          : Array.isArray(deleteJson?.data) ? deleteJson.data.length
          : typeof deleteJson?.total === 'number' ? deleteJson.total : 0;

        const overviewJson = await overviewRes.json().catch(() => null);
        const congCount = overviewJson?.success ? Number(overviewJson.overview?.congPending ?? 0) : 0;
        const expenseJson = await expenseRes.json().catch(() => null);
        const expenseCount = expenseRes.ok && Array.isArray(expenseJson?.data) ? expenseJson.data.length : 0;

        setCounts({ cong: congCount, tai_san: deleteCount, chi_phi: expenseCount });
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    fetchCounts();
  }, [role, id]);

  const modules: ModuleCard[] = [
    {
      id: 'cong',
      icon: <Clock className="h-7 w-7" />,
      iconBg: 'bg-indigo-500/15',
      iconColor: 'text-indigo-400',
      title: 'Duyệt Công',
      description: 'Phép năm, tăng ca, đổi ca, nghỉ bù và các yêu cầu liên quan đến thời gian làm việc',
      href: '/duyet-yeu-cau/cong',
      badgeCount: counts.cong,
      badgeColor: 'bg-indigo-500',
    },
    {
      id: 'tai-san',
      icon: <Trash2 className="h-7 w-7" />,
      iconBg: 'bg-rose-500/15',
      iconColor: 'text-rose-400',
      title: 'Duyệt Xóa Tài Sản',
      description: 'Xem xét và phê duyệt các đề xuất thanh lý, xóa tài sản khỏi hệ thống',
      href: '/duyet-yeu-cau/xoa-tai-san',
      badgeCount: counts.tai_san,
      badgeColor: 'bg-rose-500',
      // Hiện cho super_admin HOẶC người có quyền Xóa ở Quản Lý Tài Sản
      canShow: canDeleteAssets,
    },
    {
      id: 'cong-tac',
      icon: <Briefcase className="h-7 w-7" />,
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-400',
      title: 'Duyệt Công Tác',
      description: 'Phê duyệt đơn xin đi công tác trong và ngoài nước kèm kế hoạch chi phí',
      comingSoon: true,
    },
    {
      id: 'chi-phi',
      icon: <Receipt className="h-7 w-7" />,
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
      title: 'Duyệt Chi Phí',
      description: 'Xem chi tiết, duyệt/từ chối và hỏi đáp phiếu chi ngay tại đây',
      href: '/duyet-yeu-cau/chi-phi',
      badgeCount: counts.chi_phi,
      badgeColor: 'bg-emerald-500',
    },
    {
      id: 'mua-sam',
      icon: <ShoppingCart className="h-7 w-7" />,
      iconBg: 'bg-purple-500/15',
      iconColor: 'text-purple-400',
      title: 'Duyệt Mua Sắm',
      description: 'Xét duyệt đề xuất mua thiết bị, vật tư và các tài sản mới cho tổ chức',
      comingSoon: true,
    },
    {
      id: 'lich-lam',
      icon: <CalendarClock className="h-7 w-7" />,
      iconBg: 'bg-sky-500/15',
      iconColor: 'text-sky-400',
      title: 'Duyệt Lịch Làm',
      description: 'Phê duyệt đăng ký lịch làm linh hoạt, làm từ xa (remote) theo tuần',
      comingSoon: true,
    },
  ];

  const visibleModules = modules.filter(m =>
    m.canShow !== undefined ? m.canShow : (!m.roles || m.roles.includes(role))
  );

  const totalPending = counts.cong + counts.tai_san + counts.chi_phi;

  // Vào được trang: Quản Lý (admin/super_admin) HOẶC người được duyệt xoá tài sản
  if (!canApproveRequests && !canDeleteAssets) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Trang này chỉ dành cho Quản Lý</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">Duyệt Yêu Cầu</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Trung tâm xét duyệt toàn bộ yêu cầu trong tổ chức
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : totalPending > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-600 text-amber-300">
              {totalPending} yêu cầu đang chờ duyệt
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-600 text-emerald-300">Không có yêu cầu nào chờ duyệt</span>
          </div>
        )}
      </div>

      {/* Module Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleModules.map(mod => (
          <ModuleCardComponent key={mod.id} mod={mod} loading={loading} />
        ))}
      </div>
    </div>
  );
}

function ModuleCardComponent({ mod, loading }: { mod: ModuleCard; loading: boolean }) {
  const inner = (
    <div className={`
      relative rounded-2xl border overflow-hidden transition-all duration-200
      ${mod.comingSoon
        ? 'border-line-subtle opacity-60 cursor-default'
        : 'border-line hover:border-line-strong hover:shadow-lg hover:-translate-y-0.5 cursor-pointer group'
      }
    `} style={{ background: 'var(--card)' }}>

      {/* Coming Soon overlay badge */}
      {mod.comingSoon && (
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-line bg-hover px-2.5 py-1">
          <Lock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wider">Sắp ra mắt</span>
        </div>
      )}

      {/* Pending badge */}
      {!mod.comingSoon && !loading && (mod.badgeCount ?? 0) > 0 && (
        <div className={`absolute top-3 right-3 flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full ${mod.badgeColor} text-white text-xs font-700`}>
          {mod.badgeCount}
        </div>
      )}

      <div className="p-5">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${mod.iconBg} ${mod.iconColor} mb-4`}>
          {mod.icon}
        </div>

        {/* Title */}
        <h3 className={`text-base font-700 text-foreground mb-1.5 ${!mod.comingSoon ? 'group-hover:text-indigo-300 transition-colors' : ''}`}>
          {mod.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {mod.description}
        </p>

        {/* Footer */}
        {!mod.comingSoon && (
          <div className="flex items-center gap-1 mt-4 text-xs text-indigo-400 group-hover:gap-2 transition-all">
            <span>Xem yêu cầu</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );

  if (mod.comingSoon || !mod.href) return inner;

  return <Link href={mod.href}>{inner}</Link>;
}

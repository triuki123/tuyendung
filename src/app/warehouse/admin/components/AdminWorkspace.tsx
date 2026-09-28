'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Users, Fingerprint, BarChart3, Trophy, CheckSquare, Megaphone, Warehouse,
  ArrowLeft, FileSpreadsheet, Package, Boxes, Factory, Truck, ClipboardList, Menu, X,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import WorkersTab from './WorkersTab';
import AttendanceTab from './AttendanceTab';
import OutputTab from './OutputTab';
import SuppliesTab from './SuppliesTab';
import RankingTab from './RankingTab';
import ApprovalsTab from './ApprovalsTab';
import PostsTab from './PostsTab';
import ReportTab from './ReportTab';
import InventoryTab from './InventoryTab';
import ProductionTab from './ProductionTab';
import ShipmentsTab from './ShipmentsTab';
import OrdersTab from './OrdersTab';

const LOGIN_PATH = '/sign-up-login-screen';

// Cấu hình kho (GPS/ca/sản phẩm/email/quản lý) do CẤP TRÊN làm ở app chính
// (/kho-xuong, thẻ kho → Cấu hình) — Warehouse Admin chỉ vận hành.
type TabKey = 'workers' | 'attendance' | 'output' | 'orders' | 'inventory' | 'production'
  | 'shipments' | 'supplies' | 'ranking' | 'approvals' | 'posts' | 'report';

/**
 * SIDEBAR nhóm theo vai trò (user chốt — thay 11 tab phẳng quá tải).
 * Thứ tự tab nhóm SX & Kho = ĐÚNG DÒNG CHẢY dây chuyền:
 * đơn hàng → vật tư/nguyên liệu → sản xuất → tồn kho → xuất hàng.
 */
const NAV_GROUPS: { label: string; items: { key: TabKey; label: string; icon: any }[] }[] = [
  {
    label: 'Sản xuất & Kho',
    items: [
      { key: 'orders', label: 'Đơn hàng', icon: ClipboardList },
      { key: 'supplies', label: 'Vật tư', icon: Package },
      { key: 'production', label: 'Sản xuất', icon: Factory },
      { key: 'inventory', label: 'Tồn kho', icon: Boxes },
      { key: 'shipments', label: 'Xuất hàng', icon: Truck },
    ],
  },
  {
    label: 'Nhân công',
    items: [
      { key: 'workers', label: 'Công nhân', icon: Users },
      { key: 'attendance', label: 'Chấm công', icon: Fingerprint },
      { key: 'output', label: 'Sản lượng', icon: BarChart3 },
      { key: 'ranking', label: 'Xếp hạng', icon: Trophy },
      { key: 'approvals', label: 'Duyệt', icon: CheckSquare },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { key: 'posts', label: 'Bảng tin', icon: Megaphone },
      { key: 'report', label: 'Báo cáo', icon: FileSpreadsheet },
    ],
  },
];

const ALL_KEYS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export default function AdminWorkspace() {
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [role, setRole] = useState('');
  const [whId, setWhId] = useState('');
  const [tab, setTab] = useState<TabKey>('workers');
  const [denied, setDenied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);   // mobile

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/admin/warehouses');
      if (res.status === 401) {
        window.location.href = `${LOGIN_PATH}?redirect=${encodeURIComponent('/warehouse/admin')}`;
        return;
      }
      if (res.status === 403) { setDenied(true); return; }
      const json = await res.json();
      const list = json.data || [];
      setWarehouses(list);
      setRole(json.role || '');
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('wh');
      if (list.length > 0) {
        setWhId((prev) => prev || (requested && list.some((w: any) => w.id === requested) ? requested : list[0].id));
      }
      // Deep-link ?tab= (giữ tương thích link cũ + link chéo giữa các tab)
      const reqTab = params.get('tab') as TabKey | null;
      if (reqTab && ALL_KEYS.includes(reqTab)) setTab(reqTab);
      // KHÔNG setDenied khi list rỗng: API 200 ⇒ CÓ quyền RBAC, chỉ chưa được gán kho.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      window.location.href = `${LOGIN_PATH}?redirect=${encodeURIComponent('/warehouse/admin')}`;
      return;
    }
    load();
  }, [load]);

  const goTab = useCallback((t: string) => {
    if (ALL_KEYS.includes(t as TabKey)) {
      setTab(t as TabKey);
      setDrawerOpen(false);
      const params = new URLSearchParams(window.location.search);
      params.set('tab', t);
      window.history.replaceState(null, '', `/warehouse/admin?${params.toString()}`);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--background)' }}>
        <Warehouse className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h1 className="text-lg font-700 text-foreground">Bạn chưa có quyền Kho / Xưởng</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Cần được tick quyền module &quot;Kho / Xưởng&quot; trong ma trận phân quyền VÀ được gán làm quản lý kho.
        </p>
      </div>
    );
  }

  const wh = warehouses.find((w) => w.id === whId) || null;

  /** Menu nhóm — dùng chung cho sidebar desktop và drawer mobile. */
  const NavMenu = () => (
    <nav className="space-y-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-3 mb-1.5 text-[10px] font-700 uppercase tracking-widest text-muted-foreground/60">{g.label}</p>
          <div className="space-y-0.5">
            {g.items.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => goTab(t.key)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-600 transition-colors ${
                    active ? 'bg-indigo-500/15 text-indigo-400' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}>
                  <Icon className="h-4 w-4 shrink-0" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const renderTab = () => {
    if (!wh) return null;
    switch (tab) {
      case 'workers': return <WorkersTab warehouseId={wh.id} />;
      case 'attendance': return <AttendanceTab warehouseId={wh.id} />;
      case 'output': return <OutputTab warehouseId={wh.id} />;
      case 'orders': return <OrdersTab warehouseId={wh.id} onGoTab={goTab} />;
      case 'inventory': return <InventoryTab warehouseId={wh.id} />;
      case 'production': return <ProductionTab warehouseId={wh.id} />;
      case 'shipments': return <ShipmentsTab warehouseId={wh.id} />;
      case 'supplies': return <SuppliesTab warehouseId={wh.id} />;
      case 'ranking': return <RankingTab warehouseId={wh.id} warehouseName={wh.name} />;
      case 'approvals': return <ApprovalsTab warehouseId={wh.id} />;
      case 'posts': return <PostsTab warehouseId={wh.id} />;
      case 'report': return <ReportTab warehouseId={wh.id} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Topbar */}
      <header
        className="sticky top-0 z-40 border-b border-white/5 px-4 py-3"
        style={{ background: 'var(--card)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Hamburger — chỉ mobile */}
            <button onClick={() => setDrawerOpen(true)}
              className="lg:hidden rounded-lg border border-white/10 p-2 text-foreground shrink-0" title="Mở menu">
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 shrink-0">
              <Warehouse className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-700 text-foreground">Warehouse Admin</p>
              <p className="text-[11px] text-muted-foreground truncate">Quản lý kho/xưởng</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {warehouses.length > 0 && (
              <select
                value={whId}
                onChange={(e) => {
                  setWhId(e.target.value);
                  const params = new URLSearchParams(window.location.search);
                  params.set('wh', e.target.value);
                  window.history.replaceState(null, '', `/warehouse/admin?${params.toString()}`);
                }}
                className="rounded-xl border border-white/10 bg-[#162033] px-3 py-2 text-xs text-foreground max-w-[160px]"
              >
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <a
              href="/kho-xuong"
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-600 text-foreground flex items-center gap-1.5 whitespace-nowrap"
              title="Quay lại app chính (trang Kho / Xưởng)"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Về app chính</span>
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 flex w-full max-w-screen-2xl mx-auto">
        {/* Sidebar desktop */}
        <aside className="hidden lg:block w-[230px] shrink-0 border-r border-white/5 p-3 sticky top-[65px] self-start max-h-[calc(100vh-65px)] overflow-y-auto">
          <NavMenu />
        </aside>

        {/* Drawer mobile */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setDrawerOpen(false)}>
            <div className="h-full w-[260px] p-4 overflow-y-auto"
              style={{ background: 'var(--card)', paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-700 text-foreground flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-indigo-400" /> Menu
                </p>
                <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
              <NavMenu />
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6 pb-16">
          {warehouses.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <Warehouse className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Chưa có kho nào</p>
              <p className="text-xs mt-1 opacity-60">
                Tạo kho & gán quản lý ở app chính — trang Kho / Xưởng (/kho-xuong). Nếu không có quyền, liên hệ quản trị.
              </p>
            </div>
          ) : renderTab()}
        </main>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, FileText, FolderOpen, Settings, ShieldAlert, ClipboardCheck, ArrowLeft, History } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { LookupItem, EmploymentType, listLookup, listEmploymentTypes } from './hrApi';
import type { HrBadgeCounts } from '@/app/api/hr/badge-counts/route';
import OverviewTab from './OverviewTab';
import ContractsTab from './ContractsTab';
import HrDocsTab from './HrDocsTab';
import EvaluationsTab from './EvaluationsTab';
import SettingsTab from './SettingsTab';
import AuditLogTab from './AuditLogTab';
import BmhsProvider from './BmhsProvider';

type Tab = 'overview' | 'contracts' | 'docs' | 'evaluations' | 'history' | 'settings';

interface Perms { view: boolean; create: boolean; edit: boolean; delete: boolean; isSuperAdmin: boolean }

function resolvePerms(): Perms {
  const u = getCurrentUser() as any;
  if (!u) return { view: false, create: false, edit: false, delete: false, isSuperAdmin: false };
  const list: string[] = Array.isArray(u.module_permissions?.hr) ? u.module_permissions.hr : [];
  return {
    view: list.includes('view'),
    create: list.includes('create'),
    edit: list.includes('edit'),
    delete: list.includes('delete'),
    isSuperAdmin: u.role === 'super_admin',
  };
}

// Kiểu Record<Tab, …> (KHÔNG phải Record<string, …>): thiếu 1 tab là tsc báo lỗi ngay,
// thay vì lọt tới runtime rồi crash cả trang khi lưới thẻ mobile đọc meta undefined.
const TAB_META: Record<Tab, { desc: string; iconColor: string; iconBg: string; borderHover: string }> = {
  overview:    { desc: 'Tổng hợp hợp đồng, nhắc gia hạn',         iconColor: 'text-indigo-400',  iconBg: 'bg-indigo-500/15',  borderHover: 'hover:border-indigo-500/40' },
  contracts:   { desc: 'Danh sách & lịch sử hợp đồng lao động',   iconColor: 'text-amber-400',   iconBg: 'bg-amber-500/15',   borderHover: 'hover:border-amber-500/40' },
  evaluations: { desc: 'Thẻ đánh giá thử việc nhân viên',          iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/15', borderHover: 'hover:border-emerald-500/40' },
  docs:        { desc: 'Hồ sơ, giấy tờ nhân sự đính kèm',         iconColor: 'text-purple-400',  iconBg: 'bg-purple-500/15',  borderHover: 'hover:border-purple-500/40' },
  history:     { desc: 'Vết kiểm toán mọi thao tác trong module', iconColor: 'text-sky-400',     iconBg: 'bg-sky-500/15',     borderHover: 'hover:border-sky-500/40' },
  settings:    { desc: 'Cấu hình loại hợp đồng, hồ sơ',           iconColor: 'text-ink-muted',   iconBg: 'bg-slate-500/15',   borderHover: 'hover:border-slate-500/40' },
};

export default function HRClient() {
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true); // mobile: true = hiện card grid
  const [perms, setPerms] = useState<Perms>({ view: false, create: false, edit: false, delete: false, isSuperAdmin: false });
  const [contractTypes, setContractTypes] = useState<LookupItem[]>([]);
  const [docTypes, setDocTypes] = useState<LookupItem[]>([]);
  const [empTypes, setEmpTypes] = useState<EmploymentType[]>([]);
  const [ready, setReady] = useState(false);
  const [badges, setBadges] = useState<HrBadgeCounts>({ contracts: 0, evaluations: 0, docs: 0 });

  // Badge đếm — tách riêng để refetch được sau thao tác (kết luận/xoá đánh giá…),
  // không chỉ chạy một lần lúc mount như trước (badge cũ đứng lì số cũ).
  const loadBadges = useCallback(async () => {
    try {
      const u = getCurrentUser() as any;
      const res = await fetch('/api/hr/badge-counts', {
        headers: u?.id ? { 'x-current-user-id': u.id } : {},
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setBadges(json.data);
      }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    setPerms(resolvePerms());
    (async () => {
      try {
        const [ct, dt, et] = await Promise.all([
          listLookup('contract-types'),
          listLookup('hr-document-types'),
          listEmploymentTypes(),
        ]);
        setContractTypes(ct);
        setDocTypes(dt);
        setEmpTypes(et);
      } catch { /* noop */ } finally { setReady(true); }
    })();
  }, []);

  // Nạp lại badge khi mount VÀ mỗi lần đổi tab (quay lại tab là số cập nhật đúng).
  useEffect(() => { void loadBadges(); }, [tab, loadBadges]);

  if (ready && !perms.view) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col items-center py-24 text-muted-foreground">
          <ShieldAlert className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Bạn không có quyền truy cập module Quản Lý Hồ Sơ</p>
          <p className="text-xs mt-1 opacity-60">Xem hợp đồng &amp; hồ sơ của bạn tại trang "Hợp đồng &amp; Hồ sơ".</p>
        </div>
      </div>
    );
  }

  const allTabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'overview',     label: 'Tổng quan',   icon: <LayoutDashboard className="h-5 w-5" />, show: true },
    { id: 'contracts',    label: 'Hợp đồng',    icon: <FileText className="h-5 w-5" />,        show: true },
    { id: 'evaluations',  label: 'Đánh giá',    icon: <ClipboardCheck className="h-5 w-5" />,  show: true },
    { id: 'docs',         label: 'Hồ sơ',       icon: <FolderOpen className="h-5 w-5" />,      show: true },
    // Lịch sử = vết kiểm toán nhân sự → chỉ người quản lý hồ sơ (hr.edit) xem toàn bộ.
    { id: 'history',      label: 'Lịch sử',     icon: <History className="h-5 w-5" />,         show: perms.edit },
    // Tab Cài Đặt chứa Người Nhận Thông Báo Quản Lý Hồ Sơ — chỉ super_admin truy cập.
    { id: 'settings',     label: 'Cài đặt',     icon: <Settings className="h-5 w-5" />,        show: perms.isSuperAdmin },
  ];
  const tabs = allTabs.filter((t) => t.show);

  const activeTab = tabs.find((t) => t.id === tab);

  function getBadge(id: Tab): number {
    if (id === 'contracts') return badges.contracts;
    if (id === 'evaluations') return badges.evaluations;
    if (id === 'docs') return badges.docs;
    return 0;
  }

  function selectTab(id: Tab) {
    setTab(id);
    setMobileMenuOpen(false);
  }

  return (
    <BmhsProvider>
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {/* Mobile: back link khi đang xem nội dung */}
          {!mobileMenuOpen && (
            <button onClick={() => setMobileMenuOpen(true)}
              className="sm:hidden inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Quản Lý Hồ Sơ
            </button>
          )}
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">
            <span className="sm:hidden">{mobileMenuOpen ? 'Quản Lý Hồ Sơ' : activeTab?.label}</span>
            <span className="hidden sm:inline">Quản Lý Hồ Sơ</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Quản lý hợp đồng &amp; hồ sơ nhân sự, nhắc gia hạn tự động</p>
        </div>
      </div>

      {/* Mobile: card grid chọn tab */}
      {mobileMenuOpen && (
        <div className="sm:hidden grid grid-cols-2 gap-3">
          {tabs.map((t) => {
            // Phòng thủ: thiếu meta thì dùng mặc định, KHÔNG để undefined làm sập cả trang.
            const meta = TAB_META[t.id] ?? { desc: '', iconColor: 'text-muted-foreground', iconBg: 'bg-hover', borderHover: '' };
            return (
              <button key={t.id} onClick={() => selectTab(t.id)}
                className={`group relative flex flex-col rounded-2xl border border-line-subtle p-4 text-left transition-all duration-200 ${meta.borderHover} active:scale-95`}
                style={{ background: 'var(--card)' }}>
                {getBadge(t.id) > 0 && (
                  <span className="absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-2xs font-700 flex items-center justify-center">
                    {getBadge(t.id) > 99 ? '99+' : getBadge(t.id)}
                  </span>
                )}
                <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${meta.iconBg}`}>
                  <span className={meta.iconColor}>{t.icon}</span>
                </div>
                <p className="text-sm font-600 text-foreground mb-1">{t.label}</p>
                <p className="text-2xs text-muted-foreground leading-relaxed">{meta.desc}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Desktop: tab bar */}
      <div className="hidden sm:flex gap-2 border-b border-line">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => selectTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
              tab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.icon} {t.label}
            {getBadge(t.id) > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-2xs font-700 flex items-center justify-center">
                {getBadge(t.id) > 99 ? '99+' : getBadge(t.id)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Nội dung tab: hidden trên mobile khi menu đang mở, desktop luôn hiện */}
      <div className={mobileMenuOpen ? 'hidden sm:block' : 'block'}>
        {tab === 'overview'    && <OverviewTab />}
        {tab === 'contracts'   && <ContractsTab contractTypes={contractTypes} canCreate={perms.create} canEdit={perms.edit} canDelete={perms.delete} />}
        {tab === 'evaluations' && <EvaluationsTab canCreate={perms.create} canEdit={perms.edit} canDelete={perms.delete} />}
        {tab === 'docs'        && <HrDocsTab docTypes={docTypes} canEdit={perms.edit} />}
        {tab === 'history'     && perms.edit && <AuditLogTab />}
        {tab === 'settings'    && perms.isSuperAdmin && <SettingsTab />}
      </div>
    </div>
    </BmhsProvider>
  );
}

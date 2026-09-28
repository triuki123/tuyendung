'use client';

import { useEffect, useState } from 'react';
import { FileText, CalendarCheck, Handshake, Stamp, Settings, ShieldAlert, ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/authStore';
import { canAccess } from '@/lib/permissions';
import type { Company, LegalPerms } from './shared';
import DocumentsTab from './DocumentsTab';
import ComplianceTab from './ComplianceTab';
import ContractsTab from './ContractsTab';
import AuthSealTab from './AuthSealTab';
import LegalSettingsTab from './LegalSettingsTab';
import LegalLockProvider from './LegalLockProvider';

type Tab = 'documents' | 'compliance' | 'contracts' | 'auth-seal' | 'settings';

// Record<Tab, …> (KHÔNG Record<string, …>): thiếu 1 tab là tsc báo ngay,
// không lọt tới runtime rồi crash cả trang (bài học TAB_META module Quản Lý Hồ Sơ).
const TAB_META: Record<Tab, { desc: string; iconColor: string; iconBg: string; borderHover: string }> = {
  documents:  { desc: 'GPKD, giấy phép con, văn bản nội bộ — kèm scan & hạn',  iconColor: 'text-sky-400',     iconBg: 'bg-sky-500/15',     borderHover: 'hover:border-sky-500/40' },
  compliance: { desc: 'Nghĩa vụ định kỳ: báo cáo lao động, môn bài, BHXH…',   iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/15', borderHover: 'hover:border-emerald-500/40' },
  contracts:  { desc: 'Hợp đồng với đối tác: vòng đời, giá trị, tái ký',       iconColor: 'text-amber-400',   iconBg: 'bg-amber-500/15',   borderHover: 'hover:border-amber-500/40' },
  'auth-seal':{ desc: 'Giấy ủy quyền có thời hạn + nhật ký sử dụng con dấu',   iconColor: 'text-purple-400',  iconBg: 'bg-purple-500/15',  borderHover: 'hover:border-purple-500/40' },
  settings:   { desc: 'Danh mục loại văn bản — sửa khi luật thay đổi',         iconColor: 'text-ink-muted',   iconBg: 'bg-slate-500/15',   borderHover: 'hover:border-slate-500/40' },
};

export default function LegalClient() {
  const [tab, setTab] = useState<Tab>('documents');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(true);
  const [perms, setPerms] = useState<LegalPerms>({ view: false, create: false, edit: false, remove: false });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getCurrentUser() as any;
    const p = u?.module_permissions;
    setPerms({
      view: canAccess(p, 'legal', 'view'),
      create: canAccess(p, 'legal', 'create'),
      edit: canAccess(p, 'legal', 'edit'),
      remove: canAccess(p, 'legal', 'delete'),
    });
    fetch('/api/companies')
      .then((r) => r.json())
      .then((j) => setCompanies((j.data || j.companies || []).map((c: any) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (ready && !perms.view) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col items-center py-24 text-muted-foreground">
          <ShieldAlert className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Bạn không có quyền truy cập module Pháp Chế</p>
          <p className="text-xs mt-1 opacity-60">Liên hệ quản trị để được cấp quyền.</p>
        </div>
      </div>
    );
  }

  const allTabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'documents',  label: 'Giấy phép & Văn bản', icon: <FileText className="h-5 w-5" />,      show: true },
    { id: 'compliance', label: 'Lịch tuân thủ',        icon: <CalendarCheck className="h-5 w-5" />, show: true },
    { id: 'contracts',  label: 'Hợp đồng',             icon: <Handshake className="h-5 w-5" />,     show: true },
    { id: 'auth-seal',  label: 'Ủy quyền & Con dấu',   icon: <Stamp className="h-5 w-5" />,         show: true },
    { id: 'settings',   label: 'Cài đặt',              icon: <Settings className="h-5 w-5" />,      show: perms.edit },
  ];
  const tabs = allTabs.filter((t) => t.show);
  const activeTab = tabs.find((t) => t.id === tab);

  function selectTab(id: Tab) {
    setTab(id);
    setMobileMenuOpen(false);
  }

  return (
    <LegalLockProvider>
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {!mobileMenuOpen && (
            <button onClick={() => setMobileMenuOpen(true)}
              className="sm:hidden inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Pháp Chế
            </button>
          )}
          <h1 className="text-xl sm:text-2xl font-700 text-foreground">
            <span className="sm:hidden">{mobileMenuOpen ? 'Pháp Chế' : activeTab?.label}</span>
            <span className="hidden sm:inline">Pháp Chế</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Giấy phép, tuân thủ, hợp đồng & con dấu — toàn bộ công ty trong hệ thống
          </p>
        </div>
      </div>

      {/* Mobile: card grid chọn tab */}
      {mobileMenuOpen && (
        <div className="sm:hidden grid grid-cols-2 gap-3">
          {tabs.map((t) => {
            // Phòng thủ: thiếu meta thì fallback, không để undefined sập trang.
            const meta = TAB_META[t.id] ?? { desc: '', iconColor: 'text-muted-foreground', iconBg: 'bg-white/5', borderHover: '' };
            return (
              <button key={t.id} onClick={() => selectTab(t.id)}
                className={`group flex flex-col rounded-2xl border border-white/5 p-4 text-left transition-all duration-200 ${meta.borderHover} active:scale-95`}
                style={{ background: 'var(--card)' }}>
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
      <div className="hidden sm:flex gap-2 border-b border-white/10 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => selectTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
              tab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Nội dung tab */}
      <div className={mobileMenuOpen ? 'hidden sm:block' : 'block'}>
        {tab === 'documents'  && <DocumentsTab companies={companies} perms={perms} />}
        {tab === 'compliance' && <ComplianceTab companies={companies} perms={perms} />}
        {tab === 'contracts'  && <ContractsTab companies={companies} perms={perms} />}
        {tab === 'auth-seal'  && <AuthSealTab companies={companies} perms={perms} />}
        {tab === 'settings'   && perms.edit && <LegalSettingsTab />}
      </div>
    </div>
    </LegalLockProvider>
  );
}

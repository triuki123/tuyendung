'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { normalizeVN } from '@/lib/utils/searchVN';
import {
  MODULES, ModuleChild, UserModulePermissions, PermissionAction, getAllPermissionUnits,
} from '@/lib/modules';
import {
  Search, X, ShieldCheck, Users2, Copy, Check, ChevronDown, Crown, UserCog, User as UserIcon, AlertTriangle, CornerDownRight,
  Bookmark, Save, Trash2, Loader2, Pencil, RotateCcw, Settings2,
} from 'lucide-react';

interface PermissionsPanelProps {
  permissions: UserModulePermissions;
  onPermissionsChange: (permissions: UserModulePermissions) => void;
  isReadOnly?: boolean;
  /** Vai trò của user đang chỉnh — dùng để hiện quyền BMHS chỉ cho super_admin. */
  targetRole?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata: hành động + nhóm danh mục
// ─────────────────────────────────────────────────────────────────────────────

/** 7 hành động cố định — thứ tự cột trong ma trận, kèm nhãn ngắn + màu. */
const ACTIONS: { action: PermissionAction; short: string; full: string; color: string }[] = [
  { action: 'view',    short: 'Xem',    full: 'Xem',         color: 'text-ink-bright' },
  { action: 'create',  short: 'Thêm',   full: 'Thêm mới',    color: 'text-emerald-300' },
  { action: 'edit',    short: 'Sửa',    full: 'Chỉnh sửa',   color: 'text-blue-300' },
  { action: 'delete',  short: 'Xóa',    full: 'Xóa',         color: 'text-red-300' },
  { action: 'approve', short: 'Duyệt',  full: 'Phê duyệt',   color: 'text-amber-300' },
  { action: 'export',  short: 'Xuất',   full: 'Xuất dữ liệu', color: 'text-purple-300' },
  { action: 'notify',  short: 'T.Báo',  full: 'Nhận thông báo', color: 'text-cyan-300' },
];

/** Gom module thành 3 nhóm (giống Sidebar) để dễ tìm. */
const GROUPS: { id: string; label: string; moduleIds: string[] }[] = [
  { id: 'nav', label: 'Điều Hướng', moduleIds: ['dashboard', 'asset-management', 'organization', 'duyet-yeu-cau', 'delete-requests'] },
  { id: 'activity', label: 'Hoạt Động', moduleIds: ['tickets', 'ticket-config', 'tasks', 'room-bookings', 'recruitment-order', 'design-requests', 'cham-cong', 'tra-cuu', 'my-hr', 'announcements', 'history', 'solace', 'warehouse', 'email-signature', 'ho-so-nang-luc', 'email-center', 'expense', 'kpi'] },
  // ⚠️ Module mới KHÔNG tự hiện: panel render theo danh sách nhóm CỐ ĐỊNH này —
  // khai báo trong MODULES mà quên thêm vào đây là biến mất thầm lặng khỏi ma trận.
  { id: 'admin', label: 'Quản Trị', moduleIds: ['hr', 'hr-resources', 'legal', 'forms', 'users', 'settings'] },
];

/** Quyền mẫu theo vai trò — nút áp dụng nhanh. */
interface CopyUser {
  id: string;
  name: string;
  role: string;
  module_permissions: UserModulePermissions | null;
}

interface CustomPreset {
  id: string;
  name: string;
  description: string | null;
  permissions: UserModulePermissions;
  is_system: boolean;
  sort_order: number;
}

/** Biểu tượng + màu cho mẫu hệ thống (theo tên); mẫu tùy chỉnh dùng Bookmark tím. */
const PRESET_STYLE: Record<string, { icon: React.ReactNode; cls: string }> = {
  'Toàn quyền': { icon: <Crown size={13} />, cls: 'border-indigo-500/40 bg-indigo-500/5 text-indigo-300' },
  'Quản trị': { icon: <ShieldCheck size={13} />, cls: 'border-blue-500/40 bg-blue-500/5 text-blue-300' },
  'Quản lý': { icon: <UserCog size={13} />, cls: 'border-amber-500/40 bg-amber-500/5 text-amber-300' },
  'Nhân viên': { icon: <UserIcon size={13} />, cls: 'border-slate-500/40 bg-slate-500/5 text-ink-bright' },
};
const CUSTOM_PRESET_STYLE = { icon: <Bookmark size={13} />, cls: 'border-violet-500/40 bg-violet-500/5 text-violet-300' };

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('assetflow_auth');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u.id) h['x-current-user-id'] = u.id;
        if (u.role) h['x-current-user-role'] = u.role;
        if (u.module_permissions) h['x-user-permissions'] = JSON.stringify(u.module_permissions);
      } catch { /* noop */ }
    }
  }
  return h;
}

export default function PermissionsPanel({ permissions, onPermissionsChange, isReadOnly = false, targetRole }: PermissionsPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyUsers, setCopyUsers] = useState<CopyUser[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copySearch, setCopySearch] = useState('');
  // Quyền mẫu (cả hệ thống lẫn tùy chỉnh — quản lý thống nhất từ DB)
  const [presetList, setPresetList] = useState<CustomPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<CustomPreset | null>(null);
  const [presetName, setPresetName] = useState('');
  const [overwritePerms, setOverwritePerms] = useState(true);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetError, setPresetError] = useState('');
  const [restoring, setRestoring] = useState(false);

  // ── Quyền mặc định theo vai trò ───────────────────────────────────────────
  const ROLE_TABS = [
    { role: 'user',    label: 'Người Dùng', icon: <UserIcon size={13} />,  cls: 'border-slate-500/40 bg-slate-500/10 text-slate-200' },
    { role: 'manager', label: 'Quản Lý',    icon: <UserCog size={13} />,   cls: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
    { role: 'admin',   label: 'Admin',       icon: <ShieldCheck size={13} />, cls: 'border-blue-500/40 bg-blue-500/10 text-blue-200' },
  ] as const;
  type RoleKey = 'user' | 'manager' | 'admin';

  const [showRoleTemplates, setShowRoleTemplates] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState<RoleKey>('user');
  const [rolePerms, setRolePerms] = useState<Record<RoleKey, UserModulePermissions>>({ user: {}, manager: {}, admin: {} });
  const [rolePermsLoading, setRolePermsLoading] = useState(false);
  const [rolePermsSaving, setRolePermsSaving] = useState(false);
  const [rolePermsSaved, setRolePermsSaved] = useState(false);
  // Áp dụng mẫu vai trò cho TẤT CẢ user có role đó
  const [showApplyAllConfirm, setShowApplyAllConfirm] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyAllResult, setApplyAllResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadRoleTemplates = async () => {
    setRolePermsLoading(true);
    try {
      const res = await fetch('/api/role-permission-templates', { headers: authHeaders() });
      const json = await res.json();
      if (json.success) {
        const map: Record<RoleKey, UserModulePermissions> = { user: {}, manager: {}, admin: {} };
        for (const row of json.data as { role: RoleKey; module_permissions: UserModulePermissions }[]) {
          map[row.role] = row.module_permissions || {};
        }
        setRolePerms(map);
      }
    } catch { /* noop */ }
    finally { setRolePermsLoading(false); }
  };

  const saveRoleTemplate = async () => {
    setRolePermsSaving(true); setRolePermsSaved(false);
    try {
      const res = await fetch(`/api/role-permission-templates/${activeRoleTab}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_permissions: rolePerms[activeRoleTab] }),
      });
      if (res.ok) { setRolePermsSaved(true); setTimeout(() => setRolePermsSaved(false), 2000); }
    } catch { /* noop */ }
    finally { setRolePermsSaving(false); }
  };

  // Tick ở module MẸ thì áp (đệ quy) xuống mọi module CON có hỗ trợ hành động đó.
  const toggleRolePerm = (unitId: string, action: PermissionAction) => {
    const cur = rolePerms[activeRoleTab][unitId] || [];
    const turnOn = !cur.includes(action);
    setRolePerms(prev => {
      const next = { ...prev[activeRoleTab] };
      const setAction = (id: string, supported: boolean) => {
        if (!supported) return;
        const arr = next[id] || [];
        next[id] = turnOn ? (arr.includes(action) ? arr : [...arr, action]) : arr.filter(a => a !== action);
      };
      setAction(unitId, true);
      const mod = MODULES.find(m => m.id === unitId);
      for (const c of mod?.children || []) setAction(c.id, c.permissions.some(p => p.action === action));
      return { ...prev, [activeRoleTab]: next };
    });
  };

  // "Tất cả/Không" ở module MẸ thì cascade đặt toàn bộ quyền cho mọi module CON theo.
  const toggleRoleUnitAll = (unitId: string, unitPerms: { action: PermissionAction }[]) => {
    const all = unitPerms.map(p => p.action);
    const cur = rolePerms[activeRoleTab][unitId] || [];
    const hasAll = all.every(a => cur.includes(a));
    setRolePerms(prev => {
      const next = { ...prev[activeRoleTab] };
      next[unitId] = hasAll ? [] : all;
      const mod = MODULES.find(m => m.id === unitId);
      for (const c of mod?.children || []) next[c.id] = hasAll ? [] : c.permissions.map(p => p.action);
      return { ...prev, [activeRoleTab]: next };
    });
  };

  const applyRoleTemplateToAllUsers = async () => {
    setApplyingAll(true); setApplyAllResult(null);
    try {
      const res = await fetch(`/api/role-permission-templates/${activeRoleTab}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_permissions: rolePerms[activeRoleTab] }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRolePermsSaved(true); setTimeout(() => setRolePermsSaved(false), 2000);
        setApplyAllResult({ ok: true, msg: `Đã áp dụng cho ${json.count} người dùng có vai trò này.` });
      } else {
        setApplyAllResult({ ok: false, msg: json.error || 'Áp dụng thất bại' });
      }
    } catch {
      setApplyAllResult({ ok: false, msg: 'Lỗi kết nối máy chủ' });
    } finally {
      setApplyingAll(false);
      setShowApplyAllConfirm(false);
    }
  };

  const applyRoleTemplateToUser = () => {
    if (isReadOnly) return;
    const cloned: UserModulePermissions = {};
    for (const [k, v] of Object.entries(rolePerms[activeRoleTab])) cloned[k] = [...(v as PermissionAction[])];
    onPermissionsChange(cloned);
  };

  // ── Thao tác quyền (tick module MẸ tự áp đệ quy xuống mọi module CON) ────────
  const togglePermission = (unitId: string, action: PermissionAction) => {
    if (isReadOnly) return;
    const cur = permissions[unitId] || [];
    const turnOn = !cur.includes(action);
    const next = { ...permissions };
    const setAction = (id: string, supported: boolean) => {
      if (!supported) return;
      const arr = next[id] || [];
      next[id] = turnOn ? (arr.includes(action) ? arr : [...arr, action]) : arr.filter(a => a !== action);
    };
    setAction(unitId, true);
    const mod = MODULES.find(m => m.id === unitId);
    for (const c of mod?.children || []) setAction(c.id, c.permissions.some(p => p.action === action));
    onPermissionsChange(next);
  };

  const toggleUnitAll = (unitId: string, unitPerms: { action: PermissionAction }[]) => {
    if (isReadOnly) return;
    const all = unitPerms.map(p => p.action);
    const cur = permissions[unitId] || [];
    const hasAll = all.every(a => cur.includes(a));
    const next = { ...permissions };
    next[unitId] = hasAll ? [] : all;
    const mod = MODULES.find(m => m.id === unitId);
    for (const c of mod?.children || []) next[c.id] = hasAll ? [] : c.permissions.map(p => p.action);
    onPermissionsChange(next);
  };

  /** Bật/tắt 1 hành động cho TẤT CẢ đơn vị (mẹ + con) có hỗ trợ hành động đó. */
  const toggleActionColumn = (action: PermissionAction) => {
    if (isReadOnly) return;
    const units = getAllPermissionUnits().filter(u => u.permissions.some(p => p.action === action));
    const allOn = units.every(u => (permissions[u.id] || []).includes(action));
    const next = { ...permissions };
    for (const u of units) {
      const cur = next[u.id] || [];
      if (allOn) next[u.id] = cur.filter(a => a !== action);
      else if (!cur.includes(action)) next[u.id] = [...cur, action];
    }
    onPermissionsChange(next);
  };

  const clearAll = () => {
    if (isReadOnly) return;
    onPermissionsChange({});
  };

  // ── Quyền mẫu (hệ thống + tùy chỉnh) ─────────────────────────────────────────
  const loadPresets = async () => {
    try {
      const res = await fetch('/api/permission-presets', { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setPresetList(json.data);
    } catch { /* noop */ }
  };
  useEffect(() => { loadPresets(); }, []);

  const applyPreset = (p: CustomPreset) => {
    if (isReadOnly) return;
    const cloned: UserModulePermissions = {};
    for (const [k, v] of Object.entries(p.permissions || {})) cloned[k] = [...(v as PermissionAction[])];
    onPermissionsChange(cloned);
  };

  const openCreatePreset = () => {
    setEditingPreset(null); setPresetName(''); setOverwritePerms(true); setPresetError(''); setShowPresetModal(true);
  };
  const openEditPreset = (p: CustomPreset) => {
    setEditingPreset(p); setPresetName(p.name); setOverwritePerms(false); setPresetError(''); setShowPresetModal(true);
  };

  const savePreset = async () => {
    if (!presetName.trim()) { setPresetError('Vui lòng nhập tên mẫu'); return; }
    setSavingPreset(true); setPresetError('');
    try {
      if (editingPreset) {
        // Sửa: đổi tên + (tùy chọn) ghi đè quyền bằng lựa chọn hiện tại
        const body: any = { name: presetName.trim() };
        if (overwritePerms) body.permissions = permissions;
        const res = await fetch(`/api/permission-presets/${editingPreset.id}`, {
          method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Lưu thất bại');
        setPresetList(prev => prev.map(x => x.id === json.data.id ? json.data : x));
      } else {
        // Tạo mới từ lựa chọn hiện tại
        const res = await fetch('/api/permission-presets', {
          method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: presetName.trim(), permissions }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Lưu thất bại');
        await loadPresets();
      }
      setShowPresetModal(false); setPresetName(''); setEditingPreset(null);
    } catch (e: any) { setPresetError(e.message || 'Lỗi server'); }
    finally { setSavingPreset(false); }
  };

  const deletePreset = async (p: CustomPreset) => {
    const ok = await confirm({
      title: 'Xóa quyền mẫu?',
      message: `Xóa quyền mẫu "${p.name}"? Hành động này không thể hoàn tác.`,
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/permission-presets/${p.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        setPresetList(prev => prev.filter(x => x.id !== p.id));
        toast.success('Đã xóa quyền mẫu');
      } else {
        toast.error('Xóa quyền mẫu thất bại');
      }
    } catch { toast.error('Lỗi kết nối, thử lại sau'); }
  };

  const restoreDefaults = async () => {
    setRestoring(true);
    try {
      const res = await fetch('/api/permission-presets/restore-defaults', { method: 'POST', headers: authHeaders() });
      const json = await res.json();
      if (json.success) setPresetList(json.data);
    } catch { /* noop */ }
    finally { setRestoring(false); }
  };

  // ── Sao chép quyền từ người khác ─────────────────────────────────────────────
  const openCopy = async () => {
    setCopyOpen(o => !o);
    if (copyUsers.length === 0 && !copyLoading) {
      setCopyLoading(true);
      try {
        const res = await fetch('/api/users', { headers: authHeaders() });
        const json = await res.json();
        const list: any[] = Array.isArray(json) ? json : json.data || [];
        setCopyUsers(
          list
            .filter(u => u.module_permissions && Object.keys(u.module_permissions).length > 0)
            .map(u => ({ id: u.id, name: u.name, role: u.role, module_permissions: u.module_permissions }))
        );
      } catch { setCopyUsers([]); }
      finally { setCopyLoading(false); }
    }
  };

  const applyCopy = (u: CopyUser) => {
    if (isReadOnly || !u.module_permissions) return;
    const cloned: UserModulePermissions = {};
    for (const [k, v] of Object.entries(u.module_permissions)) cloned[k] = [...(v as PermissionAction[])];
    onPermissionsChange(cloned);
    setCopyOpen(false);
    setCopySearch('');
  };

  // ── Thống kê (tính cả module con) ───────────────────────────────────────────
  const stats = useMemo(() => {
    const units = getAllPermissionUnits();
    const totalPerms = units.reduce((t, u) => t + ((permissions[u.id] || []).length), 0);
    const unitsWith = units.filter(u => (permissions[u.id] || []).length > 0).length;
    return { totalPerms, unitsWith, total: units.length, empty: units.length - unitsWith };
  }, [permissions]);

  // ── Lọc theo tìm kiếm, gom theo nhóm (giữ module nếu mẹ HOẶC con khớp) ───────
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pick = (id: string) => {
      const m = MODULES.find(mm => mm.id === id);
      if (!m) return null;
      if (!q) return m;
      const inParent = m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
      const inChild = (m.children || []).some(c => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
      return inParent || inChild ? m : null;
    };
    // BMHS chỉ hiện khi chỉnh super_admin (kín đáo, các vai trò khác không dùng được).
    const isSA = targetRole === 'super_admin';
    return GROUPS.map(g => ({
      ...g,
      moduleIds: g.id === 'admin' && isSA ? [...g.moduleIds, 'bmhs'] : g.moduleIds,
    })).map(g => ({
      ...g,
      modules: g.moduleIds.map(pick).filter(Boolean) as typeof MODULES,
    })).filter(g => g.modules.length > 0);
  }, [search, targetRole]);

  const filteredCopyUsers = useMemo(() => {
    const q = normalizeVN(copySearch).trim();
    if (!q) return copyUsers;
    return copyUsers.filter(u => normalizeVN(u.name).includes(q) || normalizeVN(u.role).includes(q));
  }, [copyUsers, copySearch]);

  // ── Render 1 dòng ma trận (dùng cho cả mẹ & con) ────────────────────────────
  const renderMatrixRow = (
    unit: { id: string; name: string; icon?: string; description: string; permissions: { action: PermissionAction }[]; color?: string },
    isChild: boolean
  ) => {
    const unitPerms = permissions[unit.id] || [];
    const supported = new Set(unit.permissions.map(p => p.action));
    const hasAll = unit.permissions.every(p => unitPerms.includes(p.action));
    const hasAny = unitPerms.length > 0;
    return (
      <tr key={unit.id} className={`border-t border-line-subtle hover:bg-white/[0.02] transition-colors ${isChild ? 'bg-white/[0.012]' : ''}`}>
        <td className={`px-3 py-2 ${isChild ? 'pl-8' : ''}`}>
          <div className="flex items-center gap-2.5">
            {isChild && <CornerDownRight size={13} className="text-muted-foreground/40 shrink-0" />}
            <div className={`${isChild ? 'w-6 h-6 text-sm' : 'w-8 h-8 text-base'} rounded-lg flex items-center justify-center shrink-0`}
              style={{ backgroundColor: `${unit.color || '#64748B'}20` }}>
              {unit.icon}
            </div>
            <div className="min-w-0">
              <p className={`${isChild ? 'text-2xs' : 'text-xs'} font-600 text-foreground truncate`}>{unit.name}</p>
              <p className="text-2xs text-muted-foreground truncate">{unit.description}</p>
            </div>
          </div>
        </td>
        {ACTIONS.map(a => {
          const isSup = supported.has(a.action);
          const on = unitPerms.includes(a.action);
          return (
            <td key={a.action} className="px-1 py-2 text-center">
              {isSup ? (
                <button type="button" onClick={() => togglePermission(unit.id, a.action)} disabled={isReadOnly}
                  className={`w-6 h-6 rounded-md border inline-flex items-center justify-center transition-colors disabled:opacity-60 ${
                    on ? 'bg-indigo-500/25 border-indigo-500/50 text-indigo-300' : 'border-line text-transparent hover:border-white/25 hover:bg-hover'
                  }`}>
                  <Check size={13} strokeWidth={3} />
                </button>
              ) : (
                <span className="text-white/10 text-xs select-none">–</span>
              )}
            </td>
          );
        })}
        <td className="px-2 py-2 text-center">
          <button type="button" onClick={() => toggleUnitAll(unit.id, unit.permissions)} disabled={isReadOnly}
            className={`px-2 py-1 rounded-md text-2xs font-600 transition-colors disabled:opacity-60 ${
              hasAll ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : hasAny ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
              : 'bg-hover text-muted-foreground border border-line hover:bg-hover-strong'
            }`}>
            {hasAll ? 'Tất cả' : hasAny ? 'Một số' : 'Không'}
          </button>
        </td>
      </tr>
    );
  };

  // ── Render 1 thẻ mobile (dùng cho cả mẹ & con) ──────────────────────────────
  const renderMobileUnit = (
    unit: { id: string; name: string; icon?: string; permissions: { action: PermissionAction; label?: string }[]; color?: string },
    isChild: boolean
  ) => {
    const unitPerms = permissions[unit.id] || [];
    const hasAll = unit.permissions.every(p => unitPerms.includes(p.action));
    return (
      <div key={unit.id} className={`rounded-xl border border-line p-3 ${isChild ? 'ml-4' : ''}`} style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {isChild && <CornerDownRight size={13} className="text-muted-foreground/40 shrink-0" />}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ backgroundColor: `${unit.color || '#64748B'}20` }}>
              {unit.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-600 text-foreground truncate">{unit.name}</p>
              <p className="text-2xs text-muted-foreground">{unitPerms.length}/{unit.permissions.length} quyền</p>
            </div>
          </div>
          <button type="button" onClick={() => toggleUnitAll(unit.id, unit.permissions)} disabled={isReadOnly}
            className={`shrink-0 px-2 py-1 rounded-md text-2xs font-600 transition-colors disabled:opacity-60 ${
              hasAll ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-hover text-muted-foreground border border-line'
            }`}>
            {hasAll ? 'Tất cả' : 'Chọn'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {unit.permissions.map(p => {
            const meta = ACTIONS.find(a => a.action === p.action);
            const on = unitPerms.includes(p.action);
            return (
              <button key={p.action} type="button" onClick={() => togglePermission(unit.id, p.action)} disabled={isReadOnly}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-2xs font-600 transition-colors disabled:opacity-60 ${
                  on ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'border-line text-muted-foreground hover:bg-hover'
                }`}>
                {on && <Check size={11} strokeWidth={3} />} {meta?.short || p.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Thanh công cụ ────────────────────────────────────────────────────── */}
      {!isReadOnly && (
        <div className="rounded-xl border border-line bg-white/[0.02] p-3 space-y-2.5">

          {/* Row 1: Quyền mẫu chips */}
          <div>
            <p className="text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-2">Quyền mẫu</p>
            <div className="flex flex-wrap gap-1.5">
              {presetList.map(p => {
                const st = p.is_system ? (PRESET_STYLE[p.name] || CUSTOM_PRESET_STYLE) : CUSTOM_PRESET_STYLE;
                return (
                  <span key={p.id} className={`group inline-flex items-center rounded-lg border overflow-hidden ${st.cls}`}>
                    <button type="button" onClick={() => applyPreset(p)} title={p.description || `Áp dụng mẫu "${p.name}"`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-600 hover:bg-hover-strong transition-colors">
                      {st.icon} {p.name}
                    </button>
                    <button type="button" onClick={() => openEditPreset(p)} title="Sửa mẫu"
                      className="px-1.5 py-1.5 opacity-50 hover:opacity-100 hover:bg-hover-strong transition-all border-l border-white/15">
                      <Pencil size={11} />
                    </button>
                    <button type="button" onClick={() => deletePreset(p)} title="Xóa mẫu"
                      className="px-1.5 py-1.5 opacity-50 hover:opacity-100 hover:text-red-300 hover:bg-red-500/10 transition-all border-l border-white/15">
                      <Trash2 size={11} />
                    </button>
                  </span>
                );
              })}
              <button type="button" onClick={openCreatePreset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:border-violet-500/40 transition-colors">
                <Save size={13} /> Lưu mẫu
              </button>
            </div>
          </div>

          {/* Row 1b: Quyền mặc định theo vai trò */}
          <div className="pt-0.5 border-t border-line-subtle">
            <button type="button" onClick={() => { setShowRoleTemplates(o => !o); if (!showRoleTemplates) loadRoleTemplates(); }}
              className="inline-flex items-center gap-1.5 text-2xs font-600 text-muted-foreground hover:text-foreground transition-colors">
              <Settings2 size={13} />
              Quyền mặc định theo vai trò
              <ChevronDown size={12} className={`transition-transform ${showRoleTemplates ? 'rotate-180' : ''}`} />
            </button>

            {showRoleTemplates && (
              <div className="mt-2.5 rounded-xl border border-line overflow-hidden" style={{ background: 'var(--background)' }}>
                {/* Tabs */}
                <div className="flex border-b border-line">
                  {ROLE_TABS.map(t => (
                    <button key={t.role} type="button" onClick={() => setActiveRoleTab(t.role)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-600 transition-colors border-b-2 ${
                        activeRoleTab === t.role
                          ? 'border-indigo-500 text-indigo-300'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>

                {rolePermsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    {/* Mini ma trận cho role đang chọn */}
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full min-w-[420px] text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-line">
                            <th className="sticky top-0 z-10 px-3 py-2 text-left text-2xs font-600 text-muted-foreground w-40 border-b border-line" style={{ background: 'var(--card)' }}>Module</th>
                            {ACTIONS.map(a => (
                              <th key={a.action} className={`sticky top-0 z-10 px-1 py-2 text-center text-2xs font-600 ${a.color} w-10 border-b border-line`} style={{ background: 'var(--card)' }}>{a.short}</th>
                            ))}
                            <th className="sticky top-0 z-10 px-2 py-2 w-14 border-b border-line" style={{ background: 'var(--card)' }} />
                          </tr>
                        </thead>
                        <tbody>
                          {MODULES.flatMap(m => [
                            { id: m.id, name: m.name, permissions: m.permissions, isChild: false },
                            ...(m.children || []).map(c => ({ id: c.id, name: c.name, permissions: c.permissions, isChild: true })),
                          ]).map(unit => {
                            const cur = rolePerms[activeRoleTab][unit.id] || [];
                            const supported = new Set(unit.permissions.map(p => p.action));
                            const hasAll = unit.permissions.every(p => cur.includes(p.action));
                            const hasAny = cur.length > 0;
                            return (
                              <tr key={unit.id} className={`border-t border-line-subtle hover:bg-white/[0.02] ${unit.isChild ? 'bg-white/[0.012]' : ''}`}>
                                <td className={`px-3 py-1.5 ${unit.isChild ? 'pl-7' : ''}`}>
                                  <div className="flex items-center gap-1.5">
                                    {unit.isChild && <CornerDownRight size={11} className="text-muted-foreground/40 shrink-0" />}
                                    <p className={`text-2xs ${unit.isChild ? 'font-400 text-muted-foreground' : 'font-600 text-foreground'} truncate`}>{unit.name}</p>
                                  </div>
                                </td>
                                {ACTIONS.map(a => {
                                  const isSup = supported.has(a.action);
                                  const on = cur.includes(a.action);
                                  return (
                                    <td key={a.action} className="px-1 py-1.5 text-center">
                                      {isSup ? (
                                        <button type="button" onClick={() => toggleRolePerm(unit.id, a.action)}
                                          className={`w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors ${
                                            on ? 'bg-indigo-500/25 border-indigo-500/50 text-indigo-300' : 'border-line text-transparent hover:border-white/25 hover:bg-hover'
                                          }`}>
                                          <Check size={11} strokeWidth={3} />
                                        </button>
                                      ) : (
                                        <span className="text-white/10 text-xs">–</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-1.5 text-center">
                                  <button type="button" onClick={() => toggleRoleUnitAll(unit.id, unit.permissions)}
                                    className={`px-1.5 py-0.5 rounded text-2xs font-600 transition-colors ${
                                      hasAll ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      : hasAny ? 'bg-blue-500/15 text-blue-300 border border-blue-500/25'
                                      : 'bg-hover text-muted-foreground border border-line hover:bg-hover-strong'
                                    }`}>
                                    {hasAll ? 'All' : hasAny ? '...' : '—'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-line">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={applyRoleTemplateToUser}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-600 text-foreground hover:bg-hover transition-colors">
                          <Copy size={12} /> Áp dụng cho người dùng này
                        </button>
                        <button type="button" onClick={() => { setApplyAllResult(null); setShowApplyAllConfirm(true); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-600 text-amber-200 hover:bg-amber-500/20 transition-colors">
                          <Users2 size={12} /> Áp dụng cho tất cả người dùng
                        </button>
                      </div>
                      <button type="button" onClick={saveRoleTemplate} disabled={rolePermsSaving}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-600 transition-colors disabled:opacity-50 ${
                          rolePermsSaved ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300' : 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/50'
                        }`}>
                        {rolePermsSaving ? <Loader2 size={12} className="animate-spin" /> : rolePermsSaved ? <Check size={12} strokeWidth={3} /> : <Save size={12} />}
                        {rolePermsSaved ? 'Đã lưu' : 'Lưu mẫu vai trò'}
                      </button>
                    </div>

                    {applyAllResult && (
                      <div className={`flex items-center gap-1.5 px-3 py-2 text-xs font-500 border-t border-line ${
                        applyAllResult.ok ? 'text-emerald-300' : 'text-red-300'
                      }`}>
                        {applyAllResult.ok ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={13} />}
                        {applyAllResult.msg}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Row 2: Action buttons + Xóa hết */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-line-subtle">
            <button type="button" onClick={restoreDefaults} disabled={restoring}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50">
              {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              <span className="hidden sm:inline">Khôi phục mẫu gốc</span>
              <span className="sm:hidden">Khôi phục</span>
            </button>

            <div className="relative">
              <button type="button" onClick={openCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-600 text-foreground hover:bg-hover transition-colors">
                <Copy size={13} />
                <span className="hidden sm:inline">Sao chép từ người khác</span>
                <span className="sm:hidden">Sao chép</span>
                <ChevronDown size={12} className={`transition-transform ${copyOpen ? 'rotate-180' : ''}`} />
              </button>
              {copyOpen && (
                <div className="absolute left-0 z-20 mt-1.5 w-72 rounded-xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
                  <div className="p-2 border-b border-line-subtle">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input value={copySearch} onChange={e => setCopySearch(e.target.value)} placeholder="Tìm người dùng..."
                        className="w-full h-8 pl-8 pr-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {copyLoading ? (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">Đang tải...</p>
                    ) : filteredCopyUsers.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">Không có người dùng nào có quyền để sao chép.</p>
                    ) : (
                      filteredCopyUsers.map(u => {
                        const count = Object.values(u.module_permissions || {}).reduce((t, p) => t + (p?.length || 0), 0);
                        return (
                          <button key={u.id} type="button" onClick={() => applyCopy(u)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-hover transition-colors">
                            <div className="min-w-0">
                              <p className="text-xs font-500 text-foreground truncate">{u.name}</p>
                              <p className="text-2xs text-muted-foreground">{u.role} · {count} quyền</p>
                            </div>
                            <Copy size={13} className="text-muted-foreground shrink-0" />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-600 text-muted-foreground hover:text-red-300 hover:border-red-500/30 hover:bg-red-500/10 transition-colors ml-auto">
              <X size={13} /> Xóa hết
            </button>
          </div>

          {/* Row 3: Search + stats */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5 border-t border-line-subtle">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm module..."
                className="w-full h-9 pl-8 pr-8 rounded-lg text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-2xs shrink-0">
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-1 text-indigo-300 font-600">
                <ShieldCheck size={12} /> {stats.totalPerms} quyền
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-hover px-2 py-1 text-muted-foreground font-600">
                <Users2 size={12} /> {stats.unitsWith}/{stats.total} mục
              </span>
              {stats.empty > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-300/80 font-600">
                  <AlertTriangle size={12} /> {stats.empty}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {visibleGroups.length === 0 && (
        <p className="text-center py-8 text-xs text-muted-foreground">Không tìm thấy module khớp &quot;{search}&quot;.</p>
      )}

      {/* ── DESKTOP: ma trận module × hành động (mẹ + con thụt cấp) ───────────── */}
      <div className="hidden md:block space-y-5">
        {visibleGroups.map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xs font-700 text-muted-foreground uppercase tracking-wider">{group.label}</span>
              <span className="text-2xs text-muted-foreground/50">({group.modules.length})</span>
              <div className="h-px flex-1 bg-hover" />
            </div>
            <div className="rounded-xl border border-line">
              <table className="w-full border-collapse [&>tbody>tr:last-child>td:first-child]:rounded-bl-xl [&>tbody>tr:last-child>td:last-child]:rounded-br-xl">
                <thead>
                  <tr className="sticky top-0 z-10 bg-white/[0.03]" style={{ backdropFilter: 'blur(4px)' }}>
                    <th className="text-left px-3 py-2.5 text-2xs font-600 text-muted-foreground uppercase tracking-wider w-[34%] rounded-tl-xl" style={{ background: 'var(--card)' }}>Module</th>
                    {ACTIONS.map(a => (
                      <th key={a.action} className="px-1 py-2 text-center" style={{ background: 'var(--card)' }}>
                        <button type="button" onClick={() => toggleActionColumn(a.action)} disabled={isReadOnly}
                          title={`Bật/tắt "${a.full}" cho mọi mục`}
                          className={`text-2xs font-600 ${a.color} hover:underline disabled:no-underline disabled:opacity-60`}>
                          {a.short}
                        </button>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center text-2xs font-600 text-muted-foreground w-[60px] rounded-tr-xl" style={{ background: 'var(--card)' }}>Tất cả</th>
                  </tr>
                </thead>
                <tbody>
                  {group.modules.map(module => (
                    <React.Fragment key={module.id}>
                      {renderMatrixRow({ ...module, color: module.color }, false)}
                      {(module.children || []).map((child: ModuleChild) => renderMatrixRow({ ...child, color: module.color }, true))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* ── MOBILE: thẻ chip xếp dọc (mẹ + con thụt lề) ──────────────────────── */}
      <div className="md:hidden space-y-4">
        {visibleGroups.map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xs font-700 text-muted-foreground uppercase tracking-wider">{group.label}</span>
              <div className="h-px flex-1 bg-hover" />
            </div>
            <div className="space-y-2">
              {group.modules.map(module => (
                <React.Fragment key={module.id}>
                  {renderMobileUnit({ ...module, color: module.color }, false)}
                  {(module.children || []).map((child: ModuleChild) => renderMobileUnit({ ...child, color: module.color }, true))}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal: Lưu bộ quyền hiện tại thành mẫu ───────────────────────────── */}
      {showPresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-3.5">
              <h2 className="text-sm font-700 text-foreground flex items-center gap-2">
                {editingPreset ? <Pencil size={15} className="text-violet-400" /> : <Bookmark size={15} className="text-violet-400" />}
                {editingPreset ? 'Sửa Quyền Mẫu' : 'Lưu Quyền Mẫu'}
              </h2>
              <button type="button" onClick={() => setShowPresetModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-3">
              {!editingPreset && (
                <p className="text-xs text-muted-foreground">
                  Lưu lại toàn bộ quyền đang chọn ({stats.totalPerms} quyền) thành một mẫu để áp dụng nhanh cho người dùng khác.
                </p>
              )}
              <div>
                <label className="text-2xs font-600 text-muted-foreground uppercase tracking-wider block mb-1.5">Tên mẫu</label>
                <input value={presetName} onChange={e => setPresetName(e.target.value)} autoFocus
                  placeholder="VD: Nhân viên Kế toán, Trưởng phòng HCNS..."
                  onKeyDown={e => { if (e.key === 'Enter') savePreset(); }}
                  className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-violet-500/60" />
              </div>
              {editingPreset && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={overwritePerms} onChange={e => setOverwritePerms(e.target.checked)} className="mt-0.5 accent-violet-600" />
                  <span>Cập nhật quyền của mẫu theo lựa chọn hiện tại trong bảng ({stats.totalPerms} quyền). Bỏ chọn nếu chỉ đổi tên.</span>
                </label>
              )}
              {presetError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400"><AlertTriangle size={13} /> {presetError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line-subtle px-5 py-3.5">
              <button type="button" onClick={() => setShowPresetModal(false)} className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-hover">Hủy</button>
              <button type="button" onClick={savePreset} disabled={savingPreset || !presetName.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 px-3 py-1.5 text-sm font-600 text-white disabled:opacity-50">
                {savingPreset && <Loader2 size={14} className="animate-spin" />} {editingPreset ? 'Lưu thay đổi' : 'Lưu mẫu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Xác nhận áp dụng mẫu vai trò cho TẤT CẢ người dùng ──────────── */}
      {showApplyAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
            <div className="flex items-center justify-between border-b border-line-subtle px-5 py-3.5">
              <h2 className="text-sm font-700 text-foreground flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-400" /> Xác Nhận Áp Dụng
              </h2>
              <button type="button" onClick={() => setShowApplyAllConfirm(false)} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-hover"><X size={15} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bạn có chắc muốn <span className="font-700 text-amber-300">ghi đè quyền</span> của <span className="font-700 text-foreground">tất cả người dùng</span> đang có vai trò{' '}
                <span className="font-700 text-foreground">{ROLE_TABS.find(t => t.role === activeRoleTab)?.label}</span> bằng mẫu hiện tại không?
              </p>
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-2xs text-amber-200/90">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Quyền tùy chỉnh riêng của từng người trong nhóm này sẽ bị thay thế. Hành động không thể hoàn tác.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-line-subtle px-5 py-3.5">
              <button type="button" onClick={() => setShowApplyAllConfirm(false)} disabled={applyingAll}
                className="rounded-xl px-3 py-1.5 text-sm text-muted-foreground hover:bg-hover disabled:opacity-50">Hủy</button>
              <button type="button" onClick={applyRoleTemplateToAllUsers} disabled={applyingAll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-sm font-600 text-white disabled:opacity-50">
                {applyingAll ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                {applyingAll ? 'Đang áp dụng...' : 'Xác nhận áp dụng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

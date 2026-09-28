'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Building2, FolderOpen, Layers, Users, Crown, ImagePlus, X, AlertTriangle, Eye, EyeOff, RotateCcw, Copy, CornerDownRight, Loader2 } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { getCurrentUser } from '@/lib/authStore';
import OrgTagPicker, { OrgTagOption } from './OrgTagPicker';
import { normalizeVN as normVN } from '@/lib/utils/searchVN';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

interface OrgTagAssignment {
  id: string;
  tag_id: string;
  company_id: string | null;
  department_id: string | null;
  sub_department_id: string | null;
  name: string;
  color: string;
}

type LogoVariant = 'full_light' | 'full_dark' | 'icon' | 'print';

// Form công ty rỗng — dùng lại cho khởi tạo & mọi lần reset (thêm trường = sửa 1 chỗ)
const EMPTY_COMPANY_FORM = {
  name: '', code: '', slug: '', description: '',
  logo_url: '', website_url: '',
  business_name: '', tax_code: '', legal_representative: '',
  address: '', invoice_address: '', phone: '', email: '', website: '',
  // Thông tin tra cứu masothue.com
  tax_address: '', status: '', international_name: '', short_name: '',
  activation_date: '', managing_tax_office: '', business_type: '',
  main_business_line: '', business_lines: '',
};
// Class input dùng chung trong form công ty
const FIELD_CLS = 'w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto';

interface CompanyGroupRow {
  id: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

interface Company {
  id: string;
  name: string;
  code?: string;
  slug?: string;
  description?: string;
  logo_url?: string;
  logo_urls?: Partial<Record<LogoVariant, string>>;
  website_url?: string;
  business_name?: string;
  tax_code?: string;
  address?: string;
  website?: string;
  invoice_address?: string;
  legal_representative?: string;
  phone?: string;
  email?: string;
  tax_address?: string;
  status?: string;
  international_name?: string;
  short_name?: string;
  activation_date?: string;
  managing_tax_office?: string;
  business_type?: string;
  main_business_line?: string;
  business_lines?: string;
  group_id?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Department {
  id: string;
  company_id: string;
  name: string;
  code?: string;
  description?: string;
  head_id?: string;
  budget?: number;
  parent_department_id?: string;
  display_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface SubDepartment {
  id: string;
  department_id: string;
  name: string;
  code?: string;
  description?: string;
  head_id?: string;
  budget?: number;
  parent_sub_department_id?: string;
  display_order?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  job_title: string;
  manager_id: string | null;
  manager_name: string | null;
  /** Vai trò tại đơn vị (API mới) — có thể undefined với dữ liệu cũ */
  org_role?: 'head' | 'deputy' | 'assistant' | 'member';
  /** true = phân công kiêm nhiệm (không phải phân công chính) */
  is_concurrent?: boolean;
}

interface SubDeptData {
  id: string;
  name: string;
  total_users: number;
  staff: StaffMember[];
  head: StaffMember | null;
}

interface DepartmentData {
  id: string;
  name: string;
  total_users: number;
  department_level_users: number;
  department_level_staff: StaffMember[];
  head: StaffMember | null;
  sub_departments: SubDeptData[];
}

interface CompanyData {
  id: string;
  name: string;
  total_users: number;
  company_level_users: number;
  company_level_staff: StaffMember[];
  head: StaffMember | null;
  departments: DepartmentData[];
}

interface PersonnelStructure {
  companies: CompanyData[];
}

/** User đủ điều kiện gán Trưởng đơn vị (đã có phân công active tại công ty). */
interface AssignableUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  position_name?: string;
  department_name?: string;
}

/**
 * Ô chọn "Người đứng đầu" dạng combobox CÓ TÌM KIẾM (tên/email, không dấu).
 * Quy tắc "Phân công trước, gán chức sau": chỉ liệt kê user ĐÃ có phân công
 * active tại công ty (prop `users`). `fallbackUsers` dùng để hiển thị head_id
 * cũ (dữ liệu trước khi xiết) kèm badge "Chưa có phân công".
 */
function HeadPicker({
  value, onChange, users, fallbackUsers, loading,
}: {
  value: string;
  onChange: (v: string) => void;
  users: AssignableUser[];
  fallbackUsers: { id: string; name: string; email?: string }[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // head_id hiện tại KHÔNG nằm trong danh sách phân công → vẫn hiện (dữ liệu cũ)
  const legacy: AssignableUser | null =
    value && !users.some((u) => u.id === value)
      ? (fallbackUsers.find((u) => u.id === value) || { id: value, name: 'Người dùng không xác định' })
      : null;
  const selected = users.find((u) => u.id === value) || legacy;
  const nq = normVN(q.trim());
  const filtered = (nq
    ? users.filter((u) => normVN(u.name).includes(nq) || normVN(u.email || '').includes(nq))
    : users
  ).slice(0, 50);
  const isEmpty = !loading && users.length === 0;

  return (
    <div>
      <label className="block text-2xs sm:text-xs font-600 text-muted-foreground mb-1.5">
        Người đứng đầu <span className="font-400 normal-case text-muted-foreground/60">(tùy chọn)</span>
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-line text-sm text-left outline-none focus:border-indigo-500"
        >
          {selected ? (
            <span className="flex items-center gap-1.5 text-foreground truncate">
              <span className="truncate">{`${selected.name}${selected.email ? ` (${selected.email})` : ''}`}</span>
              {legacy && (
                <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-600 bg-amber-500/15 text-amber-300 border border-amber-500/25">
                  Chưa có phân công
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400/70 truncate">
              <AlertTriangle size={13} className="shrink-0" />
              <span className="truncate">— Chưa gán trưởng đơn vị —</span>
            </span>
          )}
          <ChevronDown size={15} className="text-muted-foreground shrink-0" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQ(''); }} />
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-line bg-surface-2 shadow-xl overflow-hidden">
              {!isEmpty && !loading && (
                <div className="p-2 border-b border-line-subtle">
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm theo tên hoặc email…"
                    className="w-full px-2.5 py-1.5 rounded-md bg-black/30 border border-line text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-indigo-500"
                  />
                </div>
              )}
              <div className="max-h-56 overflow-y-auto py-1">
                {loading ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">Đang tải danh sách phân công…</p>
                ) : (
                  <>
                    {(!isEmpty || legacy) && (
                      <button
                        type="button"
                        onClick={() => { onChange(''); setOpen(false); setQ(''); }}
                        className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-xs text-amber-400/70 hover:bg-hover"
                      >
                        <AlertTriangle size={12} className="shrink-0" />
                        — Chưa gán trưởng đơn vị —
                      </button>
                    )}
                    {/* head_id cũ chưa có phân công — giữ ở đầu list để không mất dữ liệu */}
                    {legacy && (
                      <button
                        type="button"
                        onClick={() => { onChange(legacy.id); setOpen(false); setQ(''); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-hover ${legacy.id === value ? 'bg-indigo-500/10 text-indigo-300' : 'text-foreground'}`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{legacy.name}</span>
                          <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-600 bg-amber-500/15 text-amber-300 border border-amber-500/25">
                            Chưa có phân công
                          </span>
                        </span>
                        {legacy.email && <span className="block text-2xs text-muted-foreground/70 truncate">{legacy.email}</span>}
                      </button>
                    )}
                    {filtered.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { onChange(u.id); setOpen(false); setQ(''); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-hover ${u.id === value ? 'bg-indigo-500/10 text-indigo-300' : 'text-foreground'}`}
                      >
                        <span className="block truncate">{u.name}</span>
                        {(u.position_name || u.department_name) && (
                          <span className="block text-2xs text-indigo-300/70 truncate">
                            {[u.position_name, u.department_name].filter(Boolean).join(' — ')}
                          </span>
                        )}
                        {u.email && <span className="block text-2xs text-muted-foreground/70 truncate">{u.email}</span>}
                      </button>
                    ))}
                    {isEmpty ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-xs text-muted-foreground">Chưa có ai được phân công tại công ty này</p>
                        <p className="text-2xs text-muted-foreground/60 mt-1 leading-relaxed">
                          Thêm phân công trong hồ sơ người dùng (tab Phân Công) trước, người đó sẽ xuất hiện ở đây.
                        </p>
                      </div>
                    ) : filtered.length === 0 && !legacy ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground text-center">Không tìm thấy</p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <p className="mt-1.5 text-2xs sm:text-xs text-muted-foreground/70 leading-relaxed">
        Trưởng đơn vị dùng cho sơ đồ tổ chức, bảng công và duyệt yêu cầu. Đơn vị chưa gán trưởng sẽ được liệt kê ở trang{' '}
        <Link href="/organization/suc-khoe-to-chuc" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
          Sức Khoẻ Tổ Chức
        </Link>.
      </p>
    </div>
  );
}

/**
 * Bộ chọn vai trò đơn vị nhiều người (Phó / Trợ lý) — multi-select kiểu chips
 * từ cùng nguồn assignable-users. `blocked` = user đang giữ vai trò khác cùng
 * đơn vị → disable kèm badge lý do (một người không giữ 2 vai trò cùng đơn vị).
 */
function RoleMultiPicker({
  label, emptyLabel, helpText, selected, onChange, users, blocked, loading,
}: {
  label: string;
  emptyLabel: string;
  helpText: string;
  selected: AssignableUser[];
  onChange: (list: AssignableUser[]) => void;
  users: AssignableUser[];
  blocked: { id: string; reason: string }[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState('');
  const nq = normVN(q.trim());

  // Mở LÊN nếu dưới nút không đủ chỗ (tránh bị cắt ở đáy modal cuộn).
  const toggleOpen = () => {
    setOpen(o => {
      if (!o) {
        const r = btnRef.current?.getBoundingClientRect();
        setDropUp(!!r && (window.innerHeight - r.bottom) < 300 && r.top > 300);
      }
      return !o;
    });
  };
  const filtered = (nq
    ? users.filter((u) => normVN(u.name).includes(nq) || normVN(u.email || '').includes(nq))
    : users
  ).slice(0, 50);
  const isEmpty = !loading && users.length === 0;
  const selectedIds = new Set(selected.map((s) => s.id));
  const blockedMap = new Map(blocked.map((b) => [b.id, b.reason]));

  const remove = (id: string) => onChange(selected.filter((s) => s.id !== id));
  const add = (u: AssignableUser) => {
    if (!selectedIds.has(u.id)) onChange([...selected, u]);
    setQ('');
  };

  return (
    <div>
      <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-1.5">
        {label} <span className="font-400 normal-case text-muted-foreground/60">(tùy chọn)</span>
      </label>
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={toggleOpen}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-line text-sm text-left outline-none focus:border-indigo-500"
        >
          {selected.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5 min-w-0">
              {selected.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-600 bg-sky-500/15 text-sky-300 border border-sky-500/25 max-w-full"
                >
                  <span className="truncate">{s.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    title="Gỡ"
                    onClick={(e) => { e.stopPropagation(); remove(s.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); remove(s.id); } }}
                    className="shrink-0 rounded-full hover:bg-sky-500/25 p-0.5"
                  >
                    <X size={10} />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground/60 truncate">{emptyLabel}</span>
          )}
          <ChevronDown size={15} className="text-muted-foreground shrink-0" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQ(''); }} />
            <div className={`absolute z-50 w-full rounded-lg border border-line bg-surface-2 shadow-xl overflow-hidden ${dropUp ? 'bottom-full mb-1' : 'mt-1'}`}>
              {!isEmpty && !loading && (
                <div className="p-2 border-b border-line-subtle">
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm theo tên hoặc email…"
                    className="w-full px-2.5 py-1.5 rounded-md bg-black/30 border border-line text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-indigo-500"
                  />
                </div>
              )}
              <div className="max-h-56 overflow-y-auto py-1">
                {loading ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground text-center">Đang tải danh sách phân công…</p>
                ) : isEmpty ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">Chưa có ai được phân công tại công ty này</p>
                    <p className="text-2xs text-muted-foreground/60 mt-1 leading-relaxed">
                      Thêm phân công trong hồ sơ người dùng (tab Phân Công) trước, người đó sẽ xuất hiện ở đây.
                    </p>
                  </div>
                ) : (
                  <>
                    {filtered.map((u) => {
                      const blockedReason = blockedMap.get(u.id);
                      const isBlocked = !!blockedReason;
                      const isPicked = selectedIds.has(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          disabled={isBlocked}
                          onClick={() => (isPicked ? remove(u.id) : add(u))}
                          className={`w-full text-left px-3 py-2 text-sm ${
                            isBlocked
                              ? 'opacity-40 cursor-not-allowed text-muted-foreground'
                              : isPicked
                                ? 'bg-sky-500/10 text-sky-300 hover:bg-hover'
                                : 'text-foreground hover:bg-hover'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{u.name}</span>
                            {isBlocked && (
                              <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-600 bg-amber-500/15 text-amber-300">
                                {blockedReason}
                              </span>
                            )}
                            {isPicked && !isBlocked && (
                              <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-600 bg-sky-500/15 text-sky-300">
                                Đã chọn
                              </span>
                            )}
                          </span>
                          {(u.position_name || u.department_name) && (
                            <span className="block text-2xs text-indigo-300/70 truncate">
                              {[u.position_name, u.department_name].filter(Boolean).join(' — ')}
                            </span>
                          )}
                          {u.email && <span className="block text-2xs text-muted-foreground/70 truncate">{u.email}</span>}
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <p className="px-3 py-3 text-xs text-muted-foreground text-center">Không tìm thấy</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <p className="mt-1.5 text-2xs sm:text-xs text-muted-foreground/70 leading-relaxed">{helpText}</p>
    </div>
  );
}

export default function OrganizationStructureManagement() {
  const toast = useToast();
  const confirm = useConfirm();
  const currentUser = getCurrentUser();

  // State
  const [companies, setCompanies] = useState<Company[]>([]);
  // Nhóm/Tập đoàn/HĐQT — tầng TRÊN công ty (thuần gom/hiển thị)
  const [groups, setGroups] = useState<CompanyGroupRow[]>([]);
  const [manageGroups, setManageGroups] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subDepartments, setSubDepartments] = useState<SubDepartment[]>([]);
  // Chuyển phòng ban → bộ phận (đưa nguyên cụm xuống 1 cấp).
  const [convertDept, setConvertDept] = useState<{ id: string; name: string; company_id: string } | null>(null);
  const [convertTarget, setConvertTarget] = useState('');
  const [converting, setConverting] = useState(false);
  // Chuyển bộ phận sang phòng ban khác (đưa nguyên cụm sang phòng ban cha khác).
  const [moveSub, setMoveSub] = useState<{ id: string; name: string; department_id: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [movingSub, setMovingSub] = useState(false);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Dữ liệu nhân sự (số người + danh sách staff) — gộp vào cây tổ chức bên dưới.
  const [personnelStructure, setPersonnelStructure] = useState<PersonnelStructure>({ companies: [] });
  // Bộ phận nào đang bung danh sách nhân sự
  const [expandedStaffSubDepts, setExpandedStaffSubDepts] = useState<Set<string>>(new Set());

  // Super admin: hiện cả đơn vị đã ẩn (is_active=false) trong cây
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [showHidden, setShowHidden] = useState(false);

  // Form states
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showDepartmentForm, setShowDepartmentForm] = useState(false);
  const [showSubDepartmentForm, setShowSubDepartmentForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: 'company' | 'department' | 'subdepartment'; id: string } | null>(null);

  // Unsaved-guard cho 3 form (company / department / subdepartment)
  const companyGuard = useUnsavedGuard(() => setShowCompanyForm(false));
  const departmentGuard = useUnsavedGuard(() => setShowDepartmentForm(false));
  const subDepartmentGuard = useUnsavedGuard(() => setShowSubDepartmentForm(false));
  useEscapeKey(companyGuard.guardedClose, showCompanyForm);
  useEscapeKey(departmentGuard.guardedClose, showDepartmentForm);
  useEscapeKey(subDepartmentGuard.guardedClose, showSubDepartmentForm);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  const [companyForm, setCompanyForm] = useState({ ...EMPTY_COMPANY_FORM });
  const [companyFormTab, setCompanyFormTab] = useState<'info' | 'people'>('info');
  const [viewCompany, setViewCompany] = useState<Company | null>(null); // modal xem chi tiết công ty (read-only)
  // Logo công ty: 4 biến thể (full_light/full_dark/icon/print). Mỗi biến thể: file mới + preview + cờ gỡ + URL hiện có.
  const LOGO_SLOTS: { variant: LogoVariant; label: string; hint: string; dark?: boolean }[] = [
    { variant: 'full_light', label: 'Logo màu (nền sáng · email)',   hint: 'Chữ ký & gửi email' },
    { variant: 'full_dark',  label: 'Logo âm bản (nền tối · webapp)', hint: 'Hiển thị trong ứng dụng', dark: true },
    { variant: 'icon',       label: 'Biểu tượng (avatar/favicon)',   hint: 'Hình vuông, chỗ hẹp' },
    { variant: 'print',      label: 'Logo in / tài liệu',            hint: 'PDF, hợp đồng, in ấn' },
  ];
  const emptyLogoMap = <T,>(v: T): Record<LogoVariant, T> => ({ full_light: v, full_dark: v, icon: v, print: v });
  const [logoFiles, setLogoFiles] = useState<Record<LogoVariant, File | null>>(() => emptyLogoMap<File | null>(null));
  const [logoPreviews, setLogoPreviews] = useState<Record<LogoVariant, string>>(() => emptyLogoMap(''));
  const [logoRemoved, setLogoRemoved] = useState<Record<LogoVariant, boolean>>(() => emptyLogoMap(false));
  const [existingLogoUrls, setExistingLogoUrls] = useState<Partial<Record<LogoVariant, string>>>({});

  function pickLogo(variant: LogoVariant, file: File | null) {
    setLogoRemoved((m) => ({ ...m, [variant]: false }));
    setLogoFiles((m) => ({ ...m, [variant]: file }));
    setLogoPreviews((m) => ({ ...m, [variant]: file ? URL.createObjectURL(file) : '' }));
  }
  function clearLogo(variant: LogoVariant) {
    setLogoFiles((m) => ({ ...m, [variant]: null }));
    setLogoPreviews((m) => ({ ...m, [variant]: '' }));
    setLogoRemoved((m) => ({ ...m, [variant]: true }));
    setExistingLogoUrls((m) => ({ ...m, [variant]: undefined }));
  }
  function resetLogoState() {
    setLogoFiles(emptyLogoMap<File | null>(null));
    setLogoPreviews(emptyLogoMap(''));
    setLogoRemoved(emptyLogoMap(false));
    setExistingLogoUrls({});
  }

  const [departmentForm, setDepartmentForm] = useState({
    name: '',
    code: '',
    description: '',
    head_id: '',
    budget: '',
    parent_department_id: '',
    display_order: '',
  });

  const [subDepartmentForm, setSubDepartmentForm] = useState({
    name: '',
    code: '',
    description: '',
    head_id: '',
    budget: '',
    parent_sub_department_id: '',
    display_order: '',
  });

  // Org tags (Tags Tổ Chức) + their assignments to units
  const [orgTags, setOrgTags] = useState<OrgTagOption[]>([]);
  const [tagAssignments, setTagAssignments] = useState<OrgTagAssignment[]>([]);
  const [companyTagIds, setCompanyTagIds] = useState<string[]>([]);
  const [departmentTagIds, setDepartmentTagIds] = useState<string[]>([]);
  const [subDepartmentTagIds, setSubDepartmentTagIds] = useState<string[]>([]);

  // Người đứng đầu công ty (cột riêng head_id) + danh sách user cho ô chọn
  const [companyHeadId, setCompanyHeadId] = useState('');
  // allUsers CHỈ còn dùng làm fallback hiển thị head_id cũ chưa có phân công
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email?: string }[]>([]);

  // Quy tắc "Phân công trước, gán chức sau": danh sách user gán được Trưởng
  // đơn vị lấy theo TỪNG công ty từ /api/organizations/assignable-users.
  const [assignableByCompany, setAssignableByCompany] = useState<Record<string, AssignableUser[]>>({});
  const [assignableLoading, setAssignableLoading] = useState(false);

  /** Headers auth cho API có check quyền (giống pattern các trang khác). */
  const buildAuthHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {};
    const u = getCurrentUser();
    if (u?.id) h['x-current-user-id'] = u.id;
    if (u?.role) h['x-current-user-role'] = u.role;
    if ((u as any)?.module_permissions) h['x-user-permissions'] = JSON.stringify((u as any).module_permissions);
    return h;
  };

  // Phó / Trợ lý đơn vị (nhiều người) cho từng form — lưu object để giữ tên trên chip
  const [companyDeputies, setCompanyDeputies] = useState<AssignableUser[]>([]);
  const [departmentDeputies, setDepartmentDeputies] = useState<AssignableUser[]>([]);
  const [subDepartmentDeputies, setSubDepartmentDeputies] = useState<AssignableUser[]>([]);
  const [companyAssistants, setCompanyAssistants] = useState<AssignableUser[]>([]);
  const [departmentAssistants, setDepartmentAssistants] = useState<AssignableUser[]>([]);
  const [subDepartmentAssistants, setSubDepartmentAssistants] = useState<AssignableUser[]>([]);

  // Chức vụ CẤP CÔNG TY (Giám Đốc, GĐĐH, Founder...) — chức vụ thuộc cấp bậc bật cờ show_in_company.
  const [companyLevelPositions, setCompanyLevelPositions] = useState<{ id: string; name: string; rank: number }[]>([]);
  const [positionHolders, setPositionHolders] = useState<Record<string, AssignableUser[]>>({});
  const [initialHolders, setInitialHolders] = useState<Record<string, string[]>>({});

  /** Nạp chức vụ cấp công ty + người đang giữ cho form công ty. */
  const loadCompanyLeadership = async (companyId: string) => {
    try {
      const [posRes, rankRes, holderRes] = await Promise.all([
        fetch(`/api/organizations/positions?company_id=${companyId}`, { headers: buildAuthHeaders() }),
        fetch('/api/organizations/position-ranks', { headers: buildAuthHeaders() }),
        fetch(`/api/organizations/company-position-holders?company_id=${companyId}`, { headers: buildAuthHeaders() }),
      ]);
      const positions = posRes.ok ? await posRes.json() : [];
      const ranksJson = rankRes.ok ? await rankRes.json() : { data: [] };
      const companyRanks = new Set<number>((ranksJson.data ?? []).filter((r: any) => r.show_in_company).map((r: any) => r.rank));
      const cols = (Array.isArray(positions) ? positions : [])
        .filter((p: any) => companyRanks.has(Number(p.rank)))
        .map((p: any) => ({ id: String(p.id), name: p.name, rank: Number(p.rank) }))
        .sort((a: any, b: any) => a.rank - b.rank || a.name.localeCompare(b.name, 'vi'));
      setCompanyLevelPositions(cols);
      const holderJson = holderRes.ok ? await holderRes.json() : { data: {} };
      const hmap: Record<string, AssignableUser[]> = {};
      const initial: Record<string, string[]> = {};
      for (const [pid, arr] of Object.entries(holderJson.data ?? {})) {
        hmap[pid] = (arr as any[]).map(u => ({ id: String(u.id), name: u.name }));
        initial[pid] = hmap[pid].map(u => u.id);
      }
      setPositionHolders(hmap);
      setInitialHolders(initial);
    } catch { setCompanyLevelPositions([]); setPositionHolders({}); setInitialHolders({}); }
  };

  type UnitRoleParams = { company_id: string; department_id?: string; sub_department_id?: string };
  type UnitRole = 'deputy' | 'assistant';
  const ROLE_LABEL: Record<UnitRole, string> = { deputy: 'Phó đơn vị', assistant: 'Trợ lý đơn vị' };

  /** Tải danh sách Phó/Trợ lý hiện hành của một đơn vị (khi mở form sửa). */
  const loadUnitRoleUsers = async (
    params: UnitRoleParams,
    role: UnitRole,
    setter: (list: AssignableUser[]) => void
  ) => {
    try {
      const qs = new URLSearchParams({ ...params, role } as Record<string, string>).toString();
      const res = await fetch(`/api/organizations/unit-deputies?${qs}`, { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`Failed to load unit ${role} list`);
      const j = await res.json();
      setter(Array.isArray(j?.data) ? j.data : []);
    } catch (error) {
      console.error(`Failed to load unit ${role} list:`, error);
      setter([]);
    }
  };

  /** Lưu (thay toàn bộ) danh sách Phó/Trợ lý của đơn vị. Lỗi → toast, không rollback đơn vị đã lưu. */
  const saveUnitRoleUsers = async (unit: UnitRoleParams, role: UnitRole, userIds: string[]) => {
    try {
      const res = await fetch('/api/organizations/unit-deputies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ ...unit, user_ids: userIds, role }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || `Lưu đơn vị xong nhưng cập nhật ${ROLE_LABEL[role]} thất bại`);
      }
    } catch {
      toast.error(`Lưu đơn vị xong nhưng cập nhật ${ROLE_LABEL[role]} thất bại`);
    }
  };

  /** Tải danh sách user đã có phân công active tại công ty (cache theo company_id). */
  const loadAssignableUsers = async (companyId: string) => {
    try {
      setAssignableLoading(true);
      const res = await fetch(
        `/api/organizations/assignable-users?company_id=${encodeURIComponent(companyId)}`,
        { headers: buildAuthHeaders() }
      );
      if (!res.ok) throw new Error('Failed to load assignable users');
      const j = await res.json();
      const arr: AssignableUser[] = Array.isArray(j?.data) ? j.data : [];
      setAssignableByCompany((prev) => ({ ...prev, [companyId]: arr }));
    } catch (error) {
      console.error('Failed to load assignable users:', error);
    } finally {
      setAssignableLoading(false);
    }
  };

  // Công ty đang áp dụng cho từng form (quyết định nguồn danh sách HeadPicker)
  // - Sửa company → chính công ty đó; TẠO company mới → null (chưa ai có phân công)
  // - Department → công ty cha (selectedCompanyId)
  // - Sub-department → công ty của phòng ban cha
  const companyFormCompanyId = editingItem?.type === 'company' ? editingItem.id : null;
  const departmentFormCompanyId = selectedCompanyId;
  const subDepartmentFormCompanyId = selectedDepartmentId
    ? departments.find((d) => d.id === selectedDepartmentId)?.company_id ?? null
    : null;

  // Mở form nào thì nạp danh sách phân công của công ty tương ứng (nếu chưa cache)
  useEffect(() => {
    const targets: (string | null)[] = [];
    if (showCompanyForm) targets.push(companyFormCompanyId);
    if (showDepartmentForm) targets.push(departmentFormCompanyId);
    if (showSubDepartmentForm) targets.push(subDepartmentFormCompanyId);
    for (const id of targets) {
      if (id && !assignableByCompany[id]) loadAssignableUsers(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompanyForm, showDepartmentForm, showSubDepartmentForm, companyFormCompanyId, departmentFormCompanyId, subDepartmentFormCompanyId]);

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async (includeHidden: boolean = showHidden) => {
    try {
      setLoading(true);
      // Xóa cache danh sách phân công — lần mở form kế tiếp sẽ nạp lại
      setAssignableByCompany({});
      // Toggle TẮT → request y hệt cũ (không param, không headers) để không đổi hành vi
      const unitQs = includeHidden ? '?include_inactive=true' : '';
      const unitInit = includeHidden ? { headers: buildAuthHeaders() } : undefined;
      const [companiesRes, departmentsRes, subDeptRes, personnelRes, orgTagsRes, assignmentsRes, usersRes, groupsRes] = await Promise.all([
        fetch(`/api/organizations/companies${unitQs}`, unitInit),
        fetch(`/api/organizations/departments${unitQs}`, unitInit),
        fetch(`/api/organizations/sub-departments${unitQs}`, unitInit),
        fetch('/api/organizations/structure/personnel'),
        fetch('/api/org-tags'),
        fetch('/api/organizations/tag-assignments'),
        fetch('/api/users?status=active'),
        fetch('/api/organizations/company-groups'),
      ]);

      if (!companiesRes.ok || !departmentsRes.ok || !subDeptRes.ok) {
        throw new Error('Failed to load data');
      }

      setCompanies(await companiesRes.json());
      setDepartments(await departmentsRes.json());
      setSubDepartments(await subDeptRes.json());

      if (personnelRes.ok) {
        setPersonnelStructure(await personnelRes.json());
      }
      if (orgTagsRes.ok) {
        setOrgTags(await orgTagsRes.json());
      }
      if (assignmentsRes.ok) {
        setTagAssignments(await assignmentsRes.json());
      }
      if (usersRes.ok) {
        const uj = await usersRes.json();
        const arr = Array.isArray(uj) ? uj : (uj.data ?? uj.users ?? []);
        setAllUsers(arr.map((u: any) => ({ id: String(u.id), name: u.name, email: u.email })));
      }
      if (groupsRes.ok) {
        const gj = await groupsRes.json();
        setGroups(Array.isArray(gj.data) ? gj.data : []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Nhóm/Tập đoàn: gán công ty + gom danh sách theo nhóm ──
  const assignCompanyToGroup = async (companyId: string, groupId: string | null) => {
    try {
      const res = await fetch('/api/organizations/company-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ companyId, groupId }),
      });
      if (!res.ok) throw new Error();
      loadAllData();
    } catch { toast.error('Không gán được nhóm'); }
  };

  const groupById = React.useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);
  // Sắp công ty theo nhóm; công ty chưa gom xuống "Chưa thuộc nhóm". Header gắn vào công ty đầu mỗi nhóm.
  const { orderedCompanies, headerFor } = React.useMemo(() => {
    if (!groups.length) return { orderedCompanies: companies, headerFor: new Map<string, { name: string; count: number }>() };
    const byGroup = new Map<string, Company[]>(); const none: Company[] = [];
    for (const c of companies) {
      const gid = c.group_id && groupById.has(c.group_id) ? c.group_id : null;
      if (gid) { const a = byGroup.get(gid) ?? []; a.push(c); byGroup.set(gid, a); } else none.push(c);
    }
    const sorted = [...groups].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'vi'));
    const ordered: Company[] = [];
    const headerFor = new Map<string, { name: string; count: number }>();
    for (const g of sorted) {
      const list = byGroup.get(g.id); if (!list?.length) continue;
      headerFor.set(list[0].id, { name: g.name, count: list.length });
      ordered.push(...list);
    }
    if (none.length) { headerFor.set(none[0].id, { name: 'Chưa thuộc nhóm', count: none.length }); ordered.push(...none); }
    return { orderedCompanies: ordered, headerFor };
  }, [companies, groups, groupById]);

  // Phòng ban CẤP CAO NHẤT của công ty (không có phòng ban cha). Con render đệ quy bên dưới.
  const getDepartmentsForCompany = (companyId: string) => {
    return departments.filter(d => d.company_id === companyId && !d.parent_department_id && (showHidden || d.is_active));
  };
  // Phòng ban con trực tiếp của 1 phòng ban.
  const getChildDepartments = (parentId: string) => {
    return departments.filter(d => d.parent_department_id === parentId && (showHidden || d.is_active));
  };
  // Duyệt DFS ra danh sách hàng phòng ban theo cây (tôn trọng trạng thái bung/thu) + độ sâu.
  const buildDeptRows = (companyId: string): { dept: Department; depth: number }[] => {
    const out: { dept: Department; depth: number }[] = [];
    const seen = new Set<string>();               // chặn vòng lặp (parent trỏ vào con)
    const walk = (list: Department[], depth: number) => {
      for (const d of list) {
        if (seen.has(d.id) || depth > 30) continue;
        seen.add(d.id);
        out.push({ dept: d, depth });
        if (expandedDepartments.has(d.id)) walk(getChildDepartments(d.id), depth + 1);
      }
    };
    walk(getDepartmentsForCompany(companyId), 0);
    return out;
  };

  // Get sub-departments for a department (toggle "hiện đơn vị ẩn" → kèm cả is_active=false)
  const getSubDepartmentsForDepartment = (departmentId: string) => {
    return subDepartments.filter(s => s.department_id === departmentId && (showHidden || s.is_active));
  };

  // Org-tag helpers
  type UnitType = 'company' | 'department' | 'sub_department';
  const assignmentColumn: Record<UnitType, keyof OrgTagAssignment> = {
    company: 'company_id',
    department: 'department_id',
    sub_department: 'sub_department_id',
  };

  const getUnitTags = (type: UnitType, id: string): OrgTagAssignment[] =>
    tagAssignments.filter((a) => a[assignmentColumn[type]] === id);

  const getUnitTagIds = (type: UnitType, id: string): string[] =>
    getUnitTags(type, id).map((a) => a.tag_id);

  // Persist the selected tag set for a unit (Super Admin only on the server)
  const saveTagAssignments = async (type: UnitType, id: string, tagIds: string[]) => {
    await fetch('/api/organizations/tag-assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: type,
        entity_id: id,
        tag_ids: tagIds,
        updated_by: currentUser?.id,
      }),
    });
  };

  // Small inline chip row for the tree
  const TagChips = ({ type, id }: { type: UnitType; id: string }) => {
    const tags = getUnitTags(type, id);
    if (tags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-600 text-foreground"
            style={{ backgroundColor: `${t.color}33` }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.color }} />
            {t.name}
          </span>
        ))}
      </div>
    );
  };

  // Toggle expand
  const toggleCompanyExpanded = (companyId: string) => {
    const newSet = new Set(expandedCompanies);
    if (newSet.has(companyId)) {
      newSet.delete(companyId);
    } else {
      newSet.add(companyId);
    }
    setExpandedCompanies(newSet);
  };

  const toggleDepartmentExpanded = (departmentId: string) => {
    const newSet = new Set(expandedDepartments);
    if (newSet.has(departmentId)) {
      newSet.delete(departmentId);
    } else {
      newSet.add(departmentId);
    }
    setExpandedDepartments(newSet);
  };

  // Bung/thu danh sách nhân sự của một bộ phận
  const toggleStaffSubDept = (subDeptId: string) => {
    const newSet = new Set(expandedStaffSubDepts);
    newSet.has(subDeptId) ? newSet.delete(subDeptId) : newSet.add(subDeptId);
    setExpandedStaffSubDepts(newSet);
  };

  // Map tra cứu số người + nhân sự theo id (gộp dữ liệu nhân sự vào cây tổ chức)
  const personnel = useMemo(() => {
    const companyUsers: Record<string, number> = {};
    const companyStaff: Record<string, StaffMember[]> = {};
    const deptUsers: Record<string, number> = {};
    const deptStaff: Record<string, StaffMember[]> = {};
    const subUsers: Record<string, number> = {};
    const subStaff: Record<string, StaffMember[]> = {};
    const heads: Record<string, StaffMember | null> = {}; // head theo id đơn vị (mọi cấp)
    for (const c of personnelStructure.companies) {
      companyUsers[c.id] = c.total_users;
      companyStaff[c.id] = c.company_level_staff ?? [];
      heads[c.id] = c.head ?? null;
      for (const d of c.departments) {
        deptUsers[d.id] = d.total_users;
        deptStaff[d.id] = d.department_level_staff ?? [];
        heads[d.id] = d.head ?? null;
        for (const s of d.sub_departments) {
          subUsers[s.id] = s.total_users;
          subStaff[s.id] = s.staff;
          heads[s.id] = s.head ?? null;
        }
      }
    }
    return { companyUsers, companyStaff, deptUsers, deptStaff, subUsers, subStaff, heads };
  }, [personnelStructure]);

  // Nhãn người đứng đầu — hiện ngay trên dòng đơn vị (nhìn là biết, không cần bung)
  const LeadBadge = ({ head }: { head: StaffMember | null | undefined }) =>
    head ? (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-600 bg-amber-500/15 text-amber-300 border border-amber-500/25 flex-shrink-0"
        title={`Người đứng đầu: ${head.name}${head.job_title ? ` — ${head.job_title}` : ''}`}
      >
        <Crown size={11} className="fill-amber-400/30" /> {head.name}
      </span>
    ) : null;

  // Badge vai trò trên dòng nhân sự. "Trưởng" KHÔNG lặp ở đây vì đơn vị đã có
  // LeadBadge riêng; chỉ hiện Phó / Trợ lý / Kiêm nhiệm.
  const STAFF_ROLE_BADGE: Record<string, { text: string; cls: string }> = {
    deputy: { text: 'Phó', cls: 'bg-sky-500/15 text-sky-300' },
    assistant: { text: 'Trợ lý', cls: 'bg-amber-500/15 text-amber-300' },
  };

  // Danh sách nhân sự (dùng chung mọi cấp). padClass = thụt lề theo cấp.
  // key gồm index vì người kiêm nhiệm có thể xuất hiện nhiều lần trong 1 nhánh.
  const StaffList = ({ staff, padClass, padLeft }: { staff: StaffMember[]; padClass?: string; padLeft?: number }) => (
    <div className="bg-black/60 border-t border-line-subtle">
      {staff.map((s, i) => (
        <div key={`${s.id}-${i}`} style={padLeft !== undefined ? { paddingLeft: padLeft } : undefined}
          className={`p-3 ${padLeft !== undefined ? '' : (padClass ?? '')} hover:bg-hover transition-colors border-b border-line-subtle last:border-b-0`}>
          <p className="text-2xs sm:text-xs text-foreground font-500">
            <span className="text-indigo-400">{s.job_title}</span>
            <span className="text-muted-foreground mx-1">-</span>
            <span>{s.name}</span>
            {s.org_role && STAFF_ROLE_BADGE[s.org_role] && (
              <span className={`ml-1.5 px-1.5 py-px rounded text-[10px] font-600 ${STAFF_ROLE_BADGE[s.org_role].cls}`}>
                {STAFF_ROLE_BADGE[s.org_role].text}
              </span>
            )}
            {s.is_concurrent === true && (
              <span className="ml-1.5 px-1.5 py-px rounded text-[10px] font-600 bg-purple-500/15 text-purple-300">
                Kiêm nhiệm
              </span>
            )}
          </p>
          <p className="text-2xs text-muted-foreground/70 mt-0.5 truncate">{s.email}</p>
          {s.manager_name && <p className="text-2xs text-muted-foreground/60 mt-0.5">Quản lý: {s.manager_name}</p>}
        </div>
      ))}
    </div>
  );

  // Badge số người dùng chung
  const HeadBadge = ({ n }: { n: number }) =>
    n > 0 ? (
      <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground font-400 flex-shrink-0">
        <Users size={11} className="opacity-70" /> {n}
      </span>
    ) : null;

  // Handle form submissions
  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.name.trim()) {
      setCompanyFormTab('info');
      toast.error('Vui lòng điền tên công ty');
      return;
    }
    if (!companyForm.code.trim()) {
      setCompanyFormTab('info');
      toast.error('Vui lòng điền mã công ty (dùng để sinh mã hợp đồng)');
      return;
    }

    try {
      setLoading(true);

      // Lọc ra các fields không trống (loại bỏ empty string)
      const cleanedForm = Object.entries(companyForm).reduce((acc, [key, value]) => {
        if (value && typeof value === 'string' && value.trim() !== '') {
          acc[key] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>);

      const method = editingItem?.type === 'company' ? 'PUT' : 'POST';
      const headField = { head_id: companyHeadId || '' };
      const payload = editingItem?.type === 'company'
        ? { id: editingItem.id, ...cleanedForm, ...headField, updated_by: currentUser?.id || 'system' }
        : { ...cleanedForm, ...headField, created_by: currentUser?.id || 'system' };

      const response = await fetch('/api/organizations/companies', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const j = await response.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to save company');
      }

      const saved = await response.json();
      // Gán trưởng có thể bị từ chối (vd người chưa được phân công tại công ty) — báo rõ, không lưu ảo
      if (saved?.head_sync_warning) toast.error(`Lưu công ty xong nhưng gán trưởng KHÔNG thành công: ${saved.head_sync_warning}`);
      const companyId = editingItem?.type === 'company' ? editingItem.id : saved?.id;
      if (companyId) await saveTagAssignments('company', companyId, companyTagIds);
      if (companyId) {
        await saveUnitRoleUsers({ company_id: companyId }, 'deputy', companyDeputies.map((d) => d.id));
        await saveUnitRoleUsers({ company_id: companyId }, 'assistant', companyAssistants.map((d) => d.id));
        // Chức vụ cấp công ty: chỉ PUT những chức vụ có thay đổi so với lúc mở form.
        for (const pos of companyLevelPositions) {
          const nowIds = (positionHolders[pos.id] ?? []).map(u => u.id);
          const wasIds = initialHolders[pos.id] ?? [];
          const changed = nowIds.length !== wasIds.length || nowIds.some(id => !wasIds.includes(id));
          if (!changed) continue;
          try {
            const r = await fetch('/api/organizations/company-position-holders', {
              method: 'PUT', headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
              body: JSON.stringify({ company_id: companyId, position_id: pos.id, user_ids: nowIds }),
            });
            if (!r.ok) toast.error(`Lưu chức vụ "${pos.name}" thất bại`);
          } catch { toast.error(`Lưu chức vụ "${pos.name}" thất bại`); }
        }
      }

      // Logo: mỗi biến thể — upload file mới, hoặc xóa nếu user bấm gỡ (chỉ khi đã có companyId)
      if (companyId) {
        for (const { variant } of LOGO_SLOTS) {
          try {
            const file = logoFiles[variant];
            if (file) {
              const fd = new FormData();
              fd.append('file', file);
              const up = await fetch(`/api/companies/${companyId}/logo?variant=${variant}`, { method: 'POST', body: fd });
              if (!up.ok) {
                const j = await up.json().catch(() => ({}));
                toast.error(j.error || `Tải logo (${variant}) thất bại`);
              }
            } else if (logoRemoved[variant]) {
              await fetch(`/api/companies/${companyId}/logo?variant=${variant}`, { method: 'DELETE' });
            }
          } catch {
            toast.error(`Xử lý logo (${variant}) thất bại`);
          }
        }
      }

      await loadAllData();
      setCompanyForm({ ...EMPTY_COMPANY_FORM });
      setCompanyFormTab('info');
      resetLogoState();
      setCompanyHeadId('');
      setCompanyDeputies([]);
      setCompanyAssistants([]);
      companyGuard.markClean();
      setShowCompanyForm(false);
      setEditingItem(null);
    } catch (error: any) {
      console.error('Error:', error);
      const msg = String(error?.message || '');
      if (/duplicate|unique|23505/i.test(msg)) {
        toast.error('Mã công ty đã tồn tại. Vui lòng dùng mã khác.');
      } else {
        toast.error(msg || 'Lỗi khi lưu công ty');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentForm.name.trim() || !selectedCompanyId) {
      toast.error('Vui lòng điền tên phòng ban');
      return;
    }

    try {
      setLoading(true);
      const method = editingItem?.type === 'department' ? 'PUT' : 'POST';
      const payload = editingItem?.type === 'department'
        ? { id: editingItem.id, ...departmentForm, company_id: selectedCompanyId, updated_by: currentUser?.id || 'system' }
        : { company_id: selectedCompanyId, ...departmentForm, created_by: currentUser?.id || 'system' };

      const response = await fetch('/api/organizations/departments', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save department');

      const saved = await response.json();
      if (saved?.head_sync_warning) toast.error(`Lưu phòng ban xong nhưng gán trưởng KHÔNG thành công: ${saved.head_sync_warning}`);
      const departmentId = editingItem?.type === 'department' ? editingItem.id : saved?.id;
      if (departmentId) await saveTagAssignments('department', departmentId, departmentTagIds);
      if (departmentId && selectedCompanyId) {
        const unit = { company_id: selectedCompanyId, department_id: departmentId };
        await saveUnitRoleUsers(unit, 'deputy', departmentDeputies.map((d) => d.id));
        await saveUnitRoleUsers(unit, 'assistant', departmentAssistants.map((d) => d.id));
      }

      await loadAllData();
      setDepartmentForm({
        name: '',
        code: '',
        description: '',
        head_id: '',
        budget: '',
        parent_department_id: '',
        display_order: '',
      });
      setDepartmentDeputies([]);
      setDepartmentAssistants([]);
      departmentGuard.markClean();
      setShowDepartmentForm(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Lỗi khi lưu phòng ban');
    } finally {
      setLoading(false);
    }
  };

  const handleSubDepartmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subDepartmentForm.name.trim() || !selectedDepartmentId) {
      toast.error('Vui lòng điền tên bộ phận');
      return;
    }

    try {
      setLoading(true);
      const method = editingItem?.type === 'subdepartment' ? 'PUT' : 'POST';
      const payload = editingItem?.type === 'subdepartment'
        ? { id: editingItem.id, ...subDepartmentForm, department_id: selectedDepartmentId, updated_by: currentUser?.id || 'system' }
        : { department_id: selectedDepartmentId, ...subDepartmentForm, created_by: currentUser?.id || 'system' };

      const response = await fetch('/api/organizations/sub-departments', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to save sub-department');

      const saved = await response.json();
      if (saved?.head_sync_warning) toast.error(`Lưu bộ phận xong nhưng gán trưởng KHÔNG thành công: ${saved.head_sync_warning}`);
      const subDeptId = editingItem?.type === 'subdepartment' ? editingItem.id : saved?.id;
      if (subDeptId) await saveTagAssignments('sub_department', subDeptId, subDepartmentTagIds);
      if (subDeptId && subDepartmentFormCompanyId) {
        const unit = { company_id: subDepartmentFormCompanyId, sub_department_id: subDeptId };
        await saveUnitRoleUsers(unit, 'deputy', subDepartmentDeputies.map((d) => d.id));
        await saveUnitRoleUsers(unit, 'assistant', subDepartmentAssistants.map((d) => d.id));
      }

      await loadAllData();
      setSubDepartmentForm({
        name: '',
        code: '',
        description: '',
        head_id: '',
        budget: '',
        parent_sub_department_id: '',
        display_order: '',
      });
      setSubDepartmentDeputies([]);
      setSubDepartmentAssistants([]);
      subDepartmentGuard.markClean();
      setShowSubDepartmentForm(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Lỗi khi lưu bộ phận');
    } finally {
      setLoading(false);
    }
  };

  // ===== Đơn vị ẩn (is_active=false) — khôi phục / xoá cứng (super_admin) =====

  const RESTORE_ENDPOINT: Record<UnitType, string> = {
    company: '/api/organizations/companies',
    department: '/api/organizations/departments',
    sub_department: '/api/organizations/sub-departments',
  };

  /** Khôi phục đơn vị ẩn: PUT { id, is_active: true } lên endpoint tương ứng. */
  const handleRestoreUnit = async (type: UnitType, id: string) => {
    try {
      setLoading(true);
      const res = await fetch(RESTORE_ENDPOINT[type], {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ id, is_active: true, updated_by: currentUser?.id || 'system' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Khôi phục thất bại');
      }
      toast.success('Đã khôi phục đơn vị');
      await loadAllData();
    } catch (error: any) {
      toast.error(String(error?.message || 'Khôi phục thất bại'));
    } finally {
      setLoading(false);
    }
  };

  /** Xoá CỨNG đơn vị ẩn khỏi DB (dọn sạch phân công/người trỏ vào) — không hoàn tác được. */
  const handleHardDeleteUnit = async (type: UnitType, id: string, name: string) => {
    const ok = await confirm({
      title: 'Xoá cứng đơn vị?',
      message: `"${name}" sẽ bị xoá vĩnh viễn khỏi DB, dọn sạch phân công/người đang trỏ vào. Không thể hoàn tác.`,
      confirmLabel: 'Xoá vĩnh viễn',
      danger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      const res = await fetch('/api/organizations/hidden-units', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
        body: JSON.stringify({ unit_type: type, id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Xoá cứng thất bại');
      toast.success(
        `Đã xoá vĩnh viễn "${name}" — dọn ${j.cleaned_assignments ?? 0} phân công, ${j.cleaned_users ?? 0} người dùng`
      );
      await loadAllData();
    } catch (error: any) {
      toast.error(String(error?.message || 'Xoá cứng thất bại'));
    } finally {
      setLoading(false);
    }
  };

  // Badge + cụm nút hành động cho node ẩn (thay cho sửa/thêm con/xóa mềm)
  const HiddenBadge = () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-600 bg-slate-500/20 text-slate-300 border border-slate-500/30 flex-shrink-0">
      <EyeOff size={11} /> Đã ẩn
    </span>
  );

  const HiddenUnitActions = ({ type, id, name }: { type: UnitType; id: string; name: string }) => (
    <>
      <button
        onClick={() => handleRestoreUnit(type, id)}
        className="flex items-center gap-1 px-2 py-1 rounded text-2xs font-600 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/10 transition-colors"
        title="Khôi phục đơn vị (hiện lại trong hệ thống)"
      >
        <RotateCcw size={11} /> Khôi phục
      </button>
      <button
        onClick={() => handleHardDeleteUnit(type, id, name)}
        className="flex items-center gap-1 px-2 py-1 rounded text-2xs font-600 text-red-400 border border-red-500/25 hover:bg-red-500/10 transition-colors"
        title="Xoá vĩnh viễn khỏi DB — không thể hoàn tác"
      >
        <Trash2 size={11} /> Xoá cứng
      </button>
    </>
  );

  const handleEditCompany = (company: Company) => {
    setCompanyForm({
      ...EMPTY_COMPANY_FORM,
      name: company.name,
      code: company.code || '',
      slug: (company as any).slug || '',
      description: company.description || '',
      logo_url: company.logo_url || '',
      website_url: company.website_url || '',
      business_name: company.business_name || '',
      tax_code: company.tax_code || '',
      legal_representative: company.legal_representative || '',
      address: company.address || '',
      invoice_address: company.invoice_address || '',
      phone: company.phone || '',
      email: company.email || '',
      website: company.website || '',
      tax_address: company.tax_address || '',
      status: company.status || '',
      international_name: company.international_name || '',
      short_name: company.short_name || '',
      activation_date: company.activation_date || '',
      managing_tax_office: company.managing_tax_office || '',
      business_type: company.business_type || '',
      main_business_line: company.main_business_line || '',
      business_lines: company.business_lines || '',
    });
    setCompanyFormTab('info');
    setCompanyTagIds(getUnitTagIds('company', company.id));
    setCompanyHeadId((company as any).head_id || '');
    setCompanyDeputies([]);
    setCompanyAssistants([]);
    loadUnitRoleUsers({ company_id: company.id }, 'deputy', setCompanyDeputies);
    loadUnitRoleUsers({ company_id: company.id }, 'assistant', setCompanyAssistants);
    setCompanyLevelPositions([]); setPositionHolders({}); setInitialHolders({});
    loadCompanyLeadership(company.id);
    resetLogoState();
    setExistingLogoUrls({
      full_light: company.logo_urls?.full_light ?? company.logo_url ?? undefined,
      full_dark:  company.logo_urls?.full_dark,
      icon:       company.logo_urls?.icon,
      print:      company.logo_urls?.print,
    });
    setEditingItem({ type: 'company', id: company.id });
    setShowCompanyForm(true);
  };

  const handleEditDepartment = (department: Department) => {
    setDepartmentForm({
      name: department.name,
      code: department.code || '',
      description: department.description || '',
      head_id: department.head_id || '',
      budget: department.budget ? String(department.budget) : '',
      parent_department_id: department.parent_department_id || '',
      display_order: department.display_order ? String(department.display_order) : '',
    });
    setSelectedCompanyId(department.company_id);
    setDepartmentTagIds(getUnitTagIds('department', department.id));
    setDepartmentDeputies([]);
    setDepartmentAssistants([]);
    loadUnitRoleUsers({ company_id: department.company_id, department_id: department.id }, 'deputy', setDepartmentDeputies);
    loadUnitRoleUsers({ company_id: department.company_id, department_id: department.id }, 'assistant', setDepartmentAssistants);
    setEditingItem({ type: 'department', id: department.id });
    setShowDepartmentForm(true);
  };

  const handleEditSubDepartment = (subDepartment: SubDepartment) => {
    setSubDepartmentForm({
      name: subDepartment.name,
      code: subDepartment.code || '',
      description: subDepartment.description || '',
      head_id: subDepartment.head_id || '',
      budget: subDepartment.budget ? String(subDepartment.budget) : '',
      parent_sub_department_id: subDepartment.parent_sub_department_id || '',
      display_order: subDepartment.display_order ? String(subDepartment.display_order) : '',
    });
    setSelectedDepartmentId(subDepartment.department_id);
    setSubDepartmentTagIds(getUnitTagIds('sub_department', subDepartment.id));
    setSubDepartmentDeputies([]);
    setSubDepartmentAssistants([]);
    const subCompanyId = departments.find((d) => d.id === subDepartment.department_id)?.company_id;
    if (subCompanyId) {
      loadUnitRoleUsers({ company_id: subCompanyId, sub_department_id: subDepartment.id }, 'deputy', setSubDepartmentDeputies);
      loadUnitRoleUsers({ company_id: subCompanyId, sub_department_id: subDepartment.id }, 'assistant', setSubDepartmentAssistants);
    }
    setEditingItem({ type: 'subdepartment', id: subDepartment.id });
    setShowSubDepartmentForm(true);
  };

  const handleDeleteCompany = async (id: string) => {
    const ok = await confirm({
      title: 'Xóa công ty?',
      message: 'Xóa công ty này?',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/organizations/companies?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      await loadAllData();
    } catch (error) {
      toast.error('Lỗi khi xóa công ty');
    } finally {
      setLoading(false);
    }
  };

  const doConvertDepartment = async () => {
    if (!convertDept || !convertTarget) return;
    setConverting(true);
    try {
      const response = await fetch('/api/organizations/departments/convert-to-sub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId: convertDept.id, targetDepartmentId: convertTarget }),
      });
      const j = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(j?.error || 'Chuyển đổi thất bại');
      toast.success(`Đã chuyển "${convertDept.name}" thành bộ phận · ${j.movedUsers} nhân sự`);
      setConvertDept(null); setConvertTarget('');
      await loadAllData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lỗi khi chuyển đổi');
    } finally {
      setConverting(false);
    }
  };

  const doMoveSubDepartment = async () => {
    if (!moveSub || !moveTarget) return;
    setMovingSub(true);
    try {
      const response = await fetch('/api/organizations/sub-departments/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subDepartmentId: moveSub.id, targetDepartmentId: moveTarget }),
      });
      const j = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(j?.error || 'Chuyển bộ phận thất bại');
      toast.success(`Đã chuyển bộ phận "${moveSub.name}" · ${j.movedUsers} nhân sự`);
      setMoveSub(null); setMoveTarget('');
      await loadAllData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Lỗi khi chuyển bộ phận');
    } finally {
      setMovingSub(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    const ok = await confirm({
      title: 'Xóa phòng ban?',
      message: 'Xóa phòng ban này?',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/organizations/departments?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      await loadAllData();
    } catch (error) {
      toast.error('Lỗi khi xóa phòng ban');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSubDepartment = async (id: string) => {
    const ok = await confirm({
      title: 'Xóa bộ phận?',
      message: 'Xóa bộ phận này?',
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/organizations/sub-departments?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      await loadAllData();
    } catch (error) {
      toast.error('Lỗi khi xóa bộ phận');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">Cơ Cấu Tổ Chức</h1>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-1">Quản lý công ty, phòng ban và bộ phận</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => {
                const next = !showHidden;
                setShowHidden(next);
                loadAllData(next);
              }}
              className={`flex items-center justify-center gap-2 h-10 px-3 rounded-lg text-2xs sm:text-xs font-600 border min-h-[44px] transition-colors ${
                showHidden
                  ? 'border-slate-500/40 bg-slate-500/15 text-slate-200'
                  : 'border-line bg-surface-2 text-muted-foreground hover:text-foreground'
              }`}
              title="Hiện/ẩn các đơn vị đã ẩn (is_active=false) — chỉ Super Admin"
            >
              {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
              {showHidden ? 'Đang hiện đơn vị ẩn' : 'Hiện đơn vị ẩn'}
            </button>
          )}
          <button
            onClick={() => {
              setShowCompanyForm(true);
              setEditingItem(null);
              setCompanyTagIds([]);
              setCompanyHeadId('');
              setCompanyDeputies([]);
              setCompanyAssistants([]);
              setCompanyForm({ ...EMPTY_COMPANY_FORM }); setCompanyFormTab('info');
              resetLogoState();
            }}
            className="flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
          >
            <Plus size={16} />
            Thêm Công Ty
          </button>
        </div>
      </div>

      {/* Cây tổ chức hợp nhất: cấu trúc + số người + nhân sự */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-2xs sm:text-xs text-muted-foreground">
          Bấm <ChevronRight size={12} className="inline -mt-0.5" /> để bung phòng ban · bộ phận · nhân sự. Số <Users size={11} className="inline -mt-0.5" /> là quân số.
        </p>
        <button onClick={() => setManageGroups(true)}
          className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg text-2xs sm:text-xs font-600 text-teal-400 border border-teal-500/30 hover:bg-teal-500/10">
          <Layers size={14} /> Nhóm / Tập đoàn
        </button>
      </div>

      <div className="space-y-2">
        {orderedCompanies.map(company => {
          const isExpanded = expandedCompanies.has(company.id);
          const companyDepts = getDepartmentsForCompany(company.id);
          const companyStaff = personnel.companyStaff[company.id] ?? [];
          const companyHasChildren = companyDepts.length > 0 || companyStaff.length > 0;
          const groupHeader = headerFor.get(company.id);

          return (
            <React.Fragment key={company.id}>
            {groupHeader && (
              <div className="flex items-center gap-2 pt-3 pb-1 px-1">
                <Layers size={14} className="text-teal-400 shrink-0" />
                <span className="text-2xs sm:text-xs font-700 uppercase tracking-wider text-teal-400">{groupHeader.name}</span>
                <span className="text-2xs text-muted-foreground">· {groupHeader.count} công ty</span>
                <div className="flex-1 h-px bg-line" />
              </div>
            )}
            <div className="bg-slate-900/50 backdrop-blur-sm border border-line rounded-lg overflow-hidden">
              {/* Company Row */}
              <div className="flex items-center justify-between p-3 sm:p-4 hover:bg-hover transition-colors">
                <div className={`flex items-center gap-3 flex-1 min-w-0 ${company.is_active === false ? 'opacity-50' : ''}`}>
                  {companyHasChildren ? (
                    <button
                      onClick={() => toggleCompanyExpanded(company.id)}
                      className="flex-shrink-0 p-1 hover:bg-hover-strong rounded transition-colors"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  ) : (
                    <div className="w-8" />
                  )}
                  {(company.logo_urls?.full_dark || company.logo_url) ? (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={company.logo_urls?.full_dark || company.logo_url} alt={company.name} className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <Building2 size={18} className="text-indigo-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-600 text-foreground flex items-center gap-2 flex-wrap">
                      <span className="truncate">{company.name}</span>
                      {company.is_active === false && <HiddenBadge />}
                      <HeadBadge n={personnel.companyUsers[company.id] ?? 0} />
                      <LeadBadge head={personnel.heads[company.id]} />
                    </h3>
                    {company.description && (
                      <p className="text-2xs sm:text-xs text-muted-foreground truncate">{company.description}</p>
                    )}
                    <TagChips type="company" id={company.id} />
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  {company.is_active === false ? (
                    <HiddenUnitActions type="company" id={company.id} name={company.name} />
                  ) : (
                    <>
                      {/* Gán công ty vào Nhóm/Tập đoàn */}
                      <select
                        value={company.group_id ?? ''}
                        onChange={(e) => assignCompanyToGroup(company.id, e.target.value || null)}
                        title="Thuộc nhóm / tập đoàn"
                        className="hidden sm:block h-7 max-w-[130px] px-2 rounded-lg text-2xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600"
                      >
                        <option value="">— Không nhóm —</option>
                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <button
                        onClick={() => {
                          setShowDepartmentForm(true);
                          setEditingItem(null);
                          setSelectedCompanyId(company.id);
                          setDepartmentTagIds([]);
                          setDepartmentDeputies([]);
                          setDepartmentAssistants([]);
                          setDepartmentForm({ name: '', code: '', description: '', head_id: '', budget: '', parent_department_id: '', display_order: '' });
                        }}
                        className="p-2 hover:bg-hover-strong rounded transition-colors"
                        title="Thêm phòng ban"
                      >
                        <Plus size={14} className="text-emerald-400" />
                      </button>
                      <button
                        onClick={() => setViewCompany(company)}
                        className="p-2 hover:bg-hover-strong rounded transition-colors"
                        title="Xem chi tiết"
                      >
                        <Eye size={14} className="text-indigo-400" />
                      </button>
                      <button
                        onClick={() => handleEditCompany(company)}
                        className="p-2 hover:bg-hover-strong rounded transition-colors"
                        title="Chỉnh sửa"
                      >
                        <Edit2 size={14} className="text-foreground" />
                      </button>
                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="p-2 hover:bg-red-500/20 rounded transition-colors"
                        title="Xóa"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* BAN LÃNH ĐẠO & VĂN PHÒNG — nhân sự cấp công ty (đứng đầu + Giám Đốc/GĐĐH/Founder…) */}
              {isExpanded && companyStaff.length > 0 && (
                <div className="border-t border-line">
                  <p className="px-4 sm:px-5 pt-2.5 pb-1 text-2xs font-700 uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Crown size={12} /> Ban Lãnh Đạo &amp; Văn Phòng
                  </p>
                  <StaffList staff={companyStaff} padLeft={32} />
                </div>
              )}

              {/* Departments List (đệ quy: phòng ban → phòng ban con → …) */}
              {isExpanded && companyDepts.length > 0 && (
                <div className="bg-black/20 border-t border-line space-y-0">
                  {buildDeptRows(company.id).map(({ dept, depth }) => {
                    const isDeptExpanded = expandedDepartments.has(dept.id);
                    const subDepts = getSubDepartmentsForDepartment(dept.id);
                    const deptStaff = personnel.deptStaff[dept.id] ?? [];
                    const childDepts = getChildDepartments(dept.id);
                    const deptHasChildren = subDepts.length > 0 || deptStaff.length > 0 || childDepts.length > 0;
                    const deptPad = 32 + depth * 20;   // thụt lề theo độ sâu

                    return (
                      <div key={dept.id}>
                        {/* Department Row */}
                        <div style={{ paddingLeft: deptPad }} className="flex items-center justify-between p-3 sm:p-4 hover:bg-hover transition-colors border-b border-line-subtle last:border-b-0">
                          <div className={`flex items-center gap-3 flex-1 min-w-0 ${dept.is_active === false ? 'opacity-50' : ''}`}>
                            {deptHasChildren ? (
                              <button
                                onClick={() => toggleDepartmentExpanded(dept.id)}
                                className="flex-shrink-0 p-1 hover:bg-hover-strong rounded transition-colors"
                              >
                                {isDeptExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                            ) : (
                              <div className="w-7" />
                            )}
                            <FolderOpen size={16} className="text-amber-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-2xs sm:text-xs font-600 text-foreground flex items-center gap-2 flex-wrap">
                                <span className="truncate">{dept.name}</span>
                                {dept.is_active === false && <HiddenBadge />}
                                <HeadBadge n={personnel.deptUsers[dept.id] ?? 0} />
                                <LeadBadge head={personnel.heads[dept.id]} />
                              </h4>
                              {dept.description && (
                                <p className="text-2xs text-muted-foreground/70 truncate">{dept.description}</p>
                              )}
                              <TagChips type="department" id={dept.id} />
                            </div>
                          </div>

                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            {dept.is_active === false ? (
                              <HiddenUnitActions type="department" id={dept.id} name={dept.name} />
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setShowDepartmentForm(true);
                                    setEditingItem(null);
                                    setSelectedCompanyId(dept.company_id);
                                    setDepartmentTagIds([]);
                                    setDepartmentDeputies([]);
                                    setDepartmentAssistants([]);
                                    setDepartmentForm({ name: '', code: '', description: '', head_id: '', budget: '', parent_department_id: dept.id, display_order: '' });
                                  }}
                                  className="p-1.5 hover:bg-hover-strong rounded transition-colors"
                                  title="Thêm phòng ban con"
                                >
                                  <Plus size={12} className="text-indigo-400" />
                                </button>
                                <button
                                  onClick={() => {
                                    setShowSubDepartmentForm(true);
                                    setEditingItem(null);
                                    setSelectedDepartmentId(dept.id);
                                    setSubDepartmentTagIds([]);
                                    setSubDepartmentDeputies([]);
                                    setSubDepartmentAssistants([]);
                                    setSubDepartmentForm({ name: '', code: '', description: '', head_id: '', budget: '', parent_sub_department_id: '', display_order: '' });
                                  }}
                                  className="p-1.5 hover:bg-hover-strong rounded transition-colors"
                                  title="Thêm bộ phận"
                                >
                                  <Plus size={12} className="text-emerald-400" />
                                </button>
                                <button
                                  onClick={() => handleEditDepartment(dept)}
                                  className="p-1.5 hover:bg-hover-strong rounded transition-colors"
                                  title="Chỉnh sửa"
                                >
                                  <Edit2 size={12} className="text-foreground" />
                                </button>
                                <button
                                  onClick={() => { setConvertDept({ id: dept.id, name: dept.name, company_id: dept.company_id }); setConvertTarget(''); }}
                                  className="p-1.5 hover:bg-hover-strong rounded transition-colors"
                                  title="Chuyển thành bộ phận (đưa nguyên cụm xuống 1 cấp)"
                                >
                                  <CornerDownRight size={12} className="text-amber-400" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDepartment(dept.id)}
                                  className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                                  title="Xóa"
                                >
                                  <Trash2 size={12} className="text-red-400" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Sub-departments List */}
                        {isDeptExpanded && subDepts.length > 0 && (
                          <div className="bg-black/40 border-t border-line-subtle">
                            {subDepts.map((subDept) => {
                              const staff = personnel.subStaff[subDept.id] ?? [];
                              const staffExpanded = expandedStaffSubDepts.has(subDept.id);
                              return (
                              <div key={subDept.id} className="border-b border-line-subtle last:border-b-0">
                                <div style={{ paddingLeft: deptPad + 24 }} className="flex items-center justify-between p-3 sm:p-4 hover:bg-hover transition-colors">
                                <div className={`flex items-center gap-3 flex-1 min-w-0 ${subDept.is_active === false ? 'opacity-50' : ''}`}>
                                  {staff.length > 0 ? (
                                    <button
                                      onClick={() => toggleStaffSubDept(subDept.id)}
                                      className="flex-shrink-0 p-1 hover:bg-hover-strong rounded transition-colors"
                                      title={staffExpanded ? 'Thu gọn nhân sự' : 'Xem nhân sự'}
                                    >
                                      {staffExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  ) : (
                                    <div className="w-6" />
                                  )}
                                  <Layers size={14} className="text-cyan-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h5 className="text-2xs sm:text-xs font-500 text-foreground flex items-center gap-2 flex-wrap">
                                      <span className="truncate">{subDept.name}</span>
                                      {subDept.is_active === false && <HiddenBadge />}
                                      <HeadBadge n={personnel.subUsers[subDept.id] ?? 0} />
                                      <LeadBadge head={personnel.heads[subDept.id]} />
                                    </h5>
                                    {subDept.description && (
                                      <p className="text-2xs text-muted-foreground/70 truncate">{subDept.description}</p>
                                    )}
                                    <TagChips type="sub_department" id={subDept.id} />
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                  {subDept.is_active === false ? (
                                    <HiddenUnitActions type="sub_department" id={subDept.id} name={subDept.name} />
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleEditSubDepartment(subDept)}
                                        className="p-1.5 hover:bg-hover-strong rounded transition-colors"
                                        title="Chỉnh sửa"
                                      >
                                        <Edit2 size={12} className="text-foreground" />
                                      </button>
                                      <button
                                        onClick={() => { setMoveSub({ id: subDept.id, name: subDept.name, department_id: subDept.department_id }); setMoveTarget(''); }}
                                        className="p-1.5 hover:bg-hover-strong rounded transition-colors"
                                        title="Chuyển sang phòng ban khác (đưa nguyên cụm)"
                                      >
                                        <CornerDownRight size={12} className="text-amber-400" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteSubDepartment(subDept.id)}
                                        className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                                        title="Xóa"
                                      >
                                        <Trash2 size={12} className="text-red-400" />
                                      </button>
                                    </>
                                  )}
                                </div>
                                </div>

                                {/* Danh sách nhân sự của bộ phận */}
                                {staffExpanded && staff.length > 0 && (
                                  <StaffList staff={staff} padLeft={deptPad + 48} />
                                )}
                              </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Nhân sự ở cấp phòng ban (chưa gán bộ phận) */}
                        {isDeptExpanded && deptStaff.length > 0 && (
                          <StaffList staff={deptStaff} padLeft={deptPad + 24} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
            </React.Fragment>
          );
        })}

        {companies.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">Chưa có công ty nào</p>
            <button
              onClick={() => {
                setShowCompanyForm(true);
                setEditingItem(null);
                setCompanyHeadId('');
                setCompanyDeputies([]);
                setCompanyAssistants([]);
                setCompanyForm({ ...EMPTY_COMPANY_FORM }); setCompanyFormTab('info');
            resetLogoState();
              }}
              className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px] mx-auto"
            >
              <Plus size={16} />
              Tạo công ty đầu tiên
            </button>
          </div>
        )}
      </div>


      {manageGroups && (
        <GroupManagerModal
          groups={groups}
          authHeaders={buildAuthHeaders}
          onClose={() => setManageGroups(false)}
          onChanged={loadAllData}
        />
      )}

      {/* Modals */}
      {moveSub && (() => {
        const curDept = departments.find(d => d.id === moveSub.department_id);
        const companyId = curDept?.company_id;
        const targets = departments.filter(d => d.company_id === companyId && d.id !== moveSub.department_id && d.is_active !== false);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !movingSub && setMoveSub(null)}>
            <div className="bg-slate-900 border border-line rounded-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="flex items-center gap-2 text-sm sm:text-base font-700 text-foreground">
                  <CornerDownRight size={18} className="text-amber-400" /> Chuyển bộ phận sang phòng ban khác
                </h3>
                <button onClick={() => !movingSub && setMoveSub(null)} className="p-1.5 hover:bg-hover-strong rounded"><X size={16} className="text-muted-foreground" /></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Đưa nguyên cụm bộ phận <span className="font-600 text-foreground">&quot;{moveSub.name}&quot;</span> (kèm toàn bộ nhân sự &amp; người đứng đầu)
                  sang một phòng ban khác{curDept ? <> (đang thuộc <span className="text-foreground">{curDept.name}</span>)</> : ''}.
                </p>
                <div>
                  <label className="block text-2xs font-600 text-muted-foreground uppercase mb-2">Chuyển tới phòng ban</label>
                  {targets.length === 0 ? (
                    <p className="text-xs text-amber-400">Công ty này chưa có phòng ban nào khác để chuyển tới.</p>
                  ) : (
                    <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600">
                      <option value="">— Chọn phòng ban đích —</option>
                      {targets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                <button onClick={() => setMoveSub(null)} disabled={movingSub} className="px-4 py-2 rounded-lg text-xs sm:text-sm text-muted-foreground hover:bg-hover-strong disabled:opacity-50">Hủy</button>
                <button onClick={doMoveSubDepartment} disabled={!moveTarget || movingSub}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-600 bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50">
                  {movingSub ? <Loader2 size={14} className="animate-spin" /> : <CornerDownRight size={14} />} Chuyển
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {convertDept && (() => {
        const targets = departments.filter(d => d.company_id === convertDept.company_id && d.id !== convertDept.id && d.is_active !== false);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !converting && setConvertDept(null)}>
            <div className="bg-slate-900 border border-line rounded-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="flex items-center gap-2 text-sm sm:text-base font-700 text-foreground">
                  <CornerDownRight size={18} className="text-amber-400" /> Chuyển thành bộ phận
                </h3>
                <button onClick={() => !converting && setConvertDept(null)} className="p-1.5 hover:bg-hover-strong rounded"><X size={16} className="text-muted-foreground" /></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Đưa nguyên cụm <span className="font-600 text-foreground">&quot;{convertDept.name}&quot;</span> (kèm toàn bộ nhân sự &amp; người đứng đầu)
                  xuống thành <span className="text-amber-400">bộ phận</span> trực thuộc một phòng ban khác. Phòng ban cũ sẽ bị gỡ.
                </p>
                <div>
                  <label className="block text-2xs font-600 text-muted-foreground uppercase mb-2">Trực thuộc phòng ban</label>
                  {targets.length === 0 ? (
                    <p className="text-xs text-amber-400">Công ty này chưa có phòng ban nào khác để chuyển vào.</p>
                  ) : (
                    <select value={convertTarget} onChange={e => setConvertTarget(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600">
                      <option value="">— Chọn phòng ban đích —</option>
                      {targets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                </div>
                <p className="text-2xs text-amber-400/80">
                  ⚠️ Nếu phòng ban còn <b>bộ phận con</b>, hãy xử lý các bộ phận con trước — bộ phận không lồng thêm cấp.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
                <button onClick={() => setConvertDept(null)} disabled={converting} className="px-4 py-2 rounded-lg text-xs sm:text-sm text-muted-foreground hover:bg-hover-strong disabled:opacity-50">Hủy</button>
                <button onClick={doConvertDepartment} disabled={!convertTarget || converting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-600 bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50">
                  {converting ? <Loader2 size={14} className="animate-spin" /> : <CornerDownRight size={14} />} Chuyển
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {viewCompany && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewCompany(null)}>
          <div className="bg-slate-900 border border-line rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={18} className="text-indigo-400 flex-shrink-0" />
                <h3 className="text-sm sm:text-base font-700 text-foreground truncate">{viewCompany.business_name || viewCompany.name}</h3>
              </div>
              <button onClick={() => setViewCompany(null)} className="p-1.5 hover:bg-hover-strong rounded transition-colors flex-shrink-0"><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <div className="divide-y divide-line">
                {([
                  ['Tên công ty', viewCompany.name],
                  ['Mã công ty', viewCompany.code],
                  ['Tên quốc tế', viewCompany.international_name],
                  ['Tên viết tắt', viewCompany.short_name],
                  ['Mã số thuế', viewCompany.tax_code],
                  ['Tình trạng', viewCompany.status],
                  ['Ngày hoạt động', viewCompany.activation_date],
                  ['Loại hình doanh nghiệp', viewCompany.business_type],
                  ['Người đại diện pháp luật', viewCompany.legal_representative],
                  ['Điện thoại', viewCompany.phone],
                  ['Email', viewCompany.email],
                  ['Website', viewCompany.website || viewCompany.website_url],
                  ['Địa chỉ trụ sở', viewCompany.address],
                  ['Địa chỉ thuế', viewCompany.tax_address],
                  ['Địa chỉ xuất hóa đơn', viewCompany.invoice_address],
                  ['Quản lý bởi', viewCompany.managing_tax_office],
                  ['Ngành nghề chính', viewCompany.main_business_line],
                ] as [string, string | undefined][])
                  .filter(([, v]) => v && String(v).trim())
                  .map(([label, value]) => (
                    <div key={label} className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5">
                      <span className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase">{label}</span>
                      <span className="text-xs sm:text-sm text-foreground break-words">{value}</span>
                    </div>
                  ))}
                {viewCompany.business_lines && viewCompany.business_lines.trim() && (
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5">
                    <span className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase">Ngành nghề kinh doanh</span>
                    <div className="space-y-1">
                      {viewCompany.business_lines.split('\n').filter(l => l.trim()).map((line, i) => (
                        <p key={i} className="text-xs sm:text-sm text-foreground break-words">{line.trim()}</p>
                      ))}
                    </div>
                  </div>
                )}
                {viewCompany.description && viewCompany.description.trim() && (
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5">
                    <span className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase">Mô tả</span>
                    <span className="text-xs sm:text-sm text-foreground break-words whitespace-pre-wrap">{viewCompany.description}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3 flex-shrink-0">
              <button onClick={() => setViewCompany(null)} className="px-4 py-2 rounded-lg text-xs sm:text-sm text-muted-foreground hover:bg-hover-strong transition-colors">Đóng</button>
              <button
                onClick={() => { const c = viewCompany; if (!c) return; setViewCompany(null); handleEditCompany(c); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                <Edit2 size={14} /> Chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}
      {showCompanyForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={companyGuard.guardedClose}>
          <div className="bg-slate-900 border border-line rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="border-b border-line flex-shrink-0">
              <div className="px-4 sm:px-6 pt-4 sm:pt-6">
                <h2 className="text-sm sm:text-base font-600 text-foreground">
                  {editingItem?.type === 'company' ? 'Chỉnh sửa công ty' : 'Tạo công ty mới'}
                </h2>
              </div>
              <div className="flex gap-1 px-4 sm:px-6 mt-3">
                {([['info', 'Thông tin công ty'], ['people', 'Nhân sự & Phân loại']] as const).map(([key, tabLabel]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCompanyFormTab(key)}
                    className={`px-3 py-2 text-2xs sm:text-xs font-600 border-b-2 -mb-px transition-colors ${
                      companyFormTab === key ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
            </div>
            <form onSubmit={handleCompanySubmit} onChange={companyGuard.markDirty} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 p-4 sm:p-6">
                <div className={companyFormTab === 'info' ? 'space-y-4' : 'hidden'}>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên công ty *</label>
                <input
                  type="text"
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: FADO Group"
                />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Mã công ty *</label>
                <input
                  type="text"
                  value={companyForm.code}
                  onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })}
                  className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto uppercase"
                  placeholder="VD: PS"
                />
                <p className="text-2xs text-muted-foreground mt-1">Dùng để sinh mã hợp đồng (token {'{COMPANY}'}). Viết tắt, không dấu, duy nhất.</p>
              </div>

              <div className="pt-1 flex items-center justify-between gap-2">
                <p className="text-2xs font-600 text-muted-foreground/70 uppercase tracking-wider">Thông tin pháp lý (không bắt buộc)</p>
                <button
                  type="button"
                  onClick={() => {
                    const lines = ([
                      ['Tên công ty', companyForm.name],
                      ['Mã số thuế', companyForm.tax_code],
                      ['Địa chỉ', companyForm.address],
                      ['Email', companyForm.email],
                    ] as [string, string][])
                      .filter(([, v]) => v && v.trim())
                      .map(([k, v]) => `${k}: ${v.trim()}`);
                    if (lines.length === 0) { toast.info('Chưa có thông tin để copy'); return; }
                    navigator.clipboard.writeText(lines.join('\n'))
                      .then(() => toast.success('Đã copy thông tin công ty'))
                      .catch(() => toast.error('Không copy được, thử lại'));
                  }}
                  title="Copy tên công ty, mã số thuế, địa chỉ, email"
                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-2xs text-muted-foreground hover:text-foreground hover:border-indigo-600 transition-colors"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên pháp lý đầy đủ</label>
                <input type="text" value={companyForm.business_name} onChange={(e) => setCompanyForm({ ...companyForm, business_name: e.target.value })} className={FIELD_CLS} placeholder="VD: Công ty TNHH FADO Group" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Mã số thuế</label>
                  <input type="text" value={companyForm.tax_code} onChange={(e) => setCompanyForm({ ...companyForm, tax_code: e.target.value })} className={FIELD_CLS} placeholder="VD: 0312345678" />
                </div>
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Người đại diện pháp luật</label>
                  <input type="text" value={companyForm.legal_representative} onChange={(e) => setCompanyForm({ ...companyForm, legal_representative: e.target.value })} className={FIELD_CLS} placeholder="Họ tên người đại diện" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Điện thoại</label>
                  <input type="tel" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} className={FIELD_CLS} placeholder="VD: 028 1234 5678" />
                </div>
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Email</label>
                  <input type="email" value={companyForm.email} onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })} className={FIELD_CLS} placeholder="VD: info@fado.vn" />
                </div>
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Website</label>
                <input type="text" value={companyForm.website} onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })} className={FIELD_CLS} placeholder="https://..." />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Địa chỉ trụ sở</label>
                <input type="text" value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} className={FIELD_CLS} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP" />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Địa chỉ xuất hóa đơn</label>
                <input type="text" value={companyForm.invoice_address} onChange={(e) => setCompanyForm({ ...companyForm, invoice_address: e.target.value })} className={FIELD_CLS} placeholder="Nếu khác địa chỉ trụ sở" />
              </div>

              {/* Thông tin tra cứu masothue.com */}
              <div className="pt-1">
                <p className="text-2xs font-600 text-muted-foreground/70 uppercase tracking-wider">Tra cứu masothue.com</p>
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên quốc tế</label>
                <input type="text" value={companyForm.international_name} onChange={(e) => setCompanyForm({ ...companyForm, international_name: e.target.value })} className={FIELD_CLS} placeholder="VD: RATRACO SOLUTIONS TRANSPORT COMPANY LIMITED" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên viết tắt</label>
                  <input type="text" value={companyForm.short_name} onChange={(e) => setCompanyForm({ ...companyForm, short_name: e.target.value })} className={FIELD_CLS} placeholder="VD: RATRACO SOLUTIONS TRANSPORT" />
                </div>
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Loại hình doanh nghiệp</label>
                  <input type="text" value={companyForm.business_type} onChange={(e) => setCompanyForm({ ...companyForm, business_type: e.target.value })} className={FIELD_CLS} placeholder="VD: Công ty TNHH 2 thành viên trở lên" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tình trạng</label>
                  <input type="text" value={companyForm.status} onChange={(e) => setCompanyForm({ ...companyForm, status: e.target.value })} className={FIELD_CLS} placeholder="VD: Đang hoạt động" />
                </div>
                <div>
                  <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Ngày hoạt động</label>
                  <input type="text" value={companyForm.activation_date} onChange={(e) => setCompanyForm({ ...companyForm, activation_date: e.target.value })} className={FIELD_CLS} placeholder="VD: 2020-02-11" />
                </div>
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Địa chỉ thuế</label>
                <input type="text" value={companyForm.tax_address} onChange={(e) => setCompanyForm({ ...companyForm, tax_address: e.target.value })} className={FIELD_CLS} placeholder="Địa chỉ đăng ký thuế (nếu khác trụ sở)" />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Quản lý bởi (cơ quan thuế)</label>
                <input type="text" value={companyForm.managing_tax_office} onChange={(e) => setCompanyForm({ ...companyForm, managing_tax_office: e.target.value })} className={FIELD_CLS} placeholder="VD: Thuế cơ sở 16 Thành phố Hồ Chí Minh" />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Ngành nghề chính</label>
                <input type="text" value={companyForm.main_business_line} onChange={(e) => setCompanyForm({ ...companyForm, main_business_line: e.target.value })} className={FIELD_CLS} placeholder="VD: Hoạt động dịch vụ hỗ trợ khác liên quan đến vận tải" />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Ngành nghề kinh doanh</label>
                <textarea
                  value={companyForm.business_lines}
                  onChange={(e) => setCompanyForm({ ...companyForm, business_lines: e.target.value })}
                  className="w-full px-2 sm:px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[88px]"
                  placeholder={'Mỗi dòng 1 ngành, VD:\n4933 - Vận tải hàng hóa bằng đường bộ\n5210 - Kho bãi và lưu giữ hàng hóa'}
                />
              </div>

              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Mô tả</label>
                <textarea
                  value={companyForm.description}
                  onChange={(e) => setCompanyForm({ ...companyForm, description: e.target.value })}
                  className="w-full px-2 sm:px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[88px]"
                  placeholder="Mô tả công ty"
                />
              </div>
              {/* Logo công ty — 4 biến thể */}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Logo công ty</label>
                {!companyFormCompanyId && (
                  <p className="text-2xs text-amber-400/80 mb-2">Lưu công ty trước rồi mới tải logo lên được.</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LOGO_SLOTS.map(({ variant, label, hint, dark }) => {
                    const preview = logoPreviews[variant] || existingLogoUrls[variant] || '';
                    return (
                      <div key={variant} className="rounded-xl border border-line p-3 bg-surface-2">
                        <p className="text-2xs sm:text-xs font-600 text-foreground">{label}</p>
                        <p className="text-2xs text-muted-foreground/60 mb-2">{hint}</p>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line"
                            style={{ background: dark ? '#0b1220' : '#ffffff' }}
                          >
                            {preview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={preview} alt={label} className="h-full w-full object-contain" />
                            ) : (
                              <Building2 size={22} className={dark ? 'text-white/30' : 'text-slate-400'} />
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-hover px-2.5 py-1.5 text-2xs font-600 text-foreground hover:bg-hover-strong">
                              <ImagePlus size={14} className="text-indigo-400" />
                              {preview ? 'Đổi' : 'Tải lên'}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => pickLogo(variant, e.target.files?.[0] ?? null)}
                              />
                            </label>
                            {preview && (
                              <button
                                type="button"
                                onClick={() => clearLogo(variant)}
                                className="inline-flex w-fit items-center gap-1 text-2xs text-red-400 hover:text-red-300"
                              >
                                <X size={12} /> Gỡ
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-2xs text-muted-foreground/60 mt-2">PNG/SVG nền trong suốt, ≤ 2MB. Tự giữ tỉ lệ. Biến thể trống sẽ tự dùng &quot;Logo màu&quot; thay thế.</p>
              </div>
                </div>

                <div className={companyFormTab === 'people' ? 'space-y-4' : 'hidden'}>
              <HeadPicker
                value={companyHeadId}
                onChange={setCompanyHeadId}
                users={companyFormCompanyId ? assignableByCompany[companyFormCompanyId] ?? [] : []}
                fallbackUsers={allUsers}
                loading={!!companyFormCompanyId && assignableLoading && !assignableByCompany[companyFormCompanyId]}
              />
              <RoleMultiPicker
                label="Phó đơn vị"
                emptyLabel="— Chưa có Phó đơn vị —"
                helpText="Chọn được nhiều người. Một người không giữ 2 vai trò cùng đơn vị."
                selected={companyDeputies}
                onChange={setCompanyDeputies}
                users={companyFormCompanyId ? assignableByCompany[companyFormCompanyId] ?? [] : []}
                blocked={[
                  ...(companyHeadId ? [{ id: companyHeadId, reason: 'Đang là Trưởng' }] : []),
                  ...companyAssistants.map((a) => ({ id: a.id, reason: 'Đang là Trợ lý' })),
                ]}
                loading={!!companyFormCompanyId && assignableLoading && !assignableByCompany[companyFormCompanyId]}
              />
              <RoleMultiPicker
                label="Trợ lý đơn vị"
                emptyLabel="— Chưa có Trợ lý đơn vị —"
                helpText="Chọn được nhiều người. Một người không giữ 2 vai trò cùng đơn vị."
                selected={companyAssistants}
                onChange={setCompanyAssistants}
                users={companyFormCompanyId ? assignableByCompany[companyFormCompanyId] ?? [] : []}
                blocked={[
                  ...(companyHeadId ? [{ id: companyHeadId, reason: 'Đang là Trưởng' }] : []),
                  ...companyDeputies.map((d) => ({ id: d.id, reason: 'Đang là Phó' })),
                ]}
                loading={!!companyFormCompanyId && assignableLoading && !assignableByCompany[companyFormCompanyId]}
              />
              {companyFormCompanyId && companyLevelPositions.length > 0 && (
                <div className="pt-2 border-t border-line-subtle">
                  <p className="text-2xs sm:text-xs font-700 text-indigo-400 uppercase mb-1">Chức vụ cấp công ty</p>
                  <p className="text-2xs text-muted-foreground/70 mb-3">Gán Giám Đốc, GĐĐH, Founder, Cố Vấn… — hiện ở Ban Lãnh Đạo của công ty & sơ đồ. Không đụng phòng ban/chấm công của họ.</p>
                  <div className="space-y-3">
                    {companyLevelPositions.map(pos => (
                      <RoleMultiPicker
                        key={pos.id}
                        label={pos.name}
                        emptyLabel={`— Chưa gán ${pos.name} —`}
                        helpText="Chọn được nhiều người."
                        selected={positionHolders[pos.id] ?? []}
                        onChange={list => setPositionHolders(prev => ({ ...prev, [pos.id]: list }))}
                        users={companyFormCompanyId ? assignableByCompany[companyFormCompanyId] ?? [] : []}
                        blocked={[]}
                        loading={!!companyFormCompanyId && assignableLoading && !assignableByCompany[companyFormCompanyId]}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tags Tổ Chức</label>
                <OrgTagPicker tags={orgTags} selected={companyTagIds} onChange={setCompanyTagIds} />
              </div>
                </div>
              </div>
              <div className="flex gap-3 p-4 sm:p-6 border-t border-line flex-shrink-0">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={companyGuard.guardedClose}
                  className="flex-1 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 bg-hover-strong text-foreground hover:bg-white/20 min-h-[44px]"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDepartmentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={departmentGuard.guardedClose}>
          <div className="bg-slate-900 border border-line rounded-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-line">
              <h2 className="text-sm sm:text-base font-600 text-foreground">
                {editingItem?.type === 'department' ? 'Chỉnh sửa phòng ban' : 'Tạo phòng ban mới'}
              </h2>
            </div>
            <form onSubmit={handleDepartmentSubmit} onChange={departmentGuard.markDirty} className="space-y-4 p-4 sm:p-6">
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên phòng ban *</label>
                <input
                  type="text"
                  value={departmentForm.name}
                  onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}
                  className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: Phòng Kế Toán"
                />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Thuộc phòng ban cha (để trống = cấp cao nhất)</label>
                <select
                  value={departmentForm.parent_department_id}
                  onChange={(e) => setDepartmentForm({ ...departmentForm, parent_department_id: e.target.value })}
                  className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto"
                >
                  <option value="">— Không (phòng ban cấp cao nhất) —</option>
                  {departments
                    .filter(d => d.company_id === departmentFormCompanyId
                      && (editingItem?.type !== 'department' || d.id !== editingItem.id))
                    .map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="text-2xs text-muted-foreground/70 mt-1">Cho phép lồng nhiều tầng: phòng ban lớn → phòng ban nhỏ → …</p>
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Mô tả</label>
                <textarea
                  value={departmentForm.description}
                  onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })}
                  className="w-full px-2 sm:px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[88px]"
                  placeholder="Mô tả phòng ban"
                />
              </div>
              <HeadPicker
                value={departmentForm.head_id}
                onChange={(v) => setDepartmentForm({ ...departmentForm, head_id: v })}
                users={departmentFormCompanyId ? assignableByCompany[departmentFormCompanyId] ?? [] : []}
                fallbackUsers={allUsers}
                loading={!!departmentFormCompanyId && assignableLoading && !assignableByCompany[departmentFormCompanyId]}
              />
              <RoleMultiPicker
                label="Phó đơn vị"
                emptyLabel="— Chưa có Phó đơn vị —"
                helpText="Chọn được nhiều người. Một người không giữ 2 vai trò cùng đơn vị."
                selected={departmentDeputies}
                onChange={setDepartmentDeputies}
                users={departmentFormCompanyId ? assignableByCompany[departmentFormCompanyId] ?? [] : []}
                blocked={[
                  ...(departmentForm.head_id ? [{ id: departmentForm.head_id, reason: 'Đang là Trưởng' }] : []),
                  ...departmentAssistants.map((a) => ({ id: a.id, reason: 'Đang là Trợ lý' })),
                ]}
                loading={!!departmentFormCompanyId && assignableLoading && !assignableByCompany[departmentFormCompanyId]}
              />
              <RoleMultiPicker
                label="Trợ lý đơn vị"
                emptyLabel="— Chưa có Trợ lý đơn vị —"
                helpText="Chọn được nhiều người. Một người không giữ 2 vai trò cùng đơn vị."
                selected={departmentAssistants}
                onChange={setDepartmentAssistants}
                users={departmentFormCompanyId ? assignableByCompany[departmentFormCompanyId] ?? [] : []}
                blocked={[
                  ...(departmentForm.head_id ? [{ id: departmentForm.head_id, reason: 'Đang là Trưởng' }] : []),
                  ...departmentDeputies.map((d) => ({ id: d.id, reason: 'Đang là Phó' })),
                ]}
                loading={!!departmentFormCompanyId && assignableLoading && !assignableByCompany[departmentFormCompanyId]}
              />
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tags Tổ Chức</label>
                <OrgTagPicker tags={orgTags} selected={departmentTagIds} onChange={setDepartmentTagIds} />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={departmentGuard.guardedClose}
                  className="flex-1 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 bg-hover-strong text-foreground hover:bg-white/20 min-h-[44px]"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSubDepartmentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={subDepartmentGuard.guardedClose}>
          <div className="bg-slate-900 border border-line rounded-lg max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-line">
              <h2 className="text-sm sm:text-base font-600 text-foreground">
                {editingItem?.type === 'subdepartment' ? 'Chỉnh sửa bộ phận' : 'Tạo bộ phận mới'}
              </h2>
            </div>
            <form onSubmit={handleSubDepartmentSubmit} onChange={subDepartmentGuard.markDirty} className="space-y-4 p-4 sm:p-6">
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tên bộ phận *</label>
                <input
                  type="text"
                  value={subDepartmentForm.name}
                  onChange={(e) => setSubDepartmentForm({ ...subDepartmentForm, name: e.target.value })}
                  className="w-full h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[44px] sm:min-h-auto"
                  placeholder="VD: Kế Toán Tổng Hợp"
                />
              </div>
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Mô tả</label>
                <textarea
                  value={subDepartmentForm.description}
                  onChange={(e) => setSubDepartmentForm({ ...subDepartmentForm, description: e.target.value })}
                  className="w-full px-2 sm:px-3 py-2 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 min-h-[88px]"
                  placeholder="Mô tả bộ phận"
                />
              </div>
              <HeadPicker
                value={subDepartmentForm.head_id}
                onChange={(v) => setSubDepartmentForm({ ...subDepartmentForm, head_id: v })}
                users={subDepartmentFormCompanyId ? assignableByCompany[subDepartmentFormCompanyId] ?? [] : []}
                fallbackUsers={allUsers}
                loading={!!subDepartmentFormCompanyId && assignableLoading && !assignableByCompany[subDepartmentFormCompanyId]}
              />
              <RoleMultiPicker
                label="Phó đơn vị"
                emptyLabel="— Chưa có Phó đơn vị —"
                helpText="Chọn được nhiều người. Một người không giữ 2 vai trò cùng đơn vị."
                selected={subDepartmentDeputies}
                onChange={setSubDepartmentDeputies}
                users={subDepartmentFormCompanyId ? assignableByCompany[subDepartmentFormCompanyId] ?? [] : []}
                blocked={[
                  ...(subDepartmentForm.head_id ? [{ id: subDepartmentForm.head_id, reason: 'Đang là Trưởng' }] : []),
                  ...subDepartmentAssistants.map((a) => ({ id: a.id, reason: 'Đang là Trợ lý' })),
                ]}
                loading={!!subDepartmentFormCompanyId && assignableLoading && !assignableByCompany[subDepartmentFormCompanyId]}
              />
              <RoleMultiPicker
                label="Trợ lý đơn vị"
                emptyLabel="— Chưa có Trợ lý đơn vị —"
                helpText="Chọn được nhiều người. Một người không giữ 2 vai trò cùng đơn vị."
                selected={subDepartmentAssistants}
                onChange={setSubDepartmentAssistants}
                users={subDepartmentFormCompanyId ? assignableByCompany[subDepartmentFormCompanyId] ?? [] : []}
                blocked={[
                  ...(subDepartmentForm.head_id ? [{ id: subDepartmentForm.head_id, reason: 'Đang là Trưởng' }] : []),
                  ...subDepartmentDeputies.map((d) => ({ id: d.id, reason: 'Đang là Phó' })),
                ]}
                loading={!!subDepartmentFormCompanyId && assignableLoading && !assignableByCompany[subDepartmentFormCompanyId]}
              />
              <div>
                <label className="block text-2xs sm:text-xs font-600 text-muted-foreground uppercase mb-2">Tags Tổ Chức</label>
                <OrgTagPicker tags={orgTags} selected={subDepartmentTagIds} onChange={setSubDepartmentTagIds} />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 btn-accent min-h-[44px]"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={subDepartmentGuard.guardedClose}
                  className="flex-1 h-10 px-3 sm:px-4 rounded-lg text-2xs sm:text-xs font-600 bg-hover-strong text-foreground hover:bg-white/20 min-h-[44px]"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modal quản lý Nhóm / Tập đoàn / HĐQT (tầng trên công ty). Thêm/sửa/xoá; lồng nhau tuỳ ý. */
function GroupManagerModal({ groups, authHeaders, onClose, onChanged }: {
  groups: CompanyGroupRow[];
  authHeaders: () => Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<{ name: string; parent_id: string }>({ name: '', parent_id: '' });
  const [busy, setBusy] = useState(false);

  const call = async (fn: () => Promise<Response>) => {
    setBusy(true);
    try { const r = await fn(); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Thất bại'); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Thất bại'); } finally { setBusy(false); }
  };
  const H = () => ({ 'Content-Type': 'application/json', ...authHeaders() });

  const add = async () => {
    if (!draft.name.trim()) return toast.error('Nhập tên nhóm');
    await call(() => fetch('/api/organizations/company-groups', { method: 'POST', headers: H(), body: JSON.stringify({ name: draft.name, parent_id: draft.parent_id || null }) }));
    setDraft({ name: '', parent_id: '' });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-base font-700 text-foreground">Nhóm / Tập đoàn / HĐQT</h2>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-2xs text-muted-foreground">Tầng GOM các công ty (lồng nhau được: Tập đoàn → HĐQT → …). Chỉ để tổ chức & hiển thị — không ảnh hưởng chấm công/quyền.</p>
          {groups.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Chưa có nhóm nào</p>}
          {[...groups].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'vi')).map(g => (
            <div key={g.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2" style={{ background: 'var(--input)' }}>
              <input defaultValue={g.name} disabled={busy}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.name) call(() => fetch(`/api/organizations/company-groups/${g.id}`, { method: 'PUT', headers: H(), body: JSON.stringify({ name: v }) })); }}
                className="flex-1 h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
              <select defaultValue={g.parent_id ?? ''} disabled={busy}
                onChange={e => call(() => fetch(`/api/organizations/company-groups/${g.id}`, { method: 'PUT', headers: H(), body: JSON.stringify({ parent_id: e.target.value || null }) }))}
                className="h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line max-w-[150px]">
                <option value="">— Nhóm gốc —</option>
                {groups.filter(x => x.id !== g.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button disabled={busy} onClick={async () => { if (await confirm({ title: 'Xoá nhóm', message: `Xoá "${g.name}"? Công ty trong nhóm sẽ về "Chưa thuộc nhóm".`, confirmLabel: 'Xoá', danger: true })) call(() => fetch(`/api/organizations/company-groups/${g.id}`, { method: 'DELETE', headers: authHeaders() })); }}
                className="btn-ghost rounded-lg p-1.5 text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2">
            <input placeholder="Tên nhóm (VD: Tập đoàn FADO)" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
              className="flex-1 h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line" />
            <select value={draft.parent_id} onChange={e => setDraft({ ...draft, parent_id: e.target.value })}
              className="h-8 px-2 rounded-lg text-xs text-foreground bg-surface-2 border border-line max-w-[150px]">
              <option value="">— Nhóm gốc —</option>
              {groups.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button disabled={busy} onClick={add} className="h-8 px-3 rounded-lg text-xs font-600 bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1"><Plus size={14} /> Thêm</button>
          </div>
        </div>
        <div className="flex justify-end border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn-ghost rounded-xl px-4 py-2 text-sm">Đóng</button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useMemo } from 'react';
import { Building2, ShieldCheck, ChevronRight } from 'lucide-react';
import { normalizeVN } from '@/lib/utils/searchVN';
import { getDefaultPermissions, UserModulePermissions } from '@/lib/modules';
import PermissionsPanel from './PermissionsPanel';

export interface CompanyMembershipRow {
  company_id: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  department_id: string;       // phòng ban cha
  sub_department_id: string;   // bộ phận
  position_id: string;         // chức vụ
  job_title_id: string;
  manager_id: string;
  /** Quyền module riêng TẠI công ty này (null = dùng quyền nền của vai trò). */
  module_permissions: UserModulePermissions | null;
}

interface DeptLike { id: string; name: string; parent_department_id?: string | null }
interface SubDeptLike { id: string; name: string; department_id: string }
interface PosLike { id: string; name: string }
interface ManagerLike { id: string; name: string; job_title: string }

interface Props {
  primaryCompanyId: string;
  /** User đang chỉnh — loại khỏi danh sách "Quản lý trực tiếp" (không tự làm sếp mình). */
  currentUserId?: string;
  allCompanies: Array<{ id: string; name: string }>;
  companyDepartmentsMap: Record<string, DeptLike[]>;
  allSubDepartments: SubDeptLike[];
  companyPositionsMap: Record<string, PosLike[]>;
  value: CompanyMembershipRow[];
  onChange: (rows: CompanyMembershipRow[]) => void;
  readOnly?: boolean;
}

const ROLE_OPTIONS: Array<{ value: CompanyMembershipRow['role']; label: string }> = [
  { value: 'user', label: 'Người Dùng' },
  { value: 'manager', label: 'Quản Lý' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

const selectCls =
  'w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50';

export default function MultiCompanyTab({
  primaryCompanyId,
  currentUserId,
  allCompanies,
  companyDepartmentsMap,
  allSubDepartments,
  companyPositionsMap,
  value,
  onChange,
  readOnly = false,
}: Props) {
  const [search, setSearch] = React.useState('');
  // Công ty đang mở bảng phân quyền riêng (chỉ render PermissionsPanel khi mở — nó nặng).
  const [permOpen, setPermOpen] = React.useState<string | null>(null);
  // Danh sách "Quản lý trực tiếp" theo công ty (nạp lười khi công ty được bật).
  // Endpoint /api/users/managers trả người LÀM VIỆC tại công ty đó (chính ∪ kiêm nhiệm).
  const [managersByCompany, setManagersByCompany] = React.useState<Record<string, ManagerLike[]>>({});

  // Nạp manager cho các công ty đang bật mà chưa có cache.
  const enabledCompanyIds = value.map((r) => r.company_id).join(',');
  React.useEffect(() => {
    const ids = value.map((r) => r.company_id).filter(Boolean);
    ids.forEach((cid) => {
      if (managersByCompany[cid]) return;
      fetch(`/api/users/managers?company_id=${cid}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: ManagerLike[]) =>
          setManagersByCompany((prev) => ({ ...prev, [cid]: Array.isArray(data) ? data : [] }))
        )
        .catch(() => setManagersByCompany((prev) => ({ ...prev, [cid]: [] })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledCompanyIds]);

  // Công ty hiển thị = tất cả TRỪ công ty chính.
  const companies = useMemo(() => {
    const q = normalizeVN(search).trim();
    return allCompanies
      .filter((c) => c.id !== primaryCompanyId)
      .filter((c) => !q || normalizeVN(c.name).includes(q));
  }, [allCompanies, primaryCompanyId, search]);

  const byId = useMemo(() => {
    const m = new Map<string, CompanyMembershipRow>();
    value.forEach((r) => m.set(r.company_id, r));
    return m;
  }, [value]);

  const toggle = (companyId: string, on: boolean) => {
    if (readOnly) return;
    if (on) {
      onChange([
        ...value,
        {
          company_id: companyId,
          role: 'user',
          department_id: '',
          sub_department_id: '',
          position_id: '',
          job_title_id: '',
          manager_id: '',
          module_permissions: null,
        },
      ]);
    } else {
      onChange(value.filter((r) => r.company_id !== companyId));
    }
  };

  const patch = (companyId: string, partial: Partial<CompanyMembershipRow>) => {
    if (readOnly) return;
    onChange(value.map((r) => (r.company_id === companyId ? { ...r, ...partial } : r)));
  };

  const parentDepartments = (companyId: string): DeptLike[] =>
    (companyDepartmentsMap[companyId] || []).filter((d) => !d.parent_department_id);

  const subDepartments = (departmentId: string): SubDeptLike[] =>
    allSubDepartments.filter((sd) => sd.department_id === departmentId);

  const positions = (companyId: string): PosLike[] => companyPositionsMap[companyId] || [];

  // Ứng viên "Quản lý trực tiếp" tại công ty — loại chính user đang chỉnh.
  const managers = (companyId: string): ManagerLike[] =>
    (managersByCompany[companyId] || []).filter((m) => m.id !== currentUserId);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-700 text-foreground flex items-center gap-2">
          <Building2 size={18} className="text-indigo-400" /> Đa Công Ty
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Bật các công ty khác để người này có vai trò & luồng xử lý công việc tại đó. Công ty chính
          được gán ở tab <strong>Thông Tin</strong> nên không hiển thị ở đây.
        </p>
      </div>

      {!primaryCompanyId && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
          Hãy chọn Công ty chính ở tab Thông Tin trước khi cấu hình Đa Công Ty.
        </div>
      )}

      {/* Tìm kiếm công ty */}
      {allCompanies.length > 6 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm công ty..."
          className={selectCls}
        />
      )}

      <div className="space-y-3">
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Không có công ty nào khác.</p>
        ) : (
          companies.map((c) => {
            const row = byId.get(c.id);
            const enabled = !!row;
            return (
              <div
                key={c.id}
                className={`rounded-xl border overflow-hidden transition-colors ${
                  enabled ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-line bg-white/02'
                }`}
              >
                {/* Header: toggle công ty */}
                <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Building2 size={16} className={enabled ? 'text-indigo-400' : 'text-muted-foreground'} />
                    <span className="text-sm font-600 text-foreground truncate">{c.name}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={readOnly}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                    className="h-4 w-4 accent-indigo-500 shrink-0"
                  />
                </label>

                {/* Body: cấu hình vai trò khi bật */}
                {enabled && row && (
                  <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-white/05 pt-3">
                    <div>
                      <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">
                        Vai trò
                      </label>
                      <select
                        value={row.role}
                        disabled={readOnly}
                        onChange={(e) => patch(c.id, { role: e.target.value as CompanyMembershipRow['role'] })}
                        className={selectCls}
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">
                        Phòng ban
                      </label>
                      <select
                        value={row.department_id}
                        disabled={readOnly}
                        onChange={(e) =>
                          patch(c.id, { department_id: e.target.value, sub_department_id: '' })
                        }
                        className={selectCls}
                      >
                        <option value="">— Chọn phòng ban —</option>
                        {parentDepartments(c.id).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">
                        Bộ phận
                      </label>
                      <select
                        value={row.sub_department_id}
                        disabled={readOnly || !row.department_id}
                        onChange={(e) => patch(c.id, { sub_department_id: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">— Chọn bộ phận —</option>
                        {subDepartments(row.department_id).map((sd) => (
                          <option key={sd.id} value={sd.id}>{sd.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">
                        Chức vụ
                      </label>
                      <select
                        value={row.position_id}
                        disabled={readOnly}
                        onChange={(e) => patch(c.id, { position_id: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">— Chọn chức vụ —</option>
                        {positions(c.id).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-2xs font-600 text-muted-foreground uppercase tracking-wider mb-1">
                        Quản lý trực tiếp (tại công ty này)
                      </label>
                      <select
                        value={row.manager_id}
                        disabled={readOnly}
                        onChange={(e) => patch(c.id, { manager_id: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">— Không có / cấp cao nhất —</option>
                        {managers(c.id).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.job_title && m.job_title !== 'No Title' ? ` — ${m.job_title}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Phân quyền riêng tại công ty này (kiêm nhiệm như tài khoản độc lập) */}
                    <div className="sm:col-span-2 border-t border-white/05 pt-3">
                      <button
                        type="button"
                        onClick={() => setPermOpen(permOpen === c.id ? null : c.id)}
                        className="flex items-center justify-between w-full text-left group"
                      >
                        <span className="flex items-center gap-2 text-2xs font-600 text-muted-foreground uppercase tracking-wider">
                          <ShieldCheck size={14} className="text-indigo-400" />
                          Phân quyền riêng tại công ty này
                          {row.module_permissions && (
                            <span className="normal-case text-indigo-400 border border-indigo-500/30 rounded px-1.5 py-0.5 text-2xs tracking-normal">
                              Đã tùy chỉnh
                            </span>
                          )}
                        </span>
                        <ChevronRight
                          size={16}
                          className={`text-muted-foreground transition-transform ${permOpen === c.id ? 'rotate-90' : ''}`}
                        />
                      </button>
                      <p className="text-2xs text-muted-foreground mt-1">
                        Để trống = dùng quyền nền của vai trò. Tùy chỉnh để cấp quyền như một tài khoản độc lập tại công ty này.
                      </p>

                      {permOpen === c.id && (
                        <div className="mt-3 space-y-2">
                          {row.module_permissions ? (
                            <>
                              <PermissionsPanel
                                permissions={row.module_permissions}
                                onPermissionsChange={(p) => patch(c.id, { module_permissions: p })}
                                isReadOnly={readOnly}
                              />
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => patch(c.id, { module_permissions: null })}
                                  className="text-2xs text-red-300 hover:text-red-200 underline underline-offset-2"
                                >
                                  Xóa tùy chỉnh — quay về quyền nền của vai trò
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => patch(c.id, { module_permissions: getDefaultPermissions(row.role) })}
                              className="rounded-lg border border-indigo-500/40 bg-indigo-500/5 text-indigo-300 text-xs font-500 px-3 py-2 hover:bg-indigo-500/10 disabled:opacity-50"
                            >
                              Tùy chỉnh quyền riêng cho công ty này
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

'use client';

/**
 * Form inline thêm/sửa 1 phân công tổ chức (dùng trong AssignmentsTab).
 * Cascade: Công ty → Phòng ban (optional = cấp công ty) → Bộ phận (optional)
 * → Chức danh (positions theo công ty) → Vai trò trong đơn vị → Quản lý trực tiếp.
 */

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export type OrgRole = 'head' | 'deputy' | 'assistant' | 'member';

export interface AssignmentRow {
  id: string;
  company_id: string;
  department_id: string | null;
  sub_department_id: string | null;
  position_id: string | null; // canonical (migration 225) — job_title_id là LEGACY, không dùng
  org_role: OrgRole;
  manager_id: string | null;
  is_primary: boolean;
  is_active: boolean;
  note?: string | null;
  company_name: string | null;
  department_name: string | null;
  sub_department_name: string | null;
  /** false = đơn vị đã xóa mềm — thẻ phân công gắn nhãn "(đã xóa)". */
  department_active?: boolean;
  sub_department_active?: boolean;
  position_name: string | null;
  position_rank: number | null;
  manager_name: string | null;
}

export interface AssignmentFormValue {
  company_id: string;
  department_id: string;
  sub_department_id: string;
  position_id: string;
  org_role: OrgRole;
  manager_id: string;
  is_primary: boolean;
  note: string;
}

export interface Company { id: string; name: string }
export interface Department { id: string; name: string; company_id?: string; parent_department_id?: string | null }
export interface SubDepartment { id: string; name: string; department_id: string }
interface Position { id: string; name: string; rank?: number | null }
interface Manager { id: string; name: string; job_title?: string }

export const ORG_ROLE_CONFIG: Record<OrgRole, { label: string; badge: string }> = {
  head: { label: 'Trưởng đơn vị', badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  deputy: { label: 'Phó đơn vị', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  assistant: { label: 'Trợ lý', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  member: { label: 'Thành viên', badge: 'bg-white/05 text-muted-foreground border-white/10' },
};

interface AssignmentFormProps {
  initial?: AssignmentRow; // có = đang sửa; không = thêm mới
  companies: Company[];
  departments: Department[];
  subDepartments: SubDepartment[];
  saving: boolean;
  onSubmit: (value: AssignmentFormValue) => void | Promise<void>;
  onCancel: () => void;
}

const inputCls = 'w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60';
const labelCls = 'block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5';

export default function AssignmentForm({
  initial, companies, departments, subDepartments, saving, onSubmit, onCancel,
}: AssignmentFormProps) {
  const isEditing = !!initial;
  const [value, setValue] = useState<AssignmentFormValue>({
    company_id: initial?.company_id ?? '',
    department_id: initial?.department_id ?? '',
    sub_department_id: initial?.sub_department_id ?? '',
    position_id: initial?.position_id ?? '',
    org_role: initial?.org_role ?? 'member',
    manager_id: initial?.manager_id ?? '',
    is_primary: initial?.is_primary ?? false,
    note: initial?.note ?? '',
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);

  // Chức danh (positions — nguồn canonical, migration 225) + quản lý theo công ty đã chọn
  useEffect(() => {
    if (!value.company_id) { setPositions([]); setManagers([]); return; }
    const params = new URLSearchParams({ company_id: value.company_id });
    fetch(`/api/organizations/positions?${params}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => setPositions(d || []))
      .catch(() => setPositions([]));
    fetch(`/api/users/managers?${params}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => setManagers(d || []))
      .catch(() => setManagers([]));
  }, [value.company_id]);

  const companyDepts = departments.filter(
    d => d.company_id === value.company_id && !d.parent_department_id
  );
  const deptSubs = subDepartments.filter(sd => sd.department_id === value.department_id);

  function handleCompanyChange(companyId: string) {
    setValue(p => ({ ...p, company_id: companyId, department_id: '', sub_department_id: '', position_id: '', manager_id: '' }));
  }

  return (
    <div className="rounded-2xl border border-indigo-500/20 p-4 space-y-4" style={{ background: 'var(--card)' }}>
      <h4 className="text-sm font-600 text-foreground">
        {isEditing ? '✏️ Sửa phân công' : '➕ Thêm phân công mới'}
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Công Ty *</label>
          <select
            disabled={isEditing} // API PUT không đổi công ty — sửa công ty = kết thúc + tạo mới
            value={value.company_id}
            onChange={e => handleCompanyChange(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Chọn công ty --</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {isEditing && <p className="text-2xs text-muted-foreground mt-1">Muốn đổi công ty: kết thúc phân công này và tạo phân công mới</p>}
        </div>
        <div>
          <label className={labelCls}>Phòng Ban</label>
          <select
            disabled={!value.company_id}
            value={value.department_id}
            onChange={e => setValue(p => ({ ...p, department_id: e.target.value, sub_department_id: '' }))}
            className={inputCls}
          >
            <option value="">-- Cấp công ty (không thuộc phòng ban) --</option>
            {companyDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Bộ Phận</label>
          <select
            disabled={!value.department_id || deptSubs.length === 0}
            value={value.sub_department_id}
            onChange={e => setValue(p => ({ ...p, sub_department_id: e.target.value }))}
            className={inputCls}
          >
            <option value="">-- Không thuộc bộ phận --</option>
            {deptSubs.map(sd => <option key={sd.id} value={sd.id}>{sd.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Chức Danh</label>
          <select
            disabled={!value.company_id}
            value={value.position_id}
            onChange={e => setValue(p => ({ ...p, position_id: e.target.value }))}
            className={inputCls}
          >
            <option value="">-- Chọn chức danh --</option>
            {positions.map(pos => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Vai Trò Trong Đơn Vị</label>
          <select
            value={value.org_role}
            onChange={e => setValue(p => ({ ...p, org_role: e.target.value as OrgRole }))}
            className={inputCls}
          >
            {(Object.keys(ORG_ROLE_CONFIG) as OrgRole[]).map(r => (
              <option key={r} value={r}>{ORG_ROLE_CONFIG[r].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Quản Lý Trực Tiếp</label>
          <select
            disabled={!value.company_id}
            value={value.manager_id}
            onChange={e => setValue(p => ({ ...p, manager_id: e.target.value }))}
            className={inputCls}
          >
            <option value="">-- Chưa có quản lý --</option>
            {managers.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}{m.job_title && m.job_title !== 'No Title' ? ` · ${m.job_title}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.is_primary}
          onChange={e => setValue(p => ({ ...p, is_primary: e.target.checked }))}
          className="mt-0.5 h-4 w-4 rounded border-line accent-indigo-500"
        />
        <span className="text-sm text-foreground">
          Là phân công chính
          <span className="block text-2xs text-muted-foreground">Mỗi công ty chỉ có 1 phân công chính — phân công chính cũ (nếu có) sẽ tự chuyển thành kiêm nhiệm.</span>
        </span>
      </label>

      <div>
        <label className={labelCls}>Ghi Chú</label>
        <input
          type="text"
          value={value.note}
          onChange={e => setValue(p => ({ ...p, note: e.target.value }))}
          placeholder="VD: Kiêm nhiệm phụ trách chi nhánh HCM"
          className={inputCls}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-9 px-4 rounded-xl btn-ghost text-sm font-500">Hủy</button>
        <button
          type="button"
          disabled={saving || !value.company_id}
          onClick={() => onSubmit(value)}
          className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-600 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isEditing ? 'Lưu phân công' : 'Thêm phân công'}
        </button>
      </div>
    </div>
  );
}

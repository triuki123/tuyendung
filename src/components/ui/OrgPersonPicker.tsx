'use client';

import React, { useEffect, useMemo, useState } from 'react';
import SearchableSelect, { SearchableOption } from '@/components/ui/SearchableSelect';

/** 1 nhân sự trong cây cơ cấu (khớp output /api/organizations/structure/personnel) */
type OrgRole = 'head' | 'deputy' | 'assistant' | 'member';
interface Staff {
  id: string;
  name: string;
  email: string;
  job_title?: string;
  /** Vai trò tại đơn vị (API mới) — có thể undefined với dữ liệu cũ */
  org_role?: OrgRole;
  /** true = phân công kiêm nhiệm (không phải phân công chính) */
  is_concurrent?: boolean;
}

/** Badge vai trò tại đơn vị — member không badge */
const ORG_ROLE_BADGE: Partial<Record<OrgRole, { text: string; className: string }>> = {
  head: { text: 'Trưởng', className: 'bg-indigo-500/15 text-indigo-300' },
  deputy: { text: 'Phó', className: 'bg-sky-500/15 text-sky-300' },
  assistant: { text: 'Trợ lý', className: 'bg-amber-500/15 text-amber-300' },
};

/** Gom badge cho 1 nhân sự (backward-compatible: field undefined → không badge) */
function staffBadges(s: Staff): { text: string; className: string }[] | undefined {
  const badges: { text: string; className: string }[] = [];
  const role = s.org_role ? ORG_ROLE_BADGE[s.org_role] : undefined;
  if (role) badges.push(role);
  if (s.is_concurrent === true) {
    badges.push({ text: 'Kiêm nhiệm', className: 'bg-purple-500/15 text-purple-300' });
  }
  return badges.length ? badges : undefined;
}
interface SubDeptNode {
  id: string;
  name: string;
  staff: Staff[];
}
interface DeptNode {
  id: string;
  name: string;
  department_level_staff: Staff[];
  sub_departments: SubDeptNode[];
}
interface CompanyNode {
  id: string;
  name: string;
  company_level_staff: Staff[];
  departments: DeptNode[];
}

export interface OrgPersonValue {
  companyId: string | null;
  departmentId: string | null;
  subDepartmentId: string | null;
  userId: string | null;
  // Tên hiển thị (để form lưu vào cột text + fallback khi nhân sự đã nghỉ)
  companyName?: string;
  departmentName?: string;
  subDepartmentName?: string;
  userName?: string;
}

interface OrgPersonPickerProps {
  value: OrgPersonValue;
  onChange: (v: OrgPersonValue) => void;
  /** Nhãn cho ô chọn nhân sự, vd "Người Phụ Trách" / "Người Sử Dụng" */
  personLabel?: string;
  companyLabel?: string;
}

const labelCls = 'block text-sm font-medium text-ink-bright mb-2';

/**
 * Chọn nhân sự theo cây cơ cấu: Công Ty → Phòng Ban → Bộ Phận → Nhân sự.
 * Dừng ở cấp nào thì danh sách nhân sự = toàn bộ nhánh con của cấp đó.
 * Mỗi ô đều có tìm kiếm.
 */
export default function OrgPersonPicker({
  value,
  onChange,
  personLabel = 'Người Phụ Trách',
  companyLabel = 'Công Ty',
}: OrgPersonPickerProps) {
  const [companies, setCompanies] = useState<CompanyNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/organizations/structure/personnel');
        if (!res.ok) return;
        const data = await res.json();
        setCompanies(data?.companies || []);
      } catch {
        /* bỏ qua lỗi tải cây cơ cấu */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const company = useMemo(
    () => companies.find((c) => c.id === value.companyId) || null,
    [companies, value.companyId],
  );
  const department = useMemo(
    () => company?.departments.find((d) => d.id === value.departmentId) || null,
    [company, value.departmentId],
  );
  const subDepartment = useMemo(
    () => department?.sub_departments.find((s) => s.id === value.subDepartmentId) || null,
    [department, value.subDepartmentId],
  );

  // Gom toàn bộ nhân sự trong 1 nhánh
  const staffOfDept = (d: DeptNode): Staff[] => [
    ...d.department_level_staff,
    ...d.sub_departments.flatMap((s) => s.staff),
  ];
  const staffOfCompany = (c: CompanyNode): Staff[] => [
    ...c.company_level_staff,
    ...c.departments.flatMap(staffOfDept),
  ];

  // Danh sách nhân sự theo cấp dừng lại sâu nhất đã chọn.
  // Người kiêm nhiệm có thể xuất hiện ở nhiều đơn vị → khi gom nhánh phải khử
  // trùng theo id (ưu tiên giữ entry phân công chính) để option không bị lặp.
  const candidates: Staff[] = useMemo(() => {
    const raw = subDepartment
      ? subDepartment.staff
      : department
        ? staffOfDept(department)
        : company
          ? staffOfCompany(company)
          : [];
    const byId = new Map<string, Staff>();
    for (const s of raw) {
      const prev = byId.get(s.id);
      if (!prev || (prev.is_concurrent === true && s.is_concurrent !== true)) {
        byId.set(s.id, s);
      }
    }
    return Array.from(byId.values());
  }, [company, department, subDepartment]);

  const companyOptions: SearchableOption[] = companies.map((c) => ({ value: c.id, label: c.name }));
  const departmentOptions: SearchableOption[] = (company?.departments || []).map((d) => ({ value: d.id, label: d.name }));
  const subDeptOptions: SearchableOption[] = (department?.sub_departments || []).map((s) => ({ value: s.id, label: s.name }));
  const personOptions: SearchableOption[] = useMemo(() => {
    const opts: SearchableOption[] = candidates.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: s.job_title || s.email,
      badges: staffBadges(s),
    }));
    // Giữ lại nhân sự đã lưu nếu họ không còn trong cây (đã nghỉ/đổi đơn vị)
    if (value.userId && !candidates.some((s) => s.id === value.userId)) {
      opts.unshift({ value: value.userId, label: value.userName || '(nhân sự cũ)', sublabel: 'Không còn trong cơ cấu' });
    }
    return opts;
  }, [candidates, value.userId, value.userName]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className={labelCls}>{companyLabel}</label>
        <SearchableSelect
          options={companyOptions}
          value={value.companyId}
          onChange={(val) => {
            const c = companies.find((x) => x.id === val) || null;
            onChange({
              companyId: val,
              companyName: c?.name || '',
              departmentId: null,
              departmentName: '',
              subDepartmentId: null,
              subDepartmentName: '',
              userId: null,
              userName: '',
            });
          }}
          placeholder={loading ? 'Đang tải...' : '— Chọn công ty —'}
          emptyText="Không có công ty"
        />
      </div>

      <div>
        <label className={labelCls}>Phòng Ban</label>
        <SearchableSelect
          options={departmentOptions}
          value={value.departmentId}
          onChange={(val) => {
            const d = company?.departments.find((x) => x.id === val) || null;
            onChange({
              ...value,
              departmentId: val,
              departmentName: d?.name || '',
              subDepartmentId: null,
              subDepartmentName: '',
              userId: null,
              userName: '',
            });
          }}
          placeholder={value.companyId ? '— Tất cả phòng ban —' : '— Chọn công ty trước —'}
          emptyText={value.companyId ? 'Công ty chưa có phòng ban' : 'Hãy chọn công ty trước'}
          disabled={!value.companyId}
        />
      </div>

      <div>
        <label className={labelCls}>Bộ Phận</label>
        <SearchableSelect
          options={subDeptOptions}
          value={value.subDepartmentId}
          onChange={(val) => {
            const s = department?.sub_departments.find((x) => x.id === val) || null;
            onChange({
              ...value,
              subDepartmentId: val,
              subDepartmentName: s?.name || '',
              userId: null,
              userName: '',
            });
          }}
          placeholder={value.departmentId ? '— Tất cả bộ phận —' : '— Chọn phòng ban trước —'}
          emptyText={value.departmentId ? 'Phòng ban chưa có bộ phận' : 'Hãy chọn phòng ban trước'}
          disabled={!value.departmentId}
        />
      </div>

      <div>
        <label className={labelCls}>{personLabel}</label>
        <SearchableSelect
          options={personOptions}
          value={value.userId}
          onChange={(val) => {
            const s = candidates.find((x) => x.id === val) || null;
            onChange({
              ...value,
              userId: val,
              userName: s?.name || (val === value.userId ? value.userName : '') || '',
            });
          }}
          placeholder={value.companyId ? '— Chọn nhân sự —' : '— Chọn công ty trước —'}
          emptyText={value.companyId ? 'Nhánh này chưa có nhân sự' : 'Hãy chọn công ty trước'}
          disabled={!value.companyId}
        />
        {value.companyId && (
          <p className="text-xs text-ink-faint mt-1">
            {candidates.length} nhân sự trong{' '}
            {subDepartment ? `bộ phận "${subDepartment.name}"` : department ? `phòng ban "${department.name}"` : `công ty "${company?.name}"`}
          </p>
        )}
      </div>
    </div>
  );
}

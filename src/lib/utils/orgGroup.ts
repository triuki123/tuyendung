/**
 * Nhóm danh sách duyệt theo tổ chức để dễ nhìn:
 *  - super_admin → gom theo CÔNG TY (company_name)
 *  - vai trò khác (admin/manager) → gom theo PHÒNG BAN (dept_name / user_department)
 * Dùng chung cho Bù Công · Tăng Ca · Nghỉ Phép.
 */
export interface OrgItem {
  dept_name?: string | null;
  /** Nghỉ phép dùng tên cột này thay cho dept_name. */
  user_department?: string | null;
  company_name?: string | null;
}

export function orgGroupLabel(it: OrgItem, role: string): string {
  if (role === 'super_admin') return it.company_name || '(Chưa phân công ty)';
  return it.dept_name || it.user_department || '(Chưa phân phòng ban)';
}

export function groupByOrg<T extends OrgItem>(items: T[], role: string): { label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const label = orgGroupLabel(it, role);
    const arr = map.get(label);
    if (arr) arr.push(it); else map.set(label, [it]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
    .map(([label, groupItems]) => ({ label, items: groupItems }));
}

/**
 * Chia tiếp 1 nhóm công ty thành các nhóm PHÒNG BAN (chỉ super_admin —
 * vai trò khác đã gom theo phòng ban ở cấp trên nên trả về 1 nhóm không nhãn).
 */
export function subGroupByDept<T extends OrgItem>(items: T[], role: string): { label: string | null; items: T[] }[] {
  if (role !== 'super_admin') return [{ label: null, items }];
  const map = new Map<string, T[]>();
  for (const it of items) {
    const label = it.dept_name || it.user_department || '(Chưa phân phòng ban)';
    const arr = map.get(label);
    if (arr) arr.push(it); else map.set(label, [it]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
    .map(([label, groupItems]) => ({ label, items: groupItems }));
}

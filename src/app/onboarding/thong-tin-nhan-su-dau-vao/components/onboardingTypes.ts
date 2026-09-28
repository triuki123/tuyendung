export interface FormFieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  section: string;
  required: boolean;
  enabled: boolean;
  sort_order: number;
  help_text: string | null;
  options: string[] | null;
}

export interface OrgData {
  companies: { id: string; name: string }[];
  departments: { id: string; name: string; company_id: string; parent_department_id: string | null }[];
  subDepartments: { id: string; name: string; department_id: string }[];
  positions: { id: string; name: string; company_id: string }[];
}

export interface AttachmentMeta {
  id: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes: number | null;
  created_at?: string;
}

export const SECTION_LABELS: Record<string, { title: string; desc: string }> = {
  personal:    { title: 'Thông Tin Cá Nhân',     desc: 'Thông tin cơ bản về bạn' },
  work:        { title: 'Thông Tin Công Việc',   desc: 'Vị trí công tác tại FADO Group' },
  identity:    { title: 'Giấy Tờ Tùy Thân',      desc: 'Căn cước công dân & địa chỉ' },
  bank:        { title: 'Tài Khoản Ngân Hàng',   desc: 'Phục vụ chi trả lương' },
  other:       { title: 'Thông Tin Khác',        desc: 'Phương tiện di chuyển' },
  emergency:   { title: 'Người Thân Liên Hệ 1',  desc: 'Liên hệ trong trường hợp khẩn cấp' },
  emergency2:  { title: 'Người Thân Liên Hệ 2',  desc: 'Người thân liên hệ thứ hai (không bắt buộc)' },
  attachments: { title: 'Đính Kèm Hồ Sơ',        desc: 'CCCD, bằng cấp, sơ yếu lý lịch... (tối đa 10MB/tệp)' },
};

export const SECTION_ORDER = ['personal', 'work', 'identity', 'bank', 'other', 'emergency', 'emergency2', 'attachments'];

/** Công thức Chức Danh: Chức Vụ + Bộ Phận; nếu không có Bộ Phận thì dùng Phòng Ban. */
export function computeJobTitle(org: OrgData, values: Record<string, any>): string {
  const pos = org.positions.find(p => p.id === values.position_id)?.name || '';
  const subDept = org.subDepartments.find(s => s.id === values.sub_department_id)?.name || '';
  const dept = org.departments.find(d => d.id === values.department_id)?.name || '';
  const unit = subDept || dept;
  return [pos, unit].filter(Boolean).join(' · ');
}

export function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

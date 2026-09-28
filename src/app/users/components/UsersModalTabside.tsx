'use client';

import React, { useState, useEffect } from 'react';
import { createUser, updateUser } from '@/lib/api-client';
import { useToast } from '@/context/ToastContext';
import { isSuperAdmin } from '@/lib/authStore';
import MoneyInput from '@/components/ui/MoneyInput';
import { XCircle, Search, X, ImagePlus } from 'lucide-react';
import { AvatarCropper } from '@/app/settings/components/AvatarCropper';
import { getDefaultPermissions, UserModulePermissions } from '@/lib/modules';
import PermissionsPanel from './PermissionsPanel';
import ExpenseApprovalTab from './ExpenseApprovalTab';
import MultiCompanyTab, { type CompanyMembershipRow } from './MultiCompanyTab';
import AssignmentsTab from './AssignmentsTab';
import ManagerPicker, { type ManagerOption } from './ManagerPicker';
import DateInputVN from '@/components/ui/DateInputVN';
import { NATIONALITIES, VIETNAM_NATIONALITY } from '@/lib/constants/nationalities';
import { normalizeVN } from '@/lib/utils/searchVN';
import { WORK_LOCATIONS } from '@/lib/constants/workLocations';
import { VN_BANKS } from '@/lib/banksVN';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'manager' | 'user';
  company_id?: string;
  department_id?: string;
  department?: string;
  company?: string;
  avatar?: string;
  phone?: string;
  position?: string;
  position_id?: string;
  bio?: string;
  sub_department_id?: string;
  job_title_id?: string;
  status: 'active' | 'inactive';
  last_login?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  created_by_name?: string;
  updated_by_name?: string;
  tags?: Array<{ id: string; name: string; color: string }>;
  manager_id?: string;
  module_permissions?: UserModulePermissions;
  telegram_chat_id?: string;
  telegram_enabled?: boolean;
  diligence_enabled?: boolean;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  children?: Department[];
  depth?: number;
}

interface SubDepartment {
  id: string;
  name: string;
  department_id: string;
  parent_sub_department_id?: string;
  depth?: number;
}

/** Bộ phận (có thể lồng nhau) của 1 phòng ban → dàn phẳng DFS + độ sâu để thụt lề dropdown. */
function orderSubDepartments(all: SubDepartment[], deptId: string): SubDepartment[] {
  const subs = all.filter(sd => sd.department_id === deptId);
  const out: SubDepartment[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    subs.filter(sd => (sd.parent_sub_department_id || null) === parentId).forEach(sd => {
      if (seen.has(sd.id) || depth > 30) return;
      seen.add(sd.id);
      out.push({ ...sd, depth });
      walk(sd.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
}

/** Tiền tố thụt lề cho option trong dropdown theo độ sâu. */
function indentLabel(name: string, depth?: number): string {
  const d = depth ?? 0;
  return d > 0 ? `${'  '.repeat(d)}└ ${name}` : name;
}

interface Company {
  id: string;
  name: string;
}

interface JobTitle {
  id: string;
  title: string;
  description?: string;
  is_active: boolean;
}

interface Position {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  salary_range_min?: number;
  salary_range_max?: number;
  is_active: boolean;
}

interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string;
  is_active: boolean;
}

interface UsersModalTabsideProps {
  user?: User | null;
  mode: 'create' | 'view' | 'edit';
  currentUser: any;
  onClose: () => void;
  onSave: (u: User) => void | Promise<void>;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: 'Super Admin', color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
  admin: { label: 'Admin', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  manager: { label: 'Quản Lý', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  user: { label: 'Người Dùng', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hiển thị "người tạo/cập nhật": ưu tiên tên đã resolve; 'system' → "Hệ thống";
 * nếu là UUID không tra được tên → "—" (không hiện UUID thô); nhãn thường → giữ nguyên.
 */
function displayActor(name?: string, raw?: string): string {
  if (name && name.trim()) return name;
  if (!raw) return '—';
  if (raw === 'system') return 'Hệ thống';
  if (UUID_RE.test(raw)) return '—';
  return raw;
}

/**
 * Giờ tan làm dự kiến từ giờ vào: + 8h làm + 1h nghỉ trưa = +9h (khoảng cách đồng hồ).
 * VD "08:00" → "17:00", "08:30" → "17:30". Trả '' nếu giờ vào không hợp lệ.
 * Chỉ để HIỂN THỊ xác nhận — không dùng cho tính công (chấm công có cơ chế riêng).
 */
function estimatedEndTime(start: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((start || '').trim());
  if (!m) return '';
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  const total = (h * 60 + min + 9 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function UsersModalTabside({ user, mode, currentUser, onClose, onSave }: UsersModalTabsideProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'hr' | 'benefits' | 'companies' | 'assignments' | 'permissions' | 'expense-approval' | 'password'>('info');

  // ===== Admin gắn/gỡ liên kết ĐĂNG NHẬP Telegram hộ (khác telegram_chat_id thông báo) =====
  const [tgLink, setTgLink] = useState<{ telegram_id: string | null; telegram_username: string | null; telegram_linked_at: string | null }>({
    telegram_id: (user as any)?.telegram_id ?? null,
    telegram_username: (user as any)?.telegram_username ?? null,
    telegram_linked_at: (user as any)?.telegram_linked_at ?? null,
  });
  const [tgInput, setTgInput] = useState('');
  const [tgBusy, setTgBusy] = useState(false);
  const [tgMsg, setTgMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function adminAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window === 'undefined') return headers;
    const stored = localStorage.getItem('assetflow_auth') || localStorage.getItem('currentUser');
    if (!stored) return headers;
    try {
      const u = JSON.parse(stored);
      if (u.id) headers['x-current-user-id'] = u.id;
      if (u.session_id) headers['x-session-id'] = u.session_id;
    } catch { /* ignore */ }
    return headers;
  }

  async function handleAdminLinkTelegram() {
    if (!user?.id) return;
    setTgBusy(true); setTgMsg(null);
    try {
      const res = await fetch(`/api/users/${user.id}/telegram-link`, {
        method: 'POST',
        headers: adminAuthHeaders(),
        body: JSON.stringify({ telegram_id: tgInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setTgMsg({ type: 'error', text: data.error || 'Gắn Telegram thất bại' }); return; }
      setTgLink({ telegram_id: data.telegram_id, telegram_username: null, telegram_linked_at: new Date().toISOString() });
      setTgInput('');
      setTgMsg({ type: 'success', text: 'Đã gắn liên kết đăng nhập Telegram' });
    } catch (e: any) {
      setTgMsg({ type: 'error', text: e?.message || 'Có lỗi xảy ra' });
    } finally { setTgBusy(false); }
  }

  async function handleAdminUnlinkTelegram() {
    if (!user?.id) return;
    setTgBusy(true); setTgMsg(null);
    try {
      const res = await fetch(`/api/users/${user.id}/telegram-link`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setTgMsg({ type: 'error', text: data.error || 'Gỡ liên kết thất bại' }); return; }
      setTgLink({ telegram_id: null, telegram_username: null, telegram_linked_at: null });
      setTgMsg({ type: 'success', text: 'Đã gỡ liên kết đăng nhập Telegram' });
    } catch (e: any) {
      setTgMsg({ type: 'error', text: e?.message || 'Có lỗi xảy ra' });
    } finally { setTgBusy(false); }
  }
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'user' as User['role'],
    company_id: user?.company_id ?? '',
    department: user?.department_id ?? user?.department ?? '',
    phone: user?.phone ?? '',
    position: user?.position ?? '',
    position_id: user?.position_id ?? '',
    bio: user?.bio ?? '',
    sub_department_id: user?.sub_department_id ?? '',
    job_title_id: user?.job_title_id ?? '',
    manager_id: user?.manager_id ?? '',
    status: user?.status ?? 'active' as 'active' | 'inactive',
    password: '',
    confirmPassword: '',
    telegram_chat_id: (user as any)?.telegram_chat_id ?? '',
    telegram_enabled: (user as any)?.telegram_enabled ?? false,
    diligence_enabled: (user as any)?.diligence_enabled ?? false,
    // Hồ Sơ Nhân Sự
    employee_code: (user as any)?.employee_code ?? '',
    hire_date: (user as any)?.hire_date ? (user as any).hire_date.toString().slice(0, 10) : '',
    employment_type: (user as any)?.employment_type ?? '',
    employment_type_id: (user as any)?.employment_type_id ?? '',
    probation_duration_days: (user as any)?.probation_duration_days ?? '',
    bank_account_no: (user as any)?.bank_account_no ?? '',
    bank_name: (user as any)?.bank_name ?? '',
    bank_account_name: (user as any)?.bank_account_name ?? '',
    home_address: (user as any)?.home_address ?? '',
    work_location: (user as any)?.work_location ?? '',
    work_start_time: (user as any)?.work_start_time ?? '',
    deduct_lunch: (user as any)?.deduct_lunch ?? true,
    // Hồ Sơ Nhân Sự — thông tin cá nhân (map từ form Onboarding)
    personal_email: (user as any)?.personal_email ?? '',
    date_of_birth: (user as any)?.date_of_birth ? (user as any).date_of_birth.toString().slice(0, 10) : '',
    gender: (user as any)?.gender ?? '',
    nationality: (user as any)?.nationality ?? VIETNAM_NATIONALITY, // mặc định VN cho hồ sơ mới (đổi được)
    ethnicity: (user as any)?.ethnicity ?? '',
    religion: (user as any)?.religion ?? '',
    marital_status: (user as any)?.marital_status ?? '',
    children_count: (user as any)?.children_count ?? '',
    education_level: (user as any)?.education_level ?? '',
    major: (user as any)?.major ?? '',
    national_id: (user as any)?.national_id ?? '',
    national_id_issue_date: (user as any)?.national_id_issue_date ? (user as any).national_id_issue_date.toString().slice(0, 10) : '',
    national_id_issue_place: (user as any)?.national_id_issue_place ?? '',
    temporary_address: (user as any)?.temporary_address ?? '',
    vehicle_type: (user as any)?.vehicle_type ?? '',
    vehicle_plate: (user as any)?.vehicle_plate ?? '',
    vehicle_model: (user as any)?.vehicle_model ?? '',
    emergency_contact_name: (user as any)?.emergency_contact_name ?? '',
    emergency_contact_relationship: (user as any)?.emergency_contact_relationship ?? '',
    emergency_contact_phone: (user as any)?.emergency_contact_phone ?? '',
    emergency_contact_address: (user as any)?.emergency_contact_address ?? '',
    emergency_contact_2_name: (user as any)?.emergency_contact_2_name ?? '',
    emergency_contact_2_relationship: (user as any)?.emergency_contact_2_relationship ?? '',
    emergency_contact_2_phone: (user as any)?.emergency_contact_2_phone ?? '',
    emergency_contact_2_address: (user as any)?.emergency_contact_2_address ?? '',
    // Chế Độ & Đãi Ngộ (migration 121)
    meal_allowance_enabled: (user as any)?.meal_allowance_enabled ?? false,
    meal_allowance_rate: (user as any)?.meal_allowance_rate ?? 25000,
    parking_allowance_enabled: (user as any)?.parking_allowance_enabled ?? false,
    parking_allowance_rate: (user as any)?.parking_allowance_rate ?? 10000,
    travel_allowance_rate: (user as any)?.travel_allowance_rate ?? 0,
    social_insurance_unit: (user as any)?.social_insurance_unit ?? '',
    social_insurance_base: (user as any)?.social_insurance_base ?? '',
    social_insurance_deduction: (user as any)?.social_insurance_deduction ?? '',
    salary_entity: (user as any)?.salary_entity ?? '',
    cost_center_code: (user as any)?.cost_center_code ?? '',
    default_full_attendance: (user as any)?.default_full_attendance ?? false,
  });
  // Đa Công Ty — danh sách công ty PHỤ của user (công ty chính ở tab Thông Tin).
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembershipRow[]>(
    Array.isArray((user as any)?.company_memberships)
      ? (user as any).company_memberships.map((m: any) => ({
          company_id: m.company_id,
          role: m.role || 'user',
          department_id: m.department_id ?? '',
          sub_department_id: m.sub_department_id ?? '',
          position_id: m.position_id ?? '',
          job_title_id: m.job_title_id ?? '',
          manager_id: m.manager_id ?? '',
          module_permissions: m.module_permissions ?? null,
        }))
      : []
  );
  const [modulePermissions, setModulePermissions] = useState<UserModulePermissions>(
    (user?.module_permissions && Object.keys(user?.module_permissions).length > 0)
      ? user.module_permissions
      : getDefaultPermissions(user?.role ?? 'user')
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(user?.tags?.map(t => t.id) ?? []);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [companyDepartmentsMap, setCompanyDepartmentsMap] = useState<Record<string, Department[]>>({});
  const [parentDepartments, setParentDepartments] = useState<Department[]>([]);
  const [childDepartments, setChildDepartments] = useState<Department[]>([]);
  const [allSubDepartments, setAllSubDepartments] = useState<SubDepartment[]>([]);
  const [filteredSubDepartments, setFilteredSubDepartments] = useState<SubDepartment[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [companyPositionsMap, setCompanyPositionsMap] = useState<Record<string, Position[]>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [managers, setManagers] = useState<Array<ManagerOption & { job_title: string; level: string; dept_positions?: Record<string, string> }>>([]);
  // Nhãn chức vụ bám theo phòng ban đang chọn: nếu ứng viên có phân công ở phòng ban đó → hiện
  // chức vụ tại đó; nếu không → chức vụ chính.
  const managersForPicker = React.useMemo<ManagerOption[]>(
    () => managers.map(m => ({
      ...m,
      job_title: (form.department && m.dept_positions?.[form.department]) || m.job_title,
    })),
    [managers, form.department]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const toast = useToast();
  const [avatarUrl, setAvatarUrl] = useState<string>(user?.avatar || '');
  const [cropperOpen, setCropperOpen] = useState(false);

  // Wrapper đóng modal — nếu có thay đổi chưa lưu thì hỏi trước
  const handleClose = () => {
    if (isDirty) { setShowUnsavedWarning(true); return; }
    onClose();
  };

  // Wrapper setForm tự đánh dấu dirty
  const setFormDirty = (updater: Parameters<typeof setForm>[0]) => {
    setForm(updater);
    setIsDirty(true);
  };

  const isCreating = mode === 'create';
  const canSetSuperAdmin = isSuperAdmin(currentUser);

  // ── Quyền theo VAI TRÒ NGƯỜI ĐANG XEM (không phải user mục tiêu) ──────────────
  // Super Admin: toàn quyền. Admin: sửa tất cả TRỪ Phân Quyền (role + module perms).
  // Quản Lý / Người Dùng: CHỈ XEM 3 tab (Thông tin, Hồ sơ nhân sự, Chế độ & đãi ngộ).
  const viewerRole = currentUser?.role as 'super_admin' | 'admin' | 'manager' | 'user' | undefined;
  const isViewerOnly = viewerRole === 'manager' || viewerRole === 'user';
  const canSeeAdminTabs = isSuperAdmin(currentUser) || viewerRole === 'admin';
  const canEditPermissions = isSuperAdmin(currentUser); // chỉ SA sửa role + phân quyền
  const isReadOnly = mode === 'view' || isViewerOnly;

  const allowedTabs: string[] = [
    'info', 'hr', 'benefits',
    ...(canSetSuperAdmin ? ['companies'] : []),
    ...(canSeeAdminTabs && !isCreating ? ['assignments'] : []),
    ...(canSeeAdminTabs ? ['permissions'] : []),
    ...(canSeeAdminTabs && !isCreating ? ['expense-approval'] : []),
    ...(canSeeAdminTabs && !isCreating ? ['password'] : []),
  ];
  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) setActiveTab('info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeAdminTabs, isCreating, activeTab]);

  // Đóng modal khi nhấn ESC (qua handleClose để kiểm tra dirty)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  useEffect(() => {
    if (mode === 'edit' && user) {
      setSelectedTagIds(user?.tags?.map(t => t.id) ?? []);
    } else if (mode === 'create') {
      setSelectedTagIds([]);
    }
  }, [user, mode]);

  useEffect(() => {
    if (!form.company_id) {
      setParentDepartments([]);
      setChildDepartments([]);
      setFilteredSubDepartments([]);
      setPositions([]);
      return;
    }

    if (companyDepartmentsMap[form.company_id]) {
      const companyDepts = companyDepartmentsMap[form.company_id];
      // Cây phòng ban NHIỀU TẦNG → dàn phẳng DFS + độ sâu để chọn phòng ban ở bất kỳ tầng nào.
      const parentDepts: Department[] = [];
      const seen = new Set<string>();
      const walk = (parentId: string | null, depth: number) => {
        companyDepts.filter(d => (d.parent_department_id || null) === parentId).forEach(d => {
          if (seen.has(d.id) || depth > 30) return;
          seen.add(d.id);
          parentDepts.push({ ...d, depth });
          walk(d.id, depth + 1);
        });
      };
      walk(null, 0);
      setParentDepartments(parentDepts);
    } else {
      setParentDepartments([]);
    }

    if (companyPositionsMap[form.company_id]) {
      setPositions(companyPositionsMap[form.company_id]);
    } else {
      setPositions([]);
    }

    if (form.department) {
      const companyDepts = companyDepartmentsMap[form.company_id];
      if (companyDepts) {
        const children = companyDepts.filter(d => d.parent_department_id === form.department);
        setChildDepartments(children);
        setFilteredSubDepartments(orderSubDepartments(allSubDepartments, form.department));
      } else {
        setChildDepartments([]);
        setFilteredSubDepartments([]);
      }
    } else {
      setChildDepartments([]);
      setFilteredSubDepartments([]);
    }
  }, [form.company_id, companyDepartmentsMap, companyPositionsMap, form.department, allSubDepartments]);

  useEffect(() => {
    if (!form.department) {
      setFilteredSubDepartments([]);
      return;
    }

    setFilteredSubDepartments(orderSubDepartments(allSubDepartments, form.department));
  }, [form.department, allSubDepartments]);

  useEffect(() => {
    if (!form.company_id) {
      setManagers([]);
      return;
    }

    const fetchManagers = async () => {
      try {
        const params = new URLSearchParams({ company_id: form.company_id });
        const managersResponse = await fetch(`/api/users/managers?${params}`);
        if (managersResponse.ok) {
          const managersData = await managersResponse.json();
          setManagers(managersData || []);
        }
      } catch (error) {
        console.error('Error fetching managers:', error);
        setManagers([]);
      }
    };

    fetchManagers();
  }, [form.company_id]);

  // FIX Bug 1: When user changes in edit/view mode, always sync managers to user's company
  useEffect(() => {
    if ((mode === 'edit' || mode === 'view') && user?.company_id) {
      const params = new URLSearchParams({ company_id: user.company_id });
      fetch(`/api/users/managers?${params}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setManagers(data || []))
        .catch(err => console.error('Error fetching managers on user load:', err));
    }
  }, [user?.id, mode]);

  // Update module permissions when role changes
  useEffect(() => {
    if (
      isCreating ||
      (mode === 'edit' && (!user?.module_permissions || form.role !== user.role))
    ) {
      setModulePermissions(getDefaultPermissions(form.role));
    }
  }, [form.role, isCreating, mode, user?.module_permissions, user?.role]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const companiesResponse = await fetch('/api/organizations/companies');
        if (!companiesResponse.ok) throw new Error('Failed to fetch companies');
        const companies = await companiesResponse.json();
        setAllCompanies(companies.map((c: any) => ({ id: c.id, name: c.name })));

        const departmentsResponse = await fetch('/api/organizations/departments');
        if (!departmentsResponse.ok) throw new Error('Failed to fetch departments');
        const allDepartments = await departmentsResponse.json();

        const subDepartmentsResponse = await fetch('/api/organizations/sub-departments');
        if (!subDepartmentsResponse.ok) throw new Error('Failed to fetch sub-departments');
        const fetchedSubDepartments = await subDepartmentsResponse.json();
        setAllSubDepartments(fetchedSubDepartments);

        const deptMap: Record<string, Department[]> = {};
        companies.forEach((company: any) => {
          const companyDepts = allDepartments.filter((dept: any) => dept.company_id === company.id);
          deptMap[company.id] = companyDepts.map((dept: any) => ({
            id: dept.id,
            name: dept.name,
            parent_department_id: dept.parent_department_id || null
          }));
        });
        setCompanyDepartmentsMap(deptMap);

        try {
          const positionsResponse = await fetch('/api/organizations/positions');
          if (positionsResponse.ok) {
            const allPositions = await positionsResponse.json();
            const posMap: Record<string, Position[]> = {};
            companies.forEach((company: any) => {
              const companyPos = allPositions.filter((pos: any) => pos.company_id === company.id);
              posMap[company.id] = companyPos;
            });
            setCompanyPositionsMap(posMap);
          }
        } catch (error) {
          console.error('Error fetching positions:', error);
          setCompanyPositionsMap({});
        }

        try {
          const tagsResponse = await fetch('/api/tags');
          if (tagsResponse.ok) {
            const tagsData = await tagsResponse.json();
            setAllTags(tagsData.data || tagsData || []);
          }
        } catch (error) {
          console.error('Error fetching tags:', error);
          setAllTags([]);
        }

        try {
          const jobTitlesResponse = await fetch('/api/organizations/job-titles');
          if (jobTitlesResponse.ok) {
            const jobTitlesData = await jobTitlesResponse.json();
            setJobTitles(jobTitlesData || []);
          }
        } catch (error) {
          console.error('Error fetching job titles:', error);
          setJobTitles([]);
        }

        // FIX Bug 1: Load managers for the USER's company, not companies[0]
        if ((mode === 'edit' || mode === 'view') && user?.company_id) {
          try {
            const params = new URLSearchParams({ company_id: user.company_id });
            const managersResponse = await fetch(`/api/users/managers?${params}`);
            if (managersResponse.ok) {
              const managersData = await managersResponse.json();
              setManagers(managersData || []);
            }
          } catch (error) {
            console.error('Error fetching managers:', error);
            setManagers([]);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  const handleCompanyChange = async (companyId: string) => {
    setForm(p => ({ ...p, company_id: companyId, department: '', sub_department_id: '', job_title_id: '', manager_id: '' }));
    setJobTitles([]);

    try {
      const params = new URLSearchParams({ company_id: companyId });
      const managersResponse = await fetch(`/api/users/managers?${params}`);
      if (managersResponse.ok) {
        const managersData = await managersResponse.json();
        setManagers(managersData || []);
      }
    } catch (error) {
      console.error('Error fetching managers for company:', error);
      setManagers([]);
    }
  };

  const handleDepartmentChange = (departmentId: string) => {
    setForm(p => ({ ...p, department: departmentId, sub_department_id: '' }));
  };

  const validatePasswordForm = () => {
    const newErrors: Record<string, string> = {};

    if (!passwordForm.newPassword) {
      newErrors.newPassword = 'Mật khẩu mới không được để trống';
    } else {
      if (passwordForm.newPassword.length < 10) {
        newErrors.newPassword = 'Mật khẩu phải có ít nhất 10 ký tự';
      }
      // Check for letter and number
      if (!/[a-zA-Z]/.test(passwordForm.newPassword)) {
        newErrors.newPassword = 'Mật khẩu phải chứa ít nhất một chữ cái';
      }
      if (!/[0-9]/.test(passwordForm.newPassword)) {
        newErrors.newPassword = 'Mật khẩu phải chứa ít nhất một chữ số';
      }
    }

    if (!passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Xác nhận mật khẩu không được để trống';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu không trùng khớp';
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/change-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentUser.id,
          targetUserId: user!.id,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Đổi mật khẩu thất bại');
      }

      setPasswordForm({ newPassword: '', confirmPassword: '' });
      toast.success('Đổi mật khẩu thành công');
      onClose();
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordErrors({ submit: error instanceof Error ? error.message : 'Có lỗi xảy ra' });
    } finally {
      setIsSaving(false);
    }
  };

  const ROLE_OPTIONS = [
    { value: 'user', label: 'Người Dùng' },
    { value: 'manager', label: 'Quản Lý' },
    { value: 'admin', label: 'Admin' },
    ...(canSetSuperAdmin ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Validate name
    if (!form.name.trim()) {
      newErrors.name = 'Tên không được để trống';
    } else if (form.name.trim().length < 2) {
      newErrors.name = 'Tên phải có ít nhất 2 ký tự';
    }

    // Validate email
    if (!form.email.trim()) {
      newErrors.email = 'Email không được để trống';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email không hợp lệ';
    }

    // Validate password when creating
    if (isCreating) {
      if (!form.password) {
        newErrors.password = 'Mật khẩu không được để trống';
      } else {
        if (form.password.length < 10) {
          newErrors.password = 'Mật khẩu phải có ít nhất 10 ký tự';
        }
        if (!/[a-zA-Z]/.test(form.password)) {
          newErrors.password = 'Mật khẩu phải chứa ít nhất một chữ cái';
        }
        if (!/[0-9]/.test(form.password)) {
          newErrors.password = 'Mật khẩu phải chứa ít nhất một chữ số';
        }
      }

      if (!form.confirmPassword) {
        newErrors.confirmPassword = 'Xác nhận mật khẩu không được để trống';
      } else if (form.password !== form.confirmPassword) {
        newErrors.confirmPassword = 'Mật khẩu không trùng khớp';
      }
    }

    // Validate module_permissions structure
    if (modulePermissions && typeof modulePermissions !== 'object') {
      newErrors.permissions = 'Cấu trúc quyền không hợp lệ';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      // Ở chế độ SỬA: chỉ gửi các trường TỔ CHỨC (công ty/phòng ban/bộ phận/chức danh/quản lý)
      // khi người dùng THỰC SỰ đổi ở tab Thông Tin. Nếu không đổi → BỎ QUA, tránh đè lại phân
      // công vừa chỉnh ở tab Phân Công (tab đó lưu ngay vào org_assignments; form Thông Tin giữ
      // ảnh chụp CŨ nên nếu luôn gửi sẽ khiến trySyncAssignments dựng lại primary từ giá trị cũ).
      const isEdit = mode === 'edit';
      const orig = {
        company_id: user?.company_id ?? '',
        department: (user?.department_id ?? user?.department ?? '') as string,
        sub: user?.sub_department_id ?? '',
        jt: user?.job_title_id ?? '',
        mgr: user?.manager_id ?? '',
        pos: user?.position_id ?? '',
      };
      const inc = (changed: boolean, key: string, val: any) => (!isEdit || changed) ? { [key]: val } : {};
      const orgPayload = {
        ...inc(form.company_id !== orig.company_id, 'company_id', form.company_id || null),
        ...inc(form.department !== orig.department, 'department_id', form.department || null),
        ...inc(form.sub_department_id !== orig.sub, 'sub_department_id', form.sub_department_id || null),
        ...inc(form.job_title_id !== orig.jt, 'job_title_id', form.job_title_id || null),
        ...inc(form.manager_id !== orig.mgr, 'manager_id', form.manager_id || null),
        ...inc(form.position_id !== orig.pos, 'position_id', form.position_id || null),
      };
      const userData = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || '',
        position: form.position || '',
        bio: form.bio || '',
        ...orgPayload,
        status: form.status,
        module_permissions: modulePermissions,
        telegram_chat_id: form.telegram_chat_id || null,
        telegram_enabled: form.telegram_enabled ?? false,
        diligence_enabled: form.diligence_enabled === true,
        // Hồ Sơ Nhân Sự
        employee_code: form.employee_code || null,
        hire_date: form.hire_date || null,
        employment_type: form.employment_type || null,
        employment_type_id: form.employment_type_id || null,
        probation_duration_days: form.probation_duration_days ? Number(form.probation_duration_days) : null,
        bank_account_no: form.bank_account_no || null,
        bank_name: form.bank_name || null,
        bank_account_name: form.bank_account_name || null,
        home_address: form.home_address || null,
        work_location: form.work_location || null,
        work_start_time: form.work_start_time || null,
        deduct_lunch: form.deduct_lunch !== false,
        // Hồ Sơ Nhân Sự — thông tin cá nhân (map từ form Onboarding)
        personal_email: form.personal_email || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        nationality: form.nationality || null,
        ethnicity: form.ethnicity || null,
        religion: form.religion || null,
        marital_status: form.marital_status || null,
        children_count: form.children_count === '' ? null : Number(form.children_count),
        education_level: form.education_level || null,
        major: form.major || null,
        national_id: form.national_id || null,
        national_id_issue_date: form.national_id_issue_date || null,
        national_id_issue_place: form.national_id_issue_place || null,
        temporary_address: form.temporary_address || null,
        vehicle_type: form.vehicle_type || null,
        vehicle_plate: form.vehicle_plate || null,
        vehicle_model: form.vehicle_model || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        emergency_contact_address: form.emergency_contact_address || null,
        emergency_contact_2_name: form.emergency_contact_2_name || null,
        emergency_contact_2_relationship: form.emergency_contact_2_relationship || null,
        emergency_contact_2_phone: form.emergency_contact_2_phone || null,
        emergency_contact_2_address: form.emergency_contact_2_address || null,
        // Chế Độ & Đãi Ngộ
        meal_allowance_enabled: form.meal_allowance_enabled,
        meal_allowance_rate: form.meal_allowance_rate === '' ? null : Number(form.meal_allowance_rate),
        parking_allowance_enabled: form.parking_allowance_enabled,
        parking_allowance_rate: form.parking_allowance_rate === '' ? null : Number(form.parking_allowance_rate),
        travel_allowance_rate: form.travel_allowance_rate === '' ? null : Number(form.travel_allowance_rate),
        social_insurance_unit: form.social_insurance_unit || null,
        social_insurance_base: form.social_insurance_base === '' ? null : Number(form.social_insurance_base),
        social_insurance_deduction: form.social_insurance_deduction === '' ? null : Number(form.social_insurance_deduction),
        salary_entity: form.salary_entity || null,
        cost_center_code: form.cost_center_code || null,
        default_full_attendance: !!form.default_full_attendance,
        // Đa Công Ty — chỉ gửi nếu là super_admin (server cũng chặn lại).
        ...(canSetSuperAdmin
          ? {
              company_memberships: companyMemberships
                .filter((m) => m.company_id && m.company_id !== form.company_id)
                .map((m) => ({
                  company_id: m.company_id,
                  role: m.role,
                  department_id: m.department_id || null,
                  sub_department_id: m.sub_department_id || null,
                  position_id: m.position_id || null,
                  job_title_id: m.job_title_id || null,
                  manager_id: m.manager_id || null,
                  module_permissions: m.module_permissions || null,
                })),
            }
          : {}),
      };

      let userId: string;
      let created: any;

      if (isCreating) {
        const userWithPassword = {
          ...userData,
          password: form.password,
        };
        created = await createUser(userWithPassword);
        userId = created.id;
      } else {
        created = await updateUser(user!.id, userData);
        userId = user!.id;
      }

      try {
        await fetch(`/api/users/${userId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: selectedTagIds }),
        });
      } catch (tagError) {
        console.error('Error assigning tags:', tagError);
      }

      setIsDirty(false);
      toast.success(isCreating ? 'Đã thêm người dùng' : 'Đã lưu thay đổi');
      onSave({
        id: userId,
        status: isCreating ? 'active' : form.status,
        module_permissions: modulePermissions,
        ...created,
      } as User);
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
      if (errorMsg.toLowerCase().includes('email')) {
        setErrors(prev => ({ ...prev, email: errorMsg }));
      } else {
        setErrors(prev => ({ ...prev, _form: errorMsg }));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onChange={() => { if (mode !== 'view') setIsDirty(true); }}
    >
      {/* Popup cảnh báo thay đổi chưa lưu */}
      {showUnsavedWarning && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl border border-yellow-500/30 p-5" style={{ background: 'var(--card)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-yellow-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-700 text-foreground mb-1">Có thay đổi chưa lưu</h3>
                <p className="text-xs text-muted-foreground">Bạn có chắc muốn thoát không? Mọi thay đổi chưa lưu sẽ bị mất.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowUnsavedWarning(false)}
                className="flex-1 h-9 rounded-xl btn-ghost text-sm font-500"
              >Tiếp tục chỉnh sửa</button>
              <button
                onClick={() => { setShowUnsavedWarning(false); setIsDirty(false); onClose(); }}
                className="flex-1 h-9 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-600"
              >Thoát không lưu</button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-6xl h-[95vh] sm:h-[90vh] rounded-2xl sm:rounded-3xl border border-line overflow-hidden flex flex-col" style={{ background: 'var(--card)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-white/08 shrink-0">
          <h2 className="text-base sm:text-lg font-700 text-foreground">
            {mode === 'create' ? 'Thêm Người Dùng' : mode === 'edit' ? 'Chỉnh Sửa Người Dùng' : 'Chi Tiết Người Dùng'}
          </h2>
          <button onClick={handleClose} className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground">
            <XCircle size={18} />
          </button>
        </div>

        {/* Mobile: tab bar ngang */}
        <div className="sm:hidden flex gap-1 px-3 py-2 border-b border-white/08 overflow-x-auto shrink-0">
          {[
            { id: 'info', label: '📝 Thông Tin' },
            { id: 'hr', label: '🗂️ Nhân Sự' },
            { id: 'benefits', label: '💰 Đãi Ngộ' },
            ...(canSetSuperAdmin ? [{ id: 'companies', label: '🏢 Đa Công Ty' }] : []),
            ...(canSeeAdminTabs && !isCreating ? [{ id: 'assignments', label: '🧩 Phân Công' }] : []),
            ...(canSeeAdminTabs ? [{ id: 'permissions', label: '🔐 Phân Quyền' }] : []),
            ...(canSeeAdminTabs && !isCreating ? [{ id: 'password', label: '🔑 Mật Khẩu' }] : []),
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-600 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/05'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Content - Tabside Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Desktop: Sidebar Tabs */}
          <div className="hidden sm:block w-48 border-r border-white/08 bg-white/02 overflow-y-auto shrink-0">
            <div className="p-2 space-y-2">
              <button
                onClick={() => setActiveTab('info')}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                  activeTab === 'info'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-foreground hover:bg-white/05'
                }`}
              >
                📝 Thông Tin
              </button>
              <button
                onClick={() => setActiveTab('hr')}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                  activeTab === 'hr'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-foreground hover:bg-white/05'
                }`}
              >
                🗂️ Hồ Sơ Nhân Sự
              </button>
              <button
                onClick={() => setActiveTab('benefits')}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                  activeTab === 'benefits'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-foreground hover:bg-white/05'
                }`}
              >
                💰 Chế Độ & Đãi Ngộ
              </button>
              {canSetSuperAdmin && (
                <button
                  onClick={() => setActiveTab('companies')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                    activeTab === 'companies'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-foreground hover:bg-white/05'
                  }`}
                >
                  🏢 Đa Công Ty
                </button>
              )}
              {canSeeAdminTabs && !isCreating && (
                <button
                  onClick={() => setActiveTab('assignments')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                    activeTab === 'assignments'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-foreground hover:bg-white/05'
                  }`}
                >
                  🧩 Phân Công
                </button>
              )}
              {canSeeAdminTabs && (
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                    activeTab === 'permissions'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-foreground hover:bg-white/05'
                  }`}
                >
                  🔐 Phân Quyền
                </button>
              )}
              {canSeeAdminTabs && !isCreating && (
                <button
                  onClick={() => setActiveTab('expense-approval')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                    activeTab === 'expense-approval'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-foreground hover:bg-white/05'
                  }`}
                >
                  💸 Quyền Chi Phí
                </button>
              )}
              {canSeeAdminTabs && !isCreating && (
                <button
                  onClick={() => setActiveTab('password')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-500 transition-colors ${
                    activeTab === 'password'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-foreground hover:bg-white/05'
                  }`}
                >
                  🔑 Đổi Mật Khẩu
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 sm:p-6 space-y-4">
              {/* User Information Tab */}
              {activeTab === 'info' && (
                <>
                  {!isCreating && user?.id && (
                    <div className="flex items-center gap-4 mb-1 pb-4 border-b border-line">
                      {avatarUrl && avatarUrl.startsWith('/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt={form.name} className="w-16 h-16 rounded-full object-cover border border-line" />
                      ) : (
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-indigo/15 text-indigo font-700 text-xl">
                          {(form.name || '?').trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        {!isReadOnly && (
                          <button type="button" onClick={() => setCropperOpen(true)}
                            className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-500 text-foreground hover:bg-hover">
                            <ImagePlus className="w-4 h-4 text-indigo" />
                            {avatarUrl ? 'Đổi ảnh đại diện' : 'Tải ảnh đại diện'}
                          </button>
                        )}
                        <span className="text-2xs text-muted-foreground/60">JPG/PNG ≤ 1MB · căn chỉnh khung trước khi lưu.</span>
                      </div>
                    </div>
                  )}
                  {user?.id && (
                    <AvatarCropper
                      isOpen={cropperOpen}
                      onClose={() => setCropperOpen(false)}
                      userId={user.id}
                      applyToCurrentUser={user.id === currentUser?.id}
                      onUploadSuccess={(url) => { setAvatarUrl(url); setCropperOpen(false); }}
                    />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Họ và tên *</label>
                      <input
                        disabled={isReadOnly}
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 disabled:opacity-60 ${
                          errors.name ? 'border-red-500/60' : 'border-line'
                        }`}
                        placeholder="Nguyễn Văn A"
                      />
                      {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Email *</label>
                      <input
                        disabled={isReadOnly}
                        type="email"
                        value={form.email}
                        onChange={e => {
                          setForm(p => ({ ...p, email: e.target.value }));
                          if (errors.email) setErrors(p => ({ ...p, email: '' }));
                        }}
                        className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 disabled:opacity-60 ${
                          errors.email ? 'border-red-500/60' : 'border-line'
                        }`}
                        placeholder="email@company.vn"
                      />
                      {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Số điện thoại</label>
                      <input
                        disabled={isReadOnly}
                        value={form.phone}
                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                        placeholder="0901234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Vai trò</label>
                      <select
                        disabled={isReadOnly || (!isCreating && !canEditPermissions)}
                        value={form.role}
                        onChange={e => setForm(p => ({ ...p, role: e.target.value as User['role'] }))}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Công Ty *</label>
                      <select
                        disabled={isReadOnly}
                        value={form.company_id}
                        onChange={e => handleCompanyChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
                      >
                        <option value="">-- Chọn công ty --</option>
                        {allCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Phòng ban</label>
                      <select
                        disabled={isReadOnly || !form.company_id || parentDepartments.length === 0}
                        value={form.department}
                        onChange={e => handleDepartmentChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
                      >
                        <option value="">-- Chọn phòng ban --</option>
                        {parentDepartments.map(d => <option key={d.id} value={d.id}>{indentLabel(d.name, d.depth)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Bộ Phận</label>
                      <select
                        disabled={isReadOnly || !form.department || filteredSubDepartments.length === 0}
                        value={form.sub_department_id}
                        onChange={e => setForm(p => ({ ...p, sub_department_id: e.target.value }))}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
                      >
                        <option value="">-- Chọn bộ phận --</option>
                        {filteredSubDepartments.map(sd => <option key={sd.id} value={sd.id}>{indentLabel(sd.name, sd.depth)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Chức Vụ</label>
                      <select
                        disabled={isReadOnly || !form.company_id || positions.length === 0}
                        value={form.position_id}
                        onChange={e => setForm(p => ({ ...p, position_id: e.target.value }))}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                      >
                        <option value="">-- Chọn chức vụ --</option>
                        {positions.map(pos => <option key={pos.id} value={pos.id}>{pos.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-foreground mb-1.5">Tiểu sử</label>
                    <textarea
                      disabled={isReadOnly}
                      value={form.bio}
                      onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
                      className="w-full h-20 px-3 py-2 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60 resize-none"
                      placeholder="Mô tả về bạn..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Chức danh công việc</label>
                      <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                        {(() => {
                          const posName = positions.find(p => p.id === form.position_id)?.name || '';
                          const subDeptName = filteredSubDepartments.find(sd => sd.id === form.sub_department_id)?.name || '';
                          const deptName = childDepartments.find(d => d.id === form.department)?.name || '';
                          const parts = [posName, subDeptName, deptName].filter(Boolean);
                          return parts.length > 0 ? parts.join(' ') : <span className="text-muted-foreground">Chưa được xác định</span>;
                        })()}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Quản lý trực tiếp</label>
                      {/* FIX Bug 2: View mode hiển thị text, không phải disabled dropdown */}
                      {isReadOnly ? (
                        <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                          {(() => {
                            const manager = managers.find(m => m.id === form.manager_id);
                            if (manager) {
                              return (
                                <span>
                                  {manager.name}
                                  {manager.job_title && manager.job_title !== 'No Title' && (
                                    <span className="text-muted-foreground ml-1.5">· {manager.job_title}</span>
                                  )}
                                </span>
                              );
                            }
                            return <span className="text-muted-foreground">-- Chưa có quản lý --</span>;
                          })()}
                        </div>
                      ) : (
                        <ManagerPicker
                          value={form.manager_id}
                          onChange={id => setForm(p => ({ ...p, manager_id: id }))}
                          managers={managersForPicker}
                          departmentId={form.department}
                          subDepartmentId={form.sub_department_id}
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-500 text-foreground">Thẻ Tags</label>
                      {selectedTagIds.length > 0 && (
                        <span className="text-2xs font-600 text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full">
                          Đã chọn {selectedTagIds.length}
                        </span>
                      )}
                    </div>
                    {allTags.length === 0 ? (
                      <div className="p-3 rounded-xl border border-line bg-hover">
                        <p className="text-xs text-muted-foreground text-center">
                          Không có thẻ nào khả dụng
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {allTags.map(tag => {
                            const isSelected = selectedTagIds.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTagIds(prev =>
                                    prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                                  );
                                }}
                                disabled={isReadOnly}
                                className={`relative group px-3 py-2 rounded-lg text-xs font-600 transition-all border-2 ${
                                  isSelected
                                    ? `text-white border-2 cursor-pointer shadow-lg`
                                    : `border-line-strong text-muted-foreground hover:border-white/40 hover:bg-hover cursor-pointer`
                                }`}
                                style={{
                                  backgroundColor: isSelected ? tag.color : 'transparent',
                                  borderColor: isSelected ? tag.color : undefined,
                                  opacity: isReadOnly ? 0.6 : 1,
                                }}
                                title={tag.description || tag.name}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span>{tag.name}</span>
                                  {isSelected && (
                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/30">
                                      ✓
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {!isCreating && (
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Trạng thái</label>
                      <select
                        disabled={isReadOnly}
                        value={form.status}
                        onChange={e => setForm(p => ({ ...p, status: e.target.value as 'active' | 'inactive' }))}
                        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none disabled:opacity-60"
                      >
                        <option value="active">Đang hoạt động</option>
                        <option value="inactive">Không hoạt động</option>
                      </select>
                    </div>
                  )}

                  {/* System Information - Only show in view mode or for non-creating users */}
                  {!isCreating && (
                    <div className="pt-4 border-t border-line">
                      <h3 className="text-sm font-600 text-foreground mb-4">📋 Thông Tin Hệ Thống</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-500 text-muted-foreground mb-1">Ngày đăng nhập cuối</label>
                          <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                            {user?.last_login ? new Date(user.last_login).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Chưa đăng nhập'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-500 text-muted-foreground mb-1">Ngày tạo</label>
                          <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                            {user?.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-500 text-muted-foreground mb-1">Người tạo</label>
                          <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                            {displayActor(user?.created_by_name, user?.created_by)}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-500 text-muted-foreground mb-1">Ngày cập nhật</label>
                          <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                            {user?.updated_at ? new Date(user.updated_at).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-500 text-muted-foreground mb-1">Người cập nhật</label>
                          <div className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line flex items-center">
                            {displayActor(user?.updated_by_name, user?.updated_by)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isCreating && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-500 text-foreground mb-1.5">Mật khẩu *</label>
                          <input
                            type="password"
                            value={form.password}
                            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                            className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                              errors.password ? 'border-red-500/60' : 'border-line'
                            }`}
                            placeholder="Nhập mật khẩu"
                          />
                          {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-500 text-foreground mb-1.5">Xác nhận mật khẩu *</label>
                          <input
                            type="password"
                            value={form.confirmPassword}
                            onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                            className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                              errors.confirmPassword ? 'border-red-500/60' : 'border-line'
                            }`}
                            placeholder="Xác nhận mật khẩu"
                          />
                          {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* HR Profile Tab */}
              {activeTab === 'hr' && (
                <div className="space-y-5">
                  {/* Thông tin cá nhân (map từ form Onboarding) */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">👤 Thông Tin Cá Nhân</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ngày Sinh</label>
                        <DateInputVN disabled={isReadOnly} value={form.date_of_birth}
                          onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Giới Tính</label>
                        <select disabled={isReadOnly} value={form.gender}
                          onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60">
                          <option value="">-- Chọn --</option>
                          <option value="Nam">Nam</option>
                          <option value="Nữ">Nữ</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Email Cá Nhân</label>
                        <input type="email" disabled={isReadOnly} value={form.personal_email}
                          onChange={e => setForm(p => ({ ...p, personal_email: e.target.value }))}
                          placeholder="email@gmail.com"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Quốc Tịch</label>
                        <select disabled={isReadOnly} value={form.nationality}
                          onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60">
                          <option value="">-- Chọn --</option>
                          {form.nationality && !NATIONALITIES.includes(form.nationality) && (
                            <option value={form.nationality}>{form.nationality} (giá trị cũ — chọn lại)</option>
                          )}
                          {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Dân Tộc</label>
                        <input type="text" disabled={isReadOnly} value={form.ethnicity}
                          onChange={e => setForm(p => ({ ...p, ethnicity: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tôn Giáo</label>
                        <input type="text" disabled={isReadOnly} value={form.religion}
                          onChange={e => setForm(p => ({ ...p, religion: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tình Trạng Hôn Nhân</label>
                        <select disabled={isReadOnly} value={form.marital_status}
                          onChange={e => setForm(p => ({ ...p, marital_status: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60">
                          <option value="">-- Chọn --</option>
                          <option value="Độc thân">Độc thân</option>
                          <option value="Đã kết hôn">Đã kết hôn</option>
                          <option value="Ly hôn">Ly hôn</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Số Con</label>
                        <input type="number" min={0} disabled={isReadOnly} value={form.children_count}
                          onChange={e => setForm(p => ({ ...p, children_count: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Trình Độ Học Vấn</label>
                        <select disabled={isReadOnly} value={form.education_level}
                          onChange={e => setForm(p => ({ ...p, education_level: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60">
                          <option value="">-- Chọn --</option>
                          <option value="Trung học phổ thông">Trung học phổ thông</option>
                          <option value="Trung cấp">Trung cấp</option>
                          <option value="Cao đẳng">Cao đẳng</option>
                          <option value="Đại học">Đại học</option>
                          <option value="Thạc sĩ">Thạc sĩ</option>
                          <option value="Tiến sĩ">Tiến sĩ</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Chuyên Ngành</label>
                        <input type="text" disabled={isReadOnly} value={form.major}
                          onChange={e => setForm(p => ({ ...p, major: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                    </div>
                  </div>

                  {/* Thông tin lao động */}
                  <EmploymentSection form={form} setForm={setForm} isReadOnly={isReadOnly} />

                  {/* Địa chỉ */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">📍 Địa Chỉ</h3>
                    <div className="space-y-4">
                      {/* Địa chỉ thường trú */}
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Địa Chỉ Thường Trú</label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={form.home_address}
                          onChange={e => setForm(p => ({ ...p, home_address: e.target.value }))}
                          placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                        />
                      </div>
                      {/* Địa chỉ tạm trú */}
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Địa Chỉ Tạm Trú</label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={form.temporary_address}
                          onChange={e => setForm(p => ({ ...p, temporary_address: e.target.value }))}
                          placeholder="Để trống nếu trùng địa chỉ thường trú"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                        />
                      </div>
                      {/* Địa chỉ công tác */}
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Địa Chỉ Công Tác</label>
                        <select
                          disabled={isReadOnly}
                          value={form.work_location}
                          onChange={e => setForm(p => ({ ...p, work_location: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                        >
                          <option value="">-- Chọn địa chỉ công tác --</option>
                          {WORK_LOCATIONS.map(w => (
                            <option key={w.value} value={w.value}>{w.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Tài khoản ngân hàng */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🏦 Tài Khoản Ngân Hàng</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tên Ngân Hàng</label>
                        <input
                          type="text"
                          list="vn-banks-user"
                          disabled={isReadOnly}
                          value={form.bank_name}
                          onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))}
                          placeholder="Gõ để tìm: VCB, Techcombank…"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                        />
                        <datalist id="vn-banks-user">
                          {VN_BANKS.map(b => <option key={b.bin} value={b.shortName}>{b.name}</option>)}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Số Tài Khoản</label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={form.bank_account_no}
                          onChange={e => setForm(p => ({ ...p, bank_account_no: e.target.value }))}
                          placeholder="Số tài khoản ngân hàng"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Tên Chủ Tài Khoản</label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={form.bank_account_name}
                          onChange={e => setForm(p => ({ ...p, bank_account_name: e.target.value }))}
                          placeholder="Tên chủ tài khoản (in hoa như in sổ ngân hàng)"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Giấy tờ tùy thân */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🪪 Giấy Tờ Tùy Thân</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Số Căn Cước Công Dân</label>
                        <input type="text" disabled={isReadOnly} value={form.national_id}
                          onChange={e => setForm(p => ({ ...p, national_id: e.target.value }))}
                          placeholder="Số CCCD/CMND"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ngày Cấp</label>
                        <DateInputVN disabled={isReadOnly} value={form.national_id_issue_date}
                          onChange={e => setForm(p => ({ ...p, national_id_issue_date: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Nơi Cấp</label>
                        <input type="text" disabled={isReadOnly} value={form.national_id_issue_place}
                          onChange={e => setForm(p => ({ ...p, national_id_issue_place: e.target.value }))}
                          placeholder="Cục Cảnh sát QLHC về TTXH / Công an tỉnh..."
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                    </div>
                  </div>

                  {/* Phương tiện di chuyển */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🚗 Phương Tiện Di Chuyển</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Loại Phương Tiện</label>
                        <select disabled={isReadOnly} value={form.vehicle_type}
                          onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60">
                          <option value="">-- Chọn --</option>
                          <option value="Không có">Không có</option>
                          <option value="Xe máy">Xe máy</option>
                          <option value="Ô tô">Ô tô</option>
                          <option value="Xe đạp">Xe đạp</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Biển Số Xe</label>
                        <input type="text" disabled={isReadOnly} value={form.vehicle_plate}
                          onChange={e => setForm(p => ({ ...p, vehicle_plate: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Hiệu Xe</label>
                        <input type="text" disabled={isReadOnly} value={form.vehicle_model}
                          onChange={e => setForm(p => ({ ...p, vehicle_model: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                    </div>
                  </div>

                  {/* Người thân liên hệ khẩn cấp 1 */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🆘 Người Thân Liên Hệ 1</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Họ Tên Người Thân</label>
                        <input type="text" disabled={isReadOnly} value={form.emergency_contact_name}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_name: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mối Quan Hệ</label>
                        <input type="text" disabled={isReadOnly} value={form.emergency_contact_relationship}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_relationship: e.target.value }))}
                          placeholder="Bố/Mẹ/Vợ/Chồng/Anh/Chị..."
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Số Điện Thoại</label>
                        <input type="tel" disabled={isReadOnly} value={form.emergency_contact_phone}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Địa Chỉ</label>
                        <input type="text" disabled={isReadOnly} value={form.emergency_contact_address}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_address: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                    </div>
                  </div>

                  {/* Người thân liên hệ khẩn cấp 2 */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🆘 Người Thân Liên Hệ 2 <span className="text-2xs font-400 text-muted-foreground normal-case">(không bắt buộc)</span></h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Họ Tên Người Thân</label>
                        <input type="text" disabled={isReadOnly} value={form.emergency_contact_2_name}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_2_name: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mối Quan Hệ</label>
                        <input type="text" disabled={isReadOnly} value={form.emergency_contact_2_relationship}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_2_relationship: e.target.value }))}
                          placeholder="Bố/Mẹ/Vợ/Chồng/Anh/Chị..."
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Số Điện Thoại</label>
                        <input type="tel" disabled={isReadOnly} value={form.emergency_contact_2_phone}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_2_phone: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Địa Chỉ</label>
                        <input type="text" disabled={isReadOnly} value={form.emergency_contact_2_address}
                          onChange={e => setForm(p => ({ ...p, emergency_contact_2_address: e.target.value }))}
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Benefits Tab — Chế Độ & Đãi Ngộ */}
              {activeTab === 'benefits' && (
                <div className="space-y-5">
                  {/* Chế độ chấm công */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🗓️ Chế Độ Chấm Công</h3>
                    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                      <input type="checkbox" disabled={isReadOnly} checked={!!form.default_full_attendance}
                        onChange={e => setForm(p => ({ ...p, default_full_attendance: e.target.checked }))}
                        className="mt-0.5 w-5 h-5 rounded accent-indigo-500 cursor-pointer disabled:opacity-60" />
                      <div className="flex-1">
                        <span className="block text-sm font-500 text-foreground">Mặc Định Đủ Công</span>
                        <p className="mt-1 text-2xs text-muted-foreground">
                          Dành cho vị trí không phải điểm danh. Bảng công hằng tháng tự tính đủ công cho
                          mọi ngày làm việc (trừ Chủ Nhật và ngày lễ), không cần chấm công. Nghỉ phép vẫn
                          được ghi nhận để theo dõi nhưng không trừ ngày công.
                        </p>
                        <p className="mt-1 text-2xs text-amber-400/80">
                          Áp dụng từ kỳ công hiện tại trở đi — bảng công các kỳ đã chốt giữ nguyên.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Phụ cấp */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🍱 Phụ Cấp Theo Ngày Công</h3>
                    <p className="text-2xs text-muted-foreground mb-3">
                      Phụ cấp tính theo số ngày công vân tay thực tế khi xuất bảng công. Bật/tắt theo từng nhân sự.
                    </p>
                    <div className="space-y-3">
                      {/* Cơm trưa */}
                      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                        <input type="checkbox" disabled={isReadOnly} checked={!!form.meal_allowance_enabled}
                          onChange={e => setForm(p => ({ ...p, meal_allowance_enabled: e.target.checked }))}
                          className="w-5 h-5 rounded accent-indigo-500 cursor-pointer disabled:opacity-60" />
                        <span className="flex-1 text-sm font-500 text-foreground">Phụ cấp cơm trưa</span>
                        <div className="flex items-center gap-1.5">
                          <MoneyInput disabled={isReadOnly || !form.meal_allowance_enabled}
                            value={form.meal_allowance_rate}
                            onValueChange={n => setForm(p => ({ ...p, meal_allowance_rate: n ? String(n) : '' }))}
                            className="w-28 h-9 px-2 rounded-lg text-sm text-right text-foreground bg-[#0f1726] border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-40" />
                          <span className="text-xs text-muted-foreground">đ/ngày</span>
                        </div>
                      </div>
                      {/* Gửi xe */}
                      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                        <input type="checkbox" disabled={isReadOnly} checked={!!form.parking_allowance_enabled}
                          onChange={e => setForm(p => ({ ...p, parking_allowance_enabled: e.target.checked }))}
                          className="w-5 h-5 rounded accent-indigo-500 cursor-pointer disabled:opacity-60" />
                        <span className="flex-1 text-sm font-500 text-foreground">Phụ cấp gửi xe</span>
                        <div className="flex items-center gap-1.5">
                          <MoneyInput disabled={isReadOnly || !form.parking_allowance_enabled}
                            value={form.parking_allowance_rate}
                            onValueChange={n => setForm(p => ({ ...p, parking_allowance_rate: n ? String(n) : '' }))}
                            className="w-28 h-9 px-2 rounded-lg text-sm text-right text-foreground bg-[#0f1726] border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-40" />
                          <span className="text-xs text-muted-foreground">đ/ngày</span>
                        </div>
                      </div>
                      {/* Công tác phí */}
                      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                        <span className="flex-1 text-sm font-500 text-foreground">Công tác phí</span>
                        <div className="flex items-center gap-1.5">
                          <MoneyInput disabled={isReadOnly} showZero
                            value={form.travel_allowance_rate}
                            onValueChange={n => setForm(p => ({ ...p, travel_allowance_rate: n ? String(n) : '' }))}
                            className="w-28 h-9 px-2 rounded-lg text-sm text-right text-foreground bg-[#0f1726] border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                          <span className="text-xs text-muted-foreground">đ/ngày</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BHXH */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🛡️ Bảo Hiểm Xã Hội</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Đơn Vị Tham Gia BHXH</label>
                        <input type="text" disabled={isReadOnly} value={form.social_insurance_unit}
                          onChange={e => setForm(p => ({ ...p, social_insurance_unit: e.target.value }))}
                          placeholder="VD: FADO GLOBAL, FADO IEXPORT..."
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mức Đóng</label>
                        <MoneyInput disabled={isReadOnly} value={form.social_insurance_base}
                          onValueChange={n => {
                            const base = n ? String(n) : '';
                            setForm(p => ({
                              ...p,
                              social_insurance_base: base,
                              // Gợi ý TỶ LỆ mặc định NLĐ đóng 10.5% nếu ô trích trừ đang trống
                              social_insurance_deduction: p.social_insurance_deduction === '' && base !== ''
                                ? '10.5'
                                : p.social_insurance_deduction,
                            }));
                          }}
                          placeholder="VD: 5.700.000"
                          className="w-full h-10 px-3 rounded-xl text-sm text-right text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">
                          Trích Trừ <span className="font-400 normal-case text-indigo-400">(%, NLĐ thường đóng 10.5)</span>
                        </label>
                        {/* TỶ LỆ %, KHÔNG phải tiền → dùng input thường để gõ được số lẻ (10.5, 20.5).
                            MoneyInput chỉ nhận số nguyên đồng nên sẽ cắt mất phần thập phân. */}
                        <div className="relative">
                          <input
                            type="text" inputMode="decimal" disabled={isReadOnly}
                            value={form.social_insurance_deduction}
                            onChange={e => {
                              // Chỉ cho số và MỘT dấu chấm/phẩy thập phân; luôn chuẩn hoá về dấu chấm.
                              const raw = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
                              const parts = raw.split('.');
                              const v = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : raw;
                              setForm(p => ({ ...p, social_insurance_deduction: v }));
                            }}
                            placeholder="VD: 10.5"
                            className="w-full h-10 pl-3 pr-8 rounded-xl text-sm text-right text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Đơn vị trả lương */}
                  <div>
                    <h3 className="text-sm font-600 text-foreground mb-3">🏢 Phân Bổ Lương</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Đơn Vị Trực Thuộc (Lương)</label>
                        <input type="text" disabled={isReadOnly} value={form.salary_entity}
                          onChange={e => setForm(p => ({ ...p, salary_entity: e.target.value }))}
                          placeholder="VD: FADO GROUP"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                      <div>
                        <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mã Chấm Công (CC)</label>
                        <input type="text" disabled={isReadOnly} value={form.cost_center_code}
                          onChange={e => setForm(p => ({ ...p, cost_center_code: e.target.value }))}
                          placeholder="Mã đối chiếu máy chấm công"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Đa Công Ty Tab */}
              {activeTab === 'companies' && (
                <MultiCompanyTab
                  primaryCompanyId={form.company_id}
                  currentUserId={user?.id}
                  allCompanies={allCompanies}
                  companyDepartmentsMap={companyDepartmentsMap}
                  allSubDepartments={allSubDepartments}
                  companyPositionsMap={companyPositionsMap}
                  value={companyMemberships}
                  onChange={setCompanyMemberships}
                  readOnly={isReadOnly}
                />
              )}

              {/* Phân Công Tab — mô hình một người nhiều phân công (org_assignments) */}
              {activeTab === 'assignments' && !isCreating && user?.id && (
                <AssignmentsTab userId={user.id} readOnly={mode === 'view'} />
              )}

              {/* Permissions Tab */}
              {activeTab === 'permissions' && (
                <>
                  {/* Theo Dõi Chuyên Cần — cờ nhạy cảm: người được BẬT mới được TÍNH VÀO theo dõi. Mặc định TẮT. */}
                  <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-600 text-foreground flex items-center gap-1.5">
                          🏅 Theo Dõi Chuyên Cần
                        </p>
                        <p className="mt-0.5 text-2xs text-muted-foreground leading-relaxed">
                          Bật thì nhân sự này mới được <span className="font-600 text-foreground">tính vào</span> báo cáo chuyên cần
                          (đi trễ, về sớm, vắng, nghỉ phép…). Dữ liệu nhạy cảm — mặc định tắt, chỉ Super Admin thay đổi được.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isReadOnly || !canEditPermissions}
                        onClick={() => setForm(p => ({ ...p, diligence_enabled: !p.diligence_enabled }))}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                          form.diligence_enabled ? 'bg-rose-500' : 'bg-white/15'
                        }`}
                        aria-label="Bật/tắt Theo Dõi Chuyên Cần"
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                          form.diligence_enabled ? 'left-[22px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                    <p className={`mt-2 text-2xs font-600 ${form.diligence_enabled ? 'text-rose-300' : 'text-muted-foreground'}`}>
                      {form.diligence_enabled ? '✅ Đang BẬT — được tính vào Theo Dõi Chuyên Cần' : '⭕ Đang TẮT — không xuất hiện trong Theo Dõi Chuyên Cần'}
                    </p>
                  </div>

                  <PermissionsPanel
                    permissions={modulePermissions}
                    onPermissionsChange={setModulePermissions}
                    isReadOnly={isReadOnly || !canEditPermissions}
                    targetRole={form.role}
                  />

                  {/* Telegram Notification Settings */}
                  <div className="border-t border-line pt-4 mt-4">
                    <h3 className="text-sm font-600 text-foreground mb-4">⚙️ Cấu Hình Thông Báo Telegram</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Telegram Chat ID */}
                      <div>
                        <label className="block text-sm font-500 text-foreground mb-1.5">Telegram User ID</label>
                        <input
                          type="text"
                          disabled={isReadOnly}
                          value={form.telegram_chat_id}
                          onChange={e => setForm(p => ({ ...p, telegram_chat_id: e.target.value }))}
                          placeholder="Ví dụ: 5195958362"
                          className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                        />
                        <p className="text-2xs text-muted-foreground mt-1">Nhập User ID Telegram để nhận thông báo booking</p>
                      </div>

                      {/* Telegram Enabled Toggle */}
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            disabled={isReadOnly || !form.telegram_chat_id}
                            checked={form.telegram_enabled}
                            onChange={e => setForm(p => ({ ...p, telegram_enabled: e.target.checked }))}
                            className="w-5 h-5 rounded border-line-strong accent-indigo-500 cursor-pointer disabled:opacity-60"
                          />
                          <span className="text-sm font-500 text-foreground">
                            {form.telegram_enabled ? '✅ Bật Thông Báo' : '⭕ Tắt Thông Báo'}
                          </span>
                        </label>
                      </div>
                    </div>

                    {form.telegram_chat_id && form.telegram_enabled && (
                      <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <p className="text-2xs text-emerald-400 font-500">
                          ✓ Sẽ gửi thông báo Telegram khi booking được duyệt hoặc từ chối
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quản trị viên tối cao gắn/gỡ liên kết ĐĂNG NHẬP Telegram */}
                  {!isCreating && isSuperAdmin(currentUser) && (
                    <div className="border-t border-line pt-4 mt-4">
                      <h3 className="text-sm font-600 text-foreground mb-1">🔗 Liên Kết Đăng Nhập Telegram</h3>
                      <p className="text-2xs text-muted-foreground mb-4">
                        Chỉ Quản trị viên tối cao gắn/gỡ. Gắn Telegram User ID để tài khoản này đăng nhập 1 chạm bằng Telegram. Mọi thao tác được ghi nhật ký kiểm toán.
                      </p>

                      {tgLink.telegram_id ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-surface-2 border border-line">
                          <div className="text-sm text-foreground">
                            <span className="text-emerald-400 font-600">✓ Đã liên kết</span>
                            <span className="ml-2 text-muted-foreground">ID: {tgLink.telegram_id}</span>
                            {tgLink.telegram_username && <span className="ml-2 text-muted-foreground">@{tgLink.telegram_username}</span>}
                          </div>
                          <button
                            type="button"
                            disabled={tgBusy}
                            onClick={handleAdminUnlinkTelegram}
                            className="shrink-0 h-9 px-4 rounded-xl text-sm font-500 text-red-300 border border-red-500/40 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            {tgBusy ? 'Đang xử lý…' : 'Gỡ liên kết'}
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tgInput}
                            onChange={e => setTgInput(e.target.value.replace(/[^\d]/g, ''))}
                            placeholder="Nhập Telegram User ID (chỉ chữ số)"
                            className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60"
                          />
                          <button
                            type="button"
                            disabled={tgBusy || !/^\d{4,20}$/.test(tgInput.trim())}
                            onClick={handleAdminLinkTelegram}
                            className="shrink-0 h-10 px-4 rounded-xl text-sm font-600 bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {tgBusy ? 'Đang xử lý…' : 'Gắn liên kết'}
                          </button>
                        </div>
                      )}

                      {tgMsg && (
                        <p className={`text-2xs mt-2 ${tgMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {tgMsg.text}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Quyền Chi Phí Tab — chuỗi duyệt + hạn mức thẩm quyền (roadmap §2.6) */}
              {activeTab === 'expense-approval' && !isCreating && user?.id && (
                <ExpenseApprovalTab userId={user.id} />
              )}

              {/* Password Tab */}
              {activeTab === 'password' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Mật khẩu mới *</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))}
                        className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                          passwordErrors.newPassword ? 'border-red-500/60' : 'border-line'
                        }`}
                        placeholder="Nhập mật khẩu mới"
                      />
                      {passwordErrors.newPassword && <p className="text-xs text-red-400 mt-1">{passwordErrors.newPassword}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Xác nhận mật khẩu mới *</label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                        className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 ${
                          passwordErrors.confirmPassword ? 'border-red-500/60' : 'border-line'
                        }`}
                        placeholder="Xác nhận mật khẩu mới"
                      />
                      {passwordErrors.confirmPassword && <p className="text-xs text-red-400 mt-1">{passwordErrors.confirmPassword}</p>}
                    </div>
                  </div>
                  {passwordErrors.submit && (
                    <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30">
                      <p className="text-sm text-red-300">{passwordErrors.submit}</p>
                    </div>
                  )}
                  <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30">
                    <p className="text-sm text-blue-300">
                      💡 Mật khẩu mới phải có ít nhất 10 ký tự. Nhân sự sẽ dùng mật khẩu này để đăng nhập lại.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        {!isReadOnly && (
          <div className="shrink-0 border-t border-white/08 px-4 sm:px-6 py-3 sm:py-4">
            {errors._form && (
              <p className="text-xs text-red-400 mb-2">{errors._form}</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <button onClick={handleClose} className="h-10 sm:h-9 px-5 rounded-xl btn-ghost text-sm font-500">Hủy</button>
              {activeTab === 'password' ? (
                <button
                  onClick={handleChangePassword}
                  disabled={isSaving || !passwordForm.newPassword || !passwordForm.confirmPassword}
                  className="h-10 sm:h-9 px-5 rounded-xl btn-accent text-sm font-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Đang lưu...' : 'Đổi Mật Khẩu'}
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={isSaving || !form.name || !form.email || (isCreating && (!form.password || !form.confirmPassword))}
                  className="h-10 sm:h-9 px-5 rounded-xl btn-accent text-sm font-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Đang lưu...' : (mode === 'create' ? 'Thêm Người Dùng' : 'Lưu')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Component phụ: Thông Tin Lao Động ────────────────────────────────────────
interface EmpType { id: string; name: string; default_duration_days: number | null; requires_evaluation: boolean; is_active: boolean; }

function EmploymentSection({
  form,
  setForm,
  isReadOnly,
}: {
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  isReadOnly: boolean;
}) {
  const [empTypes, setEmpTypes] = useState<EmpType[]>([]);

  useEffect(() => {
    fetch('/api/employment-types')
      .then((r) => r.json())
      .then((d) => { if (d.success) setEmpTypes(d.data); })
      .catch(() => {});
  }, []);

  const selectedType = empTypes.find((t) => t.id === form.employment_type_id);
  const needsDuration = selectedType?.requires_evaluation ?? false;

  function handleTypeChange(typeId: string) {
    const t = empTypes.find((e) => e.id === typeId);
    setForm((p: any) => ({
      ...p,
      employment_type_id: typeId,
      employment_type: t?.name ?? '',
      probation_duration_days: t?.default_duration_days ?? '',
    }));
  }

  return (
    <div>
      <h3 className="text-sm font-600 text-foreground mb-3">📋 Thông Tin Lao Động</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Mã nhân viên */}
        <div>
          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Mã Nhân Viên</label>
          <input type="text" disabled={isReadOnly} value={form.employee_code ?? ''}
            onChange={e => setForm((p: any) => ({ ...p, employee_code: e.target.value }))}
            placeholder="VD: NV001"
            className="w-full h-10 px-3 rounded-xl text-sm text-foreground border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
            style={{ background: 'var(--input)' }} />
        </div>
        {/* Ngày bắt đầu */}
        <div>
          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Ngày Bắt Đầu Làm Việc</label>
          <DateInputVN disabled={isReadOnly} value={form.hire_date}
            onChange={e => setForm((p: any) => ({ ...p, hire_date: e.target.value }))}
            className="w-full h-10 px-3 rounded-xl text-sm text-foreground border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
            style={{ background: 'var(--input)' }} />
        </div>
        {/* Hình thức */}
        <div>
          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Hình Thức Làm Việc</label>
          <select disabled={isReadOnly} value={form.employment_type_id || ''}
            onChange={e => handleTypeChange(e.target.value)}
            className="w-full h-10 px-3 rounded-xl text-sm text-foreground border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
            style={{ background: 'var(--input)' }}>
            <option value="">-- Chọn hình thức --</option>
            {empTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {/* Giờ Làm Việc — giờ vào ca (chấm công + nghỉ phép theo buổi + minigame Solace) */}
        <div>
          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">Giờ Làm Việc</label>
          <input type="time" disabled={isReadOnly} value={form.work_start_time ?? ''}
            onChange={e => setForm((p: any) => ({ ...p, work_start_time: e.target.value }))}
            className="w-full h-10 px-3 rounded-xl text-sm text-foreground border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
            style={{ background: 'var(--input)' }} />
          {form.deduct_lunch !== false && estimatedEndTime(form.work_start_time) && (
            <p className="text-2xs text-indigo-400/90 mt-1">Tan làm dự kiến: <span className="font-600">{estimatedEndTime(form.work_start_time)}</span> (8h làm + 1h nghỉ trưa)</p>
          )}
          {/* Trừ nghỉ trưa — mặc định bật. Bỏ tick cho ca xuyên trưa (vd tài xế làm 07:00–19:00). */}
          <label className="mt-2 flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" disabled={isReadOnly}
              checked={form.deduct_lunch !== false}
              onChange={e => setForm((p: any) => ({ ...p, deduct_lunch: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-line accent-indigo-500 disabled:opacity-60" />
            <span className="text-2xs text-muted-foreground leading-snug">
              Trừ 1 giờ nghỉ trưa khi tính công.
              <span className="block opacity-70">Bỏ tick cho ca làm xuyên trưa (vd tài xế 07:00–19:00) — sẽ tính trọn giờ, không trừ trưa.</span>
            </span>
          </label>
        </div>
        {/* Thời hạn thử việc — chỉ hiện khi loại cần đánh giá */}
        {needsDuration && (
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5">
              Thời Hạn (ngày)
              {selectedType?.default_duration_days && (
                <span className="ml-1 font-400 normal-case text-indigo-400">
                  (mặc định: {selectedType.default_duration_days} ngày)
                </span>
              )}
            </label>
            <input type="number" min="1" max="365" disabled={isReadOnly}
              value={form.probation_duration_days ?? ''}
              onChange={e => setForm((p: any) => ({ ...p, probation_duration_days: e.target.value }))}
              placeholder={String(selectedType?.default_duration_days ?? '')}
              className="w-full h-10 px-3 rounded-xl text-sm text-foreground border border-line focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
              style={{ background: 'var(--input)' }} />
            <p className="mt-1 text-2xs text-muted-foreground">
              Để trống để dùng thời hạn mặc định của hình thức làm việc
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


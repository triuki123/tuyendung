'use client';
// Force recompile - position field dropdown sync

import React, { useState, useEffect } from 'react';
import { createUser, updateUser } from '@/lib/api-client';
import { useToast } from '@/context/ToastContext';
import { isSuperAdmin } from '@/lib/authStore';
import { XCircle, Search, X } from 'lucide-react';

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
  tags?: Array<{ id: string; name: string; color: string }>;
  manager_id?: string;
  telegram_chat_id?: string;
  telegram_enabled?: boolean;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  children?: Department[];
  depth?: number;   // độ sâu trong cây phòng ban (để thụt lề trong dropdown)
}

interface SubDepartment {
  id: string;
  name: string;
  parent_sub_department_id?: string;
  depth?: number;
  department_id: string;
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

interface UsersModalProps {
  user?: User | null;
  mode: 'create' | 'view' | 'edit' | 'change-password';
  currentUser: any;
  onClose: () => void;
  onSave: (u: User) => void;
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

/** Tiền tố thụt lề cho option trong dropdown theo độ sâu (VD depth 2 → "└─ "). */
function indentLabel(name: string, depth?: number): string {
  const d = depth ?? 0;
  return d > 0 ? `${'  '.repeat(d)}└ ${name}` : name;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: 'Super Admin', color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
  admin: { label: 'Admin', color: 'text-indigo-400', bg: 'bg-indigo-500/15 border-indigo-500/30' },
  manager: { label: 'Quản Lý', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  user: { label: 'Người Dùng', color: 'text-ink-muted', bg: 'bg-slate-500/15 border-slate-500/30' },
};

export default function UsersModal({ user, mode, currentUser, onClose, onSave }: UsersModalProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'basic' | 'personal' | 'permissions' | 'password'>(mode === 'change-password' ? 'password' : 'basic');
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
    telegram_chat_id: user?.telegram_chat_id ?? '',
    telegram_enabled: user?.telegram_enabled ?? false,
  });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(user?.tags?.map(t => t.id) ?? []);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
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
  const [managers, setManagers] = useState<Array<{ id: string; name: string; job_title: string; level: string; dept_positions?: Record<string, string> }>>([]);
  // Nhãn chức vụ bám theo phòng ban đang chọn (từ org_assignments); không có thì dùng chức vụ chính.
  const managersForPicker = React.useMemo(
    () => managers.map(m => ({
      ...m,
      job_title: (form.department && m.dept_positions?.[form.department]) || m.job_title,
    })),
    [managers, form.department]
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isReadOnly = mode === 'view';
  const isCreating = mode === 'create';
  const canSetSuperAdmin = isSuperAdmin(currentUser);

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
      // Cây phòng ban NHIỀU TẦNG → dàn phẳng theo DFS + độ sâu để thụt lề trong dropdown,
      // cho phép chọn phòng ban ở bất kỳ tầng nào.
      const ordered: Department[] = [];
      const seen = new Set<string>();
      const walk = (parentId: string | null, depth: number) => {
        companyDepts
          .filter(d => (d.parent_department_id || null) === parentId)
          .forEach(d => {
            if (seen.has(d.id) || depth > 30) return;
            seen.add(d.id);
            ordered.push({ ...d, depth });
            walk(d.id, depth + 1);
          });
      };
      walk(null, 0);
      setParentDepartments(ordered);
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
  // Removed the !managers.length guard — it was preventing reload when company changed
  useEffect(() => {
    if ((mode === 'edit' || mode === 'view') && user?.company_id) {
      const params = new URLSearchParams({ company_id: user.company_id });
      fetch(`/api/users/managers?${params}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setManagers(data || []))
        .catch(err => console.error('Error fetching managers on user load:', err));
    }
  }, [user?.id, mode]);

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

        // FIX Bug 1: Load managers for the USER's company, not always companies[0]
        // In create mode: don't pre-load (no company selected yet)
        // In edit/view mode: load for the user's actual company
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

  const ROLE_OPTIONS = [
    { value: 'user', label: 'Người Dùng' },
    { value: 'manager', label: 'Quản Lý' },
    { value: 'admin', label: 'Admin' },
    ...(canSetSuperAdmin ? [{ value: 'super_admin', label: 'Super Admin' }] : []),
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = 'Tên không được để trống';
    if (!form.email.trim()) newErrors.email = 'Email không được để trống';

    if (isCreating) {
      if (!form.password) newErrors.password = 'Mật khẩu không được để trống';
      if (form.password.length < 10) newErrors.password = 'Mật khẩu phải có ít nhất 10 ký tự';
      if (!form.confirmPassword) newErrors.confirmPassword = 'Xác nhận mật khẩu không được để trống';
      if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Mật khẩu không trùng khớp';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePasswordForm = () => {
    const newErrors: Record<string, string> = {};

    if (!passwordForm.newPassword) newErrors.newPassword = 'Mật khẩu mới không được để trống';
    if (passwordForm.newPassword.length < 8) newErrors.newPassword = 'Mật khẩu phải có ít nhất 8 ký tự';
    if (!passwordForm.confirmPassword) newErrors.confirmPassword = 'Xác nhận mật khẩu không được để trống';
    if (passwordForm.newPassword !== passwordForm.confirmPassword) newErrors.confirmPassword = 'Mật khẩu không trùng khớp';

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

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const userData = {
        name: form.name,
        email: form.email,
        role: form.role,
        company_id: form.company_id || null,
        department_id: form.department || null,
        phone: form.phone || '',
        position: form.position || '',
        position_id: form.position_id || null,
        bio: form.bio || '',
        sub_department_id: form.sub_department_id || null,
        manager_id: form.manager_id || null,
        status: form.status,
        telegram_chat_id: form.telegram_chat_id || null,
        telegram_enabled: form.telegram_enabled ?? false,
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

      onSave({
        id: userId,
        status: isCreating ? 'active' : form.status,
        ...created,
      } as User);
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
      // Nếu lỗi liên quan đến email → hiển thị ngay dưới field email
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-xl rounded-3xl border border-line overflow-hidden" style={{ background: 'var(--card)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08">
          <h2 className="text-lg font-700 text-foreground">
            {mode === 'create' ? 'Thêm Người Dùng' : mode === 'edit' ? 'Chỉnh Sửa Người Dùng' : mode === 'change-password' ? 'Đổi Mật Khẩu' : 'Chi Tiết Người Dùng'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground">
            <XCircle size={18} />
          </button>
        </div>
        {(mode === 'edit' || mode === 'change-password') && (
          <div className="flex gap-2 px-6 py-3 border-b border-white/08 overflow-x-auto">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors whitespace-nowrap ${
                activeTab === 'basic'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-white/05'
              }`}
            >
              Thông Tin Cơ Bản
            </button>
            <button
              onClick={() => setActiveTab('personal')}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors whitespace-nowrap ${
                activeTab === 'personal'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-white/05'
              }`}
            >
              Thông Tin Cá Nhân
            </button>
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors whitespace-nowrap ${
                activeTab === 'permissions'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-white/05'
              }`}
            >
              Phân Quyền
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition-colors whitespace-nowrap ${
                activeTab === 'password'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-muted-foreground hover:bg-white/05'
              }`}
            >
              Đổi Mật Khẩu
            </button>
          </div>
        )}
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Basic Information Tab */}
          {activeTab === 'basic' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Họ và tên *</label>
                  <input
                    disabled={isReadOnly}
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo/60 disabled:opacity-60"
                    placeholder="Nguyễn Văn A"
                  />
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
                    className={`w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border focus:outline-none focus:border-indigo/60 disabled:opacity-60 ${errors.email ? 'border-red-500/60' : 'border-line'}`}
                    placeholder="email@company.vn"
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-400">{errors.email}</p>
                  )}
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
                    disabled={isReadOnly}
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
            </>
          )}

          {/* Personal Information Tab */}
          {activeTab === 'personal' && (
            <>
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
                      const positionName = positions.find(p => p.id === form.position_id)?.name || '';
                      const subDeptName = filteredSubDepartments.find(sd => sd.id === form.sub_department_id)?.name || '';
                      const deptName = parentDepartments.find(d => d.id === form.department)?.name || '';

                      const parts = [positionName, subDeptName, deptName].filter(p => p);
                      return parts.length > 0 ? parts.join(' · ') : <span className="text-muted-foreground">-- Không có dữ liệu --</span>;
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
                        // Fallback: nếu managers chưa load hoặc user không có company
                        return <span className="text-muted-foreground">-- Chưa có quản lý --</span>;
                      })()}
                    </div>
                  ) : (
                    <ManagerPicker
                      value={form.manager_id}
                      onChange={id => setForm(p => ({ ...p, manager_id: id }))}
                      managers={managersForPicker}
                    />
                  )}
                </div>
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
            </>
          )}

          {/* Permissions Tab */}
          {activeTab === 'permissions' && (
            <>
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
            </>
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
            </div>
          )}
        </div>
        {!isReadOnly && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/08">
            {errors._form && (
              <p className="text-xs text-red-400 flex-1 text-left">{errors._form}</p>
            )}
            <button onClick={onClose} className="h-9 px-5 rounded-xl btn-ghost text-sm font-500">Hủy</button>
            {activeTab === 'password' ? (
              <button
                onClick={handleChangePassword}
                disabled={isSaving || !passwordForm.newPassword || !passwordForm.confirmPassword}
                className="h-9 px-5 rounded-xl btn-accent text-sm font-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Đang lưu...' : 'Đổi Mật Khẩu'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving || !form.name || !form.email || (isCreating && (!form.password || !form.confirmPassword))}
                className="h-9 px-5 rounded-xl btn-accent text-sm font-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Đang lưu...' : (mode === 'create' ? 'Thêm Người Dùng' : 'Lưu')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Searchable Manager Picker ─────────────────────────────────────────────────
interface ManagerPickerProps {
  value: string;
  onChange: (id: string) => void;
  managers: { id: string; name: string; job_title?: string }[];
}

function ManagerPicker({ value, onChange, managers }: ManagerPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = managers.filter(m =>
    !q || m.name.toLowerCase().includes(q.toLowerCase()) ||
    (m.job_title || '').toLowerCase().includes(q.toLowerCase())
  );
  const selected = managers.find(m => m.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setQ(''); }}
        className="w-full h-10 px-3 rounded-xl text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60 flex items-center justify-between gap-2 text-left"
      >
        {selected ? (
          <span className="truncate">
            {selected.name}
            {selected.job_title && selected.job_title !== 'No Title' && (
              <span className="text-muted-foreground ml-1.5">· {selected.job_title}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/60">-- Chọn quản lý --</span>
        )}
        {value ? (
          <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); onChange(''); }} />
        ) : (
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-line shadow-xl overflow-hidden" style={{ background: 'var(--card)' }}>
          <div className="p-2 border-b border-line-subtle">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Tìm theo tên, chức danh..."
                className="w-full h-8 pl-8 pr-3 rounded-lg text-sm text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/60" />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            <li>
              <button type="button" onClick={() => { onChange(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-hover">
                -- Chưa có quản lý --
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="py-3 text-center text-xs text-muted-foreground">Không tìm thấy</li>
            ) : filtered.map(m => (
              <li key={m.id}>
                <button type="button" onClick={() => { onChange(m.id); setOpen(false); setQ(''); }}
                  className={`w-full text-left px-3 py-2.5 hover:bg-hover transition-colors ${m.id === value ? 'text-indigo-300' : 'text-foreground'}`}>
                  <p className="text-sm font-500">{m.name}</p>
                  {m.job_title && m.job_title !== 'No Title' && (
                    <p className="text-2xs text-muted-foreground">{m.job_title}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

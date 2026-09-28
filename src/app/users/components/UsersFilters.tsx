'use client';

import React, { useState, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
}

interface JobTitle {
  id: string;
  title: string;
  is_active: boolean;
}

interface FiltersState {
  search: string;
  company_id: string;
  department_id: string;
  role: string[];
  status: string;
  job_title_id: string;
  quick: string[];
}

/**
 * Lọc nhanh kiểu Odoo — mỗi chip là 1 điều kiện; chọn nhiều = thoả TẤT CẢ (AND).
 * key khớp với bảng predicate trong UsersClient. Nhóm để dễ đọc.
 */
export const QUICK_FILTERS: { key: string; label: string; group: string }[] = [
  { key: 'no_manager',    label: 'Chưa có quản lý trực tiếp', group: 'Thiếu thông tin' },
  { key: 'no_department', label: 'Chưa gán phòng ban',        group: 'Thiếu thông tin' },
  { key: 'no_position',   label: 'Chưa gán chức danh',         group: 'Thiếu thông tin' },
  { key: 'no_company',    label: 'Chưa gán công ty',           group: 'Thiếu thông tin' },
  { key: 'no_phone',      label: 'Chưa có SĐT',                group: 'Thiếu thông tin' },
  { key: 'no_avatar',     label: 'Chưa có ảnh đại diện',       group: 'Thiếu thông tin' },
  { key: 'is_manager',    label: 'Là quản lý (có cấp dưới)',   group: 'Khác' },
  { key: 'birthday_month',label: 'Sinh nhật tháng này',        group: 'Khác' },
  { key: 'tg_linked',     label: 'Đã liên kết Telegram',       group: 'Telegram' },
  { key: 'tg_unlinked',   label: 'Chưa liên kết Telegram',     group: 'Telegram' },
];

interface UsersFiltersProps {
  companies: Company[];
  departments: Department[];
  jobTitles: JobTitle[];
  filters: FiltersState;
  activeFilterCount: number;
  onFilterChange: (filters: FiltersState) => void;
  onReset: () => void;
}

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'Người Dùng' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tất Cả' },
  { value: 'active', label: 'Đang Hoạt Động' },
  { value: 'inactive', label: 'Không Hoạt Động' },
];

export function UsersFilters({
  companies,
  departments,
  jobTitles,
  filters,
  activeFilterCount,
  onFilterChange,
  onReset,
}: UsersFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if mobile on mount and on window resize
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get departments for selected company (assuming API returns departments with parent_department_id)
  // Or if departments have company_id field, filter by that
  const departmentsForCompany = filters.company_id
    ? departments.filter((d) => {
        // Note: This assumes departments are already filtered by company on the API side
        // Or departments have a company_id field. Adjust filter based on actual data structure.
        return true; // All departments are shown as backend should filter by company
      })
    : [];

  const handleSearchChange = (value: string) => {
    onFilterChange({ ...filters, search: value });
  };

  const handleCompanyChange = (value: string) => {
    // Reset department when company changes
    onFilterChange({ ...filters, company_id: value, department_id: '' });
  };

  const handleDepartmentChange = (value: string) => {
    onFilterChange({ ...filters, department_id: value });
  };

  const handleRoleToggle = (role: string) => {
    const newRoles = filters.role.includes(role)
      ? filters.role.filter((r) => r !== role)
      : [...filters.role, role];
    onFilterChange({ ...filters, role: newRoles });
  };

  const handleStatusChange = (value: string) => {
    onFilterChange({ ...filters, status: value });
  };

  const handleJobTitleChange = (value: string) => {
    onFilterChange({ ...filters, job_title_id: value });
  };

  const toggleQuick = (key: string) => {
    let next = filters.quick.includes(key)
      ? filters.quick.filter((k) => k !== key)
      : [...filters.quick, key];
    // Telegram: đã/chưa liên kết loại trừ nhau — bật cái này tắt cái kia.
    if (key === 'tg_linked') next = next.filter((k) => k !== 'tg_unlinked');
    if (key === 'tg_unlinked') next = next.filter((k) => k !== 'tg_linked');
    onFilterChange({ ...filters, quick: next });
  };

  const FiltersContent = () => (
    <>
      {/* Header with Reset Button */}
      {activeFilterCount > 0 && (
        <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
          <p className="text-2xs sm:text-xs font-600 text-muted-foreground uppercase">
            {activeFilterCount} bộ lọc được áp dụng
          </p>
          <button
            onClick={onReset}
            className="text-2xs sm:text-xs font-600 text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
          >
            <X size={12} /> Đặt lại
          </button>
        </div>
      )}

      {/* Filter Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Company Filter */}
        <div>
          <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Công Ty</label>
          <select
            value={filters.company_id}
            onChange={(e) => handleCompanyChange(e.target.value)}
            className="w-full h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600"
          >
            <option value="">Tất Cả Công Ty</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Department Filter */}
        <div>
          <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Phòng Ban</label>
          <select
            value={filters.department_id}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            disabled={!filters.company_id}
            className="w-full h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Tất Cả Phòng Ban</option>
            {departmentsForCompany.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Trạng Thái</label>
          <select
            value={filters.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Job Title Filter */}
        <div>
          <label className="text-2xs font-600 text-muted-foreground uppercase block mb-1.5">Chức Danh</label>
          <select
            value={filters.job_title_id}
            onChange={(e) => handleJobTitleChange(e.target.value)}
            className="w-full h-8 px-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600"
          >
            <option value="">Tất Cả Chức Danh</option>
            {jobTitles
              .filter((jt) => jt.is_active)
              .map((jobTitle) => (
                <option key={jobTitle.id} value={jobTitle.id}>
                  {jobTitle.title}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Lọc nhanh - Odoo style */}
      <div className="pt-2 border-t border-line">
        <p className="text-2xs font-600 text-muted-foreground uppercase mb-2">Lọc Nhanh</p>
        {['Thiếu thông tin', 'Khác', 'Telegram'].map((group) => (
          <div key={group} className="mb-2 last:mb-0">
            <p className="text-2xs text-muted-foreground/60 mb-1.5">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_FILTERS.filter((f) => f.group === group).map((f) => {
                const on = filters.quick.includes(f.key);
                return (
                  <button
                    key={f.key}
                    onClick={() => toggleQuick(f.key)}
                    className={`rounded-full px-2.5 py-1 text-2xs font-600 border transition-colors ${
                      on
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-surface-2 border-line text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Role Filter - Checkboxes */}
      <div className="pt-2 border-t border-line">
        <p className="text-2xs font-600 text-muted-foreground uppercase mb-2">Vai Trò</p>
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((role) => (
            <label key={role.value} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.role.includes(role.value)}
                onChange={() => handleRoleToggle(role.value)}
                className="w-4 h-4 rounded cursor-pointer accent-indigo-600"
              />
              <span className="text-2xs sm:text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                {role.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {/* Search + Filters Toggle */}
      <div className="flex gap-2 sm:gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Tìm theo tên, email..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full h-9 pl-8 pr-3 rounded-lg text-2xs sm:text-xs text-foreground bg-surface-2 border border-line focus:outline-none focus:border-indigo-600 placeholder:text-muted-foreground"
          />
        </div>

        {/* Filters Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-2xs sm:text-xs font-600 transition-all border ${
            isExpanded
              ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
              : 'bg-surface-2 border-line text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>Bộ Lọc</span>
          {activeFilterCount > 0 && (
            <span className="bg-indigo-500 text-white text-2xs font-700 rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Desktop: Inline Expandable Panel */}
      {!isMobile && isExpanded && (
        <div className="bg-slate-900/50 backdrop-blur-sm border border-line rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <FiltersContent />
        </div>
      )}

      {/* Mobile: Modal */}
      {isMobile && isExpanded && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setIsExpanded(false)}
          />

          {/* Bottom Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950 rounded-t-2xl border-t border-line shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Header */}
            <div className="flex items-center justify-between sticky top-0 bg-slate-950 border-b border-line p-4 rounded-t-2xl">
              <h3 className="text-sm font-700 text-foreground">Bộ Lọc</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1.5 hover:bg-hover-strong rounded-lg transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <FiltersContent />
            </div>

            {/* Footer - Close Button */}
            <div className="sticky bottom-0 bg-slate-950 border-t border-line p-4">
              <button
                onClick={() => setIsExpanded(false)}
                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-600 rounded-lg transition-colors"
              >
                Xong
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

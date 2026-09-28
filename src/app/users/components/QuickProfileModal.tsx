'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, Mail, Phone, Briefcase, UserCircle2, FileText, Users2 } from 'lucide-react';
import { workLocationLabel } from '@/lib/constants/workLocations';

interface DropdownCache {
  companies: Array<{ id: string; name: string }>;
  companyDepartmentsMap: Record<string, Array<{ id: string; name: string }>>;
  subDepartmentsByDepartmentId: Record<string, Array<{ id: string; name: string }>>;
  positions: Record<string, Array<{ id: string; name: string }>>;
}

interface QuickProfileModalProps {
  user: any;
  dropdownCache: DropdownCache;
  onClose: () => void;
}

/** Chuỗi trông như UUID (dữ liệu cũ lưu id vào cột text) — không bao giờ hiển thị ra SYLL. */
function looksLikeUuid(s: unknown): boolean {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

function fmtDate(d?: string | null): string {
  if (!d) return '';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(d);
}

function fmtDateNow(): string {
  const d = new Date();
  return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

export default function QuickProfileModal({ user, dropdownCache, onClose }: QuickProfileModalProps) {
  const companyName = user.company_id
    ? dropdownCache.companies.find(c => c.id === user.company_id)?.name || ''
    : '';
  // Tra tên phòng ban/bộ phận trên TOÀN BỘ cache (mọi công ty) — cache chỉ chứa đơn vị
  // đang hiển thị nên user thuộc đơn vị ẩn sẽ tra trượt; khi đó fetch theo id ở effect dưới.
  // KHÔNG rơi về user.department nếu nó là UUID (dữ liệu cũ lưu id vào cột text).
  const [fetchedDeptName, setFetchedDeptName] = useState('');
  const [fetchedSubName, setFetchedSubName] = useState('');

  const cachedDeptName = user.department_id
    ? Object.values(dropdownCache.companyDepartmentsMap).flat().find(d => d.id === user.department_id)?.name || ''
    : '';
  const departmentName =
    cachedDeptName ||
    fetchedDeptName ||
    (looksLikeUuid(user.department) ? '' : user.department || '');
  const cachedSubName = user.sub_department_id
    ? Object.values(dropdownCache.subDepartmentsByDepartmentId).flat().find(s => s.id === user.sub_department_id)?.name || ''
    : '';
  const subDepartmentName = cachedSubName || fetchedSubName;

  useEffect(() => {
    setFetchedDeptName('');
    setFetchedSubName('');
    if (user.department_id && !cachedDeptName) {
      fetch(`/api/organizations/departments?id=${user.department_id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d?.name) setFetchedDeptName(d.name); })
        .catch(() => {});
    }
    if (user.sub_department_id && !cachedSubName) {
      fetch(`/api/organizations/sub-departments?id=${user.sub_department_id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d?.name) setFetchedSubName(d.name); })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);
  const positionName = (() => {
    if (user.company_id && user.position_id) {
      const found = (dropdownCache.positions[user.company_id] || []).find(p => p.id === user.position_id);
      if (found) return found.name;
    }
    return user.position || '';
  })();

  const initials = (user.name || '?').split(' ').map((w: string) => w[0]).slice(-2).join('').toUpperCase();
  const hasAvatar = typeof user.avatar === 'string' && user.avatar.startsWith('/');
  const emergencyContactColumns = [
    {
      title: 'Người liên hệ 1',
      rows: [
        ['Người liên hệ 1', user.emergency_contact_name],
        ['Số điện thoại', user.emergency_contact_phone],
        ['Quan hệ', user.emergency_contact_relationship],
        ['Địa chỉ', user.emergency_contact_address],
      ] as [string, any][],
    },
    {
      title: 'Người liên hệ 2',
      rows: [
        ['Người liên hệ 2', user.emergency_contact_2_name],
        ['Số điện thoại (2)', user.emergency_contact_2_phone],
        ['Quan hệ (2)', user.emergency_contact_2_relationship],
        ['Địa chỉ (2)', user.emergency_contact_2_address],
      ] as [string, any][],
    },
  ]
    .map(c => ({ ...c, rows: c.rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '') }))
    .filter(c => c.rows.length > 0)
    .map(column => ({
      ...column,
      rows: column.rows.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== ''),
    }))
    .filter(column => column.rows.length > 0);

  const sections: { title: string; icon: React.ReactNode; rows: [string, any][] }[] = [
    {
      title: 'Công Việc & Tổ Chức',
      icon: <Briefcase size={15} className="text-indigo-400" />,
      rows: [
        ['Mã nhân viên', user.employee_code],
        ['Công ty', companyName],
        ['Phòng ban', departmentName],
        ['Bộ phận', subDepartmentName],
        ['Chức danh / Vị trí', positionName],
        ['Quản lý trực tiếp', user.manager_name],
        ['Loại hình lao động', user.employment_type],
        ['Ngày vào làm', fmtDate(user.hire_date)],
        ['Nơi làm việc', workLocationLabel(user.work_location)],
      ],
    },
    {
      title: 'Thông Tin Cá Nhân',
      icon: <UserCircle2 size={15} className="text-emerald-400" />,
      rows: [
        ['Ngày sinh', fmtDate(user.date_of_birth)],
        ['Giới tính', user.gender],
        ['Email cá nhân', user.personal_email],
        ['Quốc tịch', user.nationality],
        ['Dân tộc', user.ethnicity],
        ['Tôn giáo', user.religion],
        ['Tình trạng hôn nhân', user.marital_status],
        ['Số con', (user.children_count ?? '') === '' ? '' : String(user.children_count)],
        ['Trình độ học vấn', user.education_level],
        ['Chuyên ngành', user.major],
      ],
    },
    {
      title: 'Giấy Tờ, Địa Chỉ & Ngân Hàng',
      icon: <FileText size={15} className="text-amber-400" />,
      rows: [
        ['Số CMND / CCCD', user.national_id],
        ['Ngày cấp', fmtDate(user.national_id_issue_date)],
        ['Nơi cấp', user.national_id_issue_place],
        ['Địa chỉ thường trú', user.home_address],
        ['Địa chỉ tạm trú', user.temporary_address],
        ['Ngân hàng', user.bank_name],
        ['Số tài khoản', user.bank_account_no],
        ['Chủ tài khoản', user.bank_account_name],
        ['Loại phương tiện', user.vehicle_type],
        ['Biển số', user.vehicle_plate],
        ['Mẫu xe', user.vehicle_model],
      ],
    },
    {
      title: 'Liên Hệ Khẩn Cấp',
      icon: <Users2 size={15} className="text-rose-400" />,
      rows: [
        ['Người liên hệ 1', user.emergency_contact_name],
        ['Quan hệ', user.emergency_contact_relationship],
        ['Số điện thoại', user.emergency_contact_phone],
        ['Địa chỉ', user.emergency_contact_address],
        ['Người liên hệ 2', user.emergency_contact_2_name],
        ['Quan hệ (2)', user.emergency_contact_2_relationship],
        ['Số điện thoại (2)', user.emergency_contact_2_phone],
        ['Địa chỉ (2)', user.emergency_contact_2_address],
      ],
    },
  ];

  const visibleSections = sections
    .map(s => ({ ...s, rows: s.rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '') }))
    .filter(s => s.rows.length > 0);

  // Đóng modal khi nhấn Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* =====================================================
          VÙNG IN — chỉ hiện khi @media print
          ===================================================== */}
      <div id="print-profile" className="print-only">
        {/* Tiêu đề */}
        <div className="pp-titleblock">
          <div className="pp-title">Sơ Yếu Lý Lịch</div>
          <div className="pp-subtitle">{companyName ? `${companyName} · ` : ''}Tài liệu nội bộ — {fmtDateNow()}</div>
        </div>

        {/* Avatar + tên */}
        <div className="pp-header">
          {hasAvatar ? (
            <img src={user.avatar} alt={user.name} className="pp-avatar" />
          ) : (
            <div className="pp-avatar-initials">{initials}</div>
          )}
          <div>
            <div className="pp-name">{user.name}</div>
            {positionName && <div className="pp-meta">Chức danh: {positionName}</div>}
            {departmentName && <div className="pp-meta">Phòng ban: {departmentName}</div>}
            {user.email && <div className="pp-meta">Email: {user.email}</div>}
            {user.phone && <div className="pp-meta">Điện thoại: {user.phone}</div>}
          </div>
        </div>

        {/* Các section */}
        {visibleSections.map(section => (
          <div key={section.title} className="pp-section">
            <div className="pp-section-title">{section.title}</div>
            <div className="pp-grid">
              {section.rows.map(([label, value]) => (
                <div key={label} className="pp-row">
                  <span className="pp-label">{label}</span>
                  <span className="pp-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {visibleSections.length === 0 && (
          <p style={{ textAlign: 'center', color: '#888', marginTop: 32 }}>Chưa cập nhật thông tin hồ sơ.</p>
        )}

        {/* Ký tên */}
        <p className="pp-sign-date">Ngày ..... tháng ..... năm .....</p>
        <div className="pp-sign">
          <div>
            <div style={{ fontWeight: 600 }}>Người khai</div>
            <div className="pp-sign-line" />
            <div>{user.name}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>Xác nhận của HR</div>
            <div className="pp-sign-line" />
            <div>&nbsp;</div>
          </div>
        </div>
      </div>

      {/* =====================================================
          MODAL HIỂN THỊ TRÊN MÀN HÌNH
          ===================================================== */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      >
        <div
          className="w-full max-w-2xl max-h-[92vh] rounded-2xl sm:rounded-3xl border border-line overflow-hidden flex flex-col"
          style={{ background: 'var(--card)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-line shrink-0">
            <h2 className="text-base sm:text-lg font-700 text-foreground flex items-center gap-2">
              <FileText size={18} className="text-indigo-400" /> Sơ Yếu Lý Lịch Điện Tử
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                title="In sơ yếu lý lịch"
                className="h-8 px-3 rounded-xl btn-ghost hidden sm:flex items-center gap-1.5 text-xs font-600 text-muted-foreground hover:text-foreground hover:bg-hover-strong transition-colors"
              >
                <Printer size={14} />
                In
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl btn-ghost flex items-center justify-center text-muted-foreground hover:bg-hover-strong"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Khối nhận diện */}
            <div className="flex items-center gap-4">
              {hasAvatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-16 h-16 rounded-2xl object-cover border border-line shrink-0"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-700 text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #06B6D4)' }}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-700 text-foreground truncate">{user.name}</h3>
                <div className="mt-1 flex flex-col gap-0.5">
                  {user.email && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Mail size={12} /> {user.email}
                    </span>
                  )}
                  {user.phone && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                      <Phone size={12} /> {user.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Các nhóm thông tin */}
            {visibleSections.map(section => (
              <div
                key={section.title}
                className="rounded-2xl border border-line-subtle overflow-hidden"
                style={{ background: 'var(--background)' }}
              >
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line-subtle bg-white/[0.02]">
                  {section.icon}
                  <span className="text-xs font-700 text-foreground uppercase tracking-wider">{section.title}</span>
                </div>
                {section.title === 'Liên Hệ Khẩn Cấp' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    {emergencyContactColumns.map((column, columnIndex) => (
                      <div
                        key={column.title}
                        className={columnIndex > 0 ? 'border-t sm:border-t-0 sm:border-l border-line-subtle' : ''}
                      >
                        {column.rows.map(([label, value], rowIndex) => (
                          <div
                            key={`${column.title}-${label}`}
                            className={`flex justify-between gap-3 px-4 py-2.5 ${
                              rowIndex > 0 ? 'border-t border-line-subtle' : ''
                            }`}
                          >
                            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                            <span className="text-xs font-500 text-foreground text-right break-words">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
                    {section.rows.map(([label, value], i) => (
                      <div
                        key={label}
                        className={`flex justify-between gap-3 px-4 py-2.5 ${
                          i >= 2 ? 'border-t border-line-subtle' : i === 1 ? 'sm:border-t-0 border-t border-line-subtle' : ''
                        }`}
                      >
                        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
                        <span className="text-xs font-500 text-foreground text-right break-words">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {visibleSections.length === 0 && (
              <p className="text-center py-10 text-sm text-muted-foreground">
                Nhân sự này chưa cập nhật thông tin hồ sơ.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center gap-2 px-5 sm:px-6 py-3.5 border-t border-line shrink-0">
            <button
              onClick={handlePrint}
              className="sm:hidden h-9 px-4 rounded-xl btn-ghost text-sm font-500 flex items-center gap-2 text-muted-foreground"
            >
              <Printer size={14} /> In
            </button>
            <button onClick={onClose} className="h-9 px-5 rounded-xl btn-ghost text-sm font-500 ml-auto">
              Đóng
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

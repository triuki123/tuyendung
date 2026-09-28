'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Briefcase, Tags, ArrowRight, Users, Layers, Zap, CheckCircle, Network, Archive, HeartPulse } from 'lucide-react';
import { clientCanAccess } from '@/lib/clientPermissions';

interface StatsData {
  companies: number;
  positions: number;
  departments: number;
  jobTitles: number;
  employees: number;
  activeEmployees: number;
}

export default function OrganizationPage() {
  const router = useRouter();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch stats on mount
  useEffect(() => {
    fetch('/api/organizations/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => {
        console.error('Failed to fetch stats:', err);
        setStats({
          companies: 0,
          positions: 0,
          departments: 0,
          jobTitles: 0,
          employees: 0,
          activeEmployees: 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const modules = [
    {
      id: 'so-do-to-chuc',
      unit: 'org-companies',
      title: 'Sơ Đồ Tổ Chức',
      description: 'Xem toàn bộ cơ cấu tổ chức dạng sơ đồ cây trực quan',
      icon: <Network size={32} />,
      color: 'from-indigo-500 to-indigo-600',
      href: '/organization/so-do-to-chuc',
    },
    {
      id: 'companies-organization',
      unit: 'org-companies',
      title: 'Cơ Cấu Tổ Chức',
      description: 'Quản lý cấu trúc tổ chức, công ty và bộ phận',
      icon: <Building2 size={32} />,
      color: 'from-emerald-500 to-emerald-600',
      href: '/organization/companies-organization',
    },
    {
      id: 'positions',
      unit: 'org-positions',
      title: 'Chức Vụ',
      description: 'Quản lý chức vụ công việc cho từng công ty',
      icon: <Briefcase size={32} />,
      color: 'from-blue-500 to-blue-600',
      href: '/organization/positions',
    },
    {
      id: 'tags',
      unit: 'org-tags',
      title: 'Tags',
      description: 'Tạo và quản lý tags để phân loại người dùng',
      icon: <Tags size={32} />,
      color: 'from-purple-500 to-purple-600',
      href: '/organization/tags',
    },
    {
      id: 'suc-khoe-to-chuc',
      unit: 'org-companies',
      title: 'Sức Khoẻ Tổ Chức',
      description: 'Rà soát dữ liệu cơ cấu: ai chưa xếp chỗ, đơn vị thiếu trưởng, chức danh chưa xếp cấp',
      icon: <HeartPulse size={32} />,
      color: 'from-rose-500 to-rose-600',
      href: '/organization/suc-khoe-to-chuc',
    },
    {
      id: 'inactive-companies',
      unit: 'org-companies',
      title: 'Công Ty Ngừng Hoạt Động',
      description: 'Xem, khôi phục hoặc xoá vĩnh viễn các công ty đã ẩn',
      icon: <Archive size={32} />,
      color: 'from-slate-500 to-slate-600',
      href: '/organization/inactive-companies',
    },
  ];

  // Lọc tile theo quyền (kế thừa mẹ 'organization'). Đọc localStorage sau mount để tránh hydration mismatch.
  const [visibleModuleIds, setVisibleModuleIds] = useState<string[]>(modules.map((m) => m.id));
  useEffect(() => {
    setVisibleModuleIds(modules.filter((m) => clientCanAccess(m.unit, 'view')).map((m) => m.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visibleModules = modules.filter((m) => visibleModuleIds.includes(m.id));

  // Metrics configuration
  const metrics = [
    {
      id: 'companies',
      label: 'Công Ty',
      icon: <Building2 size={20} />,
      count: stats?.companies ?? 0,
      color: 'from-emerald-500/10 to-emerald-600/5',
      textColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/20',
    },
    {
      id: 'positions',
      label: 'Chức Vụ',
      icon: <Briefcase size={20} />,
      count: stats?.positions ?? 0,
      color: 'from-blue-500/10 to-blue-600/5',
      textColor: 'text-blue-400',
      borderColor: 'border-blue-500/20',
    },
    {
      id: 'departments',
      label: 'Bộ Phận',
      icon: <Layers size={20} />,
      count: stats?.departments ?? 0,
      color: 'from-purple-500/10 to-purple-600/5',
      textColor: 'text-purple-400',
      borderColor: 'border-purple-500/20',
    },
    {
      id: 'job-titles',
      label: 'Vị Trí Công Việc',
      icon: <Zap size={20} />,
      count: stats?.jobTitles ?? 0,
      color: 'from-indigo-500/10 to-indigo-600/5',
      textColor: 'text-indigo-400',
      borderColor: 'border-indigo-500/20',
    },
    {
      id: 'employees',
      label: 'Nhân Viên',
      icon: <Users size={20} />,
      count: stats?.employees ?? 0,
      color: 'from-amber-500/10 to-amber-600/5',
      textColor: 'text-amber-400',
      borderColor: 'border-amber-500/20',
    },
    {
      id: 'active-employees',
      label: 'Nhân Viên Hoạt Động',
      icon: <CheckCircle size={20} />,
      count: stats?.activeEmployees ?? 0,
      color: 'from-cyan-500/10 to-cyan-600/5',
      textColor: 'text-cyan-400',
      borderColor: 'border-cyan-500/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-700 text-foreground">Quản Lý Tổ Chức</h1>
        <p className="text-2xs sm:text-xs text-muted-foreground mt-1">Thống kê và quản lý cơ cấu tổ chức, chức vụ, bộ phận</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className={`bg-gradient-to-br ${metric.color} border ${metric.borderColor} rounded-lg sm:rounded-xl p-4 sm:p-5 transition-all hover:border-opacity-100`}
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="flex-shrink-0 text-muted-foreground">
                {metric.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className={`text-2xl sm:text-3xl font-700 ${metric.textColor}`}>
                  {loading ? '—' : metric.count}
                </div>
                <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
                  {metric.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {visibleModules.map((module) => (
          <button
            key={module.id}
            onClick={() => router.push(module.href)}
            className="bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6 rounded-lg sm:rounded-xl border border-line hover:border-line-strong transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div
                className={`
                  w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center flex-shrink-0
                  bg-gradient-to-r ${module.color} text-white group-hover:scale-110 transition-transform
                `}
              >
                {module.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-600 text-foreground group-hover:text-indigo transition-colors">
                  {module.title}
                </h3>
                <p className="text-2xs sm:text-xs text-muted-foreground mt-1">
                  {module.description}
                </p>
              </div>

              {/* Arrow */}
              <ArrowRight
                size={20}
                className="text-muted-foreground group-hover:text-indigo transition-colors flex-shrink-0 mt-1"
              />
            </div>
          </button>
        ))}
      </div>

      {/* Info Section */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-lg sm:rounded-xl p-4 sm:p-6 space-y-3">
        <h3 className="font-600 text-foreground">💡 Hướng Dẫn Sử Dụng</h3>
        <ul className="space-y-2 text-2xs sm:text-xs text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-indigo">•</span>
            <span><strong>Cơ Cấu Tổ Chức:</strong> Quản lý công ty, bộ phận, phòng ban và cơ cấu tổ chức chung</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo">•</span>
            <span><strong>Sơ Đồ Tổ Chức:</strong> Xem toàn bộ cơ cấu tập đoàn dạng sơ đồ cây trực quan</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo">•</span>
            <span><strong>Chức Vụ:</strong> Quản lý các chức vụ (vị trí) và gán cho nhân viên của từng công ty</span>
          </li>
          <li className="flex gap-2">
            <span className="text-indigo">•</span>
            <span><strong>Tags:</strong> Tạo tags hệ thống để phân loại và đánh dấu người dùng theo các tiêu chí khác</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

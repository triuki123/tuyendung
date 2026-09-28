'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { HardDrive, Globe, Mail, Package, TrendingUp, AlertCircle, Activity, Server } from 'lucide-react';
import { clientCanAccess } from '@/lib/clientPermissions';
import DashboardMetrics from '@/app/dashboard/components/DashboardMetrics';
import DashboardCharts from '@/app/dashboard/components/DashboardCharts';

// Phân tích tài sản nâng cao — dời từ Dashboard chính sang đây (recharts: ssr off)
const AssetValueAnalytics = dynamic(() => import('@/app/dashboard/components/AssetValueAnalytics'), { ssr: false });
const MaintenanceAnalytics = dynamic(() => import('@/app/dashboard/components/MaintenanceAnalytics'), { ssr: false });
const DepartmentAnalytics = dynamic(() => import('@/app/dashboard/components/DepartmentAnalytics'), { ssr: false });

/** Map đường dẫn khu vực con → đơn vị quyền (kế thừa quyền mẹ asset-management). */
const ASSET_UNIT_BY_HREF: Record<string, string> = {
  '/asset-management/hardware': 'hardware',
  '/asset-management/software': 'software',
  '/asset-management/domains': 'asset-domains',
  '/asset-management/email-accounts': 'asset-emails',
};

interface DashboardStats {
  modules: {
    hardware: { count: number; label: string };
    domains: { count: number; label: string };
    emailAccounts: { count: number; label: string };
    software: { count: number; label: string };
  };
  summary: {
    totalAssets: number;
    warnings: number;
    recentActivity: number;
  };
}

interface DashboardModule {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export default function AssetManagementDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ name?: string; role?: string } | null>(null);
  const [recentActivities] = useState<any[]>([
    {
      id: 1,
      type: 'domain',
      message: 'Thêm tên miền',
      detail: 'example.com',
      daysAgo: 3,
      color: 'purple',
    },
    {
      id: 2,
      type: 'email',
      message: 'Cấp email',
      detail: 'hr@company.com cho Nguyễn Văn A',
      daysAgo: 2,
      color: 'emerald',
    },
    {
      id: 3,
      type: 'software',
      message: 'Gia hạn license',
      detail: 'Microsoft Office',
      daysAgo: 1,
      color: 'orange',
    },
  ]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('assetflow_auth');
      if (stored) {
        const user = JSON.parse(stored);
        setCurrentUser(user);
      }
    } catch (err) {
      console.error('Failed to parse user from localStorage:', err);
    }
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('Failed to fetch dashboard stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const modules: DashboardModule[] = stats
    ? [
        {
          id: 'hardware',
          label: 'Phần Cứng',
          href: '/asset-management/hardware',
          icon: <HardDrive size={24} />,
          count: stats.modules.hardware.count,
          color: 'text-blue-400',
          bgColor: 'from-blue-500/10 to-blue-600/5',
          borderColor: 'border-blue-500/20',
          description: 'Thiết bị công nghệ',
        },
        {
          id: 'domains',
          label: 'Tên Miền',
          href: '/asset-management/domains',
          icon: <Globe size={24} />,
          count: stats.modules.domains.count,
          color: 'text-purple-400',
          bgColor: 'from-purple-500/10 to-purple-600/5',
          borderColor: 'border-purple-500/20',
          description: 'Tên miền đang quản lý',
        },
        {
          id: 'email-accounts',
          label: 'Tài Khoản Email',
          href: '/asset-management/email-accounts',
          icon: <Mail size={24} />,
          count: stats.modules.emailAccounts.count,
          color: 'text-emerald-400',
          bgColor: 'from-emerald-500/10 to-emerald-600/5',
          borderColor: 'border-emerald-500/20',
          description: 'Email được cấp cho nhân sự',
        },
        {
          id: 'software',
          label: 'Phần Mềm',
          href: '/asset-management/software',
          icon: <Package size={24} />,
          count: stats.modules.software.count,
          color: 'text-orange-400',
          bgColor: 'from-orange-500/10 to-orange-600/5',
          borderColor: 'border-orange-500/20',
          description: 'Giấy phép phần mềm',
        },
        ...(currentUser?.name === 'Trà Phương Nam' ? [{
          id: 'zimbra',
          label: 'Zimbra Mail',
          href: '/asset-management/zimbra',
          icon: <Server size={24} />,
          count: 0,
          color: 'text-cyan-400',
          bgColor: 'from-cyan-500/10 to-cyan-600/5',
          borderColor: 'border-cyan-500/20',
          description: 'Quản lý tài khoản và nhóm email Zimbra',
        }] : []),
      ].filter((m) => {
        const unit = ASSET_UNIT_BY_HREF[m.href];
        return !unit || clientCanAccess(unit, 'view');
      })
    : [];
  const canViewAssetAnalytics = currentUser?.role === 'super_admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-700 text-foreground">
          📦 Quản Lý Tài Sản
        </h1>
        <p className="text-sm text-muted-foreground">
          Quản lý tập trung tất cả tài sản tổ chức - Phần cứng, Tên miền, Email, Phần mềm
        </p>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-white/05 p-4 bg-gradient-to-br from-white/5 to-white/[2.5%]">
        <p className="text-sm font-600 text-foreground mb-3">🚀 Thao tác nhanh</p>
        <div className={`grid ${currentUser?.name === 'Trà Phương Nam' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'} gap-2`}>
          <button
            onClick={() => router.push('/asset-management/hardware')}
            className="px-3 py-2 rounded-lg text-2xs font-500 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 transition-colors cursor-pointer"
          >
            ➕ Thêm Phần Cứng
          </button>
          <button
            onClick={() => router.push('/asset-management/domains')}
            className="px-3 py-2 rounded-lg text-2xs font-500 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors cursor-pointer"
          >
            ➕ Thêm Tên Miền
          </button>
          <button
            onClick={() => router.push('/asset-management/email-accounts')}
            className="px-3 py-2 rounded-lg text-2xs font-500 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-colors cursor-pointer"
          >
            ➕ Thêm Email
          </button>
          <button
            onClick={() => router.push('/asset-management/software')}
            className="px-3 py-2 rounded-lg text-2xs font-500 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 transition-colors cursor-pointer"
          >
            ➕ Thêm Phần Mềm
          </button>
          {currentUser?.name === 'Trà Phương Nam' && (
            <button
              onClick={() => router.push('/asset-management/zimbra')}
              className="px-3 py-2 rounded-lg text-2xs font-500 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 transition-colors cursor-pointer"
            >
              📧 Zimbra Mail
            </button>
          )}
        </div>
      </div>

      {/* Module Cards Grid — luôn nằm trên 1 hàng ở desktop (số cột = số thẻ) */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${modules.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3 sm:gap-4`}>
        {modules.length > 0 && modules.map((module) => (
          <Link
            key={module.id}
            href={module.href}
            className="group"
          >
            <div
              className={`
                h-full rounded-lg sm:rounded-xl border transition-all duration-200
                bg-gradient-to-br ${module.bgColor} ${module.borderColor}
                hover:border-line-strong hover:shadow-lg
                p-3 sm:p-4 cursor-pointer min-h-[160px]
              `}
            >
              {/* Icon */}
              <div className={`${module.color} mb-2 sm:mb-3 group-hover:scale-110 transition-transform`}>
                {module.icon}
              </div>

              {/* Content */}
              <div className="space-y-2">
                <h3 className="text-sm font-600 text-foreground">{module.label}</h3>
                <p className="text-2xs text-muted-foreground">{module.description}</p>

                {/* Count */}
                <div className="pt-2 border-t border-line-subtle">
                  <p className="text-lg font-700 text-foreground">{loading ? '—' : module.count}</p>
                  <p className="text-2xs text-muted-foreground/60">Mục</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ===== Phân Tích Tài Sản (dời từ Dashboard chính) ===== */}
      <div className={canViewAssetAnalytics ? 'pt-2' : 'hidden'}>
        <h2 className="text-lg font-700 text-foreground">📊 Phân Tích Tài Sản</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Tình trạng, giá trị, bảo trì và phân bổ tài sản theo phòng ban
        </p>
      </div>

      {/* KPI tình trạng tài sản */}
      {canViewAssetAnalytics && <DashboardMetrics />}

      {/* Biểu đồ xu hướng + phân bổ trạng thái */}
      {canViewAssetAnalytics && <DashboardCharts />}

      {/* Phân tích nâng cao */}
      {canViewAssetAnalytics && <AssetValueAnalytics />}
      {canViewAssetAnalytics && <MaintenanceAnalytics />}
      {canViewAssetAnalytics && <DepartmentAnalytics />}

      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Assets */}
        <div className="rounded-2xl border border-white/05 p-4 bg-gradient-to-br from-indigo-500/5 to-indigo-600/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground">
              Tổng Tài Sản
            </p>
            <TrendingUp size={16} className="text-indigo-400" />
          </div>
          <p className="text-2xl font-700 text-foreground">{loading ? '—' : stats?.summary.totalAssets || 0}</p>
          <p className="text-2xs text-muted-foreground mt-1">
            Tất cả các loại tài sản
          </p>
        </div>

        {/* Alerts */}
        <div className="rounded-2xl border border-white/05 p-4 bg-gradient-to-br from-red-500/5 to-red-600/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground">
              Cảnh báo
            </p>
            <AlertCircle size={16} className="text-red-400" />
          </div>
          <p className="text-2xl font-700 text-red-400">{loading ? '—' : stats?.summary.warnings || 0}</p>
          <p className="text-2xs text-muted-foreground mt-1">
            Tên miền & License sắp hết hạn
          </p>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-white/05 p-4 bg-gradient-to-br from-emerald-500/5 to-emerald-600/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-2xs font-600 uppercase tracking-widest text-muted-foreground">
              Hoạt động
            </p>
            <Activity size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-700 text-foreground">{loading ? '—' : stats?.summary.recentActivity || 0}</p>
          <p className="text-2xs text-muted-foreground mt-1">
            Thay đổi trong 7 ngày
          </p>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="rounded-2xl border border-white/05 p-4 bg-gradient-to-br from-white/[2.5%] to-white/[1%]">
        <p className="text-sm font-600 text-foreground mb-3">📋 Hoạt động gần đây</p>
        <div className="space-y-2">
          {recentActivities.map((activity) => {
            const colorMap: { [key: string]: string } = {
              purple: 'bg-purple-400',
              emerald: 'bg-emerald-400',
              orange: 'bg-orange-400',
            };
            return (
              <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-hover transition-colors">
                <div className={`w-2 h-2 rounded-full ${colorMap[activity.color]} mt-1.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">
                    {activity.message} <span className="font-600">{activity.detail}</span>
                  </p>
                  <p className="text-2xs text-muted-foreground">{activity.daysAgo} ngày trước</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

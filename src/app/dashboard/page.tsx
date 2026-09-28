'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import CommandCenterMetrics from './components/CommandCenterMetrics';
import HrInsightsSection from './components/HrInsightsSection';
import ActionItemsCard from './components/ActionItemsCard';
import UserDashboard from './components/UserDashboard';
import ManagerDashboard from './components/ManagerDashboard';
import RecentAnnouncementsCard from './components/RecentAnnouncementsCard';
import RecentDocumentsCard from './components/RecentDocumentsCard';
import DashboardShell from './components/DashboardShell';
import { getCurrentUser } from '@/lib/authStore';

export default function DashboardPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setUserRole(user?.role || null);
      return;
    }
    // localStorage rỗng có thể do vừa đăng nhập qua SSO (callback là 302 redirect,
    // không có JS nào chạy để ghi localStorage) — thử bootstrap từ cookie session
    // trước khi kết luận chưa đăng nhập, tránh redirect nhầm về màn hình login.
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((u) => {
        if (u && !u.error) {
          localStorage.setItem('assetflow_auth', JSON.stringify(u));
          setUserRole(u?.role || null);
        } else {
          router?.push('/sign-up-login-screen');
        }
      })
      .catch(() => router?.push('/sign-up-login-screen'));
  }, [router]);

  // Wait for userRole to be determined
  if (userRole === null) {
    return (
      <AppLayout activePath="/dashboard">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Role 'user': dashboard cá nhân (đã tự bố trí Thông báo/Văn bản ở cột phải bên trong)
  if (userRole === 'user') {
    return (
      <AppLayout activePath="/dashboard">
        <UserDashboard />
      </AppLayout>
    );
  }

  // Role 'manager': dashboard đội ngũ (scope theo cấp dưới)
  if (userRole === 'manager') {
    return (
      <AppLayout activePath="/dashboard">
        <ManagerDashboard />
      </AppLayout>
    );
  }

  return (
    <AppLayout activePath="/dashboard">
      <DashboardShell
        role={userRole}
        header={
          <div className="flex flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-700 text-foreground">Trung Tâm Điều Hành</h1>
              <p className="hidden sm:block text-xs sm:text-sm text-muted-foreground mt-1">
                Tổng quan toàn hệ thống — nhấn vào từng chỉ số để vào module tương ứng
              </p>
            </div>
            <span className="shrink-0 flex items-center gap-1.5 text-2xs sm:text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline">Đồng bộ thời gian thực</span>
              <span className="sm:hidden">Trực tiếp</span>
            </span>
          </div>
        }
        elements={{
          'command-metrics': <CommandCenterMetrics />,
          'action-items': <ActionItemsCard />,
          'hr-insights': <HrInsightsSection />,
          announcements: <RecentAnnouncementsCard />,
          documents: <RecentDocumentsCard />,
        }}
      />
    </AppLayout>
  );
}
'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const AssetTrendChart = dynamic(() => import('./AssetTrendChart'), { ssr: false });
const DepartmentBarChart = dynamic(() => import('./DepartmentBarChart'), { ssr: false });
const StatusPieChart = dynamic(() => import('./StatusPieChart'), { ssr: false });

export default function DashboardCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3 gap-3 sm:gap-4">
      {/* Trend chart — spans 2 cols on lg+ */}
      <div
        className="lg:col-span-2 rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-5 gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-600 text-foreground">Biến Động Tài Sản</h3>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Nhập kho & Thanh lý — 12 tháng gần nhất</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4 text-2xs sm:text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-indigo-400" />
              Nhập kho
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1.5 rounded-full bg-red-400" />
              Thanh lý
            </div>
          </div>
        </div>
        <AssetTrendChart />
      </div>

      {/* Status pie */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm sm:text-base font-600 text-foreground">Phân Bổ Trạng Thái</h3>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Tỷ lệ theo trạng thái hiện tại</p>
        </div>
        <StatusPieChart />
      </div>

      {/* Department bar chart — full width */}
      <div
        className="lg:col-span-3 rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex items-center justify-between mb-4 sm:mb-5">
          <div>
            <h3 className="text-sm sm:text-base font-600 text-foreground">Tài Sản Theo Phòng Ban</h3>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Số lượng tài sản đang quản lý tại mỗi phòng ban</p>
          </div>
        </div>
        <DepartmentBarChart />
      </div>
    </div>
  );
}

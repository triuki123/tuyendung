'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Users, TrendingUp } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import { formatVNDCompact } from '@/lib/format';

// @ts-ignore
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
// @ts-ignore
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
// @ts-ignore
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
// @ts-ignore
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
// @ts-ignore
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
// @ts-ignore
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
// @ts-ignore
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false });
// @ts-ignore
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

/**
 * Phase 2: Department Analytics Component
 * Shows assets, value, and maintenance costs by department
 */
export default function DepartmentAnalytics() {
  const { fetchAssets } = require('@/lib/api-client');
  const [departmentData, setDepartmentData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    loadDepartmentAnalytics();
  }, []);

  const loadDepartmentAnalytics = async () => {
    try {
      setLoading(true);
      setError(false);
      const assets = await fetchAssets();

      const deptMap: Record<string, { assetCount: number; assetValue: number; maintenanceCost: number }> = {};

      assets?.forEach((asset: any) => {
        const dept = asset.department || 'Unknown';
        if (!deptMap[dept]) {
          deptMap[dept] = { assetCount: 0, assetValue: 0, maintenanceCost: 0 };
        }
        deptMap[dept].assetCount++;
        // assets.value là BIGINT → pg trả CHUỖI, cộng thẳng sẽ NỐI CHUỖI ("0"+"0"="00").
        const v = Number(asset.value);
        if (Number.isFinite(v) && v !== 0) {
          deptMap[dept].assetValue += v;
          // Estimate maintenance cost as 5% of asset value per year
          deptMap[dept].maintenanceCost += Math.round(v * 0.05);
        }
      });

      const data = Object.entries(deptMap)
        .map(([dept, stats]) => ({
          dept,
          ...stats,
        }))
        .sort((a, b) => b.assetValue - a.assetValue);

      setDepartmentData(data);
    } catch (error) {
      console.error('Error loading department analytics:', error);
      setError(true);
      setDepartmentData([]);
    } finally {
      setLoading(false);
    }
  };

  const departmentDataMemo = useMemo(() => departmentData, [departmentData]);

  const totalAssets = useMemo(() => departmentDataMemo.reduce((sum, item) => sum + item.assetCount, 0), [departmentDataMemo]);
  const totalValue = useMemo(() => departmentDataMemo.reduce((sum, item) => sum + item.assetValue, 0), [departmentDataMemo]);
  const totalMaintenance = useMemo(() => departmentDataMemo.reduce((sum, item) => sum + item.maintenanceCost, 0), [departmentDataMemo]);

  // Tiền tệ VN — dùng tiện ích chung (trước đây tự chế "₫1.4T"/"₫850M" kiểu Anh).
  const formatCurrency = (value: number) => formatVNDCompact(value);

  // Sort by asset value descending
  const sortedData = [...departmentDataMemo].sort((a, b) => b.assetValue - a.assetValue);
  const topDept = sortedData[0];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl p-4 border border-white/05 h-32 animate-pulse" style={{ background: 'var(--card)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState onRetry={loadDepartmentAnalytics} />;
  }

  if (!departmentDataMemo || departmentDataMemo.length === 0) {
    return (
      <EmptyState icon={Users} title="Không có dữ liệu phòng ban" description="Chưa có tài sản nào được gán cho phòng ban." />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Assets by Department */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Tài Sản / Phòng Ban</h4>
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Users size={16} className="text-blue-400" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-700 text-foreground">{totalAssets}</p>
          <p className="text-xs text-muted-foreground mt-2">Tổng cộng {departmentDataMemo.length} phòng ban</p>
        </div>

        {/* Total Value by Department */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Giá Trị Tài Sản</h4>
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <TrendingUp size={16} className="text-violet-400" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-700 text-foreground">{formatCurrency(totalValue)}</p>
          <p className="text-xs text-muted-foreground mt-2">Trung bình: {formatCurrency(totalValue / departmentDataMemo.length)}/phòng</p>
        </div>

        {/* Top Department */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Phòng Ban Dẫn Đầu</h4>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <span className="text-emerald-400 text-xs font-600">🏆</span>
            </div>
          </div>
          <p className="text-lg sm:text-xl font-700 text-foreground">{topDept.dept}</p>
          <p className="text-xs text-muted-foreground mt-2">{formatCurrency(topDept.assetValue)}</p>
        </div>
      </div>

      {/* Department Comparison Chart */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm sm:text-base font-600 text-foreground">Phân Tích Phòng Ban</h3>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Số lượng tài sản, giá trị và chi phí bảo trì theo phòng ban</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={departmentDataMemo} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff/05" />
            <XAxis
              dataKey="dept"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: '#e2e8f0'
              }}
            />
            <Legend />
            <Bar dataKey="assetCount" fill="#60a5fa" name="Số Tài Sản" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Department Details */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <h3 className="text-sm sm:text-base font-600 text-foreground mb-4">Chi Tiết Từng Phòng Ban</h3>

        <div className="space-y-2">
          {departmentDataMemo.map((dept, idx) => (
            <div
              key={dept.dept}
              className="flex items-center justify-between p-3 rounded-lg bg-white/02 hover:bg-white/05 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-600 text-indigo-400 w-6"># {idx + 1}</span>
                  <p className="text-sm font-500 text-foreground">{dept.dept}</p>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground ml-9">
                  <span>📦 {dept.assetCount} tài sản</span>
                  <span>💰 {formatCurrency(dept.assetValue)}</span>
                  <span>🔧 {formatCurrency(dept.maintenanceCost)}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-600 text-emerald-400">
                  {((dept.assetValue / totalValue) * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">của tổng giá trị</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance Cost by Department */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm sm:text-base font-600 text-foreground">Chi Phí Bảo Trì Theo Phòng Ban</h3>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Chi phí bảo trì trung bình trên tài sản</p>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={departmentDataMemo} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff/05" />
            <XAxis
              dataKey="dept"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
              tickFormatter={(value) => `${(value / 1_000_000).toFixed(0)} tr`}
            />
            <Tooltip
              // @ts-ignore
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: '#e2e8f0'
              }}
            />
            <Bar dataKey="maintenanceCost" fill="#f97316" name="Chi Phí Bảo Trì" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

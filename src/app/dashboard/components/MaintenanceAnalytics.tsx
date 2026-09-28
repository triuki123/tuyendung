'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Wrench, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';

// @ts-ignore
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false });
// @ts-ignore
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false });
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
 * Phase 2: Maintenance Analytics Component
 * Shows maintenance costs, frequency, and equipment health
 */
export default function MaintenanceAnalytics() {
  const { fetchAssets } = require('@/lib/api-client');
  const [maintenanceData, setMaintenanceData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    loadMaintenanceAnalytics();
  }, []);

  const loadMaintenanceAnalytics = async () => {
    try {
      setLoading(true);
      setError(false);
      const assets = await fetchAssets();

      // Calculate monthly maintenance data based on asset status and dates
      const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6'];
      const monthlyMap: Record<string, { cost: number; count: number; completed: number }> = {};

      months.forEach(month => {
        monthlyMap[month] = { cost: 0, count: 0, completed: 0 };
      });

      assets?.forEach((asset: any) => {
        // Estimate maintenance based on status
        if (asset.status === 'maintenance') {
          // Maintenance in progress
          const estimatedCost = asset.value ? Math.round(asset.value * 0.015) : 10000000;
          months.forEach(month => {
            monthlyMap[month].cost += estimatedCost / 6;
            monthlyMap[month].count += 1 / 6;
          });
        } else if (asset.status === 'broken') {
          // Broken items need maintenance
          const estimatedCost = asset.value ? Math.round(asset.value * 0.025) : 20000000;
          months.forEach((month, idx) => {
            if (idx < 3) {
              monthlyMap[month].cost += estimatedCost / 3;
              monthlyMap[month].count += 1 / 3;
              monthlyMap[month].completed += 1 / 3;
            }
          });
        }
      });

      const data = months.map(month => ({
        month,
        cost: Math.round(monthlyMap[month].cost),
        count: Math.round(monthlyMap[month].count),
        completed: Math.round(monthlyMap[month].completed),
      }));

      setMaintenanceData(data);
    } catch (error) {
      console.error('Error loading maintenance analytics:', error);
      setError(true);
      setMaintenanceData([]);
    } finally {
      setLoading(false);
    }
  };

  const maintenanceDataMemo = useMemo(() => maintenanceData, [maintenanceData]);

  const stats = useMemo(() => {
    const totalCost = maintenanceDataMemo.reduce((sum, item) => sum + item.cost, 0);
    const totalCount = maintenanceDataMemo.reduce((sum, item) => sum + item.count, 0);
    const totalCompleted = maintenanceDataMemo.reduce((sum, item) => sum + item.completed, 0);
    const avgCostPerMaintenance = totalCount > 0 ? totalCost / totalCount : 0;

    return { totalCost, totalCount, totalCompleted, avgCostPerMaintenance };
  }, [maintenanceDataMemo]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
      return `₫${(value / 1000000000).toFixed(1)}T`;
    }
    if (value >= 1000000) {
      return `₫${(value / 1000000).toFixed(0)}M`;
    }
    return `₫${value.toLocaleString('vi-VN')}`;
  };

  // Equipment health score (0-100)
  const healthScore = Math.round((stats.totalCompleted / stats.totalCount) * 100);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl p-4 border border-white/05 h-32 animate-pulse" style={{ background: 'var(--card)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState onRetry={loadMaintenanceAnalytics} />;
  }

  if (!maintenanceDataMemo || maintenanceDataMemo.length === 0) {
    return (
      <EmptyState icon={Wrench} title="Không có dữ liệu bảo trì" description="Chưa có tài sản nào ở trạng thái bảo trì hoặc hỏng." />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Maintenance Cost */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Tổng Chi Bảo Trì</h4>
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Wrench size={16} className="text-orange-400" />
            </div>
          </div>
          <p className="text-lg font-700 text-foreground">{formatCurrency(stats.totalCost)}</p>
          <p className="text-xs text-muted-foreground mt-2">6 tháng vừa qua</p>
        </div>

        {/* Maintenance Count */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Lần Bảo Trì</h4>
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Clock size={16} className="text-blue-400" />
            </div>
          </div>
          <p className="text-lg font-700 text-foreground">{stats.totalCount}</p>
          <p className="text-xs text-muted-foreground mt-2">Bảo trì được thực hiện</p>
        </div>

        {/* Completed Maintenance */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Hoàn Thành</h4>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle size={16} className="text-emerald-400" />
            </div>
          </div>
          <p className="text-lg font-700 text-foreground">{stats.totalCompleted}/{stats.totalCount}</p>
          <p className="text-xs text-muted-foreground mt-2">{Math.round((stats.totalCompleted / stats.totalCount) * 100)}% hoàn thành</p>
        </div>

        {/* Average Cost per Maintenance */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Trung Bình</h4>
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <AlertCircle size={16} className="text-indigo-400" />
            </div>
          </div>
          <p className="text-lg font-700 text-foreground">{formatCurrency(stats.avgCostPerMaintenance)}</p>
          <p className="text-xs text-muted-foreground mt-2">Chi phí bảo trì trung bình</p>
        </div>
      </div>

      {/* Maintenance Trend Chart */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm sm:text-base font-600 text-foreground">Xu Hướng Bảo Trì (6 Tháng)</h3>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Chi phí bảo trì và số lần bảo trì theo tháng</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={maintenanceDataMemo} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff/05" />
            <XAxis
              dataKey="month"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
              yAxisId="left"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
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
              formatter={(value: any) => {
                if (typeof value === 'number' && value > 100000) {
                  return formatCurrency(value);
                }
                return value;
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cost"
              stroke="#f97316"
              name="Chi Phí (₫)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="count"
              stroke="#3b82f6"
              name="Lần Bảo Trì"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Equipment Health */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-600 text-foreground">Điểm Sức Khỏe Thiết Bị</h3>
            <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Dựa trên tỷ lệ bảo trì hoàn thành</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-700 text-emerald-400">{healthScore}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {healthScore >= 90 ? '🟢 Tốt' : healthScore >= 75 ? '🟡 Bình thường' : '🔴 Cần chú ý'}
            </p>
          </div>
        </div>

        <div className="mt-4 bg-white/02 rounded-lg h-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-lg ${
              healthScore >= 90 ? 'bg-emerald-400' : healthScore >= 75 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="text-xs">
            <p className="text-muted-foreground">Lần Bảo Trì</p>
            <p className="text-sm font-600 text-foreground mt-1">{stats.totalCount}</p>
          </div>
          <div className="text-xs">
            <p className="text-muted-foreground">Hoàn Thành</p>
            <p className="text-sm font-600 text-emerald-400 mt-1">{stats.totalCompleted}</p>
          </div>
          <div className="text-xs">
            <p className="text-muted-foreground">Chưa Hoàn</p>
            <p className="text-sm font-600 text-red-400 mt-1">{stats.totalCount - stats.totalCompleted}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

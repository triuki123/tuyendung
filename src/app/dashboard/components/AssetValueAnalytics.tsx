'use client';

import React, { useMemo, Suspense } from 'react';
import { DollarSign, TrendingDown } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import { formatVNDCompact } from '@/lib/format';

const BarChart = React.lazy(() => import('recharts').then(m => ({ default: m.BarChart as any }))) as any;
const Bar = React.lazy(() => import('recharts').then(m => ({ default: m.Bar as any }))) as any;
const XAxis = React.lazy(() => import('recharts').then(m => ({ default: m.XAxis as any }))) as any;
const YAxis = React.lazy(() => import('recharts').then(m => ({ default: m.YAxis as any }))) as any;
const CartesianGrid = React.lazy(() => import('recharts').then(m => ({ default: m.CartesianGrid as any }))) as any;
const Tooltip = React.lazy(() => import('recharts').then(m => ({ default: m.Tooltip as any }))) as any;
const Legend = React.lazy(() => import('recharts').then(m => ({ default: m.Legend as any }))) as any;
const ResponsiveContainer = React.lazy(() => import('recharts').then(m => ({ default: m.ResponsiveContainer as any }))) as any;

/**
 * Phase 2: Asset Value Analytics Component
 * Shows asset value distribution and depreciation analysis
 */
export default function AssetValueAnalytics() {
  const { fetchAssets } = require('@/lib/api-client');
  const [valueData, setValueData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    loadAssetValueAnalytics();
  }, []);

  const loadAssetValueAnalytics = async () => {
    try {
      setLoading(true);
      setError(false);
      const assets = await fetchAssets();

      // Group assets by category (using asset_category or default categories)
      const categoryMap: Record<string, { value: number; depreciation: number }> = {};

      assets?.forEach((asset: any) => {
        const category = asset.category || asset.asset_category || 'Other';
        if (!categoryMap[category]) {
          categoryMap[category] = { value: 0, depreciation: 0 };
        }
        // assets.value là BIGINT → pg trả về CHUỖI. Cộng thẳng bằng + sẽ NỐI CHUỖI
        // ("0"+"0"="00") làm tổng phình khổng lồ → phải ép Number trước khi cộng.
        const v = Number(asset.value);
        if (Number.isFinite(v) && v !== 0) {
          categoryMap[category].value += v;
          // Estimate depreciation as 5% per year
          categoryMap[category].depreciation += Math.round(v * 0.05);
        }
      });

      const data = Object.entries(categoryMap)
        .map(([category, stats]) => ({
          category,
          ...stats,
        }))
        .sort((a, b) => b.value - a.value);

      setValueData(data);
    } catch (error) {
      console.error('Error loading asset value analytics:', error);
      setError(true);
      setValueData([]);
    } finally {
      setLoading(false);
    }
  };

  const valueDataMemo = useMemo(() => valueData, [valueData]);

  const totalValue = useMemo(() => valueDataMemo.reduce((sum, item) => sum + item.value, 0), [valueDataMemo]);
  const totalDepreciation = useMemo(() => valueDataMemo.reduce((sum, item) => sum + item.depreciation, 0), [valueDataMemo]);

  // Tiền tệ VN — dùng tiện ích chung (trước đây tự chế "₫1.4T"/"₫850M" kiểu Anh).
  const formatCurrency = (value: number) => formatVNDCompact(value);

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
    return <ErrorState onRetry={loadAssetValueAnalytics} />;
  }

  if (!valueDataMemo || valueDataMemo.length === 0) {
    return (
      <EmptyState icon={DollarSign} title="Không có dữ liệu giá trị tài sản" description="Chưa có tài sản nào được khai báo giá trị." />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Total Value */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Tổng Giá Trị</h4>
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
              <DollarSign size={16} className="text-violet-400" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-700 text-foreground">{formatCurrency(totalValue)}</p>
          <p className="text-xs text-muted-foreground mt-2">Giá trị khai báo toàn bộ tài sản</p>
        </div>

        {/* Average Depreciation */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Khấu Hao Năm</h4>
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
              <TrendingDown size={16} className="text-red-400" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-700 text-foreground">{formatCurrency(totalDepreciation)}</p>
          <p className="text-xs text-muted-foreground mt-2">Khấu hao hàng năm dự kiến</p>
        </div>

        {/* Depreciation Rate */}
        <div
          className="rounded-2xl p-4 border border-white/05 flex flex-col justify-between"
          style={{ background: 'var(--card)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Tỷ Lệ Khấu Hao</h4>
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <span className="text-amber-400 text-xs font-600">%</span>
            </div>
          </div>
          <p className="text-lg sm:text-xl font-700 text-foreground">
            {((totalDepreciation / totalValue) * 100).toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground mt-2">Tỷ lệ khấu hao so với giá trị</p>
        </div>
      </div>

      {/* Value Distribution Chart */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <div className="mb-4 sm:mb-5">
          <h3 className="text-sm sm:text-base font-600 text-foreground">Giá Trị Tài Sản Theo Loại</h3>
          <p className="text-2xs sm:text-xs text-muted-foreground mt-0.5">Phân bổ giá trị và khấu hao theo loại tài sản</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={valueDataMemo} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff/05" />
            <XAxis
              dataKey="category"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              axisLine={{ stroke: '#ffffff/10' }}
              tickFormatter={(value: any) => `${(value / 1_000_000_000).toFixed(1)} tỷ`}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: '#e2e8f0'
              }}
            />
            <Legend />
            <Bar dataKey="value" fill="#a78bfa" name="Giá Trị" radius={[8, 8, 0, 0]} />
            <Bar dataKey="depreciation" fill="#f87171" name="Khấu Hao" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Breakdown */}
      <div
        className="rounded-2xl p-4 sm:p-5 border border-white/05"
        style={{ background: 'var(--card)' }}
      >
        <h3 className="text-sm sm:text-base font-600 text-foreground mb-4">Chi Tiết Theo Loại Tài Sản</h3>

        <div className="space-y-3">
          {valueDataMemo.map((item) => (
            <div key={item.category} className="flex items-start justify-between p-3 rounded-lg bg-white/02 hover:bg-white/05 transition-colors">
              <div className="flex-1">
                <p className="text-sm font-500 text-foreground">{item.category}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Giá trị: {formatCurrency(item.value)}</span>
                  <span>Khấu hao: {formatCurrency(item.depreciation)}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-600 text-indigo-400">
                  {((item.value / totalValue) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

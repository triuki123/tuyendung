'use client';

import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,  } from 'recharts';
import { fetchAssets } from '@/lib/api-client';
import ErrorState from '@/components/ui/ErrorState';

interface MonthlyData {
  month: string;
  acquired: number;
  retired: number;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-white/08 p-3 text-sm"
      style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-xs font-600 text-muted-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={`tt-${i}`} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground text-xs">{p.name === 'acquired' ? 'Nhập kho' : 'Thanh lý'}:</span>
          <span className="text-foreground font-600 tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AssetTrendChart() {
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadMonthlyData();
  }, []);

  const loadMonthlyData = async () => {
    try {
      setLoading(true);
      setError(false);
      const assets = await fetchAssets();

      const monthlyMap: Record<string, { acquired: number; retired: number }> = {};
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      assets?.forEach((asset: any) => {
        const createdDate = asset.created_at ? new Date(asset.created_at) : null;
        const createdMonth = createdDate ? months[createdDate.getMonth()] : null;

        if (createdMonth) {
          if (!monthlyMap[createdMonth]) {
            monthlyMap[createdMonth] = { acquired: 0, retired: 0 };
          }
          monthlyMap[createdMonth].acquired++;
        }

        if (asset.status === 'retired' && asset.updated_at) {
          const retiredDate = new Date(asset.updated_at);
          const retiredMonth = months[retiredDate.getMonth()];
          if (!monthlyMap[retiredMonth]) {
            monthlyMap[retiredMonth] = { acquired: 0, retired: 0 };
          }
          monthlyMap[retiredMonth].retired++;
        }
      });

      const chartData = months.map(month => ({
        month,
        acquired: monthlyMap[month]?.acquired || 0,
        retired: monthlyMap[month]?.retired || 0,
      }));

      setData(chartData);
    } catch (error) {
      console.error('Error loading monthly data:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="h-56 animate-pulse bg-white/05 rounded-lg" />;
  }
  if (error) {
    return <ErrorState onRetry={loadMonthlyData} />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradAcquired" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradRetired" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#C62828" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#C62828" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="acquired" stroke="#6366f1" strokeWidth={2} fill="url(#gradAcquired)" name="acquired" />
        <Area type="monotone" dataKey="retired" stroke="#C62828" strokeWidth={2} fill="url(#gradRetired)" name="retired" />
      </AreaChart>
    </ResponsiveContainer>
  );
}